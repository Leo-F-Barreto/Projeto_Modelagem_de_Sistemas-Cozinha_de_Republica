import type { Contexto } from '../servicos/contexto.ts';
import { Roteador, criado, semConteudo } from './roteador.ts';
import * as v from '../validacao.ts';
import { ErroDominio } from '../erros.ts';
import { somarDias, ehDataISO } from '../dominio/datas.ts';
import * as auth from '../servicos/auth.ts';
import * as estoque from '../servicos/estoque.ts';
import * as lista from '../servicos/lista.ts';
import * as financas from '../servicos/financas.ts';
import * as escala from '../servicos/escala.ts';
import * as republica from '../servicos/republica.ts';
import * as notificacoes from '../servicos/notificacoes.ts';
import { obterPainel } from '../servicos/painel.ts';

const SENHA = { min: 8, max: 128 };

/** Tabela de rotas da API. Cada rota valida a entrada e delega a um serviço; nenhuma regra de negócio mora aqui. */
export function montarRotas(ctx: Contexto): Roteador {
  const r = new Roteador();

  // --- Autenticação (públicas) ---
  r.registrar('POST', '/api/auth/registro', async (req) => {
    const c = v.objeto(req.corpo);
    return criado(await auth.registrar(ctx, {
      nome: v.texto(c, 'nome', { min: 2, max: 60 }),
      email: v.texto(c, 'email', { min: 5, max: 120 }),
      senha: v.texto(c, 'senha', SENHA),
      nomeRepublica: v.textoOpcional(c, 'nomeRepublica', { min: 2, max: 60 }),
      codigoConvite: v.textoOpcional(c, 'codigoConvite', { min: 6, max: 20 }),
    }));
  }, { publica: true });

  r.registrar('POST', '/api/auth/login', async (req) => {
    const c = v.objeto(req.corpo);
    return auth.entrar(ctx, v.texto(c, 'email', { max: 120 }), v.texto(c, 'senha', { max: 128 }));
  }, { publica: true });

  r.get('/api/eu', (req) => req.usuario);
  r.get('/api/painel', (req) => obterPainel(ctx, req.usuario));

  // --- República e moradores ---
  r.get('/api/republica', (req) => republica.obterRepublica(ctx, req.usuario));
  r.post('/api/republica/convite', (req) => republica.regenerarConvite(ctx, req.usuario));
  r.get('/api/auditoria', (req) => republica.listarAuditoria(ctx, req.usuario));
  r.patch('/api/moradores/:id', (req) => {
    const c = v.objeto(req.corpo);
    const mudanca: { perfil?: 'ADMIN' | 'MORADOR'; ativo?: boolean } = {};
    if (c.perfil !== undefined) mudanca.perfil = v.umDe(c, 'perfil', ['ADMIN', 'MORADOR'] as const);
    if (c.ativo !== undefined) {
      if (typeof c.ativo !== 'boolean') throw new ErroDominio('VALIDACAO', 'Campo "ativo" deve ser booleano.', 400);
      mudanca.ativo = c.ativo;
    }
    return republica.alterarMorador(ctx, req.usuario, v.idDeRota(req.params.id), mudanca);
  });

  // --- Estoque ---
  r.get('/api/produtos', (req) => estoque.listarProdutos(ctx, req.usuario, req.consulta.get('todos') === '1'));
  r.post('/api/produtos', (req) => {
    const c = v.objeto(req.corpo);
    return criado(estoque.cadastrarProduto(ctx, req.usuario, {
      nome: v.texto(c, 'nome', { max: 80 }),
      quantidade: v.numero(c, 'quantidade', { exclusivoMin: true }),
      unidade: v.texto(c, 'unidade', { max: 12 }),
      validade: v.dataISOOpcional(c, 'validade'),
      classificacao: v.umDe(c, 'classificacao', ['COLETIVO', 'INDIVIDUAL'] as const),
      quantidadeMinima: c.quantidadeMinima == null ? null : v.numero(c, 'quantidadeMinima'),
    }));
  });
  r.patch('/api/produtos/:id', (req) => {
    const c = v.objeto(req.corpo);
    const dados: estoque.EdicaoProduto = {};
    if (c.nome !== undefined) dados.nome = v.texto(c, 'nome', { max: 80 });
    if (c.unidade !== undefined) dados.unidade = v.texto(c, 'unidade', { max: 12 });
    if (c.validade !== undefined) dados.validade = v.dataISOOpcional(c, 'validade');
    if (c.quantidadeMinima !== undefined) dados.quantidadeMinima = c.quantidadeMinima === null ? null : v.numero(c, 'quantidadeMinima');
    return estoque.editarProduto(ctx, req.usuario, v.idDeRota(req.params.id), dados);
  });
  r.post('/api/produtos/:id/consumo', (req) =>
    estoque.consumirProduto(ctx, req.usuario, v.idDeRota(req.params.id), v.numero(v.objeto(req.corpo), 'quantidade', { exclusivoMin: true })));
  r.post('/api/produtos/:id/reposicao', (req) => {
    const c = v.objeto(req.corpo);
    return estoque.reporProduto(ctx, req.usuario, v.idDeRota(req.params.id), v.numero(c, 'quantidade', { exclusivoMin: true }), v.dataISOOpcional(c, 'validade'));
  });
  r.post('/api/produtos/:id/descarte', (req) => estoque.descartarProduto(ctx, req.usuario, v.idDeRota(req.params.id)));
  r.get('/api/consumos', (req) => estoque.historicoConsumo(ctx, req.usuario));

  // --- Lista de compras ---
  r.get('/api/lista', (req) => lista.listarItens(ctx, req.usuario));
  r.post('/api/lista', (req) => criado(lista.adicionarItem(ctx, req.usuario, v.texto(v.objeto(req.corpo), 'nome', { max: 80 }))));
  r.post('/api/lista/:id/comprado', (req) => lista.marcarComprado(ctx, req.usuario, v.idDeRota(req.params.id)));
  r.delete('/api/lista/:id', (req) => {
    lista.removerItem(ctx, req.usuario, v.idDeRota(req.params.id));
    return semConteudo();
  });

  // --- Finanças ---
  r.get('/api/compras', (req) => financas.listarCompras(ctx, req.usuario));
  r.post('/api/compras', (req) => {
    const c = v.objeto(req.corpo);
    return criado(financas.registrarCompra(ctx, req.usuario, {
      descricao: v.texto(c, 'descricao', { max: 120 }),
      valorCentavos: v.inteiro(c, 'valorCentavos', { min: 1, max: 100_000_00 }),
      pagadorId: v.inteiro(c, 'pagadorId'),
      data: v.dataISO(c, 'data'),
    }));
  });
  r.post('/api/compras/:id/aprovacao', (req) => financas.decidirCompra(ctx, req.usuario, v.idDeRota(req.params.id), true, undefined));
  r.post('/api/compras/:id/rejeicao', (req) =>
    financas.decidirCompra(ctx, req.usuario, v.idDeRota(req.params.id), false, v.textoOpcional(v.objeto(req.corpo), 'motivo', { max: 200 })));
  r.get('/api/balanco', (req) => financas.obterBalanco(ctx, req.usuario));
  r.post('/api/fechamentos', (req) => criado(financas.fecharPeriodo(ctx, req.usuario, v.texto(v.objeto(req.corpo), 'periodo', { min: 7, max: 7 }))));
  r.post('/api/acertos/:id/confirmacao', (req) => financas.confirmarAcerto(ctx, req.usuario, v.idDeRota(req.params.id)));

  // --- Escala ---
  r.get('/api/escala', (req) => {
    const hoje = ctx.relogio.hoje();
    const de = req.consulta.get('de') ?? somarDias(hoje, -7);
    const ate = req.consulta.get('ate') ?? somarDias(hoje, 30);
    if (!ehDataISO(de) || !ehDataISO(ate)) throw new ErroDominio('VALIDACAO', 'Parâmetros "de" e "ate" devem ser datas AAAA-MM-DD.', 400);
    return { turnos: escala.listarTurnos(ctx, req.usuario, de, ate), trocas: escala.listarTrocas(ctx, req.usuario) };
  });
  r.post('/api/escala', (req) => {
    const c = v.objeto(req.corpo);
    if (!Array.isArray(c.tipos) || c.tipos.length === 0 || !c.tipos.every((t) => t === 'LIMPEZA' || t === 'REFEICAO')) {
      throw new ErroDominio('VALIDACAO', 'Campo "tipos" deve listar LIMPEZA e/ou REFEICAO.', 400);
    }
    return criado(escala.gerarEscala(ctx, req.usuario, v.dataISO(c, 'inicio'), v.inteiro(c, 'dias', { min: 1, max: 60 }), c.tipos as escala.TipoTurno[]));
  });
  r.post('/api/turnos/:id/conclusao', (req) => escala.concluirTurno(ctx, req.usuario, v.idDeRota(req.params.id)));
  r.post('/api/trocas', (req) => {
    const c = v.objeto(req.corpo);
    return criado(escala.solicitarTroca(ctx, req.usuario, v.inteiro(c, 'meuTurnoId'), v.inteiro(c, 'outroTurnoId')));
  });
  r.post('/api/trocas/:id/aceite', (req) => escala.responderTroca(ctx, req.usuario, v.idDeRota(req.params.id), true));
  r.post('/api/trocas/:id/recusa', (req) => escala.responderTroca(ctx, req.usuario, v.idDeRota(req.params.id), false));
  r.post('/api/trocas/:id/cancelamento', (req) => escala.cancelarTroca(ctx, req.usuario, v.idDeRota(req.params.id)));

  // --- Notificações ---
  r.get('/api/notificacoes', (req) => notificacoes.listarNotificacoes(ctx, req.usuario));
  r.post('/api/notificacoes/lidas', (req) => {
    notificacoes.marcarTodasLidas(ctx, req.usuario);
    return semConteudo();
  });
  r.post('/api/notificacoes/:id/lida', (req) => {
    notificacoes.marcarLida(ctx, req.usuario, v.idDeRota(req.params.id));
    return semConteudo();
  });

  return r;
}
