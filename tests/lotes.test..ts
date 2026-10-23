
/**
 * FASE VERMELHA FEITA, RENOMEAR ARQUIVO
 * 
 * FASE VERMELHA (TDD) — T-46: lotes por produto, cada um com sua validade (US-16; revisão A-02).
 *
 * Fora do `npm test` e do CI (o nome termina em .red.ts). Para rodar:
 *   npm run test:red
 * Quando a tarefa estiver pronta, o arquivo é renomeado para tests/lotes.test.ts e passa a fazer parte da suíte.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HOJE, subirApp } from '../apoio.ts';
import type { App, Sessao } from '../apoio.ts';

/* ------------------------------------------------------------------------------------------------
 * 1. Unidade: regra pura de consumo por lotes (módulo a criar: src/dominio/lotes.ts)
 * ---------------------------------------------------------------------------------------------- */

interface Lote { id: number; quantidade: number; validade: string | null }
interface ModuloLotes {
  /** RB-11: devolve quanto sai de cada lote, do que vence primeiro para o que vence depois. Lotes sem validade saem por último. */
  planejarConsumo(lotes: readonly Lote[], quantidade: number): { loteId: number; quantidade: number }[];
  /** RB-04 por lote: separa os lotes vencidos em `hoje` dos que continuam consumíveis (no dia do vencimento ainda vale). */
  separarVencidos(lotes: readonly Lote[], hoje: string): { validos: Lote[]; vencidos: Lote[] };
}

// O caminho fica numa variável para que a verificação de tipos não acuse o módulo que ainda não existe.
const CAMINHO_LOTES = '../../src/dominio/lotes.ts';
const carregarLotes = async (): Promise<ModuloLotes> => import(CAMINHO_LOTES);

describe('VERMELHO T-46 / RB-11: consumo por lotes (unidade)', () => {
  const lotes: Lote[] = [
    { id: 1, quantidade: 5, validade: '2026-03-25' },
    { id: 2, quantidade: 2, validade: '2026-03-12' },
    { id: 3, quantidade: 4, validade: null },
  ];

  test('RB-11: consome primeiro o lote que vence antes, mesmo que tenha sido cadastrado depois', async () => {
    const { planejarConsumo } = await carregarLotes();
    assert.deepEqual(planejarConsumo(lotes, 1), [{ loteId: 2, quantidade: 1 }]);
  });

  test('RB-11: quando um lote não basta, completa com o próximo a vencer', async () => {
    const { planejarConsumo } = await carregarLotes();
    assert.deepEqual(planejarConsumo(lotes, 4), [{ loteId: 2, quantidade: 2 }, { loteId: 1, quantidade: 2 }]);
  });

  test('RB-11: lote sem validade é o último a sair', async () => {
    const { planejarConsumo } = await carregarLotes();
    assert.deepEqual(planejarConsumo(lotes, 9), [{ loteId: 2, quantidade: 2 }, { loteId: 1, quantidade: 5 }, { loteId: 3, quantidade: 2 }]);
  });

  test('RF-02: pedir mais do que a soma dos lotes é recusado', async () => {
    const { planejarConsumo } = await carregarLotes();
    assert.throws(() => planejarConsumo(lotes, 12), RangeError);
  });

  test('RB-04 por lote: no dia do vencimento o lote vale; no dia seguinte, vence sozinho', async () => {
    const { separarVencidos } = await carregarLotes();
    assert.deepEqual(separarVencidos(lotes, '2026-03-12').vencidos, []);
    const { validos, vencidos } = separarVencidos(lotes, '2026-03-13');
    assert.deepEqual(vencidos.map((l) => l.id), [2]);
    assert.deepEqual(validos.map((l) => l.id).sort(), [1, 3]);
  });
});

/* ------------------------------------------------------------------------------------------------
 * 2. Integração: o comportamento visto pela API
 * ---------------------------------------------------------------------------------------------- */

describe('VERMELHO T-46 / RF-17: lotes por produto (API)', () => {
  let app: App;
  let admin: Sessao;
  let ana: Sessao;

  before(async () => { app = await subirApp(); });
  after(() => app.fechar());
  beforeEach(async () => {
    app.relogio.definir(HOJE); // 2026-03-10
    const r = await app.criarRepublica(1);
    admin = r.admin;
    [ana] = r.moradores as [Sessao];
  });

  const cadastrar = (s: Sessao, dados: Record<string, unknown>) =>
    app.chamar('POST', '/api/produtos', { unidade: 'un', classificacao: 'COLETIVO', ...dados }, s.token);
  const repor = (s: Sessao, id: number, quantidade: number, validade?: string) =>
    app.chamar('POST', `/api/produtos/${id}/reposicao`, { quantidade, ...(validade ? { validade } : {}) }, s.token);
  const consumir = (s: Sessao, id: number, quantidade: number) =>
    app.chamar('POST', `/api/produtos/${id}/consumo`, { quantidade }, s.token);
  const produto = async (s: Sessao, id: number) =>
    ((await app.chamar('GET', '/api/produtos?todos=1', undefined, s.token)).corpo as any[]).find((p) => p.id === id);
  const resumoLotes = (p: any) => (p.lotes as any[] | undefined)?.map((l) => [l.quantidade, l.validade]);

  test('RF-17: o cadastro cria o primeiro lote do produto', async () => {
    const p = (await cadastrar(admin, { nome: 'Leite', quantidade: 2, validade: '2026-03-12' })).corpo;
    assert.deepEqual(resumoLotes(p), [[2, '2026-03-12']], 'o produto deve expor seus lotes');
  });

  test('RF-17: repor com outra validade cria um segundo lote, sem sobrescrever o primeiro', async () => {
    const p = (await cadastrar(admin, { nome: 'Leite', quantidade: 2, validade: '2026-03-12' })).corpo;
    const r = (await repor(ana, p.id, 5, '2026-03-25')).corpo;
    assert.equal(r.quantidade, 7, 'a quantidade do produto é a soma dos lotes');
    assert.equal(r.validade, '2026-03-12', 'a validade exibida é a do lote que vence primeiro, não a do último reposto');
    assert.deepEqual(resumoLotes(r), [[2, '2026-03-12'], [5, '2026-03-25']]);
  });

  test('RF-17: repor com a mesma validade soma no lote existente', async () => {
    const p = (await cadastrar(admin, { nome: 'Arroz', quantidade: 1, validade: '2026-06-01' })).corpo;
    const r = (await repor(ana, p.id, 2, '2026-06-01')).corpo;
    assert.deepEqual(resumoLotes(r), [[3, '2026-06-01']]);
  });

  test('RB-11: o consumo baixa primeiro o lote que vence antes', async () => {
    const p = (await cadastrar(admin, { nome: 'Iogurte', quantidade: 2, validade: '2026-03-12' })).corpo;
    await repor(ana, p.id, 5, '2026-03-25');
    const r = (await consumir(ana, p.id, 3)).corpo;
    assert.equal(r.quantidade, 4);
    assert.deepEqual(resumoLotes(r), [[4, '2026-03-25']], 'o lote de 12/03 acabou e o de 25/03 perdeu 1 unidade');
    assert.equal(r.validade, '2026-03-25');
  });

  test('RB-04 por lote: o lote vencido sai do estoque e o produto continua ativo com o restante', async () => {
    const p = (await cadastrar(admin, { nome: 'Queijo', quantidade: 2, validade: '2026-03-12' })).corpo;
    await repor(ana, p.id, 5, '2026-03-25');
    app.relogio.definir('2026-03-13');
    const atual = await produto(ana, p.id);
    assert.equal(atual.status, 'ATIVO');
    assert.equal(atual.quantidade, 5, 'as 2 unidades vencidas não podem continuar contando como estoque');
    assert.deepEqual(resumoLotes(atual), [[5, '2026-03-25']]);
    assert.equal((await consumir(ana, p.id, 6)).corpo.erro?.codigo, 'QUANTIDADE_INSUFICIENTE', 'só há 5 unidades consumíveis');
  });

  test('RB-04 por lote: o produto só fica VENCIDO quando todos os lotes vencem', async () => {
    const p = (await cadastrar(admin, { nome: 'Pão', quantidade: 1, validade: '2026-03-12' })).corpo;
    await repor(ana, p.id, 1, '2026-03-14');
    app.relogio.definir('2026-03-13');
    const meio = await produto(ana, p.id);
    assert.deepEqual([meio.status, resumoLotes(meio)], ['ATIVO', [[1, '2026-03-14']]]);
    app.relogio.definir('2026-03-15');
    assert.equal((await produto(ana, p.id)).status, 'VENCIDO');
  });

  test('RF-03 por lote: um lote perto de vencer aparece no painel mesmo havendo lote novo', async () => {
    const p = (await cadastrar(admin, { nome: 'Presunto', quantidade: 1, validade: '2026-03-12' })).corpo; // 2 dias: crítica
    await repor(ana, p.id, 3, '2026-03-30');
    const painel = (await app.chamar('GET', '/api/painel', undefined, ana.token)).corpo;
    assert.deepEqual(painel.validadeCritica.map((x: any) => x.nome), ['Presunto'],
      'repor com validade longa não pode esconder o lote que está vencendo');
  });

  test('RF-04 por lote: se o vencimento de um lote deixa o total no mínimo, o produto entra na lista de compras', async () => {
    const p = (await cadastrar(admin, { nome: 'Ovos', quantidade: 3, validade: '2026-03-12', quantidadeMinima: 2 })).corpo;
    await repor(ana, p.id, 2, '2026-03-30'); // total 5, acima do mínimo
    const pendentes = async () => ((await app.chamar('GET', '/api/lista', undefined, ana.token)).corpo as any[])
      .filter((i) => i.status === 'PENDENTE').map((i) => i.nome);
    assert.deepEqual(await pendentes(), []);
    app.relogio.definir('2026-03-13'); // vencem 3: restam 2, que é o mínimo
    await produto(ana, p.id);
    assert.deepEqual(await pendentes(), ['Ovos']);
  });
});
