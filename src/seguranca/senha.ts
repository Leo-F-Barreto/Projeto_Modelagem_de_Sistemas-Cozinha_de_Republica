import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * RNF-02 / ADR-004: senhas guardadas como hash scrypt com salt aleatório por usuário.
 * Formato autodescritivo: scrypt$logN$r$p$salt$hash — os parâmetros viajam com o hash,
 * o que permite elevar o custo no futuro sem invalidar as senhas já cadastradas.
 */

const R = 8;
const P = 1;
const TAMANHO = 32;

function derivar(senha: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  const N = 2 ** logN;
  return new Promise((resolve, reject) => {
    scrypt(senha.normalize('NFKC'), salt, TAMANHO, { N, r, p, maxmem: 256 * N * r }, (erro, chave) => {
      if (erro) reject(erro);
      else resolve(chave);
    });
  });
}

export async function gerarHash(senha: string, logN: number): Promise<string> {
  const salt = randomBytes(16);
  const chave = await derivar(senha, salt, logN, R, P);
  return ['scrypt', logN, R, P, salt.toString('base64url'), chave.toString('base64url')].join('$');
}

export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  const [algoritmo, logN, r, p, salt, esperado] = hash.split('$');
  if (algoritmo !== 'scrypt' || !logN || !r || !p || !salt || !esperado) return false;
  const logNNum = Number(logN);
  // Limites defensivos: um hash adulterado não pode forçar um custo arbitrário.
  if (!Number.isInteger(logNNum) || logNNum < 10 || logNNum > 20) return false;
  const chave = await derivar(senha, Buffer.from(salt, 'base64url'), logNNum, Number(r), Number(p));
  const alvo = Buffer.from(esperado, 'base64url');
  return chave.length === alvo.length && timingSafeEqual(chave, alvo);
}
