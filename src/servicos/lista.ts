import type { Contexto, Usuario } from './contexto.ts';
import { notificarAtivos } from './notificacoes.ts';
import { conflito, naoEncontrado, proibido } from '../erros.ts';

interface ItemLinha {
  id: number; republica_id: number; nome: string; produto_id: number | null; origem: 'MANUAL' | 'AUTOMATICA';
  status: 'PENDENTE' | 'COMPRADO'; criado_por: number | null; criado_em: string; comprado_em: string | null;
  criador_nome: string | null; comprador_nome: string | null;
}

const paraDTO = (i: ItemLinha) => ({
  id: i.id, nome: i.nome, produtoId: i.produto_id, origem: i.origem, status: i.status,
  criadoPor: i.criado_por, criadorNome: i.criador_nome, criadoEm: i.criado_em,
  compradorNome: i.comprador_nome, compradoEm: i.comprado_em,
});

const SELECAO = `
  SELECT i.*, c.nome AS criador_nome, k.nome AS comprador_nome
  FROM item_lista i
  LEFT JOIN usuario c ON c.id = i.criado_por
  LEFT JOIN usuario k ON k.id = i.comprado_por`;

export function listarItens(ctx: Contexto, u: Usuario) {
  return ctx.db
    .todos<ItemLinha>(`${SELECAO} WHERE i.republica_id = ? AND (i.status = 'PENDENTE' OR i.comprado_em >= ?) ORDER BY i.status DESC, i.id DESC`,
      u.republicaId, `${ctx.relogio.hoje().slice(0, 8)}01`)
    .map(paraDTO);
}

export function adicionarItem(ctx: Contexto, u: Usuario, nome: string) {
  const { id } = ctx.db.executar(
    `INSERT INTO item_lista (republica_id, nome, origem, status, criado_por, criado_em) VALUES (?, ?, 'MANUAL', 'PENDENTE', ?, ?)`,
    u.republicaId, nome, u.id, ctx.relogio.agora());
  return paraDTO(ctx.db.um<ItemLinha>(`${SELECAO} WHERE i.id = ?`, id)!);
}

function buscar(ctx: Contexto, u: Usuario, id: number): ItemLinha {
  const item = ctx.db.um<ItemLinha>(`${SELECAO} WHERE i.id = ? AND i.republica_id = ?`, id, u.republicaId);
  if (!item) throw naoEncontrado('Item da lista');
  return item;
}

export function marcarComprado(ctx: Contexto, u: Usuario, id: number) {
  const item = buscar(ctx, u, id);
  if (item.status !== 'PENDENTE') throw conflito('ITEM_JA_COMPRADO', 'Este item já foi marcado como comprado.');
  ctx.db.executar(`UPDATE item_lista SET status = 'COMPRADO', comprado_por = ?, comprado_em = ? WHERE id = ?`, u.id, ctx.relogio.agora(), id);
  return paraDTO(buscar(ctx, u, id));
}

export function removerItem(ctx: Contexto, u: Usuario, id: number): void {
  const item = buscar(ctx, u, id);
  if (item.status !== 'PENDENTE') throw conflito('ITEM_JA_COMPRADO', 'Itens já comprados ficam no histórico e não podem ser removidos.');
  // Sugestões automáticas refletem o estado do estoque: só o administrador pode descartá-las.
  const podeRemover = u.perfil === 'ADMIN' || (item.origem === 'MANUAL' && item.criado_por === u.id);
  if (!podeRemover) throw proibido('SEM_PERMISSAO', 'Apenas quem adicionou o item ou o administrador pode removê-lo.');
  ctx.db.executar('DELETE FROM item_lista WHERE id = ?', id);
}

/**
 * RF-04: inclui o produto coletivo na lista de compras quando ele atinge o mínimo de segurança.
 * Idempotente: se já existe item pendente para o produto, nada acontece.
 */
export function sugerirReposicao(ctx: Contexto, produto: { id: number; republica_id: number; nome: string }): boolean {
  const r = ctx.db.executar(
    `INSERT OR IGNORE INTO item_lista (republica_id, nome, produto_id, origem, status, criado_em) VALUES (?, ?, ?, 'AUTOMATICA', 'PENDENTE', ?)`,
    produto.republica_id, produto.nome, produto.id, ctx.relogio.agora());
  if (r.alteradas === 0) return false;
  notificarAtivos(ctx, produto.republica_id, 'ESTOQUE_MINIMO',
    `"${produto.nome}" atingiu o estoque mínimo e entrou na lista de compras.`, `minimo:${r.id}`);
  return true;
}

/** Fecha o ciclo estoque → lista → estoque: repor o produto dá baixa na sugestão pendente. */
export function concluirSugestao(ctx: Contexto, produtoId: number, usuarioId: number): void {
  ctx.db.executar(
    `UPDATE item_lista SET status = 'COMPRADO', comprado_por = ?, comprado_em = ? WHERE produto_id = ? AND status = 'PENDENTE'`,
    usuarioId, ctx.relogio.agora(), produtoId);
}
