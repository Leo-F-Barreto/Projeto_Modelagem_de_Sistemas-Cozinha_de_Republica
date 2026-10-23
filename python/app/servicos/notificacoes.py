"""Notificações internas. Envio idempotente: a combinação (usuário, chave) nunca gera duas notificações."""

from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as insert_pg
from sqlalchemy.dialects.sqlite import insert as insert_sqlite

from app.db.modelos import Notificacao
from app.erros import nao_encontrado
from app.servicos.contexto import Contexto, UsuarioAtual, instante, moradores_ativos

TIPOS = (
    "VALIDADE_CRITICA",
    "PRODUTO_VENCIDO",
    "ESTOQUE_MINIMO",
    "TAREFA_PENDENTE",
    "COMPRA_PENDENTE",
    "COMPRA_DECIDIDA",
    "ACERTO",
    "TROCA",
)


def notificar(ctx: Contexto, usuario_id: int, tipo: str, mensagem: str, chave: str) -> None:
    insert = insert_pg if ctx.s.get_bind().dialect.name == "postgresql" else insert_sqlite
    ctx.s.execute(
        insert(Notificacao)
        .values(
            usuario_id=usuario_id, tipo=tipo, mensagem=mensagem, chave=chave, lida=False, criado_em=ctx.relogio.agora()
        )
        .on_conflict_do_nothing(index_elements=["usuario_id", "chave"])
    )


def notificar_ativos(ctx: Contexto, republica_id: int, tipo: str, mensagem: str, chave: str) -> None:
    for m in moradores_ativos(ctx, republica_id):
        notificar(ctx, m.id, tipo, mensagem, chave)


def notificar_admins(ctx: Contexto, republica_id: int, tipo: str, mensagem: str, chave: str) -> None:
    for m in moradores_ativos(ctx, republica_id):
        if m.perfil == "ADMIN":
            notificar(ctx, m.id, tipo, mensagem, chave)


def listar(ctx: Contexto, u: UsuarioAtual) -> list[dict[str, Any]]:
    linhas = ctx.s.scalars(
        select(Notificacao)
        .where(Notificacao.usuario_id == u.id)
        .order_by(Notificacao.lida, Notificacao.id.desc())
        .limit(50)
    )
    return [
        {"id": n.id, "tipo": n.tipo, "mensagem": n.mensagem, "lida": n.lida, "criadoEm": instante(n.criado_em)}
        for n in linhas
    ]


def nao_lidas(ctx: Contexto, u: UsuarioAtual) -> int:
    return ctx.s.scalar(select(func.count()).where(Notificacao.usuario_id == u.id, Notificacao.lida.is_(False))) or 0


def marcar_lida(ctx: Contexto, u: UsuarioAtual, id_: int) -> None:
    r = ctx.s.execute(
        update(Notificacao).where(Notificacao.id == id_, Notificacao.usuario_id == u.id).values(lida=True)
    )
    if r.rowcount == 0:  # type: ignore[attr-defined]
        raise nao_encontrado("Notificação")


def marcar_todas_lidas(ctx: Contexto, u: UsuarioAtual) -> None:
    ctx.s.execute(
        update(Notificacao).where(Notificacao.usuario_id == u.id, Notificacao.lida.is_(False)).values(lida=True)
    )
