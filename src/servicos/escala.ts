import type { Contexto, Usuario } from './contexto.ts';
import { auditar, exigirAdmin, moradoresAtivos } from './contexto.ts';
import { ErroDominio, conflito, naoEncontrado, proibido } from '../erros.ts';
import { distribuirTurnos } from '../dominio/escala.ts';
import { somarDias } from '../dominio/datas.ts';
import { notificar } from './notificacoes.ts';

export type TipoTurno = 'LIMPEZA' | 'REFEICAO';

interface TurnoLinha {
  id: number; republica_id: number; data: string; tipo: TipoTurno; responsavel_id: number;
  status: 'PENDENTE' | 'CONCLUIDO'; concluido_em: string | null; responsavel_nome: string;
}

const SELECAO = 'SELECT t.*, r.nome AS responsavel_nome FROM turno t JOIN usuario r ON r.id = t.responsavel_id';
const rotulo = (tipo: TipoTurno) => (tipo === 'LIMPEZA' ? 'limpeza' : 'refeição');

const paraDTO = (t: TurnoLinha, hoje: string) => ({
  id: t.id, data: t.data, tipo: t.tipo, responsavelId: t.responsavel_id, responsavelNome: t.responsavel_nome,
  status: t.status, atrasado: t.status === 'PENDENTE' && t.data < hoje,
});

function buscar(ctx: Contexto, u: Usuario, id: number): TurnoLinha {
  const t = ctx.db.um<TurnoLinha>(`${SELECAO} WHERE t.id = ? AND t.republica_id = ?`, id, u.republicaId);
  if (!t) throw naoEncontrado('Turno');
  return t;
}

export function listarTurnos(ctx: Contexto, u: Usuario, de: string, ate: string) {
  const hoje = ctx.relogio.hoje();
  return ctx.db.todos<TurnoLinha>(`${SELECAO} WHERE t.republica_id = ? AND t.data BETWEEN ? AND ? ORDER BY t.data, t.tipo`, u.republicaId, de, ate)
    .map((t) => paraDTO(t, hoje));
}

/**
 * RF-11: gera a escala rotativa. Datas que já têm turno são preservadas (inclusive trocas já feitas);
 * o rodízio continua a partir do último responsável anterior ao período.
 */
export function gerarEscala(ctx: Contexto, u: Usuario, inicio: string, dias: number, tipos: TipoTurno[]) {
  exigirAdmin(u);
  const hoje = ctx.relogio.hoje();
  if (inicio < hoje) throw new ErroDominio('DATA_PASSADA', 'A escala só pode ser gerada de hoje em diante.');
  return ctx.db.transacao(() => {
    const moradores = moradoresAtivos(ctx, u.republicaId).map((m) => m.id);
    const fim = somarDias(inicio, dias - 1);
    let criados = 0;
    for (const tipo of new Set(tipos)) {
      const ocupadas = new Set(ctx.db.todos<{ data: string }>(
        'SELECT data FROM turno WHERE republica_id = ? AND tipo = ? AND data BETWEEN ? AND ?', u.republicaId, tipo, inicio, fim).map((l) => l.data));
      const livres = Array.from({ length: dias }, (_, i) => somarDias(inicio, i)).filter((d) => !ocupadas.has(d));
      const anterior = ctx.db.um<{ responsavel_id: number }>(
        'SELECT responsavel_id FROM turno WHERE republica_id = ? AND tipo = ? AND data < ? ORDER BY data DESC LIMIT 1', u.republicaId, tipo, inicio);
      // Sem histórico, a escala de refeição começa defasada da de limpeza, para a mesma pessoa não acumular os dois turnos do dia.
      const ultimo = anterior?.responsavel_id ?? (tipo === 'REFEICAO' && moradores.length > 1 ? moradores[0]! : null);
      for (const t of distribuirTurnos(livres, moradores, ultimo)) {
        ctx.db.executar(`INSERT INTO turno (republica_id, data, tipo, responsavel_id, status) VALUES (?, ?, ?, ?, 'PENDENTE')`,
          u.republicaId, t.data, tipo, t.responsavelId);
        criados += 1;
      }
    }
    auditar(ctx, u, 'ESCALA_GERADA', { inicio, dias, tipos, turnosCriados: criados });
    return { turnosCriados: criados, turnos: listarTurnos(ctx, u, inicio, fim) };
  });
}

/** Marca o turno como cumprido: apenas o responsável, e nunca antes do dia do turno. */
export function concluirTurno(ctx: Contexto, u: Usuario, id: number) {
  const hoje = ctx.relogio.hoje();
  return ctx.db.transacao(() => {
    const t = buscar(ctx, u, id);
    if (t.responsavel_id !== u.id) throw proibido('NAO_RESPONSAVEL', 'Apenas o responsável pelo turno pode marcá-lo como cumprido.');
    if (t.status !== 'PENDENTE') throw conflito('TURNO_JA_CONCLUIDO', 'Este turno já foi concluído.');
    if (t.data > hoje) throw new ErroDominio('TURNO_FUTURO', 'Não é possível concluir um turno antes do dia marcado.');
    ctx.db.executar(`UPDATE turno SET status = 'CONCLUIDO', concluido_em = ? WHERE id = ?`, ctx.relogio.agora(), id);
    return paraDTO(buscar(ctx, u, id), hoje);
  });
}

interface TrocaLinha {
  id: number; republica_id: number; turno_solicitante_id: number; turno_solicitado_id: number;
  solicitante_id: number; solicitado_id: number; status: 'PENDENTE' | 'ACEITA' | 'RECUSADA' | 'CANCELADA';
}

function trocaDTO(ctx: Contexto, u: Usuario, t: TrocaLinha) {
  const hoje = ctx.relogio.hoje();
  const nome = (id: number) => ctx.db.um<{ nome: string }>('SELECT nome FROM usuario WHERE id = ?', id)!.nome;
  return {
    id: t.id, status: t.status,
    solicitanteId: t.solicitante_id, solicitanteNome: nome(t.solicitante_id),
    solicitadoId: t.solicitado_id, solicitadoNome: nome(t.solicitado_id),
    turnoSolicitante: paraDTO(buscar(ctx, u, t.turno_solicitante_id), hoje),
    turnoSolicitado: paraDTO(buscar(ctx, u, t.turno_solicitado_id), hoje),
  };
}

function buscarTroca(ctx: Contexto, u: Usuario, id: number): TrocaLinha {
  const t = ctx.db.um<TrocaLinha>('SELECT * FROM troca WHERE id = ? AND republica_id = ?', id, u.republicaId);
  if (!t) throw naoEncontrado('Solicitação de troca');
  return t;
}

/** Um turno só pode ser trocado enquanto está pendente e ainda não passou. */
function trocavel(t: TurnoLinha, hoje: string): boolean {
  return t.status === 'PENDENTE' && t.data >= hoje;
}

/** RF-06 (1ª metade): um morador propõe trocar um turno seu por um turno de outro morador. */
export function solicitarTroca(ctx: Contexto, u: Usuario, meuTurnoId: number, outroTurnoId: number) {
  const hoje = ctx.relogio.hoje();
  return ctx.db.transacao(() => {
    const meu = buscar(ctx, u, meuTurnoId);
    const outro = buscar(ctx, u, outroTurnoId);
    if (meu.responsavel_id !== u.id) throw proibido('NAO_RESPONSAVEL', 'Você só pode oferecer em troca um turno que é seu.');
    if (outro.responsavel_id === u.id) throw new ErroDominio('TROCA_INVALIDA', 'O turno desejado já é seu.');
    if (!trocavel(meu, hoje) || !trocavel(outro, hoje)) {
      throw new ErroDominio('TROCA_INVALIDA', 'Só é possível trocar turnos pendentes e que ainda não passaram.');
    }
    const emAberto = ctx.db.um(
      `SELECT 1 AS x FROM troca WHERE status = 'PENDENTE' AND (turno_solicitante_id IN (?, ?) OR turno_solicitado_id IN (?, ?))`,
      meuTurnoId, outroTurnoId, meuTurnoId, outroTurnoId);
    if (emAberto) throw conflito('TROCA_EM_ABERTO', 'Já existe uma solicitação de troca em aberto envolvendo um destes turnos.');

    const { id } = ctx.db.executar(
      `INSERT INTO troca (republica_id, turno_solicitante_id, turno_solicitado_id, solicitante_id, solicitado_id, status, criado_em)
       VALUES (?, ?, ?, ?, ?, 'PENDENTE', ?)`, u.republicaId, meuTurnoId, outroTurnoId, u.id, outro.responsavel_id, ctx.relogio.agora());
    notificar(ctx, outro.responsavel_id, 'TROCA',
      `${u.nome} quer trocar o turno de ${rotulo(meu.tipo)} de ${meu.data} pelo seu de ${rotulo(outro.tipo)} de ${outro.data}.`, `troca:${id}`);
    return trocaDTO(ctx, u, buscarTroca(ctx, u, id));
  });
}

/** RF-06 (2ª metade): com o aceite do segundo morador, a substituição é registrada e o calendário atualizado. */
export function responderTroca(ctx: Contexto, u: Usuario, id: number, aceitar: boolean) {
  const hoje = ctx.relogio.hoje();
  const troca = buscarTroca(ctx, u, id);
  if (troca.solicitado_id !== u.id) throw proibido('SEM_PERMISSAO', 'Apenas o morador convidado para a troca pode respondê-la.');
  if (troca.status !== 'PENDENTE') throw conflito('TROCA_JA_DECIDIDA', 'Esta solicitação de troca não está mais em aberto.');

  if (aceitar) {
    // A escala pode ter mudado desde o pedido: revalida antes de efetivar.
    const a = buscar(ctx, u, troca.turno_solicitante_id);
    const b = buscar(ctx, u, troca.turno_solicitado_id);
    const ativos = new Set(moradoresAtivos(ctx, u.republicaId).map((m) => m.id));
    const aindaValida = trocavel(a, hoje) && trocavel(b, hoje)
      && a.responsavel_id === troca.solicitante_id && b.responsavel_id === troca.solicitado_id
      && ativos.has(troca.solicitante_id) && ativos.has(troca.solicitado_id);
    if (!aindaValida) {
      ctx.db.executar(`UPDATE troca SET status = 'CANCELADA', decidido_em = ? WHERE id = ?`, ctx.relogio.agora(), id);
      throw conflito('TROCA_EXPIRADA', 'Os turnos mudaram desde o pedido; a solicitação foi cancelada.');
    }
  }

  return ctx.db.transacao(() => {
    if (aceitar) {
      ctx.db.executar('UPDATE turno SET responsavel_id = ? WHERE id = ?', troca.solicitado_id, troca.turno_solicitante_id);
      ctx.db.executar('UPDATE turno SET responsavel_id = ? WHERE id = ?', troca.solicitante_id, troca.turno_solicitado_id);
    }
    ctx.db.executar('UPDATE troca SET status = ?, decidido_em = ? WHERE id = ?', aceitar ? 'ACEITA' : 'RECUSADA', ctx.relogio.agora(), id);
    notificar(ctx, troca.solicitante_id, 'TROCA', `${u.nome} ${aceitar ? 'aceitou' : 'recusou'} sua solicitação de troca de turno.`, `troca-resposta:${id}`);
    return trocaDTO(ctx, u, buscarTroca(ctx, u, id));
  });
}

export function cancelarTroca(ctx: Contexto, u: Usuario, id: number) {
  const troca = buscarTroca(ctx, u, id);
  if (troca.solicitante_id !== u.id) throw proibido('SEM_PERMISSAO', 'Apenas quem solicitou a troca pode cancelá-la.');
  if (troca.status !== 'PENDENTE') throw conflito('TROCA_JA_DECIDIDA', 'Esta solicitação de troca não está mais em aberto.');
  ctx.db.executar(`UPDATE troca SET status = 'CANCELADA', decidido_em = ? WHERE id = ?`, ctx.relogio.agora(), id);
  return trocaDTO(ctx, u, buscarTroca(ctx, u, id));
}

/** Trocas em aberto em que o usuário é parte. */
export function listarTrocas(ctx: Contexto, u: Usuario) {
  return ctx.db.todos<TrocaLinha>(
    `SELECT * FROM troca WHERE republica_id = ? AND status = 'PENDENTE' AND (solicitante_id = ? OR solicitado_id = ?) ORDER BY id DESC`,
    u.republicaId, u.id, u.id).map((t) => trocaDTO(ctx, u, t));
}
