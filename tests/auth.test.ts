import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirApp } from './apoio.ts';
import type { App } from './apoio.ts';

describe('Autenticação, perfis e isolamento', () => {
  let app: App;
  before(async () => { app = await subirApp(); });
  after(() => app.fechar());

  test('quem cria a república vira ADMIN; quem entra por convite vira MORADOR', async () => {
    const { admin, moradores } = await app.criarRepublica(1);
    assert.equal(admin.usuario.perfil, 'ADMIN');
    assert.equal(moradores[0]!.usuario.perfil, 'MORADOR');
    assert.equal(moradores[0]!.usuario.republicaId, admin.usuario.republicaId);
  });

  test('cadastro exige exatamente um entre nome da república e convite, e-mail válido e senha de 8+ caracteres', async () => {
    const base = { nome: 'Ana', email: 'ana@teste.com', senha: 'senha-forte-1' };
    assert.equal((await app.chamar('POST', '/api/auth/registro', base)).status, 400);
    assert.equal((await app.chamar('POST', '/api/auth/registro', { ...base, nomeRepublica: 'Casa', codigoConvite: 'ABCDEF123456' })).status, 400);
    assert.equal((await app.chamar('POST', '/api/auth/registro', { ...base, nomeRepublica: 'Casa', email: 'sem-arroba' })).status, 400);
    assert.equal((await app.chamar('POST', '/api/auth/registro', { ...base, nomeRepublica: 'Casa', senha: 'curta' })).status, 400);
    const r = await app.chamar('POST', '/api/auth/registro', { ...base, codigoConvite: 'NAOEXISTE000' });
    assert.equal(r.corpo.erro.codigo, 'CONVITE_INVALIDO');
  });

  test('e-mail não pode ser reutilizado (nem mudando maiúsculas)', async () => {
    const dados = { nome: 'Bia', email: 'bia@teste.com', senha: 'senha-forte-1', nomeRepublica: 'Casa da Bia' };
    assert.equal((await app.chamar('POST', '/api/auth/registro', dados)).status, 201);
    const r = await app.chamar('POST', '/api/auth/registro', { ...dados, email: 'BIA@teste.com' });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'EMAIL_EM_USO');
  });

  test('RNF-02: a senha nunca é gravada em claro e nunca é devolvida pela API', async () => {
    const r = await app.chamar('POST', '/api/auth/registro', { nome: 'Caio', email: 'caio@teste.com', senha: 'segredo-do-caio', nomeRepublica: 'Casa do Caio' });
    assert.equal(JSON.stringify(r.corpo).includes('segredo-do-caio'), false);
    const linha = app.ctx.db.um<{ senha_hash: string }>('SELECT senha_hash FROM usuario WHERE email = ?', 'caio@teste.com')!;
    assert.match(linha.senha_hash, /^scrypt\$/);
    assert.equal(linha.senha_hash.includes('segredo-do-caio'), false);
  });

  test('login: senha errada e e-mail inexistente dão a mesma resposta', async () => {
    await app.chamar('POST', '/api/auth/registro', { nome: 'Duda', email: 'duda@teste.com', senha: 'senha-forte-1', nomeRepublica: 'Casa da Duda' });
    const ok = await app.chamar('POST', '/api/auth/login', { email: 'duda@teste.com', senha: 'senha-forte-1' });
    assert.equal(ok.status, 200);
    assert.ok(ok.corpo.token);
    const errada = await app.chamar('POST', '/api/auth/login', { email: 'duda@teste.com', senha: 'senha-errada' });
    const inexistente = await app.chamar('POST', '/api/auth/login', { email: 'ninguem@teste.com', senha: 'senha-forte-1' });
    assert.equal(errada.status, 401);
    assert.deepEqual(errada.corpo, inexistente.corpo);
  });

  test('RNF-02: toda rota privada exige token válido', async () => {
    for (const caminho of ['/api/eu', '/api/painel', '/api/produtos', '/api/lista', '/api/compras', '/api/balanco', '/api/escala', '/api/republica', '/api/notificacoes', '/api/auditoria']) {
      assert.equal((await app.chamar('GET', caminho)).status, 401, caminho);
      assert.equal((await app.chamar('GET', caminho, undefined, 'token.invalido.aqui')).status, 401, caminho);
    }
  });

  test('token expira', async () => {
    const { admin } = await app.criarRepublica(0);
    assert.equal((await app.chamar('GET', '/api/eu', undefined, admin.token)).status, 200);
    app.relogio.definir('2026-04-08');
    assert.equal((await app.chamar('GET', '/api/eu', undefined, admin.token)).status, 200, 'dentro da validade');
    app.relogio.definir('2026-04-09');
    assert.equal((await app.chamar('GET', '/api/eu', undefined, admin.token)).status, 401, 'expirado');
    app.relogio.definir('2026-03-10');
  });

  test('isolamento: uma república não enxerga nem altera dados de outra', async () => {
    const a = await app.criarRepublica(0);
    const b = await app.criarRepublica(0);
    const produto = (await app.chamar('POST', '/api/produtos',
      { nome: 'Arroz', quantidade: 5, unidade: 'kg', classificacao: 'COLETIVO' }, a.admin.token)).corpo;
    assert.deepEqual((await app.chamar('GET', '/api/produtos', undefined, b.admin.token)).corpo, []);
    assert.equal((await app.chamar('POST', `/api/produtos/${produto.id}/consumo`, { quantidade: 1 }, b.admin.token)).status, 404);
    assert.equal((await app.chamar('PATCH', `/api/moradores/${a.admin.usuario.id}`, { ativo: false }, b.admin.token)).status, 404);
  });

  test('morador comum não acessa funções de administrador', async () => {
    const { moradores, admin } = await app.criarRepublica(1);
    const t = moradores[0]!.token;
    assert.equal((await app.chamar('POST', '/api/republica/convite', {}, t)).status, 403);
    assert.equal((await app.chamar('GET', '/api/auditoria', undefined, t)).status, 403);
    assert.equal((await app.chamar('POST', '/api/fechamentos', { periodo: '2026-03' }, t)).status, 403);
    assert.equal((await app.chamar('POST', '/api/escala', { inicio: '2026-03-10', dias: 7, tipos: ['LIMPEZA'] }, t)).status, 403);
    assert.equal((await app.chamar('PATCH', `/api/moradores/${admin.usuario.id}`, { perfil: 'MORADOR' }, t)).status, 403);
    const rep = (await app.chamar('GET', '/api/republica', undefined, t)).corpo;
    assert.equal(rep.codigoConvite, undefined, 'convite só é visível ao admin');
  });

  test('entradas malformadas são recusadas com 4xx, nunca 500', async () => {
    const { admin } = await app.criarRepublica(0);
    const t = admin.token;
    assert.equal((await app.chamar('POST', '/api/produtos', { nome: 'X', quantidade: 'muito', unidade: 'un', classificacao: 'COLETIVO' }, t)).status, 400);
    assert.equal((await app.chamar('POST', '/api/produtos', { nome: 'X', quantidade: -1, unidade: 'un', classificacao: 'COLETIVO' }, t)).status, 400);
    assert.equal((await app.chamar('POST', '/api/produtos', { nome: 'X', quantidade: 1, unidade: 'un', classificacao: 'OUTRA' }, t)).status, 400);
    assert.equal((await app.chamar('POST', '/api/produtos', { nome: 'X', quantidade: 1, unidade: 'un', classificacao: 'COLETIVO', validade: '2026-02-31' }, t)).status, 400);
    assert.equal((await app.chamar('POST', '/api/produtos/abc/consumo', { quantidade: 1 }, t)).status, 400);
    assert.equal((await app.chamar('POST', '/api/compras', { descricao: 'x', valorCentavos: 10.5, pagadorId: 1, data: '2026-03-10' }, t)).status, 400);
    assert.equal((await app.chamar('GET', '/api/nao-existe', undefined, t)).status, 404);
    assert.equal((await app.chamar('DELETE', '/api/produtos', undefined, t)).status, 405);
    const bruto = await fetch(`${app.base}/api/produtos`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: '{quebrado' });
    assert.equal(bruto.status, 400);
  });

  test('alvo de requisição malformado devolve 400 e não derruba o servidor', async () => {
    const { admin } = await app.criarRepublica(0);
    const { request } = await import('node:http');
    const bruto = (caminho: string) => new Promise<number>((ok, falha) => {
      const req = request(`${app.base}/`, { path: caminho, headers: { Authorization: `Bearer ${admin.token}` } }, (res) => { res.resume(); ok(res.statusCode!); });
      req.on('error', falha);
      req.end();
    });
    assert.equal(await bruto('//'), 400);
    assert.equal(await bruto('/api/produtos/%E0%A4%A/consumo'), 405);
    assert.equal((await app.chamar('GET', '/api/eu', undefined, admin.token)).status, 200, 'servidor segue de pé');
  });

  test('injeção de SQL em campos de texto é tratada como texto', async () => {
    const { admin } = await app.criarRepublica(0);
    const nome = `Feijão'); DROP TABLE produto; --`;
    const r = await app.chamar('POST', '/api/produtos', { nome, quantidade: 1, unidade: 'kg', classificacao: 'COLETIVO' }, admin.token);
    assert.equal(r.status, 201);
    assert.equal((await app.chamar('GET', '/api/produtos', undefined, admin.token)).corpo[0].nome, nome);
  });

  test('cabeçalhos de segurança e proteção contra travessia de diretório', async () => {
    const r = await fetch(`${app.base}/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy')!, /default-src 'self'/);
    assert.match(r.headers.get('content-security-policy')!, /script-src 'self'/);
    assert.doesNotMatch(r.headers.get('content-security-policy')!, /script-src[^;]*unsafe-inline/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    const fuga = await fetch(`${app.base}/..%2f..%2fpackage.json`);
    assert.equal(fuga.status, 404);
  });
});

describe('Limite de tentativas de autenticação', () => {
  test('após o limite, novas tentativas recebem 429', async () => {
    const app = await subirApp({ limiteAuth: 3 });
    try {
      const tentar = () => app.chamar('POST', '/api/auth/login', { email: 'x@teste.com', senha: 'qualquer-senha' });
      assert.deepEqual([(await tentar()).status, (await tentar()).status, (await tentar()).status], [401, 401, 401]);
      assert.equal((await tentar()).status, 429);
    } finally {
      await app.fechar();
    }
  });
});
