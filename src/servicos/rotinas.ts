import type { Contexto } from './contexto.ts';
import { notificar, notificarAtivos } from './notificacoes.ts';
import { sugerirReposicao } from './lista.ts';
import { somarDias } from '../dominio/datas.ts';
import { DIAS_VALIDADE_CRITICA } from '../dominio/validade.ts';

interface ProdutoAlvo {
  id: number; republica_id: number; nome: string; validade: string;
  classificacao: 'COLETIVO' | 'INDIVIDUAL'; dono_id: number | null; quantidade_minima: number | null;
}

/**
 * Ator "Sistema / Notificador Automatizado". Idempotente: pode rodar quantas vezes for preciso no mesmo dia.
 *  1. RB-04: produtos com validade ultrapassada passam a VENCIDO e saem do estoque ativo.
 *  2. RF-03: produtos em validade crítica geram notificação (uma por produto e data de validade).
 *  3. Turnos de hoje ainda pendentes geram lembrete ao responsável.
 * É executado por agendamento (servidor.ts) e também antes de consultas e baixas de estoque,
 * para que o estado nunca dependa de o agendador ter rodado.
 */
export function executarRotinas(ctx: Contexto, republicaId: number): void {
  const hoje = ctx.relogio.hoje();
  ctx.db.transacao(() => {
    const vencidos = ctx.db.todos<ProdutoAlvo>(
      `SELECT id, republica_id, nome, validade, classificacao, dono_id, quantidade_minima
       FROM produto WHERE republica_id = ? AND status = 'ATIVO' AND validade IS NOT NULL AND validade < ?`, republicaId, hoje);
    for (const p of vencidos) {
      ctx.db.executar(`UPDATE produto SET status = 'VENCIDO' WHERE id = ?`, p.id);
      const mensagem = `"${p.nome}" venceu em ${p.validade} e foi retirado do estoque ativo.`;
      const chave = `vencido:${p.id}:${p.validade}`;
      if (p.classificacao === 'COLETIVO') {
        notificarAtivos(ctx, republicaId, 'PRODUTO_VENCIDO', mensagem, chave);
        if (p.quantidade_minima !== null) sugerirReposicao(ctx, p);
      } else if (p.dono_id !== null) {
        notificar(ctx, p.dono_id, 'PRODUTO_VENCIDO', mensagem, chave);
      }
    }

    const criticos = ctx.db.todos<ProdutoAlvo>(
      `SELECT id, republica_id, nome, validade, classificacao, dono_id, quantidade_minima
       FROM produto WHERE republica_id = ? AND status = 'ATIVO' AND validade IS NOT NULL AND validade BETWEEN ? AND ?`,
      republicaId, hoje, somarDias(hoje, DIAS_VALIDADE_CRITICA));
    for (const p of criticos) {
      const mensagem = `"${p.nome}" vence em ${p.validade}. Consuma antes que estrague.`;
      const chave = `critico:${p.id}:${p.validade}`;
      if (p.classificacao === 'COLETIVO') notificarAtivos(ctx, republicaId, 'VALIDADE_CRITICA', mensagem, chave);
      else if (p.dono_id !== null) notificar(ctx, p.dono_id, 'VALIDADE_CRITICA', mensagem, chave);
    }

    const turnos = ctx.db.todos<{ id: number; tipo: string; responsavel_id: number }>(
      `SELECT id, tipo, responsavel_id FROM turno WHERE republica_id = ? AND data = ? AND status = 'PENDENTE'`, republicaId, hoje);
    for (const t of turnos) {
      notificar(ctx, t.responsavel_id, 'TAREFA_PENDENTE',
        `Hoje é o seu turno de ${t.tipo === 'LIMPEZA' ? 'limpeza' : 'preparo de refeição'}.`, `turno:${t.id}:${t.responsavel_id}`);
    }
  });
}

export function executarRotinasGlobais(ctx: Contexto): number {
  const republicas = ctx.db.todos<{ id: number }>('SELECT id FROM republica');
  for (const r of republicas) executarRotinas(ctx, r.id);
  return republicas.length;
}
