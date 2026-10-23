"""Contexto de cada operação e utilidades comuns aos serviços."""

import json
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.modelos import Auditoria, Usuario
from app.erros import proibido
from app.relogio import Relogio

log = logging.getLogger("cochef")


@dataclass
class Contexto:
    s: Session
    relogio: Relogio
    settings: Settings


@dataclass(frozen=True)
class UsuarioAtual:
    """Usuário autenticado e ativo, já vinculado à sua república. Todo serviço filtra os dados por `republica_id`."""

    id: int
    republica_id: int
    nome: str
    perfil: str

    def dto(self) -> dict[str, Any]:
        return {"id": self.id, "republicaId": self.republica_id, "nome": self.nome, "perfil": self.perfil}


def exigir_admin(u: UsuarioAtual) -> None:
    if u.perfil != "ADMIN":
        raise proibido("APENAS_ADMIN", "Ação restrita ao administrador da república.")


def moradores_ativos(ctx: Contexto, republica_id: int) -> list[Usuario]:
    """Glossário: "Morador Ativo" participa do rateio e das escalas vigentes."""
    return list(
        ctx.s.scalars(
            select(Usuario).where(Usuario.republica_id == republica_id, Usuario.ativo.is_(True)).order_by(Usuario.id)
        )
    )


def auditar(ctx: Contexto, u: UsuarioAtual, acao: str, detalhe: dict[str, Any]) -> None:
    """Trilha de auditoria das ações sensíveis (finanças, administração e tentativas indevidas)."""
    ctx.s.add(
        Auditoria(
            republica_id=u.republica_id,
            usuario_id=u.id,
            acao=acao,
            detalhe=json.dumps(detalhe, ensure_ascii=False, default=str),
            criado_em=ctx.relogio.agora(),
        )
    )
    ctx.s.flush()


def instante(valor: datetime | None) -> str | None:
    """Instante em ISO 8601 UTC (o SQLite devolve datas sem fuso, sempre gravadas em UTC)."""
    if valor is None:
        return None
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=UTC)
    return valor.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def dia(valor: date | None) -> str | None:
    return None if valor is None else valor.isoformat()


def reais(centavos: int) -> str:
    return f"R$ {centavos / 100:.2f}".replace(".", ",")
