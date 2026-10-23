import type { Contexto, Usuario } from './contexto.ts';
import { ErroDominio, conflito, naoEncontrado, proibido } from '../erros.ts';
import { estadoValidade } from '../dominio/validade.ts';
import { diasEntre } from '../dominio/datas.ts';
import { concluirSugestao, sugerirReposicao } from './lista.ts';
import { executarRotinas } from './rotinas.ts';

export type Classificacao = 'COLETIVO' | 'INDIVIDUAL';
export type StatusProduto = 'ATIVO' | 'ESGOTADO' | 'VENCIDO' | 'DESCARTADO';

export interface ProdutoLinha {
  id: number; republica_id: number; nome: string; quantidade: number; unidade: string; validade: string | null;
  classificacao: Classificacao; dono_id: number | null; quantidade_minima: number | null; status: StatusProduto;
  criado_por: number; criado_em: string; dono_nome?: string | null;
}

const arredondar = (n: number) => Math.round(n * 1000) / 1000;

function paraDTO(p: ProdutoLinha, u: Usuario, hoje: string) {
  return {
    id: p.id,
    nome: p.nome,
    quantidade: p.quantidade,
    unidade: p.unidade,
    validade: p.validade,
    classificacao: p.classificacao,
    donoId: p.dono_id,
    donoNome: p.dono_nome ?? null,
    quantidadeMinima: p.quantidade_minima,
    status: p.status,
    estadoValidade: estadoValidade(p.validade, hoje),
    diasParaVencer: p.validade === null ? null : diasEntre(hoje, p.validade),
    abaixoDoMinimo: p.quantidade_minima !== null && p.quantidade <= p.quantidade_minima,
    // RB-01: só o dono movimenta um item individual. A interface usa isto para esconder ações; o servidor revalida.
    meu: p.classificacao === 'COLETIVO' || p.dono_id === u.id,
  };
}

const SELECAO = 'SELECT p.*, d.nome AS dono_nome FROM produto p LEFT JOIN usuario d ON d.id = p.dono_id';

function buscar(ctx: Contexto, u: Usuario, id: number): ProdutoLinha {
  const p = ctx.db.um<ProdutoLinha>(`${SELECAO} WHERE p.id = ? AND p.republica_id = ?`, id, u.republicaId);
  if (!p) throw naoEncontrado('Produto');
  return p;
}

/** RB-01 / RF-07: bloqueia qualquer movimentação de item individual por quem não é o dono. */
function exigirPropriedade(p: ProdutoLinha, u: Usuario): void {
  if (p.classificacao === 'INDIVIDUAL' && p.dono_id !== u.id) {
    throw proibido('PROPRIEDADE_INDIVIDUAL', `Este item é de uso individual de ${p.dono_nome ?? 'outro morador'} e só pode ser movimentado por quem o cadastrou.`);
  }
}

/** RF-04: produto coletivo com quantidade no mínimo de segurança (ou abaixo) entra na lista de compras. */
function verificarMinimo(ctx: Contexto, p: ProdutoLinha): void {
  if (p.classificacao !== 'COLETIVO' || p.quantidade_minima === null) return;
  if (p.status === 'DESCARTADO') return;
  if (p.status === 'VENCIDO' || p.quantidade <= p.quantidade_minima) sugerirReposicao(ctx, p);
}

export function listarProdutos(ctx: Contexto, u: Usuario, incluirInativos: boolean) {
  executarRotinas(ctx, u.republicaId);
  const filtro = incluirInativos ? '' : `AND p.status IN ('ATIVO','ESGOTADO')`;
  const hoje = ctx.relogio.hoje();
  return ctx.db
    .todos<ProdutoLinha>(`${SELECAO} WHERE p.republica_id = ? ${filtro} ORDER BY p.status, p.validade IS NULL, p.validade, p.nome`, u.republicaId)
    .map((p) => paraDTO(p, u, hoje));
}

export interface NovoProduto {
  nome: string; quantidade: number; unidade: string; validade: string | null;
  classificacao: Classificacao; quantidadeMinima: number | null;
}

/** RF-01: cadastro e classificação. */
export function cadastrarProduto(ctx: Contexto, u: Usuario, dados: NovoProduto) {
  const hoje = ctx.relogio.hoje();
  if (dados.validade !== null && dados.validade < hoje) {
    throw new ErroDominio('VALIDADE_PASSADA', 'Não é possível cadastrar um produto que já está vencido.');
  }
  if (dados.classificacao === 'INDIVIDUAL' && dados.quantidadeMinima !== null) {
    throw new ErroDominio('MINIMO_APENAS_COLETIVO', 'Quantidade mínima só se aplica a itens de uso coletivo.');
  }
  return ctx.db.transacao(() => {
    const { id } = ctx.db.executar(
      `INSERT INTO produto (republica_id, nome, quantidade, unidade, validade, classificacao, dono_id, quantidade_minima, status, criado_por, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO', ?, ?)`,
      u.republicaId, dados.nome, arredondar(dados.quantidade), dados.unidade, dados.validade, dados.classificacao,
      dados.classificacao === 'INDIVIDUAL' ? u.id : null, dados.quantidadeMinima, u.id, ctx.relogio.agora());
    const p = buscar(ctx, u, id);
    verificarMinimo(ctx, p);
    return paraDTO(p, u, hoje);
  });
}

/** RF-02 (baixa), RF-07 (bloqueio de item alheio) e RB-04 (vencido não é consumível). */
export function consumirProduto(ctx: Contexto, u: Usuario, id: number, quantidade: number) {
  // Garante que o status reflita a data de hoje antes de decidir (RB-04).
  executarRotinas(ctx, u.republicaId);
  return ctx.db.transacao(() => {
    const p = buscar(ctx, u, id);
    exigirPropriedade(p, u);
    if (p.status === 'VENCIDO' || p.status === 'DESCARTADO') {
      throw conflito('PRODUTO_INDISPONIVEL', 'Produto vencido ou descartado não pode ser consumido.');
    }
    if (p.status === 'ESGOTADO') throw conflito('PRODUTO_ESGOTADO', 'Não há estoque deste produto.');
    if (quantidade > p.quantidade) {
      throw new ErroDominio('QUANTIDADE_INSUFICIENTE', `Quantidade indisponível: há apenas ${p.quantidade} ${p.unidade} em estoque.`);
    }
    const restante = arredondar(p.quantidade - quantidade);
    ctx.db.executar('UPDATE produto SET quantidade = ?, status = ? WHERE id = ?', restante, restante === 0 ? 'ESGOTADO' : 'ATIVO', id);
    ctx.db.executar('INSERT INTO consumo (produto_id, usuario_id, quantidade, registrado_em) VALUES (?, ?, ?, ?)', id, u.id, quantidade, ctx.relogio.agora());
    const atualizado = buscar(ctx, u, id);
    verificarMinimo(ctx, atualizado);
    return paraDTO(atualizado, u, ctx.relogio.hoje());
  });
}

/** Reposição: entrada de estoque em produto já cadastrado. Um produto vencido é substituído pelo novo lote. */
export function reporProduto(ctx: Contexto, u: Usuario, id: number, quantidade: number, validade: string | null) {
  executarRotinas(ctx, u.republicaId);
  const hoje = ctx.relogio.hoje();
  return ctx.db.transacao(() => {
    const p = buscar(ctx, u, id);
    exigirPropriedade(p, u);
    if (p.status === 'DESCARTADO') throw conflito('PRODUTO_INDISPONIVEL', 'Produto descartado não pode ser reposto; cadastre um novo.');
    if (validade !== null && validade < hoje) throw new ErroDominio('VALIDADE_PASSADA', 'A validade do novo lote não pode estar no passado.');
    const semEstoqueValido = p.status !== 'ATIVO';
    if (semEstoqueValido && p.validade !== null && validade === null) {
      throw new ErroDominio('VALIDADE_OBRIGATORIA', 'Informe a validade do novo lote.');
    }
    const novaQuantidade = arredondar(p.status === 'VENCIDO' ? quantidade : p.quantidade + quantidade);
    ctx.db.executar(`UPDATE produto SET quantidade = ?, validade = ?, status = 'ATIVO' WHERE id = ?`, novaQuantidade, validade ?? p.validade, id);
    const atualizado = buscar(ctx, u, id);
    if (atualizado.quantidade_minima === null || atualizado.quantidade > atualizado.quantidade_minima) concluirSugestao(ctx, id, u.id);
    return paraDTO(atualizado, u, hoje);
  });
}

export interface EdicaoProduto {
  nome?: string; unidade?: string; validade?: string | null; quantidadeMinima?: number | null;
}

export function editarProduto(ctx: Contexto, u: Usuario, id: number, dados: EdicaoProduto) {
  const hoje = ctx.relogio.hoje();
  return ctx.db.transacao(() => {
    const p = buscar(ctx, u, id);
    exigirPropriedade(p, u);
    if (p.status !== 'ATIVO' && p.status !== 'ESGOTADO') throw conflito('PRODUTO_INDISPONIVEL', 'Produto vencido ou descartado não pode ser editado.');
    if (dados.validade != null && dados.validade < hoje) throw new ErroDominio('VALIDADE_PASSADA', 'A validade não pode estar no passado.');
    if (dados.quantidadeMinima != null && p.classificacao === 'INDIVIDUAL') {
      throw new ErroDominio('MINIMO_APENAS_COLETIVO', 'Quantidade mínima só se aplica a itens de uso coletivo.');
    }
    ctx.db.executar('UPDATE produto SET nome = ?, unidade = ?, validade = ?, quantidade_minima = ? WHERE id = ?',
      dados.nome ?? p.nome, dados.unidade ?? p.unidade,
      dados.validade === undefined ? p.validade : dados.validade,
      dados.quantidadeMinima === undefined ? p.quantidade_minima : dados.quantidadeMinima, id);
    const atualizado = buscar(ctx, u, id);
    verificarMinimo(ctx, atualizado);
    return paraDTO(atualizado, u, hoje);
  });
}

/** Descarte manual (estragou, caiu, etc.). Estado terminal. */
export function descartarProduto(ctx: Contexto, u: Usuario, id: number) {
  return ctx.db.transacao(() => {
    const p = buscar(ctx, u, id);
    exigirPropriedade(p, u);
    if (p.classificacao === 'COLETIVO' && u.perfil !== 'ADMIN' && p.criado_por !== u.id) {
      throw proibido('SEM_PERMISSAO', 'Apenas quem cadastrou o item coletivo ou o administrador pode descartá-lo.');
    }
    if (p.status === 'DESCARTADO') throw conflito('PRODUTO_INDISPONIVEL', 'Produto já descartado.');
    ctx.db.executar(`UPDATE produto SET status = 'DESCARTADO' WHERE id = ?`, id);
    return paraDTO(buscar(ctx, u, id), u, ctx.relogio.hoje());
  });
}

/** RF-02: histórico de consumo da república. Consumos de itens individuais só aparecem para o próprio dono. */
export function historicoConsumo(ctx: Contexto, u: Usuario) {
  return ctx.db.todos<{ id: number; produto: string; unidade: string; quantidade: number; morador: string; registradoEm: string }>(
    `SELECT c.id, p.nome AS produto, p.unidade, c.quantidade, m.nome AS morador, c.registrado_em AS registradoEm
     FROM consumo c JOIN produto p ON p.id = c.produto_id JOIN usuario m ON m.id = c.usuario_id
     WHERE p.republica_id = ? AND (p.classificacao = 'COLETIVO' OR p.dono_id = ?)
     ORDER BY c.id DESC LIMIT 100`, u.republicaId, u.id);
}
