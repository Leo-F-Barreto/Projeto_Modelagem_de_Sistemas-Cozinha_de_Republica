import { randomBytes } from 'node:crypto';
import type { Contexto, Perfil, Usuario } from './contexto.ts';
import { auditar, exigirAdmin } from './contexto.ts';
import { ErroDominio, conflito, naoEncontrado } from '../erros.ts';
import { calcularSaldos } from './financas.ts';

export const gerarCodigoConvite = () => randomBytes(6).toString('hex').toUpperCase();

interface MembroLinha {
  id: number; nome: string; email: string; perfil: Perfil; ativo: number;
}

export function obterRepublica(ctx: Contexto, u: Usuario) {
  const r = ctx.db.um<{ id: number; nome: string; codigo_convite: string }>('SELECT id, nome, codigo_convite FROM republica WHERE id = ?', u.republicaId)!;
  const membros = ctx.db.todos<MembroLinha>('SELECT id, nome, email, perfil, ativo FROM usuario WHERE republica_id = ? ORDER BY ativo DESC, nome', u.republicaId);
  return {
    id: r.id,
    nome: r.nome,
    // O código de convite dá acesso à casa: só o administrador o enxerga.
    codigoConvite: u.perfil === 'ADMIN' ? r.codigo_convite : undefined,
    membros: membros.map((m) => ({ id: m.id, nome: m.nome, email: u.perfil === 'ADMIN' ? m.email : undefined, perfil: m.perfil, ativo: m.ativo === 1 })),
  };
}

export function regenerarConvite(ctx: Contexto, u: Usuario) {
  exigirAdmin(u);
  const codigo = gerarCodigoConvite();
  ctx.db.executar('UPDATE republica SET codigo_convite = ? WHERE id = ?', codigo, u.republicaId);
  auditar(ctx, u, 'CONVITE_REGENERADO', {});
  return { codigoConvite: codigo };
}

/**
 * RF-12: gestão de moradores pelo administrador.
 *  - RB-06: a república nunca fica sem administrador ativo.
 *  - RB-07: morador com saldo diferente de zero não pode ser desativado (precisa acertar as contas antes).
 * Ao desativar, os turnos futuros pendentes do morador são removidos para que a escala seja regenerada.
 */
export function alterarMorador(ctx: Contexto, u: Usuario, id: number, mudanca: { perfil?: Perfil; ativo?: boolean }) {
  exigirAdmin(u);
  return ctx.db.transacao(() => {
    const alvo = ctx.db.um<MembroLinha>('SELECT id, nome, email, perfil, ativo FROM usuario WHERE id = ? AND republica_id = ?', id, u.republicaId);
    if (!alvo) throw naoEncontrado('Morador');
    const novoPerfil = mudanca.perfil ?? alvo.perfil;
    const novoAtivo = mudanca.ativo ?? alvo.ativo === 1;

    const eraAdminAtivo = alvo.perfil === 'ADMIN' && alvo.ativo === 1;
    const continuaAdminAtivo = novoPerfil === 'ADMIN' && novoAtivo;
    if (eraAdminAtivo && !continuaAdminAtivo) {
      const outros = ctx.db.um<{ n: number }>(
        `SELECT COUNT(*) AS n FROM usuario WHERE republica_id = ? AND perfil = 'ADMIN' AND ativo = 1 AND id <> ?`, u.republicaId, id)!.n;
      if (outros === 0) throw conflito('ULTIMO_ADMIN', 'A república precisa de ao menos um administrador ativo. Promova outro morador antes.');
    }

    if (alvo.ativo === 1 && !novoAtivo) {
      const saldo = calcularSaldos(ctx, u.republicaId).find((s) => s.usuarioId === id)!.saldoCentavos;
      if (saldo !== 0) {
        throw new ErroDominio('SALDO_PENDENTE', `${alvo.nome} tem saldo ${saldo > 0 ? 'credor' : 'devedor'} em aberto. Faça o fechamento e confirme os acertos antes de desativá-lo.`);
      }
      const pendentes = ctx.db.um<{ n: number }>(`SELECT COUNT(*) AS n FROM compra WHERE pagador_id = ? AND status = 'PENDENTE'`, id)!.n;
      if (pendentes > 0) throw new ErroDominio('COMPRAS_PENDENTES', `${alvo.nome} tem compras aguardando aprovação. Decida-as antes de desativá-lo.`);
      ctx.db.executar(`DELETE FROM turno WHERE responsavel_id = ? AND status = 'PENDENTE' AND data >= ?`, id, ctx.relogio.hoje());
      ctx.db.executar(`UPDATE troca SET status = 'CANCELADA', decidido_em = ? WHERE status = 'PENDENTE' AND (solicitante_id = ? OR solicitado_id = ?)`,
        ctx.relogio.agora(), id, id);
    }

    ctx.db.executar('UPDATE usuario SET perfil = ?, ativo = ? WHERE id = ?', novoPerfil, novoAtivo ? 1 : 0, id);
    auditar(ctx, u, 'MORADOR_ALTERADO', { moradorId: id, perfil: novoPerfil, ativo: novoAtivo });
    return { id, nome: alvo.nome, perfil: novoPerfil, ativo: novoAtivo };
  });
}

export function listarAuditoria(ctx: Contexto, u: Usuario) {
  exigirAdmin(u);
  return ctx.db.todos<{ id: number; acao: string; detalhe: string; usuario: string; criadoEm: string }>(
    `SELECT a.id, a.acao, a.detalhe, x.nome AS usuario, a.criado_em AS criadoEm
     FROM auditoria a JOIN usuario x ON x.id = a.usuario_id WHERE a.republica_id = ? ORDER BY a.id DESC LIMIT 100`, u.republicaId);
}
