import { ErroDominio } from './erros.ts';
import { ehDataISO } from './dominio/datas.ts';

/** Validação de entrada na fronteira HTTP: nada chega aos serviços sem tipo e limites conferidos. */

const invalido = (mensagem: string) => new ErroDominio('VALIDACAO', mensagem, 400);

export type Corpo = Record<string, unknown>;

export function objeto(valor: unknown): Corpo {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) throw invalido('O corpo da requisição deve ser um objeto JSON.');
  return valor as Corpo;
}

export function texto(o: Corpo, campo: string, opcoes: { min?: number; max?: number } = {}): string {
  const { min = 1, max = 120 } = opcoes;
  const v = o[campo];
  if (typeof v !== 'string') throw invalido(`Campo "${campo}" é obrigatório e deve ser texto.`);
  const limpo = v.trim();
  if (limpo.length < min || limpo.length > max) throw invalido(`Campo "${campo}" deve ter entre ${min} e ${max} caracteres.`);
  return limpo;
}

export function textoOpcional(o: Corpo, campo: string, opcoes: { min?: number; max?: number } = {}): string | undefined {
  return o[campo] === undefined || o[campo] === null ? undefined : texto(o, campo, opcoes);
}

export function numero(o: Corpo, campo: string, opcoes: { min?: number; max?: number; exclusivoMin?: boolean } = {}): number {
  const { min = 0, max = 1_000_000, exclusivoMin = false } = opcoes;
  const v = o[campo];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw invalido(`Campo "${campo}" é obrigatório e deve ser numérico.`);
  if (v < min || v > max || (exclusivoMin && v === min)) {
    throw invalido(`Campo "${campo}" deve ser ${exclusivoMin ? 'maior que' : 'no mínimo'} ${min} e no máximo ${max}.`);
  }
  return v;
}

export function inteiro(o: Corpo, campo: string, opcoes: { min?: number; max?: number } = {}): number {
  const v = numero(o, campo, { min: opcoes.min ?? 1, max: opcoes.max ?? Number.MAX_SAFE_INTEGER });
  if (!Number.isInteger(v)) throw invalido(`Campo "${campo}" deve ser um número inteiro.`);
  return v;
}

export function dataISO(o: Corpo, campo: string): string {
  const v = o[campo];
  if (typeof v !== 'string' || !ehDataISO(v)) throw invalido(`Campo "${campo}" deve ser uma data válida no formato AAAA-MM-DD.`);
  return v;
}

export function dataISOOpcional(o: Corpo, campo: string): string | null {
  return o[campo] === undefined || o[campo] === null || o[campo] === '' ? null : dataISO(o, campo);
}

export function umDe<T extends string>(o: Corpo, campo: string, opcoes: readonly T[]): T {
  const v = o[campo];
  if (typeof v !== 'string' || !opcoes.includes(v as T)) throw invalido(`Campo "${campo}" deve ser um de: ${opcoes.join(', ')}.`);
  return v as T;
}

export function idDeRota(valor: string | undefined): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw invalido('Identificador inválido.');
  return n;
}
