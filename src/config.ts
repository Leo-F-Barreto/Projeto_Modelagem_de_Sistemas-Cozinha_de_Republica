import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

export interface Config {
  porta: number;
  caminhoBanco: string;
  segredoJwt: string;
  fuso: string;
  /** log2 do parâmetro N do scrypt. */
  scryptLogN: number;
  /** Validade do token de sessão, em segundos. */
  duracaoTokenSeg: number;
  /** Limite de requisições de autenticação por IP a cada janela de 15 minutos. */
  limiteAuth: number;
}

/** Lê um arquivo .env simples (CHAVE=valor), sem sobrescrever variáveis já definidas. */
function carregarDotEnv(caminho: string): void {
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}

/**
 * O segredo nunca fica no código. Em desenvolvimento, é gerado na primeira execução e
 * guardado ao lado do banco (fora do Git) para que as sessões sobrevivam a reinícios.
 */
function obterSegredo(caminhoBanco: string): string {
  const doAmbiente = process.env.COCHEF_JWT_SEGREDO;
  if (doAmbiente) {
    if (doAmbiente.length < 32) throw new Error('COCHEF_JWT_SEGREDO deve ter ao menos 32 caracteres.');
    return doAmbiente;
  }
  const arquivo = join(dirname(caminhoBanco), '.segredo-jwt');
  if (existsSync(arquivo)) return readFileSync(arquivo, 'utf8').trim();
  const novo = randomBytes(48).toString('base64url');
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, novo, { mode: 0o600 });
  return novo;
}

export function carregarConfig(): Config {
  carregarDotEnv('.env');
  const caminhoBanco = process.env.COCHEF_DB ?? 'dados/cochef.db';
  return {
    porta: Number(process.env.PORT ?? 3000),
    caminhoBanco,
    segredoJwt: obterSegredo(caminhoBanco),
    fuso: process.env.COCHEF_FUSO ?? 'America/Sao_Paulo',
    scryptLogN: Number(process.env.COCHEF_SCRYPT_LOGN ?? 17),
    duracaoTokenSeg: 8 * 60 * 60,
    limiteAuth: 30,
  };
}
