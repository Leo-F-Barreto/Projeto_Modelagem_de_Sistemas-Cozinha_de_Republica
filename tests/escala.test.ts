import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HOJE, subirApp } from './apoio.ts';
import type { App, Sessao } from './apoio.ts';

describe('Escala de tarefas e gestão de moradores', () => {
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

  const gerar = (dias = 6, tipos = ['LIMPEZA'], inicio = HOJE) => app.chamar('POST', '/api/escala', { inicio, dias, tipos }, admin.token);
  const escala = async (s: Sessao = admin) => (await app.chamar('GET', '/api/escala', undefined, s.token)).corpo;
  const turnoDe = async (s: Sessao, n = 0) => (await escala()).turnos.filter((t: any) => t.responsavelId === s.usuario.id && t.tipo === 'LIMPEZA')[n];

  test('RF-11: escala gerada é rotativa entre os moradores ativos', async () => {
    const r = await gerar(6);
    assert.equal(r.status, 201);
    assert.equal(r.corpo.turnosCriados, 6);
    const ids = [admin, ana, beto].map((s) => s.usuario.id);
    assert.deepEqual(r.corpo.turnos.map((t: any) => t.responsavelId), [...ids, ...ids]);
  });

  test('RF-11: limpeza e refeição do mesmo dia caem com pessoas diferentes', async () => {
    const turnos = (await gerar(3, ['LIMPEZA', 'REFEICAO'])).corpo.turnos as any[];
    for (const data of ['2026-03-10', '2026-03-11', '2026-03-12']) {
      const doDia = turnos.filter((t) => t.data === data);
      assert.equal(doDia.length, 2);
      assert.notEqual(doDia[0].responsavelId, doDia[1].responsavelId);
    }
  });

  test('RF-11: gerar de novo não duplica turnos e continua o rodízio de onde parou', async () => {
    await gerar(4); // admin, ana, beto, admin
    assert.equal((await gerar(4)).corpo.turnosCriados, 0);
    const mais = await gerar(2, ['LIMPEZA'], '2026-03-14');
    assert.deepEqual(mais.corpo.turnos.map((t: any) => t.responsavelId), [ana.usuario.id, beto.usuario.id]);
  });

  test('RF-11: não gera escala no passado nem com parâmetros fora do limite', async () => {
    assert.equal((await gerar(3, ['LIMPEZA'], '2026-03-09')).corpo.erro.codigo, 'DATA_PASSADA');
    assert.equal((await gerar(61)).status, 400);
    assert.equal((await gerar(3, ['FAXINA'])).status, 400);
  });

  test('conclusão de turno: só o responsável, só a partir do dia marcado, uma única vez', async () => {
    await gerar(6);
    const hojeDoAdmin = await turnoDe(admin, 0);
    const futuroDaAna = await turnoDe(ana, 0);
    assert.equal((await app.chamar('POST', `/api/turnos/${hojeDoAdmin.id}/conclusao`, {}, ana.token)).corpo.erro.codigo, 'NAO_RESPONSAVEL');
    assert.equal((await app.chamar('POST', `/api/turnos/${futuroDaAna.id}/conclusao`, {}, ana.token)).corpo.erro.codigo, 'TURNO_FUTURO');
    assert.equal((await app.chamar('POST', `/api/turnos/${hojeDoAdmin.id}/conclusao`, {}, admin.token)).corpo.status, 'CONCLUIDO');
    assert.equal((await app.chamar('POST', `/api/turnos/${hojeDoAdmin.id}/conclusao`, {}, admin.token)).status, 409);
  });

  test('turno de hoje pendente gera lembrete ao responsável; turno passado pendente aparece como atrasado', async () => {
    await gerar(6);
    await app.chamar('GET', '/api/painel', undefined, admin.token);
    const ns = (await app.chamar('GET', '/api/notificacoes', undefined, admin.token)).corpo;
    assert.equal(ns.filter((n: any) => n.tipo === 'TAREFA_PENDENTE').length, 1);
    app.relogio.definir('2026-03-11');
    assert.equal((await turnoDe(admin, 0)).atrasado, true);
  });

  test('RF-06: troca solicitada e aceita registra a substituição e atualiza o calendário', async () => {
    await gerar(6);
    const daAna = await turnoDe(ana, 0); // 11/03
    const doBeto = await turnoDe(beto, 0); // 12/03
    const pedido = await app.chamar('POST', '/api/trocas', { meuTurnoId: daAna.id, outroTurnoId: doBeto.id }, ana.token);
    assert.equal(pedido.status, 201);
    assert.equal(pedido.corpo.status, 'PENDENTE');
    assert.equal((await escala(beto)).trocas.length, 1, 'beto vê o pedido');
    assert.equal((await turnoDe(ana, 0)).id, daAna.id, 'nada muda antes do aceite');

    assert.equal((await app.chamar('POST', `/api/trocas/${pedido.corpo.id}/aceite`, {}, ana.token)).status, 403, 'quem pediu não aceita por conta própria');
    assert.equal((await app.chamar('POST', `/api/trocas/${pedido.corpo.id}/aceite`, {}, admin.token)).status, 403, 'nem o admin aceita pelo morador');
    const aceite = await app.chamar('POST', `/api/trocas/${pedido.corpo.id}/aceite`, {}, beto.token);
    assert.equal(aceite.corpo.status, 'ACEITA');

    const turnos = (await escala()).turnos as any[];
    assert.equal(turnos.find((t) => t.id === daAna.id).responsavelId, beto.usuario.id);
    assert.equal(turnos.find((t) => t.id === doBeto.id).responsavelId, ana.usuario.id);
    const ns = (await app.chamar('GET', '/api/notificacoes', undefined, ana.token)).corpo;
    assert.equal(ns.some((n: any) => n.tipo === 'TROCA' && /aceitou/.test(n.mensagem)), true);
  });

  test('RF-06: recusa e cancelamento mantêm a escala como estava', async () => {
    await gerar(6);
    const daAna = await turnoDe(ana, 0);
    const doBeto = await turnoDe(beto, 0);
    const p1 = (await app.chamar('POST', '/api/trocas', { meuTurnoId: daAna.id, outroTurnoId: doBeto.id }, ana.token)).corpo;
    assert.equal((await app.chamar('POST', `/api/trocas/${p1.id}/recusa`, {}, beto.token)).corpo.status, 'RECUSADA');
    const p2 = (await app.chamar('POST', '/api/trocas', { meuTurnoId: daAna.id, outroTurnoId: doBeto.id }, ana.token)).corpo;
    assert.equal((await app.chamar('POST', `/api/trocas/${p2.id}/cancelamento`, {}, beto.token)).status, 403);
    assert.equal((await app.chamar('POST', `/api/trocas/${p2.id}/cancelamento`, {}, ana.token)).corpo.status, 'CANCELADA');
    assert.equal((await turnoDe(ana, 0)).id, daAna.id);
    assert.equal((await app.chamar('POST', `/api/trocas/${p2.id}/aceite`, {}, beto.token)).status, 409);
  });

  test('RF-06: regras do pedido — turno próprio, de outra pessoa, pendente, não passado e sem pedido em aberto', async () => {
    await gerar(6);
    const doAdmin = await turnoDe(admin, 0); // hoje
    const daAna = await turnoDe(ana, 0);
    const daAna2 = await turnoDe(ana, 1);
    const doBeto = await turnoDe(beto, 0);
    const pedir = (s: Sessao, meu: any, outro: any) => app.chamar('POST', '/api/trocas', { meuTurnoId: meu.id, outroTurnoId: outro.id }, s.token);

    assert.equal((await pedir(ana, doBeto, doAdmin)).corpo.erro.codigo, 'NAO_RESPONSAVEL');
    assert.equal((await pedir(ana, daAna, daAna2)).corpo.erro.codigo, 'TROCA_INVALIDA');
    assert.equal((await pedir(ana, daAna, doBeto)).status, 201);
    assert.equal((await pedir(admin, doAdmin, doBeto)).corpo.erro.codigo, 'TROCA_EM_ABERTO');

    await app.chamar('POST', `/api/turnos/${doAdmin.id}/conclusao`, {}, admin.token);
    assert.equal((await pedir(ana, daAna2, doAdmin)).corpo.erro.codigo, 'TROCA_INVALIDA', 'turno concluído não se troca');
  });

  test('RF-06: aceite tardio de troca cujo turno já passou cancela o pedido', async () => {
    await gerar(6);
    const daAna = await turnoDe(ana, 0); // 11/03
    const doBeto = await turnoDe(beto, 0); // 12/03
    const p = (await app.chamar('POST', '/api/trocas', { meuTurnoId: daAna.id, outroTurnoId: doBeto.id }, ana.token)).corpo;
    app.relogio.definir('2026-03-12');
    const r = await app.chamar('POST', `/api/trocas/${p.id}/aceite`, {}, beto.token);
    assert.equal(r.corpo.erro.codigo, 'TROCA_EXPIRADA');
    assert.equal((await escala(beto)).trocas.length, 0);
  });

  test('RF-12 / RB-06: a república nunca fica sem administrador ativo', async () => {
    const eu = admin.usuario.id;
    assert.equal((await app.chamar('PATCH', `/api/moradores/${eu}`, { perfil: 'MORADOR' }, admin.token)).corpo.erro.codigo, 'ULTIMO_ADMIN');
    assert.equal((await app.chamar('PATCH', `/api/moradores/${eu}`, { ativo: false }, admin.token)).corpo.erro.codigo, 'ULTIMO_ADMIN');
    assert.equal((await app.chamar('PATCH', `/api/moradores/${ana.usuario.id}`, { perfil: 'ADMIN' }, admin.token)).status, 200);
    assert.equal((await app.chamar('PATCH', `/api/moradores/${eu}`, { perfil: 'MORADOR' }, admin.token)).status, 200);
    assert.equal((await app.chamar('POST', '/api/republica/convite', {}, admin.token)).status, 403, 'rebaixamento vale na hora, com o mesmo token');
    assert.equal((await app.chamar('POST', '/api/republica/convite', {}, ana.token)).status, 200, 'promoção também');
  });

  test('RF-12 / RB-07: morador com saldo em aberto não pode ser desativado', async () => {
    await app.chamar('POST', '/api/compras', { descricao: 'Gás', valorCentavos: 9000, pagadorId: admin.usuario.id, data: HOJE }, admin.token);
    const r = await app.chamar('PATCH', `/api/moradores/${beto.usuario.id}`, { ativo: false }, admin.token);
    assert.equal(r.status, 422);
    assert.equal(r.corpo.erro.codigo, 'SALDO_PENDENTE');
    const acertos = (await app.chamar('POST', '/api/fechamentos', { periodo: '2026-03' }, admin.token)).corpo.acertos as any[];
    await app.chamar('POST', `/api/acertos/${acertos.find((a) => a.devedorId === beto.usuario.id).id}/confirmacao`, {}, admin.token);
    assert.equal((await app.chamar('PATCH', `/api/moradores/${beto.usuario.id}`, { ativo: false }, admin.token)).status, 200);
  });

  test('RB-07: morador com compra aguardando aprovação também não pode ser desativado', async () => {
    await app.chamar('POST', '/api/compras', { descricao: 'Feira', valorCentavos: 3000, pagadorId: beto.usuario.id, data: HOJE }, beto.token);
    const r = await app.chamar('PATCH', `/api/moradores/${beto.usuario.id}`, { ativo: false }, admin.token);
    assert.equal(r.corpo.erro.codigo, 'COMPRAS_PENDENTES');
  });

  test('RF-12: desativar encerra o acesso na hora, tira o morador da escala futura e do rodízio seguinte', async () => {
    await gerar(6);
    assert.equal((await app.chamar('PATCH', `/api/moradores/${beto.usuario.id}`, { ativo: false }, admin.token)).status, 200);
    assert.equal((await app.chamar('GET', '/api/eu', undefined, beto.token)).status, 401, 'token antigo deixa de valer');
    assert.equal((await app.chamar('POST', '/api/auth/login', { email: 'x@teste.com', senha: 'senha-forte-1' })).status, 401);
    const turnos = (await escala()).turnos as any[];
    assert.equal(turnos.some((t) => t.responsavelId === beto.usuario.id), false);
    assert.equal(turnos.length, 4);
    const regerada = (await gerar(6)).corpo;
    assert.equal(regerada.turnosCriados, 2, 'preenche só as lacunas');
    assert.equal(regerada.turnos.some((t: any) => t.responsavelId === beto.usuario.id), false);
  });

  test('convite regenerado invalida o código anterior', async () => {
    const antigo = (await app.chamar('GET', '/api/republica', undefined, admin.token)).corpo.codigoConvite;
    const novo = (await app.chamar('POST', '/api/republica/convite', {}, admin.token)).corpo.codigoConvite;
    assert.notEqual(novo, antigo);
    const dados = { nome: 'Intruso', email: 'intruso@teste.com', senha: 'senha-forte-1' };
    assert.equal((await app.chamar('POST', '/api/auth/registro', { ...dados, codigoConvite: antigo })).corpo.erro.codigo, 'CONVITE_INVALIDO');
    assert.equal((await app.chamar('POST', '/api/auth/registro', { ...dados, codigoConvite: novo })).status, 201);
  });
});
