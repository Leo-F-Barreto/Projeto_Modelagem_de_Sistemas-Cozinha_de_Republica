export interface TurnoPlanejado {
  data: string;
  responsavelId: number;
}

/**
 * Escala rotativa: percorre as datas atribuindo os moradores em rodízio.
 * `ultimoResponsavelId` permite continuar o rodízio de onde a escala anterior parou,
 * evitando que a mesma pessoa abra todas as escalas geradas.
 */
export function distribuirTurnos(
  datas: readonly string[],
  moradores: readonly number[],
  ultimoResponsavelId: number | null,
): TurnoPlanejado[] {
  if (moradores.length === 0) throw new RangeError('escala exige ao menos um morador ativo');
  const fila = [...moradores].sort((a, b) => a - b);
  // Próximo da fila depois do último responsável; se ele saiu da casa, segue quem viria depois dele por id.
  let indice = 0;
  if (ultimoResponsavelId !== null) {
    const proximo = fila.findIndex((id) => id > ultimoResponsavelId);
    indice = proximo === -1 ? 0 : proximo;
  }
  return datas.map((data) => {
    const responsavelId = fila[indice % fila.length]!;
    indice += 1;
    return { data, responsavelId };
  });
}
