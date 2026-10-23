import type { Contexto, Usuario } from './contexto.ts';
import { auditar, exigirAdmin, moradoresAtivos } from './contexto.ts';
import { ErroDominio, conflito, naoEncontrado, proibido } from '../erros.ts';
import { ratear } from '../dominio/rateio.ts';
import { simplificarDividas } from '../dominio/acerto.ts';
import { ehPeriodo, periodoDe, ultimoDiaDoPeriodo } from '../dominio/datas.ts';
import { notificar, notificarAdmins } from './notificacoes.ts';

interface CompraLinha {
  id: number; republica_id: number; descricao: string; valor_centavos: number; pagador_id: number; data: string;
  status: 'PENDENTE' | 'APROVADA' | 'REJEITADA'; registrada_por: number; decidida_por: number | null;
  decidida_em: string | null; motivo_rejeicao: string | null; pagador_nome: string; registrador_nome: string;
}

const SELECAO = `
  SELECT c.*, p.nome AS pagador_nome, r.nome AS registrador_nome
  FROM compra c JOIN usuario p ON p.id = c.pagador_id JOIN usuario r ON r.id = c.registrada_por`;

function paraDTO(ctx: Contexto, c: CompraLinha) {
  const cotas = ctx.db.todos<{ usuarioId: number; nome: string; valorCentavos: number }>(
    `SELECT ct.usuario_id AS usuarioId, u.nome, ct.valor_centavos AS valorCentavos
     FROM cota ct JOIN usuario u ON u.id = ct.usuario_id WHERE ct.compra_id = ? ORDER BY u.id`, c.id);
  return {
    id: c.id, descricao: c.descricao, valorCentavos: c.valor_centavos, data: c.data, status: c.status,
    pagadorId: c.pagador_id, pagadorNome: c.pagador_nome, registradaPor: c.registrada_por, registradorNome: c.registrador_nome,
    motivoRejeicao: c.motivo_rejeicao, cotas,
  };
}

function buscar(ctx: Contexto, u: Usuario, id: number): CompraLinha {
  const c = ctx.db.um<CompraLinha>(`${SELECAO} WHERE c.id = ? AND c.republica_id = ?`, id, u.republicaId);
  if (!c) throw naoEncontrado('Compra');
  return c;
}

function periodoFechado(ctx: Contexto, republicaId: number, data: string): boolean {
  return ctx.db.um('SELECT 1 AS x FROM fechamento WHERE republica_id = ? AND periodo = ?', republicaId, periodoDe(data)) !== undefined;
}

/** RB-02: lança o rateio da compra entre os moradores ativos neste momento (o da efetivação). */
function lancarRateio(ctx: Contexto, compra: CompraLinha): void {
  const ativos = moradoresAtivos(ctx, compra.republica_id).map((m) => m.id);
  if (!ativos.includes(compra.pagador_id)) {
    throw conflito('PAGADOR_INATIVO', 'O pagador não é mais um morador ativo; a compra não pode ser efetivada.');
  }
  for (const [usuarioId, valor] of ratear(compra.valor_centavos, ativos, compra.pagador_id)) {
    ctx.db.executar('INSERT INTO cota (compra_id, usuario_id, valor_centavos) VALUES (?, ?, ?)', compra.id, usuarioId, valor);
  }
}

export interface NovaCompra {
  descricao: string; valorCentavos: number; pagadorId: number; data: string;
}

/**
 * RF-05 / RF-08: registro de compra coletiva.
 * Registrada pelo administrador, é efetivada na hora. Registrada por morador, fica PENDENTE até a decisão do administrador.
 */
export function registrarCompra(ctx: Contexto, u: Usuario, dados: NovaCompra) {
  const hoje = ctx.relogio.hoje();
  if (dados.data > hoje) throw new ErroDominio('DATA_FUTURA', 'A data da compra não pode estar no futuro.');
  return ctx.db.transacao(() => {
    if (periodoFechado(ctx, u.republicaId, dados.data)) {
      throw conflito('PERIODO_FECHADO', `O mês ${periodoDe(dados.data)} já foi fechado e não aceita novos lançamentos.`);
    }
    const pagador = ctx.db.um<{ id: number }>('SELECT id FROM usuario WHERE id = ? AND republica_id = ? AND ativo = 1', dados.pagadorId, u.republicaId);
    if (!pagador) throw new ErroDominio('PAGADOR_INVALIDO', 'O pagador deve ser um morador ativo desta república.');

    const aprovadaNaHora = u.perfil === 'ADMIN';
    const agora = ctx.relogio.agora();
    const { id } = ctx.db.executar(
      `INSERT INTO compra (republica_id, descricao, valor_centavos, pagador_id, data, status, registrada_por, decidida_por, decidida_em, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u.republicaId, dados.descricao, dados.valorCentavos, dados.pagadorId, dados.data,
      aprovadaNaHora ? 'APROVADA' : 'PENDENTE', u.id, aprovadaNaHora ? u.id : null, aprovadaNaHora ? agora : null, agora);
    const compra = buscar(ctx, u, id);
    if (aprovadaNaHora) {
      lancarRateio(ctx, compra);
      auditar(ctx, u, 'COMPRA_REGISTRADA_E_APROVADA', { compraId: id, valorCentavos: dados.valorCentavos, pagadorId: dados.pagadorId });
    } else {
      notificarAdmins(ctx, u.republicaId, 'COMPRA_PENDENTE', `${u.nome} registrou a compra "${dados.descricao}" e aguarda aprovação.`, `compra-pendente:${id}`);
    }
    return paraDTO(ctx, compra);
  });
}

/** RF-08: decisão do administrador sobre uma compra pendente. Só a aprovação gera rateio. */
export function decidirCompra(ctx: Contexto, u: Usuario, id: number, aprovar: boolean, motivo: string | undefined) {
  exigirAdmin(u);
  return ctx.db.transacao(() => {
    const compra = buscar(ctx, u, id);
    if (compra.status !== 'PENDENTE') throw conflito('COMPRA_JA_DECIDIDA', 'Esta compra já foi aprovada ou rejeitada.');
    if (aprovar) {
      if (periodoFechado(ctx, u.republicaId, compra.data)) {
        throw conflito('PERIODO_FECHADO', `O mês ${periodoDe(compra.data)} já foi fechado; rejeite a compra ou registre-a com outra data.`);
      }
      lancarRateio(ctx, compra);
    } else if (!motivo) {
      throw new ErroDominio('MOTIVO_OBRIGATORIO', 'Informe o motivo da rejeição.', 400);
    }
    ctx.db.executar('UPDATE compra SET status = ?, decidida_por = ?, decidida_em = ?, motivo_rejeicao = ? WHERE id = ?',
      aprovar ? 'APROVADA' : 'REJEITADA', u.id, ctx.relogio.agora(), aprovar ? null : motivo!, id);
    auditar(ctx, u, aprovar ? 'COMPRA_APROVADA' : 'COMPRA_REJEITADA', { compraId: id, motivo: motivo ?? null });
    notificar(ctx, compra.registrada_por, 'COMPRA_DECIDIDA',
      aprovar ? `Sua compra "${compra.descricao}" foi aprovada e entrou no rateio.` : `Sua compra "${compra.descricao}" foi rejeitada: ${motivo}`,
      `compra-decidida:${id}`);
    return paraDTO(ctx, buscar(ctx, u, id));
  });
}

export function listarCompras(ctx: Contexto, u: Usuario) {
  return ctx.db.todos<CompraLinha>(`${SELECAO} WHERE c.republica_id = ? ORDER BY c.status = 'PENDENTE' DESC, c.data DESC, c.id DESC LIMIT 200`, u.republicaId)
    .map((c) => paraDTO(ctx, c));
}

export interface SaldoMorador {
  usuarioId: number; nome: string; ativo: boolean; saldoCentavos: number;
}

/**
 * Glossário: "Saldo Devedor / Credor". saldo = total pago em compras aprovadas − soma das próprias cotas,
 * corrigido pelos acertos já pagos (quem pagou sobe, quem recebeu desce).
 * RB-03: por ser um saldo líquido único por morador, toda dívida anterior é compensada antes de surgir crédito.
 */
export function calcularSaldos(ctx: Contexto, republicaId: number): SaldoMorador[] {
  return ctx.db.todos<{ id: number; nome: string; ativo: number; saldo: number }>(
    `SELECT u.id, u.nome, u.ativo,
        COALESCE((SELECT SUM(c.valor_centavos) FROM compra c WHERE c.pagador_id = u.id AND c.status = 'APROVADA'), 0)
      - COALESCE((SELECT SUM(ct.valor_centavos) FROM cota ct WHERE ct.usuario_id = u.id), 0)
      + COALESCE((SELECT SUM(a.valor_centavos) FROM acerto a WHERE a.devedor_id = u.id AND a.status = 'PAGO'), 0)
      - COALESCE((SELECT SUM(a.valor_centavos) FROM acerto a WHERE a.credor_id = u.id AND a.status = 'PAGO'), 0) AS saldo
     FROM usuario u WHERE u.republica_id = ? ORDER BY u.id`, republicaId)
    .map((l) => ({ usuarioId: l.id, nome: l.nome, ativo: l.ativo === 1, saldoCentavos: l.saldo }));
}

function transferenciasAtuais(saldos: SaldoMorador[]) {
  const nomes = new Map(saldos.map((s) => [s.usuarioId, s.nome]));
  return simplificarDividas(new Map(saldos.map((s) => [s.usuarioId, s.saldoCentavos]))).map((t) => ({
    ...t, devedorNome: nomes.get(t.devedorId)!, credorNome: nomes.get(t.credorId)!,
  }));
}

interface AcertoLinha {
  id: number; fechamento_id: number; devedor_id: number; credor_id: number; valor_centavos: number;
  status: 'PENDENTE' | 'PAGO' | 'SUBSTITUIDO'; devedor_nome: string; credor_nome: string; confirmado_em: string | null;
}

const acertoDTO = (a: AcertoLinha) => ({
  id: a.id, devedorId: a.devedor_id, devedorNome: a.devedor_nome, credorId: a.credor_id, credorNome: a.credor_nome,
  valorCentavos: a.valor_centavos, status: a.status, confirmadoEm: a.confirmado_em,
});

const SELECAO_ACERTO = `
  SELECT a.*, d.nome AS devedor_nome, c.nome AS credor_nome
  FROM acerto a JOIN usuario d ON d.id = a.devedor_id JOIN usuario c ON c.id = a.credor_id`;

/** Balanço "quem deve para quem": saldos, transferências sugeridas e fechamentos já realizados. */
export function obterBalanco(ctx: Contexto, u: Usuario) {
  const saldos = calcularSaldos(ctx, u.republicaId);
  const fechamentos = ctx.db
    .todos<{ id: number; periodo: string; fechado_em: string; fechado_por_nome: string }>(
      `SELECT f.id, f.periodo, f.fechado_em, x.nome AS fechado_por_nome FROM fechamento f JOIN usuario x ON x.id = f.fechado_por
       WHERE f.republica_id = ? ORDER BY f.periodo DESC`, u.republicaId)
    .map((f) => ({
      id: f.id, periodo: f.periodo, fechadoEm: f.fechado_em, fechadoPor: f.fechado_por_nome,
      acertos: ctx.db.todos<AcertoLinha>(`${SELECAO_ACERTO} WHERE a.fechamento_id = ? ORDER BY a.id`, f.id).map(acertoDTO),
    }));
  return { saldos, transferenciasSugeridas: transferenciasAtuais(saldos), fechamentos };
}

/**
 * RF-09: fechamento mensal. Congela o período (não aceita novos lançamentos) e transforma os saldos
 * correntes em acertos a pagar. Acertos pendentes de fechamentos anteriores são substituídos, pois
 * o saldo corrente já os contém.
 */
export function fecharPeriodo(ctx: Contexto, u: Usuario, periodo: string) {
  exigirAdmin(u);
  if (!ehPeriodo(periodo)) throw new ErroDominio('VALIDACAO', 'Período deve estar no formato AAAA-MM.', 400);
  if (periodo > periodoDe(ctx.relogio.hoje())) throw new ErroDominio('PERIODO_FUTURO', 'Não é possível fechar um mês que ainda não começou.');
  return ctx.db.transacao(() => {
    if (ctx.db.um('SELECT 1 AS x FROM fechamento WHERE republica_id = ? AND periodo = ?', u.republicaId, periodo)) {
      throw conflito('PERIODO_FECHADO', `O mês ${periodo} já foi fechado.`);
    }
    const pendentes = ctx.db.um<{ n: number }>(
      `SELECT COUNT(*) AS n FROM compra WHERE republica_id = ? AND status = 'PENDENTE' AND data <= ?`, u.republicaId, ultimoDiaDoPeriodo(periodo))!.n;
    if (pendentes > 0) {
      throw conflito('COMPRAS_PENDENTES', `Há ${pendentes} compra(s) aguardando aprovação até ${periodo}. Decida-as antes de fechar o mês.`);
    }
    ctx.db.executar(
      `UPDATE acerto SET status = 'SUBSTITUIDO' WHERE status = 'PENDENTE' AND fechamento_id IN (SELECT id FROM fechamento WHERE republica_id = ?)`, u.republicaId);
    const { id } = ctx.db.executar('INSERT INTO fechamento (republica_id, periodo, fechado_por, fechado_em) VALUES (?, ?, ?, ?)',
      u.republicaId, periodo, u.id, ctx.relogio.agora());
    const transferencias = transferenciasAtuais(calcularSaldos(ctx, u.republicaId));
    for (const t of transferencias) {
      const acerto = ctx.db.executar(`INSERT INTO acerto (fechamento_id, devedor_id, credor_id, valor_centavos, status) VALUES (?, ?, ?, ?, 'PENDENTE')`,
        id, t.devedorId, t.credorId, t.valorCentavos);
      notificar(ctx, t.devedorId, 'ACERTO',
        `Fechamento de ${periodo}: você deve R$ ${(t.valorCentavos / 100).toFixed(2).replace('.', ',')} para ${t.credorNome}.`, `acerto:${acerto.id}`);
    }
    auditar(ctx, u, 'PERIODO_FECHADO', { periodo, acertos: transferencias.length });
    return { id, periodo, acertos: ctx.db.todos<AcertoLinha>(`${SELECAO_ACERTO} WHERE a.fechamento_id = ? ORDER BY a.id`, id).map(acertoDTO) };
  });
}

/**
 * RF-10: o pagamento acontece fora do sistema (PIX, dinheiro). Quem confirma é quem recebeu
 * (o credor) ou o administrador — nunca o próprio devedor.
 */
export function confirmarAcerto(ctx: Contexto, u: Usuario, id: number) {
  return ctx.db.transacao(() => {
    const a = ctx.db.um<AcertoLinha>(
      `${SELECAO_ACERTO} JOIN fechamento f ON f.id = a.fechamento_id WHERE a.id = ? AND f.republica_id = ?`, id, u.republicaId);
    if (!a) throw naoEncontrado('Acerto');
    if (u.id !== a.credor_id && u.perfil !== 'ADMIN') {
      throw proibido('SEM_PERMISSAO', 'Apenas quem recebe o pagamento ou o administrador pode confirmá-lo.');
    }
    if (u.id === a.devedor_id) throw proibido('DEVEDOR_NAO_CONFIRMA', 'O devedor não pode confirmar o próprio pagamento.');
    if (a.status !== 'PENDENTE') throw conflito('ACERTO_NAO_PENDENTE', 'Este acerto já foi pago ou substituído por um fechamento mais recente.');
    ctx.db.executar(`UPDATE acerto SET status = 'PAGO', confirmado_por = ?, confirmado_em = ? WHERE id = ?`, u.id, ctx.relogio.agora(), id);
    auditar(ctx, u, 'ACERTO_CONFIRMADO', { acertoId: id, valorCentavos: a.valor_centavos });
    notificar(ctx, a.devedor_id, 'ACERTO', `${a.credor_nome} recebeu seu pagamento de R$ ${(a.valor_centavos / 100).toFixed(2).replace('.', ',')}.`, `acerto-pago:${id}`);
    return acertoDTO(ctx.db.um<AcertoLinha>(`${SELECAO_ACERTO} WHERE a.id = ?`, id)!);
  });
}
