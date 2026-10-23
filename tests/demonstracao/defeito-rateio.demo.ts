/**
 * DEMONSTRAÇÃO DE FALHA — este arquivo falha de propósito.
 *
 * Simula um defeito realista: alguém "simplifica" o rateio e esquece a linha que entrega os centavos
 * residuais ao pagador (RB-05). Os testes abaixo são exatamente as verificações da suíte oficial
 * (tests/dominio.test.ts), aplicadas à versão defeituosa, para mostrar como a falha é apontada.
 *
 * Não faz parte de `npm test` nem do CI (o nome termina em .demo.ts). Para rodar:
 *   npm run test:demo-falha
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ratear } from '../../src/dominio/rateio.ts';

/** Cópia de src/dominio/rateio.ts com o defeito: o resto da divisão é descartado. */
function ratearComDefeito(valorCentavos: number, moradores: readonly number[], _pagadorId: number): Map<number, number> {
  const participantes = [...new Set(moradores)].sort((a, b) => a - b);
  const base = Math.floor(valorCentavos / participantes.length);
  return new Map<number, number>(participantes.map((id) => [id, base])); // DEFEITO: falta somar o resto na cota do pagador
}

const soma = (cotas: Map<number, number>) => [...cotas.values()].reduce((a, b) => a + b, 0);

describe('DEMONSTRAÇÃO: rateio com defeito (falha esperada)', () => {
  test('RB-05: R$ 100,00 entre 3 moradores deve fechar em R$ 100,00', () => {
    const cotas = ratearComDefeito(10000, [1, 2, 3], 2);
    assert.equal(soma(cotas), 10000, `a soma das cotas deu ${soma(cotas)} centavos: 1 centavo sumiu do rateio`);
  });

  test('RB-05: o pagador (id 2) fica com o centavo residual', () => {
    assert.deepEqual([...ratearComDefeito(10000, [1, 2, 3], 2)], [[1, 3333], [2, 3334], [3, 3333]]);
  });

  test('controle: a implementação real passa nas mesmas verificações', () => {
    const cotas = ratear(10000, [1, 2, 3], 2);
    assert.equal(soma(cotas), 10000);
    assert.deepEqual([...cotas], [[1, 3333], [2, 3334], [3, 3333]]);
  });
});
