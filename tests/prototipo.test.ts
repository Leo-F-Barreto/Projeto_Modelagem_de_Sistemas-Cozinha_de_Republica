import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { subirApp, type App } from './apoio.ts';

const htmlPath = resolve('public/index.html');

async function prototypeHtml(): Promise<{ html: string; js: string; css: string }> {
  const [html, js, css] = await Promise.all([
    readFile(htmlPath, 'utf8'),
    readFile(resolve('public/app.js'), 'utf8'),
    readFile(resolve('public/styles.css'), 'utf8'),
  ]);
  return { html, js, css };
}

describe('protótipo navegável CoChef', () => {
  test('página inicial existe e declara idioma e viewport para mobile', async () => {
    const { html } = await prototypeHtml();
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<html lang="pt-BR">/i);
    assert.match(html, /name="viewport"/i);
    assert.match(html, /href="\/styles\.css"/i);
    assert.match(html, /src="\/app\.js"/i);
  });

  test('expõe os módulos principais definidos no escopo do MVP', async () => {
    const { html } = await prototypeHtml();
    for (const modulo of ['dashboard', 'stock', 'shopping', 'finance', 'schedule', 'people']) {
      assert.match(html, new RegExp(`data-view="${modulo}"`), `módulo ausente: ${modulo}`);
    }
  });

  test('contém formulários para estoque, lista colaborativa e rateio financeiro', async () => {
    const { html } = await prototypeHtml();
    for (const id of ['item-form', 'shopping-form', 'expense-form']) {
      assert.match(html, new RegExp(`id="${id}"`), `formulário ausente: ${id}`);
    }
    assert.match(html, /rateado igualmente entre os moradores ativos/i);
    assert.match(html, /Compartimento físico/i);
  });

  test('mantém interações de demonstração no navegador e informa a limitação do protótipo', async () => {
    const { html, js, css } = await prototypeHtml();
    assert.match(js, /localStorage\.getItem\('cochef-demo-v1'\)/);
    assert.match(js, /localStorage\.setItem\('cochef-demo-v1'/);
    assert.match(html, /não realiza pagamento bancário/i);
    assert.match(css, /prefers-reduced-motion/);
    assert.doesNotMatch(html, /<script>([\s\S]*?)<\/script>/i, 'JavaScript deve ser servido por arquivo da mesma origem');
  });
});


describe('arquivos estáticos do protótipo servidos pela aplicação', () => {
  let app: App;
  before(async () => { app = await subirApp(); });
  after(async () => { await app.fechar(); });

  test('rota inicial, CSS e JavaScript retornam 200 e tipos MIME corretos', async () => {
    const [page, css, js] = await Promise.all([
      fetch(`${app.base}/`),
      fetch(`${app.base}/styles.css`),
      fetch(`${app.base}/app.js`),
    ]);
    assert.equal(page.status, 200);
    assert.equal(css.status, 200);
    assert.equal(js.status, 200);
    assert.match(page.headers.get('content-type') ?? '', /text\/html/);
    assert.match(css.headers.get('content-type') ?? '', /text\/css/);
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
  });

  test('política de segurança permite apenas scripts da própria origem', async () => {
    const response = await fetch(`${app.base}/`);
    const policy = response.headers.get('content-security-policy') ?? '';
    assert.match(policy, /script-src 'self'/);
    assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/);
  });
});
