import type { Banco } from '../db.ts';
import type { Relogio } from '../relogio.ts';
import { proibido } from '../erros.ts';

export interface Contexto {
  db: Banco;
  relogio: Relogio;
  config: { segredoJwt: string; scryptLogN: number; duracaoTokenSeg: number };
}

export type Perfil = 'ADMIN' | 'MORADOR';

/** Usuário autenticado e ativo, já vinculado à sua república. Todo serviço filtra os dados por `republicaId`. */
export interface Usuario {
  id: number;
  republicaId: number;
  nome: string;
  perfil: Perfil;
}

export function exigirAdmin(u: Usuario): void {
  if (u.perfil !== 'ADMIN') throw proibido('APENAS_ADMIN', 'Ação restrita ao administrador da república.');
}

export interface Morador {
  id: number;
  nome: string;
  perfil: Perfil;
}

/** Glossário: "Morador Ativo" — participa do rateio e das escalas vigentes. */
export function moradoresAtivos(ctx: Contexto, republicaId: number): Morador[] {
  return ctx.db.todos<Morador>('SELECT id, nome, perfil FROM usuario WHERE republica_id = ? AND ativo = 1 ORDER BY id', republicaId);
}

/** Trilha de auditoria das ações sensíveis (finanças e administração). */
export function auditar(ctx: Contexto, u: Usuario, acao: string, detalhe: Record<string, unknown>): void {
  ctx.db.executar(
    'INSERT INTO auditoria (republica_id, usuario_id, acao, detalhe, criado_em) VALUES (?, ?, ?, ?, ?)',
    u.republicaId, u.id, acao, JSON.stringify(detalhe), ctx.relogio.agora(),
  );
}
