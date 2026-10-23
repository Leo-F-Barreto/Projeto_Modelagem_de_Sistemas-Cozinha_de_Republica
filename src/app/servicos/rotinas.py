"""Ator "Sistema / Notificador Automatizado". Idempotente: pode rodar quantas vezes for preciso no mesmo dia.

1. RB-04 por lote: lotes com validade ultrapassada vencem e saem do estoque; o produto só fica VENCIDO
   quando não sobra nenhum lote consumível.
2. RF-03.2 / RF-03.3: lotes em validade crítica geram notificação (uma por produto e data de validade).
3. Turnos de hoje ainda pendentes geram lembrete ao responsável.
4. EX-06.1: pedidos de troca sem resposta até a véspera do turno são cancelados.

Roda pelo agendador e também antes de consultas e baixas de estoque, para que o estado nunca dependa
de o agendador ter rodado.
"""

from collections import defaultdict
from datetime import date

from sqlalchemy import select

from app.db.modelos import Lote, Produto, Republica, Troca, Turno
from app.dominio.datas import dias_entre, somar_dias
from app.dominio.validade import DIAS_VALIDADE_CRITICA
from app.servicos.contexto import Contexto
from app.servicos.notificacoes import notificar, notificar_ativos


def recalcular(ctx: Contexto, p: Produto) -> None:
    """Quantidade = soma dos lotes consumíveis; validade = a do lote que vence primeiro."""
    ativos = list(
        ctx.s.scalars(select(Lote).where(Lote.produto_id == p.id, Lote.status == "ATIVO", Lote.quantidade > 0))
    )
    p.quantidade = round(sum(lote.quantidade for lote in ativos), 3)
    if ativos:
        validades = [lote.validade for lote in ativos if lote.validade is not None]
        p.validade = min(validades) if validades else None
    ctx.s.flush()


def _avisar(ctx: Contexto, p: Produto, tipo: str, mensagem: str, chave: str) -> None:
    if p.classificacao == "COLETIVO":
        notificar_ativos(ctx, p.republica_id, tipo, mensagem, chave)
    elif p.dono_id is not None:
        notificar(ctx, p.dono_id, tipo, mensagem, chave)


def _fmt(n: float) -> str:
    return f"{n:g}".replace(".", ",")


def executar_rotinas(ctx: Contexto, republica_id: int) -> None:
    from app.servicos.lista import sugerir_reposicao  # evita import circular

    hoje = ctx.relogio.hoje()

    # 1. Vencimento por lote.
    vencidos = ctx.s.execute(
        select(Lote, Produto)
        .join(Produto, Produto.id == Lote.produto_id)
        .where(
            Produto.republica_id == republica_id,
            Produto.status == "ATIVO",
            Lote.status == "ATIVO",
            Lote.quantidade > 0,
            Lote.validade.is_not(None),
            Lote.validade < hoje,
        )
    ).all()
    afetados: dict[int, Produto] = {}
    for lote, p in vencidos:
        lote.status = "VENCIDO"
        afetados[p.id] = p
        _avisar(
            ctx,
            p,
            "PRODUTO_VENCIDO",
            f'{_fmt(lote.quantidade)} {p.unidade} de "{p.nome}" venceram em {lote.validade} e saíram do estoque ativo.',
            f"vencido:{p.id}:{lote.validade}",
        )
    ctx.s.flush()
    for p in afetados.values():
        recalcular(ctx, p)
        if p.quantidade == 0:
            p.status = "VENCIDO"
        ctx.s.flush()
        if (
            p.classificacao == "COLETIVO"
            and p.quantidade_minima is not None
            and (p.status == "VENCIDO" or p.quantidade <= p.quantidade_minima)
        ):
            sugerir_reposicao(ctx, p)

    # 2. Validade crítica por lote.
    criticos = ctx.s.execute(
        select(Lote.validade, Produto)
        .join(Produto, Produto.id == Lote.produto_id)
        .where(
            Produto.republica_id == republica_id,
            Produto.status == "ATIVO",
            Lote.status == "ATIVO",
            Lote.quantidade > 0,
            Lote.validade.between(hoje, somar_dias(hoje, DIAS_VALIDADE_CRITICA)),
        )
    ).all()
    vistos: dict[tuple[int, date], Produto] = {}
    for validade, p in criticos:
        if validade is not None:
            vistos[(p.id, validade)] = p
    for (_, validade), p in vistos.items():
        dias = dias_entre(hoje, validade)
        quando = "hoje" if dias == 0 else f"em {dias} dia(s) ({validade})"
        _avisar(
            ctx,
            p,
            "VALIDADE_CRITICA",
            f'"{p.nome}" ({p.compartimento}) vence {quando}. Consuma antes que estrague.',
            f"critico:{p.id}:{validade}",
        )

    # 3. Lembrete de turno.
    for t in ctx.s.scalars(
        select(Turno).where(Turno.republica_id == republica_id, Turno.data == hoje, Turno.status == "PENDENTE")
    ):
        rotulo = "limpeza" if t.tipo == "LIMPEZA" else "preparo de refeição"
        notificar(
            ctx,
            t.responsavel_id,
            "TAREFA_PENDENTE",
            f"Hoje é o seu turno de {rotulo}.",
            f"turno:{t.id}:{t.responsavel_id}",
        )

    # 4. Trocas sem resposta até a véspera do primeiro turno envolvido.
    pendentes = ctx.s.scalars(select(Troca).where(Troca.republica_id == republica_id, Troca.status == "PENDENTE")).all()
    if pendentes:
        ids = {t.turno_solicitante_id for t in pendentes} | {t.turno_solicitado_id for t in pendentes}
        datas = {t.id: t.data for t in ctx.s.scalars(select(Turno).where(Turno.id.in_(ids)))}
        por_solicitante: defaultdict[int, list[Troca]] = defaultdict(list)
        for troca in pendentes:
            primeiro = min(datas[troca.turno_solicitante_id], datas[troca.turno_solicitado_id])
            if primeiro <= hoje:
                troca.status = "CANCELADA"
                troca.decidido_em = ctx.relogio.agora()
                por_solicitante[troca.solicitante_id].append(troca)
        for solicitante, trocas in por_solicitante.items():
            for troca in trocas:
                notificar(
                    ctx,
                    solicitante,
                    "TROCA",
                    "Sua solicitação de troca expirou sem resposta e foi cancelada.",
                    f"troca-expirada:{troca.id}",
                )
    ctx.s.flush()


def executar_rotinas_globais(ctx: Contexto) -> int:
    ids = list(ctx.s.scalars(select(Republica.id)))
    for republica_id in ids:
        executar_rotinas(ctx, republica_id)
    return len(ids)
