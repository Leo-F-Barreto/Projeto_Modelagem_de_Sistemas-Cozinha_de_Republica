import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Contexto, Usuario } from '../servicos/contexto.ts';
import { ErroDominio } from '../erros.ts';
import { autenticar } from '../servicos/auth.ts';
import { montarRotas } from './rotas.ts';
import type { Resposta } from './roteador.ts';

const PUBLICO = fileURLToPath(new URL('../../public', import.meta.url));
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const LIMITE_CORPO = 64 * 1024;
const JANELA_AUTH_MS = 15 * 60 * 1000;

const CABECALHOS_SEGURANCA: Record<string, string> = {
  // Scripts só da própria origem; estilos inline são permitidos para classes/ajustes do protótipo.
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export interface OpcoesApp {
  /** Máximo de requisições de autenticação por IP a cada 15 minutos. */
  limiteAuth: number;
  /** Recebe uma linha de log estruturado por requisição. */
  registrar?: (evento: Record<string, unknown>) => void;
}

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const pedacos: Buffer[] = [];
    let tamanho = 0;
    req.on('data', (p: Buffer) => {
      tamanho += p.length;
      if (tamanho > LIMITE_CORPO) {
        reject(new ErroDominio('CORPO_GRANDE', 'Corpo da requisição excede o limite permitido.', 413));
        req.destroy();
        return;
      }
      pedacos.push(p);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (tamanho === 0) return resolve({});
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
        return reject(new ErroDominio('TIPO_NAO_SUPORTADO', 'Envie o corpo como application/json.', 415));
      }
      try {
        resolve(JSON.parse(Buffer.concat(pedacos).toString('utf8')));
      } catch {
        reject(new ErroDominio('JSON_INVALIDO', 'O corpo da requisição não é um JSON válido.', 400));
      }
    });
  });
}

async function servirEstatico(caminho: string, res: ServerResponse): Promise<boolean> {
  const relativo = caminho === '/' ? 'index.html' : caminho.slice(1);
  const absoluto = normalize(join(PUBLICO, relativo));
  // Impede travessia de diretório ("/../src/config.ts").
  if (!absoluto.startsWith(PUBLICO + sep)) return false;
  try {
    const conteudo = await readFile(absoluto);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(absoluto)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(conteudo);
    return true;
  } catch {
    return false;
  }
}

/** Monta o tratador HTTP da aplicação: cabeçalhos de segurança, estáticos, autenticação, roteamento e erros. */
export function criarApp(ctx: Contexto, opcoes: OpcoesApp) {
  const roteador = montarRotas(ctx);
  const tentativas = new Map<string, { n: number; expira: number }>();

  function limiteExcedido(ip: string): boolean {
    const agora = Date.now();
    if (tentativas.size > 10_000) for (const [k, t] of tentativas) if (t.expira <= agora) tentativas.delete(k);
    const atual = tentativas.get(ip);
    if (!atual || atual.expira <= agora) {
      tentativas.set(ip, { n: 1, expira: agora + JANELA_AUTH_MS });
      return false;
    }
    atual.n += 1;
    return atual.n > opcoes.limiteAuth;
  }

  return async function tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const inicio = performance.now();
    const idRequisicao = randomUUID();
    // Só o caminho e a consulta interessam; a URL é interpretada dentro do try para que um alvo malformado vire 400.
    let url = new URL('http://localhost/');
    const metodo = req.method ?? 'GET';
    let usuario: Usuario | null = null;
    let codigoErro: string | undefined;

    for (const [nome, valor] of Object.entries(CABECALHOS_SEGURANCA)) res.setHeader(nome, valor);
    res.setHeader('X-Request-Id', idRequisicao);

    const responderJson = (status: number, corpo: unknown) => {
      if (status === 204) {
        res.writeHead(204).end();
        return;
      }
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(corpo));
    };

    try {
      try {
        url = new URL(req.url ?? '/', 'http://localhost');
      } catch {
        throw new ErroDominio('URL_INVALIDA', 'Endereço da requisição inválido.', 400);
      }
      if (url.pathname === '/saude') {
        ctx.db.um('SELECT 1 AS ok');
        responderJson(200, { status: 'ok' });
      } else if (!url.pathname.startsWith('/api/')) {
        if (metodo !== 'GET' && metodo !== 'HEAD') throw new ErroDominio('METODO_NAO_PERMITIDO', 'Método não permitido.', 405);
        if (!(await servirEstatico(url.pathname, res))) throw new ErroDominio('NAO_ENCONTRADO', 'Recurso não encontrado.', 404);
      } else {
        const achado = roteador.resolver(metodo, url.pathname);
        if (achado === null) throw new ErroDominio('NAO_ENCONTRADO', 'Rota não encontrada.', 404);
        if (achado === 'METODO') throw new ErroDominio('METODO_NAO_PERMITIDO', 'Método não permitido para esta rota.', 405);

        if (achado.rota.publica) {
          if (limiteExcedido(req.socket.remoteAddress ?? 'desconhecido')) {
            throw new ErroDominio('MUITAS_TENTATIVAS', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
          }
        } else {
          const cabecalho = req.headers.authorization ?? '';
          usuario = cabecalho.startsWith('Bearer ') ? autenticar(ctx, cabecalho.slice(7)) : null;
          if (!usuario) throw new ErroDominio('NAO_AUTENTICADO', 'Sessão inválida ou expirada. Entre novamente.', 401);
        }

        const corpo = metodo === 'GET' || metodo === 'DELETE' ? {} : await lerCorpo(req);
        const resultado = await achado.rota.tratador({ params: achado.params, consulta: url.searchParams, corpo, usuario: usuario! });
        const ehResposta = typeof resultado === 'object' && resultado !== null && 'status' in resultado && 'corpo' in resultado;
        if (ehResposta) responderJson((resultado as Resposta).status, (resultado as Resposta).corpo);
        else responderJson(200, resultado);
      }
    } catch (erro) {
      if (erro instanceof ErroDominio) {
        codigoErro = erro.codigo;
        responderJson(erro.status, { erro: { codigo: erro.codigo, mensagem: erro.message } });
      } else {
        // Erro inesperado: detalhe vai só para o log; o cliente recebe uma mensagem genérica e o id para suporte.
        codigoErro = 'ERRO_INTERNO';
        opcoes.registrar?.({ nivel: 'erro', idRequisicao, mensagem: String(erro), pilha: erro instanceof Error ? erro.stack : undefined });
        if (!res.headersSent) responderJson(500, { erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno. Tente novamente.', idRequisicao } });
        else res.end();
      }
    } finally {
      if (url.pathname.startsWith('/api/')) {
        opcoes.registrar?.({
          nivel: 'info', idRequisicao, metodo, caminho: url.pathname, status: res.statusCode,
          duracaoMs: Math.round(performance.now() - inicio), usuarioId: usuario?.id ?? null,
          republicaId: usuario?.republicaId ?? null, erro: codigoErro,
        });
      }
    }
  };
}
