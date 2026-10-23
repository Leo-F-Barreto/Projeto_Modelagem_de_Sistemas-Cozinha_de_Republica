import type { Contexto, Usuario } from './contexto.ts';
import { moradoresAtivos } from './contexto.ts';
import { naoEncontrado } from '../erros.ts';

export type TipoNotificacao =
  | 'VALIDADE_CRITICA' | 'PRODUTO_VENCIDO' | 'ESTOQUE_MINIMO' | 'TAREFA_PENDENTE'
  | 'COMPRA_PENDENTE' | 'COMPRA_DECIDIDA' | 'ACERTO' | 'TROCA';

/** Envio idempotente: a combinação (usuário, chave) nunca gera duas notificações. */
export function notificar(ctx: Contexto, usuarioId: number, tipo: TipoNotificacao, mensagem: string, chave: string): void {
  ctx.db.executar(
    'INSERT OR IGNORE INTO notificacao (usuario_id, tipo, mensagem, chave, criado_em) VALUES (?, ?, ?, ?, ?)',
    usuarioId, tipo, mensagem, chave, ctx.relogio.agora(),
  );
}

export function notificarAtivos(ctx: Contexto, republicaId: number, tipo: TipoNotificacao, mensagem: string, chave: string): void {
  for (const m of moradoresAtivos(ctx, republicaId)) notificar(ctx, m.id, tipo, mensagem, chave);
}

export function notificarAdmins(ctx: Contexto, republicaId: number, tipo: TipoNotificacao, mensagem: string, chave: string): void {
  for (const m of moradoresAtivos(ctx, republicaId)) if (m.perfil === 'ADMIN') notificar(ctx, m.id, tipo, mensagem, chave);
}

export interface NotificacaoDTO {
  id: number;
  tipo: string;
  mensagem: string;
  lida: boolean;
  criadoEm: string;
}

export function listarNotificacoes(ctx: Contexto, u: Usuario): NotificacaoDTO[] {
  return ctx.db
    .todos<{ id: number; tipo: string; mensagem: string; lida: number; criado_em: string }>(
      'SELECT id, tipo, mensagem, lida, criado_em FROM notificacao WHERE usuario_id = ? ORDER BY lida, id DESC LIMIT 50', u.id)
    .map((n) => ({ id: n.id, tipo: n.tipo, mensagem: n.mensagem, lida: n.lida === 1, criadoEm: n.criado_em }));
}

export function marcarLida(ctx: Contexto, u: Usuario, id: number): void {
  const r = ctx.db.executar('UPDATE notificacao SET lida = 1 WHERE id = ? AND usuario_id = ?', id, u.id);
  if (r.alteradas === 0) throw naoEncontrado('Notificação');
}

export function marcarTodasLidas(ctx: Contexto, u: Usuario): void {
  ctx.db.executar('UPDATE notificacao SET lida = 1 WHERE usuario_id = ? AND lida = 0', u.id);
}
