import { diasEntre } from './datas.ts';

/** Glossário: "Validade Crítica" = vencimento a 3 dias ou menos do dia atual. */
export const DIAS_VALIDADE_CRITICA = 3;

export type EstadoValidade = 'SEM_VALIDADE' | 'OK' | 'CRITICA' | 'VENCIDA';

/**
 * Classifica a validade de um produto em relação a hoje.
 * No próprio dia do vencimento o produto ainda é consumível (CRITICA); só passa a VENCIDA no dia seguinte (RB-04).
 */
export function estadoValidade(validade: string | null, hoje: string): EstadoValidade {
  if (validade === null) return 'SEM_VALIDADE';
  const dias = diasEntre(hoje, validade);
  if (dias < 0) return 'VENCIDA';
  if (dias <= DIAS_VALIDADE_CRITICA) return 'CRITICA';
  return 'OK';
}
