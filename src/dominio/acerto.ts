export interface Transferencia {
  devedorId: number;
  credorId: number;
  valorCentavos: number;
}

/**
 * RB-03: a partir dos saldos líquidos (positivo = credor, negativo = devedor), gera o conjunto de
 * transferências que zera todos os saldos. Como parte do saldo líquido, dívidas cruzadas já estão
 * compensadas. Estratégia gulosa (maior devedor paga o maior credor): no máximo n-1 transferências.
 * Determinística: empates são resolvidos pelo menor id.
 */
export function simplificarDividas(saldos: ReadonlyMap<number, number>): Transferencia[] {
  const total = [...saldos.values()].reduce((a, b) => a + b, 0);
  if (total !== 0) throw new RangeError(`saldos não fecham em zero (soma = ${total})`);

  const devedores = [...saldos].filter(([, v]) => v < 0).map(([id, v]) => ({ id, valor: -v }));
  const credores = [...saldos].filter(([, v]) => v > 0).map(([id, v]) => ({ id, valor: v }));
  const ordenar = (lista: { id: number; valor: number }[]) => lista.sort((a, b) => b.valor - a.valor || a.id - b.id);

  const transferencias: Transferencia[] = [];
  while (devedores.length > 0 && credores.length > 0) {
    ordenar(devedores);
    ordenar(credores);
    const devedor = devedores[0]!;
    const credor = credores[0]!;
    const valor = Math.min(devedor.valor, credor.valor);
    transferencias.push({ devedorId: devedor.id, credorId: credor.id, valorCentavos: valor });
    devedor.valor -= valor;
    credor.valor -= valor;
    if (devedor.valor === 0) devedores.shift();
    if (credor.valor === 0) credores.shift();
  }
  return transferencias;
}
