"""RF-04: lista de compras colaborativa, com sugestões automáticas a partir do estoque."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import aliased

from app.db.modelos import ItemLista, Produto, Usuario
from app.erros import conflito, nao_encontrado, proibido
from app.servicos.contexto import Contexto, UsuarioAtual, instante
from app.servicos.notificacoes import notificar_ativos

_Criador = aliased(Usuario)
_Comprador = aliased(Usuario)


def _consulta():  # type: ignore[no-untyped-def]
    return (
        select(ItemLista, _Criador.nome, _Comprador.nome)
        .outerjoin(_Criador, _Criador.id == ItemLista.criado_por)
        .outerjoin(_Comprador, _Comprador.id == ItemLista.comprado_por)
    )


def _dto(i: ItemLista, criador: str | None, comprador: str | None) -> dict[str, Any]:
    return {
        "id": i.id,
        "nome": i.nome,
        "quantidade": i.quantidade,
        "unidade": i.unidade,
        "produtoId": i.produto_id,
        "origem": i.origem,
        "status": i.status,
        "criadoPor": i.criado_por,
        "criadorNome": criador,
        "criadoEm": instante(i.criado_em),
        "compradorNome": comprador,
        "compradoEm": instante(i.comprado_em),
    }


def _buscar(ctx: Contexto, u: UsuarioAtual, id_: int) -> dict[str, Any]:
    linha = ctx.s.execute(_consulta().where(ItemLista.id == id_, ItemLista.republica_id == u.republica_id)).first()
    if linha is None:
        raise nao_encontrado("Item da lista")
    return _dto(*linha)


def listar(ctx: Contexto, u: UsuarioAtual) -> list[dict[str, Any]]:
    """RF-04.5: pendentes primeiro (esgotados, depois estoque baixo, depois manuais) e comprados do mês corrente."""
    hoje = ctx.relogio.hoje()
    inicio_mes = datetime(hoje.year, hoje.month, 1, tzinfo=UTC)
    linhas = ctx.s.execute(
        _consulta()
        .add_columns(Produto.quantidade)
        .outerjoin(Produto, Produto.id == ItemLista.produto_id)
        .where(
            ItemLista.republica_id == u.republica_id,
            (ItemLista.status == "PENDENTE") | (ItemLista.comprado_em >= inicio_mes),
        )
    ).all()

    def prioridade(linha: Any) -> tuple[int, int, int]:
        item, _, _, qtd_estoque = linha
        if item.status != "PENDENTE":
            return (3, 0, -item.id)
        if item.origem == "AUTOMATICA":
            return (0 if (qtd_estoque or 0) == 0 else 1, 0, -item.id)
        return (2, 0, -item.id)

    return [_dto(i, c, k) for i, c, k, _ in sorted(linhas, key=prioridade)]


def adicionar(ctx: Contexto, u: UsuarioAtual, nome: str, quantidade: float, unidade: str | None) -> dict[str, Any]:
    """RF-04.2 / EX-04.1: item manual; se já houver um pendente com o mesmo nome, soma a quantidade."""
    existente = ctx.s.scalar(
        select(ItemLista).where(
            ItemLista.republica_id == u.republica_id,
            ItemLista.status == "PENDENTE",
            func.lower(ItemLista.nome) == nome.lower(),
        )
    )
    if existente is not None:
        existente.quantidade = round((existente.quantidade or 0) + quantidade, 3)
        existente.alterado_por = u.id
        ctx.s.flush()
        return _buscar(ctx, u, existente.id)
    item = ItemLista(
        republica_id=u.republica_id,
        nome=nome,
        quantidade=round(quantidade, 3),
        unidade=unidade,
        origem="MANUAL",
        status="PENDENTE",
        criado_por=u.id,
        criado_em=ctx.relogio.agora(),
    )
    ctx.s.add(item)
    ctx.s.flush()
    return _buscar(ctx, u, item.id)


def editar_quantidade(ctx: Contexto, u: UsuarioAtual, id_: int, quantidade: float) -> dict[str, Any]:
    """RF-04.4: ajuste da quantidade, registrando quem alterou."""
    item = ctx.s.scalar(select(ItemLista).where(ItemLista.id == id_, ItemLista.republica_id == u.republica_id))
    if item is None:
        raise nao_encontrado("Item da lista")
    if item.status != "PENDENTE":
        raise conflito("ITEM_JA_COMPRADO", "Itens já comprados ficam no histórico e não podem ser alterados.")
    item.quantidade = round(quantidade, 3)
    item.alterado_por = u.id
    ctx.s.flush()
    return _buscar(ctx, u, id_)


def marcar_comprado(ctx: Contexto, u: UsuarioAtual, id_: int) -> dict[str, Any]:
    item = ctx.s.scalar(select(ItemLista).where(ItemLista.id == id_, ItemLista.republica_id == u.republica_id))
    if item is None:
        raise nao_encontrado("Item da lista")
    if item.status != "PENDENTE":
        raise conflito("ITEM_JA_COMPRADO", "Este item já foi marcado como comprado.")
    item.status = "COMPRADO"
    item.comprado_por = u.id
    item.comprado_em = ctx.relogio.agora()
    ctx.s.flush()
    dto = _buscar(ctx, u, id_)
    # RB-08: o item comprado sugere registrar a nota no rateio financeiro.
    dto["sugestao"] = "Registre a nota desta compra em Finanças para que ela entre no rateio."
    return dto


def remover(ctx: Contexto, u: UsuarioAtual, id_: int) -> None:
    item = ctx.s.scalar(select(ItemLista).where(ItemLista.id == id_, ItemLista.republica_id == u.republica_id))
    if item is None:
        raise nao_encontrado("Item da lista")
    if item.status != "PENDENTE":
        raise conflito("ITEM_JA_COMPRADO", "Itens já comprados ficam no histórico e não podem ser removidos.")
    # RB-07: sugestões automáticas refletem o estoque; só o administrador pode descartá-las.
    pode = u.perfil == "ADMIN" or (item.origem == "MANUAL" and item.criado_por == u.id)
    if not pode:
        raise proibido("SEM_PERMISSAO", "Apenas quem adicionou o item ou o administrador pode removê-lo.")
    ctx.s.delete(item)
    ctx.s.flush()


def quantidade_sugerida(p: Produto) -> float:
    """RF-04.1: repor até a meta ideal, definida como o dobro do estoque mínimo."""
    minimo = p.quantidade_minima or 0
    return max(round(minimo * 2 - p.quantidade, 3), minimo, 1)


def sugerir_reposicao(ctx: Contexto, p: Produto) -> bool:
    """Inclui o produto coletivo na lista ao atingir o mínimo. Se já existe item pendente, só recalcula a quantidade."""
    existente = ctx.s.scalar(select(ItemLista).where(ItemLista.produto_id == p.id, ItemLista.status == "PENDENTE"))
    if existente is not None:
        existente.quantidade = quantidade_sugerida(p)
        ctx.s.flush()
        return False
    item = ItemLista(
        republica_id=p.republica_id,
        nome=p.nome,
        quantidade=quantidade_sugerida(p),
        unidade=p.unidade,
        produto_id=p.id,
        origem="AUTOMATICA",
        status="PENDENTE",
        criado_em=ctx.relogio.agora(),
    )
    ctx.s.add(item)
    ctx.s.flush()
    notificar_ativos(
        ctx,
        p.republica_id,
        "ESTOQUE_MINIMO",
        f'"{p.nome}" atingiu o estoque mínimo e entrou na lista de compras.',
        f"minimo:{item.id}",
    )
    return True


def concluir_sugestao(ctx: Contexto, produto_id: int, usuario_id: int) -> None:
    """Fecha o ciclo estoque → lista → estoque: repor o produto dá baixa na sugestão pendente."""
    for item in ctx.s.scalars(
        select(ItemLista).where(ItemLista.produto_id == produto_id, ItemLista.status == "PENDENTE")
    ):
        item.status = "COMPRADO"
        item.comprado_por = usuario_id
        item.comprado_em = ctx.relogio.agora()
    ctx.s.flush()


def pendentes(ctx: Contexto, republica_id: int) -> int:
    return (
        ctx.s.scalar(select(func.count()).where(ItemLista.republica_id == republica_id, ItemLista.status == "PENDENTE"))
        or 0
    )
