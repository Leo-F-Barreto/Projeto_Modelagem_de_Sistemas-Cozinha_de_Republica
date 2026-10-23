import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { estadoValidade } from '../src/dominio/validade.ts';
import { ratear } from '../src/dominio/rateio.ts';
import { simplificarDividas } from '../src/dominio/acerto.ts';
import { distribuirTurnos } from '../src/dominio/escala.ts';
import { diasEntre, ehDataISO, somarDias, ultimoDiaDoPeriodo } from '../src/dominio/datas.ts';
import { conferirSenha, gerarHash } from '../src/seguranca/senha.ts';
import { emitirToken, verificarToken } from '../src/seguranca/token.ts';

describe('datas', () => {
  test('valida datas de calendário, inclusive inexistentes', () => {
    assert.equal(ehDataISO('2026-02-28'), true);
    assert.equal(ehDataISO('2026-02-30'), false);
    assert.equal(ehDataISO('10/03/2026'), false);
  });
  test('soma e diferença atravessam mês e ano bissexto', () => {
    assert.equal(somarDias('2024-02-28', 2), '2024-03-01');
    assert.equal(diasEntre('2026-12-30', '2027-01-02'), 3);
    assert.equal(ultimoDiaDoPeriodo('2024-02'), '2024-02-29');
  });
});

describe('RF-03 / glossário: Validade Crítica (3 dias ou menos)', () => {
  const hoje = '2026-03-10';
  test('4 dias para vencer ainda é OK', () => assert.equal(estadoValidade('2026-03-14', hoje), 'OK'));
  test('exatamente 3 dias já é crítica', () => assert.equal(estadoValidade('2026-03-13', hoje), 'CRITICA'));
  test('vence hoje: crítica e ainda consumível', () => assert.equal(estadoValidade('2026-03-10', hoje), 'CRITICA'));
  test('RB-04: venceu ontem é vencida', () => assert.equal(estadoValidade('2026-03-09', hoje), 'VENCIDA'));
  test('produto sem validade nunca entra em alerta', () => assert.equal(estadoValidade(null, hoje), 'SEM_VALIDADE'));
});

describe('RB-02 / RB-05: rateio igualitário', () => {
  test('divisão exata gera cotas idênticas', () => {
    assert.deepEqual([...ratear(9000, [1, 2, 3], 1)], [[1, 3000], [2, 3000], [3, 3000]]);
  });
  test('RB-05: centavos residuais ficam com o pagador e a soma fecha no valor da compra', () => {
    const cotas = ratear(10000, [1, 2, 3], 2);
    assert.deepEqual([...cotas], [[1, 3333], [2, 3334], [3, 3333]]);
    assert.equal([...cotas.values()].reduce((a, b) => a + b), 10000);
  });
  test('a soma das cotas sempre é igual ao valor, para qualquer valor e tamanho de casa', () => {
    for (let n = 1; n <= 9; n += 1) {
      const moradores = Array.from({ length: n }, (_, i) => i + 1);
      for (const valor of [1, 7, 99, 100, 101, 1234567]) {
        const cotas = [...ratear(valor, moradores, 1).values()];
        assert.equal(cotas.reduce((a, b) => a + b), valor);
        assert.ok(Math.max(...cotas) - Math.min(...cotas) < n, 'diferença entre cotas é só o resíduo');
      }
    }
  });
  test('rejeita valor não inteiro, não positivo ou casa sem moradores', () => {
    assert.throws(() => ratear(10.5, [1], 1), RangeError);
    assert.throws(() => ratear(0, [1], 1), RangeError);
    assert.throws(() => ratear(100, [], 1), RangeError);
  });
});

describe('RB-03: compensação de saldos em transferências', () => {
  test('um credor e dois devedores', () => {
    assert.deepEqual(simplificarDividas(new Map([[1, 6000], [2, -3000], [3, -3000]])), [
      { devedorId: 2, credorId: 1, valorCentavos: 3000 },
      { devedorId: 3, credorId: 1, valorCentavos: 3000 },
    ]);
  });
  test('gera no máximo n-1 transferências e zera todos os saldos', () => {
    const saldos = new Map([[1, 5000], [2, -1200], [3, 2500], [4, -4300], [5, -2000]]);
    const ts = simplificarDividas(saldos);
    assert.ok(ts.length <= saldos.size - 1);
    const final = new Map(saldos);
    for (const t of ts) {
      final.set(t.devedorId, final.get(t.devedorId)! + t.valorCentavos);
      final.set(t.credorId, final.get(t.credorId)! - t.valorCentavos);
    }
    assert.deepEqual([...final.values()], [0, 0, 0, 0, 0]);
  });
  test('saldos zerados não geram transferência', () => assert.deepEqual(simplificarDividas(new Map([[1, 0], [2, 0]])), []));
  test('saldos que não fecham em zero indicam corrupção e são rejeitados', () => {
    assert.throws(() => simplificarDividas(new Map([[1, 100], [2, -50]])), RangeError);
  });
});

describe('RF-11: rodízio da escala', () => {
  const datas = ['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13'];
  test('percorre os moradores em ordem e recomeça', () => {
    assert.deepEqual(distribuirTurnos(datas, [1, 2, 3], null).map((t) => t.responsavelId), [1, 2, 3, 1]);
  });
  test('continua depois do último responsável da escala anterior', () => {
    assert.deepEqual(distribuirTurnos(datas, [1, 2, 3], 2).map((t) => t.responsavelId), [3, 1, 2, 3]);
  });
  test('se o último responsável saiu da casa, segue o próximo por ordem', () => {
    assert.deepEqual(distribuirTurnos(datas.slice(0, 2), [1, 4], 2).map((t) => t.responsavelId), [4, 1]);
  });
});

describe('RNF-02: senha e token', () => {
  test('hash usa scrypt com salt aleatório: mesma senha, hashes diferentes', async () => {
    const [a, b] = await Promise.all([gerarHash('minha-senha', 10), gerarHash('minha-senha', 10)]);
    assert.match(a, /^scrypt\$10\$8\$1\$/);
    assert.notEqual(a, b);
    assert.equal(await conferirSenha('minha-senha', a), true);
    assert.equal(await conferirSenha('outra-senha', a), false);
  });
  test('hash malformado ou com custo absurdo é recusado sem estourar', async () => {
    assert.equal(await conferirSenha('x', 'texto-qualquer'), false);
    assert.equal(await conferirSenha('x', 'scrypt$40$8$1$AAAA$AAAA'), false);
  });
  test('token válido devolve o usuário; expirado, adulterado ou de outro segredo, não', () => {
    const token = emitirToken(7, 'segredo-a', 1000, 60);
    assert.equal(verificarToken(token, 'segredo-a', 1030), 7);
    assert.equal(verificarToken(token, 'segredo-a', 1060), null, 'expirado');
    assert.equal(verificarToken(token, 'segredo-b', 1030), null, 'outro segredo');
    const [c, , a] = token.split('.');
    const forjado = Buffer.from(JSON.stringify({ sub: 1, iat: 1000, exp: 9999999999 })).toString('base64url');
    assert.equal(verificarToken(`${c}.${forjado}.${a}`, 'segredo-a', 1030), null, 'corpo adulterado');
  });
  test('token com "alg: none" é recusado', () => {
    const cabecalho = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const corpo = Buffer.from(JSON.stringify({ sub: 1, exp: 9999999999 })).toString('base64url');
    assert.equal(verificarToken(`${cabecalho}.${corpo}.`, 'segredo-a', 1000), null);
  });
});
