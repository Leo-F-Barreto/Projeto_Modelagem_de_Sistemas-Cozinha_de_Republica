import type { Contexto, Usuario } from './contexto.ts';
import { listarProdutos } from './estoque.ts';
import { calcularSaldos } from './financas.ts';
import { listarTrocas, listarTurnos } from './escala.ts';
import { somarDias } from '../dominio/datas.ts';

/** Painel principal: o que exige atenção agora (RF-03 exige o destaque de validade crítica aqui). */
export function obterPainel(ctx: Contexto, u: Usuario) {
  const hoje = ctx.relogio.hoje();
  const produtos = listarProdutos(ctx, u, false); // também executa as rotinas do notificador
  const contar = (sql: string, ...p: (string | number)[]) => ctx.db.um<{ n: number }>(sql, ...p)!.n;
  return {
    hoje,
    validadeCritica: produtos.filter((p) => p.status === 'ATIVO' && p.estadoValidade === 'CRITICA'),
    itensNaLista: contar(`SELECT COUNT(*) AS n FROM item_lista WHERE republica_id = ? AND status = 'PENDENTE'`, u.republicaId),
    meuSaldoCentavos: calcularSaldos(ctx, u.republicaId).find((s) => s.usuarioId === u.id)?.saldoCentavos ?? 0,
    meusTurnos: listarTurnos(ctx, u, somarDias(hoje, -7), somarDias(hoje, 14)).filter((t) => t.responsavelId === u.id && t.status === 'PENDENTE'),
    trocasParaResponder: listarTrocas(ctx, u).filter((t) => t.solicitadoId === u.id).length,
    comprasAguardandoAprovacao: u.perfil === 'ADMIN'
      ? contar(`SELECT COUNT(*) AS n FROM compra WHERE republica_id = ? AND status = 'PENDENTE'`, u.republicaId) : 0,
    notificacoesNaoLidas: contar('SELECT COUNT(*) AS n FROM notificacao WHERE usuario_id = ? AND lida = 0', u.id),
  };
}
