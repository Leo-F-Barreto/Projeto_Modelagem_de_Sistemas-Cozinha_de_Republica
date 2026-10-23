import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HOJE, subirApp } from './apoio.ts';
import type { App, Sessao } from './apoio.ts';

describe('Compras coletivas, rateio e acerto', () => {
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

  const comprar = (quem: Sessao, pagador: Sessao, valorCentavos: number, extra: Record<string, unknown> = {}) =>
    app.chamar('POST', '/api/compras', { descricao: 'Mercado', valorCentavos, pagadorId: pagador.usuario.id, data: HOJE, ...extra }, quem.token);
  const balanco = async (s: Sessao = admin) => (await app.chamar('GET', '/api/balanco', undefined, s.token)).corpo;
  const saldos = async () => Object.fromEntries((await balanco()).saldos.map((s: any) => [s.usuarioId, s.saldoCentavos]));

  test('RF-05 / RB-02: compra registrada pelo admin é rateada em partes iguais entre os moradores ativos', async () => {
    const r = await comprar(admin, admin, 9000);
    assert.equal(r.status, 201);
    assert.equal(r.corpo.status, 'APROVADA');
    assert.deepEqual(r.corpo.cotas.map((c: any) => c.valorCentavos), [3000, 3000, 3000]);
    assert.deepEqual(await saldos(), { [admin.usuario.id]: 6000, [ana.usuario.id]: -3000, [beto.usuario.id]: -3000 });
  });

  test('RB-05: divisão inexata — o resíduo fica com o pagador e os saldos somam zero', async () => {
    await comprar(admin, ana, 10000);
    const s = await saldos();
    assert.deepEqual(s, { [admin.usuario.id]: -3333, [ana.usuario.id]: 6666, [beto.usuario.id]: -3333 });
    assert.equal(Object.values(s).reduce((a: number, b) => a + (b as number), 0), 0);
  });

  test('RF-08: compra registrada por morador fica PENDENTE, não altera saldos e avisa o admin', async () => {
    const r = await comprar(ana, ana, 6000);
    assert.equal(r.corpo.status, 'PENDENTE');
    assert.deepEqual(r.corpo.cotas, []);
    assert.deepEqual(Object.values(await saldos()), [0, 0, 0]);
    const ns = (await app.chamar('GET', '/api/notificacoes', undefined, admin.token)).corpo;
    assert.equal(ns.filter((n: any) => n.tipo === 'COMPRA_PENDENTE').length, 1);
  });

  test('RF-08: só o admin aprova; a aprovação lança o rateio e notifica quem registrou', async () => {
    const c = (await comprar(ana, ana, 6000)).corpo;
    assert.equal((await app.chamar('POST', `/api/compras/${c.id}/aprovacao`, {}, ana.token)).status, 403);
    assert.equal((await app.chamar('POST', `/api/compras/${c.id}/aprovacao`, {}, beto.token)).status, 403);
    const r = await app.chamar('POST', `/api/compras/${c.id}/aprovacao`, {}, admin.token);
    assert.equal(r.corpo.status, 'APROVADA');
    assert.deepEqual(await saldos(), { [admin.usuario.id]: -2000, [ana.usuario.id]: 4000, [beto.usuario.id]: -2000 });
    assert.equal((await app.chamar('POST', `/api/compras/${c.id}/aprovacao`, {}, admin.token)).status, 409, 'não aprova duas vezes');
    const ns = (await app.chamar('GET', '/api/notificacoes', undefined, ana.token)).corpo;
    assert.equal(ns.filter((n: any) => n.tipo === 'COMPRA_DECIDIDA').length, 1);
  });

  test('RF-08: rejeição exige motivo e não gera rateio', async () => {
    const c = (await comprar(beto, beto, 5000)).corpo;
    assert.equal((await app.chamar('POST', `/api/compras/${c.id}/rejeicao`, {}, admin.token)).status, 400);
    const r = await app.chamar('POST', `/api/compras/${c.id}/rejeicao`, { motivo: 'Era item individual' }, admin.token);
    assert.equal(r.corpo.status, 'REJEITADA');
    assert.equal(r.corpo.motivoRejeicao, 'Era item individual');
    assert.deepEqual(Object.values(await saldos()), [0, 0, 0]);
  });

  test('RB-02: o rateio considera quem está ativo no momento do lançamento', async () => {
    await app.chamar('PATCH', `/api/moradores/${beto.usuario.id}`, { ativo: false }, admin.token);
    const r = await comprar(admin, admin, 9000);
    assert.deepEqual(r.corpo.cotas.map((c: any) => [c.usuarioId, c.valorCentavos]), [[admin.usuario.id, 4500], [ana.usuario.id, 4500]]);
    assert.equal((await saldos())[beto.usuario.id], 0);
  });

  test('RB-03: o que o morador paga abate primeiro a dívida que ele já tinha', async () => {
    await comprar(admin, admin, 9000); // ana deve 3000
    assert.equal((await saldos())[ana.usuario.id], -3000);
    await comprar(admin, ana, 3000); // ana paga 3000, cota 1000 → +2000: dívida cai para 1000, sem virar credora
    assert.equal((await saldos())[ana.usuario.id], -1000);
    await comprar(admin, ana, 6000); // +4000: quita os 1000 e só então gera crédito de 3000
    assert.equal((await saldos())[ana.usuario.id], 3000);
    const b = await balanco();
    assert.equal(b.transferenciasSugeridas.every((t: any) => t.devedorId !== ana.usuario.id), true);
  });

  test('RF-05: validações — valor positivo, data não futura, pagador ativo da própria casa', async () => {
    assert.equal((await comprar(admin, admin, 0)).status, 400);
    assert.equal((await comprar(admin, admin, 100, { data: '2026-03-11' })).corpo.erro.codigo, 'DATA_FUTURA');
    const outraCasa = await app.criarRepublica(0);
    assert.equal((await comprar(admin, outraCasa.admin, 100)).corpo.erro.codigo, 'PAGADOR_INVALIDO');
    await app.chamar('PATCH', `/api/moradores/${beto.usuario.id}`, { ativo: false }, admin.token);
    assert.equal((await comprar(admin, beto, 100)).corpo.erro.codigo, 'PAGADOR_INVALIDO');
  });

  test('"quem deve para quem": transferências sugeridas zeram os saldos', async () => {
    await comprar(admin, admin, 9000);
    await comprar(admin, ana, 3000);
    const b = await balanco(beto);
    assert.deepEqual(b.transferenciasSugeridas.map((t: any) => [t.devedorNome, t.credorNome, t.valorCentavos]), [
      [beto.usuario.nome, admin.usuario.nome, 4000],
      [ana.usuario.nome, admin.usuario.nome, 1000],
    ]);
  });

  test('RF-09: fechamento gera os acertos, notifica devedores e congela o mês', async () => {
    await comprar(admin, admin, 9000);
    const f = await app.chamar('POST', '/api/fechamentos', { periodo: '2026-03' }, admin.token);
    assert.equal(f.status, 201);
    assert.deepEqual(f.corpo.acertos.map((a: any) => [a.devedorId, a.credorId, a.valorCentavos, a.status]), [
      [ana.usuario.id, admin.usuario.id, 3000, 'PENDENTE'],
      [beto.usuario.id, admin.usuario.id, 3000, 'PENDENTE'],
    ]);
    assert.equal((await app.chamar('POST', '/api/fechamentos', { periodo: '2026-03' }, admin.token)).status, 409, 'não fecha duas vezes');
    assert.equal((await comprar(admin, admin, 100)).corpo.erro.codigo, 'PERIODO_FECHADO');
    const ns = (await app.chamar('GET', '/api/notificacoes', undefined, ana.token)).corpo;
    assert.equal(ns.filter((n: any) => n.tipo === 'ACERTO').length, 1);
  });

  test('RF-09: não fecha mês futuro nem com compra pendente', async () => {
    assert.equal((await app.chamar('POST', '/api/fechamentos', { periodo: '2026-04' }, admin.token)).corpo.erro.codigo, 'PERIODO_FUTURO');
    assert.equal((await app.chamar('POST', '/api/fechamentos', { periodo: 'marco' }, admin.token)).status, 400);
    const c = (await comprar(ana, ana, 500)).corpo;
    assert.equal((await app.chamar('POST', '/api/fechamentos', { periodo: '2026-03' }, admin.token)).corpo.erro.codigo, 'COMPRAS_PENDENTES');
    await app.chamar('POST', `/api/compras/${c.id}/rejeicao`, { motivo: 'duplicada' }, admin.token);
    assert.equal((await app.chamar('POST', '/api/fechamentos', { periodo: '2026-03' }, admin.token)).status, 201);
  });

  test('RF-08 + RF-09: compra pendente de mês já fechado não pode mais ser aprovada', async () => {
    app.relogio.definir('2026-02-20');
    const c = (await comprar(ana, ana, 500, { data: '2026-02-20' })).corpo;
    app.ctx.db.executar('INSERT INTO fechamento (republica_id, periodo, fechado_por, fechado_em) VALUES (?, ?, ?, ?)',
      admin.usuario.republicaId, '2026-02', admin.usuario.id, app.relogio.agora());
    const r = await app.chamar('POST', `/api/compras/${c.id}/aprovacao`, {}, admin.token);
    assert.equal(r.corpo.erro.codigo, 'PERIODO_FECHADO');
  });

  test('RF-10: quem recebe (ou o admin) confirma o pagamento; o devedor não; o saldo é zerado', async () => {
    await comprar(admin, ana, 9000); // ana credora de 6000; admin e beto devem 3000 cada
    const acertos = (await app.chamar('POST', '/api/fechamentos', { periodo: '2026-03' }, admin.token)).corpo.acertos as any[];
    const doBeto = acertos.find((a) => a.devedorId === beto.usuario.id);
    const doAdmin = acertos.find((a) => a.devedorId === admin.usuario.id);

    assert.equal((await app.chamar('POST', `/api/acertos/${doBeto.id}/confirmacao`, {}, beto.token)).status, 403, 'devedor não confirma');
    assert.equal((await app.chamar('POST', `/api/acertos/${doAdmin.id}/confirmacao`, {}, admin.token)).corpo.erro.codigo, 'DEVEDOR_NAO_CONFIRMA');
    assert.equal((await app.chamar('POST', `/api/acertos/${doBeto.id}/confirmacao`, {}, ana.token)).corpo.status, 'PAGO');
    assert.equal((await app.chamar('POST', `/api/acertos/${doBeto.id}/confirmacao`, {}, ana.token)).status, 409, 'não confirma duas vezes');
    assert.deepEqual(await saldos(), { [admin.usuario.id]: -3000, [ana.usuario.id]: 3000, [beto.usuario.id]: 0 });

    await app.chamar('POST', `/api/acertos/${doAdmin.id}/confirmacao`, {}, ana.token);
    assert.deepEqual(Object.values(await saldos()), [0, 0, 0]);
    assert.deepEqual((await balanco()).transferenciasSugeridas, []);
  });

  test('RF-09: novo fechamento substitui acertos ainda pendentes do anterior, sem cobrar em dobro', async () => {
    app.relogio.definir('2026-02-15');
    await comprar(admin, admin, 9000, { data: '2026-02-15' });
    const fev = (await app.chamar('POST', '/api/fechamentos', { periodo: '2026-02' }, admin.token)).corpo.acertos as any[];
    await app.chamar('POST', `/api/acertos/${fev.find((a) => a.devedorId === ana.usuario.id).id}/confirmacao`, {}, admin.token);

    app.relogio.definir('2026-03-10');
    await comprar(admin, admin, 3000);
    const mar = (await app.chamar('POST', '/api/fechamentos', { periodo: '2026-03' }, admin.token)).corpo.acertos as any[];
    assert.deepEqual(mar.map((a) => [a.devedorId, a.valorCentavos]), [[beto.usuario.id, 4000], [ana.usuario.id, 1000]]);
    const b = await balanco();
    const antigo = b.fechamentos.find((f: any) => f.periodo === '2026-02').acertos.find((a: any) => a.devedorId === beto.usuario.id);
    assert.equal(antigo.status, 'SUBSTITUIDO');
    assert.equal((await app.chamar('POST', `/api/acertos/${antigo.id}/confirmacao`, {}, admin.token)).status, 409);
  });

  test('ações financeiras ficam na trilha de auditoria', async () => {
    const c = (await comprar(ana, ana, 6000)).corpo;
    await app.chamar('POST', `/api/compras/${c.id}/aprovacao`, {}, admin.token);
    await app.chamar('POST', '/api/fechamentos', { periodo: '2026-03' }, admin.token);
    const acoes = (await app.chamar('GET', '/api/auditoria', undefined, admin.token)).corpo.map((a: any) => a.acao);
    assert.deepEqual(acoes, ['PERIODO_FECHADO', 'COMPRA_APROVADA']);
  });
});
