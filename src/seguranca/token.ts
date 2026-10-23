import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * RNF-02 / ADR-004: token de sessão JWT (RFC 7519) assinado com HS256.
 * Implementação mínima e fechada: só emite e só aceita HS256, o que elimina as classes de
 * ataque por troca de algoritmo ("alg: none", confusão RS/HS).
 */

const CABECALHO = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function assinar(conteudo: string, segredo: string): Buffer {
  return createHmac('sha256', segredo).update(conteudo).digest();
}

export function emitirToken(usuarioId: number, segredo: string, agoraSeg: number, duracaoSeg: number): string {
  const corpo = Buffer.from(JSON.stringify({ sub: usuarioId, iat: agoraSeg, exp: agoraSeg + duracaoSeg })).toString('base64url');
  const conteudo = `${CABECALHO}.${corpo}`;
  return `${conteudo}.${assinar(conteudo, segredo).toString('base64url')}`;
}

/** Devolve o id do usuário, ou null se o token for inválido, adulterado ou expirado. */
export function verificarToken(token: string, segredo: string, agoraSeg: number): number | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [cabecalho, corpo, assinatura] = partes as [string, string, string];
  if (cabecalho !== CABECALHO) return null;

  const esperada = assinar(`${cabecalho}.${corpo}`, segredo);
  const recebida = Buffer.from(assinatura, 'base64url');
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;

  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as { sub?: unknown; exp?: unknown };
    if (typeof dados.sub !== 'number' || typeof dados.exp !== 'number') return null;
    if (dados.exp <= agoraSeg) return null;
    return dados.sub;
  } catch {
    return null;
  }
}
