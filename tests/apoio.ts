import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Banco } from '../src/db.ts';
import { relogioFixo } from '../src/relogio.ts';
import { criarApp } from '../src/http/app.ts';
import type { Contexto } from '../src/servicos/contexto.ts';

export const HOJE = '2026-03-10';

export interface Sessao {
  token: string;
  usuario: { id: number; republicaId: number; nome: string; perfil: 'ADMIN' | 'MORADOR' };
}

export interface Resp<T = any> {
  status: number;
  corpo: T;
}

/** Sobe a aplicação inteira (HTTP + regras + SQLite em memória) com relógio controlado. */
export async function subirApp(opcoes: { limiteAuth?: number } = {}) {
  const relogio = relogioFixo(HOJE);
  const ctx: Contexto = {
    db: new Banco(':memory:'),
    relogio,
    config: { segredoJwt: 'segredo-de-teste-com-mais-de-32-caracteres', scryptLogN: 10, duracaoTokenSeg: 30 * 86_400 },
  };
  const servidor: Server = createServer(criarApp(ctx, { limiteAuth: opcoes.limiteAuth ?? 10_000 }));
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

  async function chamar<T = any>(metodo: string, caminho: string, corpo?: unknown, token?: string): Promise<Resp<T>> {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await r.text();
    return { status: r.status, corpo: (texto ? JSON.parse(texto) : null) as T };
  }

  let seq = 0;
  /** Cria uma república com um administrador e `moradores` moradores comuns. */
  async function criarRepublica(moradores = 2): Promise<{ admin: Sessao; moradores: Sessao[]; convite: string }> {
    seq += 1;
    const admin = (await chamar<Sessao>('POST', '/api/auth/registro',
      { nome: `Admin${seq}`, email: `admin${seq}@teste.com`, senha: 'senha-forte-1', nomeRepublica: `República ${seq}` })).corpo;
    const convite = (await chamar('GET', '/api/republica', undefined, admin.token)).corpo.codigoConvite as string;
    const lista: Sessao[] = [];
    for (let i = 1; i <= moradores; i += 1) {
      lista.push((await chamar<Sessao>('POST', '/api/auth/registro',
        { nome: `Morador${seq}.${i}`, email: `m${seq}.${i}@teste.com`, senha: 'senha-forte-1', codigoConvite: convite })).corpo);
    }
    return { admin, moradores: lista, convite };
  }

  return {
    ctx, relogio, base, chamar, criarRepublica,
    fechar: () => new Promise<void>((ok) => servidor.close(() => { ctx.db.fechar(); ok(); })),
  };
}

export type App = Awaited<ReturnType<typeof subirApp>>;
