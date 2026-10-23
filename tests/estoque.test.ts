import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HOJE, subirApp } from './apoio.ts';
import type { App, Sessao } from './apoio.ts';

describe('Estoque, validade e lista de compras', () => {
  let app: App;
  let admin: Sessao;
  let ana: Sessao;
  let beto: Sessao;

  before(async () => { app = await subirApp(); });
  after(() => app.fechar());
  beforeEach(async () => {
    app.relogio.definir(HOJE);
    const r = await app.criarRepublica(2);
    admin = r.admin;
    [ana, beto] = r.moradores as [Sessao, Sessao];
  });

  const cadastrar = (s: Sessao, dados: Record<string, unknown>) =>
    app.chamar('POST', '/api/produtos', { quantidade: 4, unidade: 'un', classificacao: 'COLETIVO', ...dados }, s.token);
  const produtos = async (s: Sessao, todos = false) => (await app.chamar('GET', `/api/produtos${todos ? '?todos=1' : ''}`, undefined, s.token)).corpo as any[];
  const lista = async (s: Sessao) => (await app.chamar('GET', '/api/lista', undefined, s.token)).corpo as any[];
  const notificacoes = async (s: Sessao) => (await app.chamar('GET', '/api/notificacoes', undefined, s.token)).corpo as any[];

  test('RF-01: cadastro registra nome, quantidade, validade e classificação', async () => {
    const r = await cadastrar(ana, { nome: 'Leite', quantidade: 2, unidade: 'L', validade: '2026-03-20' });
    assert.equal(r.status, 201);
    assert.deepEqual(
      { nome: r.corpo.nome, quantidade: r.corpo.quantidade, validade: r.corpo.validade, classificacao: r.corpo.classificacao, status: r.corpo.status, donoId: r.corpo.donoId },
      { nome: 'Leite', quantidade: 2, validade: '2026-03-20', classificacao: 'COLETIVO', status: 'ATIVO', donoId: null });
  });

  test('RF-01 / RB-01: item individual pertence a quem cadastrou', async () => {
    const r = await cadastrar(ana, { nome: 'Iogurte da Ana', classificacao: 'INDIVIDUAL' });
    assert.equal(r.corpo.donoId, ana.usuario.id);
    const vistoPeloBeto = (await produtos(beto)).find((p) => p.id === r.corpo.id);
    assert.equal(vistoPeloBeto.meu, false);
    assert.equal(vistoPeloBeto.donoNome, ana.usuario.nome);
  });

  test('RF-01: não aceita produto já vencido nem mínimo em item individual', async () => {
    assert.equal((await cadastrar(ana, { nome: 'Queijo', validade: '2026-03-09' })).corpo.erro.codigo, 'VALIDADE_PASSADA');
    assert.equal((await cadastrar(ana, { nome: 'Queijo', classificacao: 'INDIVIDUAL', quantidadeMinima: 1 })).corpo.erro.codigo, 'MINIMO_APENAS_COLETIVO');
  });

  test('RF-02: consumo decrementa o estoque e entra no histórico', async () => {
    const p = (await cadastrar(admin, { nome: 'Ovos', quantidade: 12 })).corpo;
    const r = await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 5 }, beto.token);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.quantidade, 7);
    const historico = (await app.chamar('GET', '/api/consumos', undefined, admin.token)).corpo;
    assert.deepEqual({ produto: historico[0].produto, quantidade: historico[0].quantidade, morador: historico[0].morador },
      { produto: 'Ovos', quantidade: 5, morador: beto.usuario.nome });
  });

  test('RF-02: não permite consumir mais do que há; ao zerar, produto fica ESGOTADO', async () => {
    const p = (await cadastrar(admin, { nome: 'Manteiga', quantidade: 1.5 })).corpo;
    const demais = await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 2 }, ana.token);
    assert.equal(demais.status, 422);
    assert.equal(demais.corpo.erro.codigo, 'QUANTIDADE_INSUFICIENTE');
    await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 0.5 }, ana.token);
    const fim = await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, ana.token);
    assert.equal(fim.corpo.quantidade, 0);
    assert.equal(fim.corpo.status, 'ESGOTADO');
    assert.equal((await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, ana.token)).corpo.erro.codigo, 'PRODUTO_ESGOTADO');
  });

  test('RF-07 / RB-01: baixa em item individual alheio é bloqueada com mensagem de propriedade, inclusive para o admin', async () => {
    const p = (await cadastrar(ana, { nome: 'Chocolate da Ana', classificacao: 'INDIVIDUAL' })).corpo;
    for (const intruso of [beto, admin]) {
      const r = await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, intruso.token);
      assert.equal(r.status, 403);
      assert.equal(r.corpo.erro.codigo, 'PROPRIEDADE_INDIVIDUAL');
      assert.match(r.corpo.erro.mensagem, /uso individual/);
    }
    assert.equal((await produtos(ana)).find((x) => x.id === p.id).quantidade, 4, 'estoque intacto');
    assert.equal((await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, ana.token)).status, 200, 'a dona consome');
  });

  test('RB-01: outro morador também não edita, repõe nem descarta item individual alheio', async () => {
    const p = (await cadastrar(ana, { nome: 'Granola da Ana', classificacao: 'INDIVIDUAL' })).corpo;
    assert.equal((await app.chamar('PATCH', `/api/produtos/${p.id}`, { nome: 'Granola do Beto' }, beto.token)).status, 403);
    assert.equal((await app.chamar('POST', `/api/produtos/${p.id}/reposicao`, { quantidade: 1 }, beto.token)).status, 403);
    assert.equal((await app.chamar('POST', `/api/produtos/${p.id}/descarte`, {}, admin.token)).status, 403);
  });

  test('RF-03: produto a 3 dias ou menos do vencimento aparece em destaque no painel e notifica os moradores', async () => {
    await cadastrar(admin, { nome: 'Presunto', validade: '2026-03-13' }); // 3 dias
    await cadastrar(admin, { nome: 'Arroz', validade: '2026-03-14' }); // 4 dias
    const painel = (await app.chamar('GET', '/api/painel', undefined, ana.token)).corpo;
    assert.deepEqual(painel.validadeCritica.map((p: any) => p.nome), ['Presunto']);
    for (const s of [admin, ana, beto]) {
      await app.chamar('GET', '/api/painel', undefined, s.token);
      const ns = (await notificacoes(s)).filter((n) => n.tipo === 'VALIDADE_CRITICA');
      assert.equal(ns.length, 1, `${s.usuario.nome} recebe exatamente uma notificação`);
      assert.match(ns[0].mensagem, /Presunto/);
    }
  });

  test('RF-03: o alerta acompanha o estado — surge quando o prazo se aproxima e some quando o produto é consumido', async () => {
    const p = (await cadastrar(admin, { nome: 'Frango', quantidade: 1, validade: '2026-03-20' })).corpo;
    const criticos = async () => (await app.chamar('GET', '/api/painel', undefined, ana.token)).corpo.validadeCritica.length;
    assert.equal(await criticos(), 0);
    app.relogio.definir('2026-03-17');
    assert.equal(await criticos(), 1);
    await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, ana.token);
    assert.equal(await criticos(), 0);
  });

  test('RF-03: validade crítica de item individual só notifica o dono', async () => {
    await cadastrar(ana, { nome: 'Iogurte da Ana', classificacao: 'INDIVIDUAL', validade: '2026-03-11' });
    await app.chamar('GET', '/api/painel', undefined, beto.token);
    assert.equal((await notificacoes(beto)).length, 0);
    assert.equal((await notificacoes(ana)).filter((n) => n.tipo === 'VALIDADE_CRITICA').length, 1);
  });

  test('RB-04: passada a validade, o produto vira VENCIDO, sai do estoque ativo e não pode ser consumido', async () => {
    const p = (await cadastrar(admin, { nome: 'Iogurte', validade: '2026-03-12' })).corpo;
    app.relogio.definir('2026-03-12');
    assert.equal((await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, ana.token)).status, 200, 'no dia do vencimento ainda pode');
    app.relogio.definir('2026-03-13');
    const r = await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, ana.token);
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'PRODUTO_INDISPONIVEL');
    assert.equal((await produtos(ana)).some((x) => x.id === p.id), false, 'fora do estoque ativo');
    assert.equal((await produtos(ana, true)).find((x) => x.id === p.id).status, 'VENCIDO');
    assert.equal((await notificacoes(beto)).filter((n) => n.tipo === 'PRODUTO_VENCIDO').length, 1);
  });

  test('RF-04: ao atingir a quantidade mínima, o item coletivo entra sozinho na lista de compras, uma única vez', async () => {
    const p = (await cadastrar(admin, { nome: 'Café', quantidade: 3, quantidadeMinima: 1 })).corpo;
    await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, ana.token); // 2 > 1
    assert.equal((await lista(ana)).length, 0);
    await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, ana.token); // 1 == mínimo
    let itens = await lista(beto);
    assert.deepEqual(itens.map((i) => [i.nome, i.origem, i.status]), [['Café', 'AUTOMATICA', 'PENDENTE']]);
    await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, ana.token); // 0
    itens = await lista(beto);
    assert.equal(itens.length, 1, 'não duplica a sugestão');
    assert.equal((await notificacoes(beto)).filter((n) => n.tipo === 'ESTOQUE_MINIMO').length, 1);
  });

  test('RF-04: item individual nunca vai para a lista coletiva; coletivo sem mínimo também não', async () => {
    const ind = (await cadastrar(ana, { nome: 'Whey da Ana', quantidade: 1, classificacao: 'INDIVIDUAL' })).corpo;
    const col = (await cadastrar(ana, { nome: 'Sal', quantidade: 1 })).corpo;
    await app.chamar('POST', `/api/produtos/${ind.id}/consumo`, { quantidade: 1 }, ana.token);
    await app.chamar('POST', `/api/produtos/${col.id}/consumo`, { quantidade: 1 }, ana.token);
    assert.equal((await lista(ana)).length, 0);
  });

  test('RF-04 + reposição: repor acima do mínimo dá baixa na sugestão e reativa o produto', async () => {
    const p = (await cadastrar(admin, { nome: 'Detergente', quantidade: 1, quantidadeMinima: 1 })).corpo;
    assert.equal((await lista(ana)).length, 1, 'já nasce no mínimo');
    const r = await app.chamar('POST', `/api/produtos/${p.id}/reposicao`, { quantidade: 3 }, beto.token);
    assert.equal(r.corpo.quantidade, 4);
    const itens = await lista(ana);
    assert.equal(itens[0].status, 'COMPRADO');
    assert.equal(itens[0].compradorNome, beto.usuario.nome);
  });

  test('reposição de produto vencido substitui o lote e exige nova validade', async () => {
    const p = (await cadastrar(admin, { nome: 'Leite', quantidade: 2, validade: '2026-03-11', quantidadeMinima: 1 })).corpo;
    app.relogio.definir('2026-03-15');
    await produtos(admin);
    assert.equal((await lista(ana)).filter((i) => i.status === 'PENDENTE').length, 1, 'coletivo vencido volta para a lista');
    assert.equal((await app.chamar('POST', `/api/produtos/${p.id}/reposicao`, { quantidade: 6 }, ana.token)).corpo.erro.codigo, 'VALIDADE_OBRIGATORIA');
    const r = await app.chamar('POST', `/api/produtos/${p.id}/reposicao`, { quantidade: 6, validade: '2026-03-30' }, ana.token);
    assert.deepEqual([r.corpo.quantidade, r.corpo.status, r.corpo.validade], [6, 'ATIVO', '2026-03-30']);
  });

  test('lista de compras manual: adicionar, marcar comprado e permissões de remoção', async () => {
    const item = (await app.chamar('POST', '/api/lista', { nome: 'Papel toalha' }, ana.token)).corpo;
    assert.equal(item.origem, 'MANUAL');
    assert.equal((await app.chamar('DELETE', `/api/lista/${item.id}`, undefined, beto.token)).status, 403);
    assert.equal((await app.chamar('POST', `/api/lista/${item.id}/comprado`, {}, beto.token)).corpo.status, 'COMPRADO');
    assert.equal((await app.chamar('POST', `/api/lista/${item.id}/comprado`, {}, beto.token)).status, 409);
    const outro = (await app.chamar('POST', '/api/lista', { nome: 'Esponja' }, ana.token)).corpo;
    assert.equal((await app.chamar('DELETE', `/api/lista/${outro.id}`, undefined, ana.token)).status, 204);
  });

  test('descarte de item coletivo: só quem cadastrou ou o admin', async () => {
    const p = (await cadastrar(ana, { nome: 'Tomate' })).corpo;
    assert.equal((await app.chamar('POST', `/api/produtos/${p.id}/descarte`, {}, beto.token)).status, 403);
    assert.equal((await app.chamar('POST', `/api/produtos/${p.id}/descarte`, {}, admin.token)).corpo.status, 'DESCARTADO');
    assert.equal((await app.chamar('POST', `/api/produtos/${p.id}/consumo`, { quantidade: 1 }, ana.token)).status, 409);
  });
});

describe('RNF-01: desempenho das consultas', () => {
  test('estoque com 2.000 produtos e finanças com 500 compras respondem em menos de 1,5 s', async () => {
    const app = await subirApp();
    try {
      const { admin, moradores } = await app.criarRepublica(5);
      const agora = app.relogio.agora();
      app.ctx.db.transacao(() => {
        for (let i = 0; i < 2000; i += 1) {
          app.ctx.db.executar(
            `INSERT INTO produto (republica_id, nome, quantidade, unidade, validade, classificacao, quantidade_minima, status, criado_por, criado_em)
             VALUES (?, ?, 5, 'un', ?, 'COLETIVO', 1, 'ATIVO', ?, ?)`,
            admin.usuario.republicaId, `Produto ${i}`, `2026-0${4 + (i % 5)}-1${i % 9}`, admin.usuario.id, agora);
        }
      });
      for (let i = 0; i < 500; i += 1) {
        const pagador = i % 2 === 0 ? admin.usuario.id : moradores[i % 5]!.usuario.id;
        const r = await app.chamar('POST', '/api/compras', { descricao: `Compra ${i}`, valorCentavos: 1000 + i, pagadorId: pagador, data: HOJE }, admin.token);
        assert.equal(r.status, 201);
      }
      for (const caminho of ['/api/produtos', '/api/balanco', '/api/painel', '/api/compras']) {
        const inicio = performance.now();
        const r = await app.chamar('GET', caminho, undefined, admin.token);
        const duracao = performance.now() - inicio;
        assert.equal(r.status, 200);
        assert.ok(duracao < 1500, `${caminho} levou ${duracao.toFixed(0)} ms`);
        console.log(`    RNF-01 ${caminho}: ${duracao.toFixed(0)} ms`);
      }
    } finally {
      await app.fechar();
    }
  });
});
