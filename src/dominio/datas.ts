/** Operações sobre datas de calendário (AAAA-MM-DD), sem componente de hora nem fuso. */

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 86_400_000;

export function ehDataISO(valor: string): boolean {
  if (!FORMATO.test(valor)) return false;
  const t = Date.parse(`${valor}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === valor;
}

export function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Quantos dias faltam de `de` até `ate` (negativo se `ate` já passou). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / MS_DIA);
}

/** Período contábil (AAAA-MM) ao qual a data pertence. */
export function periodoDe(data: string): string {
  return data.slice(0, 7);
}

export function ehPeriodo(valor: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);
}

export function ultimoDiaDoPeriodo(periodo: string): string {
  const [ano, mes] = periodo.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}
