/**
 * RB-02 / RB-05: divide o valor de uma compra coletiva em partes iguais entre os moradores ativos.
 * Valores são inteiros em centavos. Quando a divisão não é exata, os centavos residuais ficam na cota do
 * pagador (que já desembolsou o valor), de modo que a soma das cotas é sempre igual ao valor da compra.
 * Se o pagador não participa do rateio, o resíduo é distribuído um centavo por morador, em ordem de id.
 */
export function ratear(valorCentavos: number, moradores: readonly number[], pagadorId: number): Map<number, number> {
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) throw new RangeError('valor deve ser inteiro positivo em centavos');
  const participantes = [...new Set(moradores)].sort((a, b) => a - b);
  if (participantes.length === 0) throw new RangeError('rateio exige ao menos um morador ativo');

  const base = Math.floor(valorCentavos / participantes.length);
  let resto = valorCentavos - base * participantes.length;
  const cotas = new Map<number, number>(participantes.map((id) => [id, base]));

  if (cotas.has(pagadorId)) {
    cotas.set(pagadorId, base + resto);
  } else {
    for (const id of participantes) {
      if (resto === 0) break;
      cotas.set(id, base + 1);
      resto -= 1;
    }
  }
  return cotas;
}
