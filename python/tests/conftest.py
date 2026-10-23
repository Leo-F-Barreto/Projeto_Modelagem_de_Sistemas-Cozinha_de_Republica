"""Infraestrutura dos testes: aplicação inteira, SQLite em memória e relógio fixo em 10/03/2026."""

import itertools
import os
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db.modelos import Base
from app.db.sessao import criar_motor
from app.main import criar_app
from app.relogio import RelogioFixo

HOJE = "2026-03-10"
# Por padrão, SQLite em memória. Para rodar a suíte no PostgreSQL:
#   COCHEF_TESTE_DB_URL=postgresql+psycopg://usuario@localhost:5432/banco pytest
DB_TESTE = os.environ.get("COCHEF_TESTE_DB_URL", "sqlite:///:memory:")
SENHA = "Senha-forte-1"
_contador = itertools.count(1)


@dataclass
class Resposta:
    status: int
    corpo: Any


@dataclass
class Sessao:
    token: str
    usuario: dict[str, Any]
    email: str


class Api:
    def __init__(self, cliente: TestClient, relogio: RelogioFixo) -> None:
        self.cliente = cliente
        self.relogio = relogio
        self.app = cliente.app

    def chamar(self, metodo: str, caminho: str, corpo: Any = None, token: str | None = None) -> Resposta:
        cabecalhos = {"Authorization": f"Bearer {token}"} if token else {}
        r = self.cliente.request(metodo, caminho, json=corpo, headers=cabecalhos)
        try:
            dados = r.json()
        except ValueError:
            dados = r.text
        return Resposta(r.status_code, dados)

    def sessao(self) -> Any:
        return self.app.state.sessoes()  # type: ignore[attr-defined]

    def registrar(self, nome: str, **extra: Any) -> Sessao:
        email = f"{nome.lower().replace(' ', '.')}.{next(_contador)}@teste.com"
        r = self.chamar("POST", "/api/auth/registro", {"nome": nome, "email": email, "senha": SENHA, **extra})
        assert r.status == 201, r.corpo
        return Sessao(r.corpo["token"], r.corpo["usuario"], email)

    def criar_republica(self, moradores: int = 0) -> tuple[Sessao, list[Sessao]]:
        n = next(_contador)
        admin = self.registrar(f"Admin {n}", nomeRepublica=f"Casa {n}")
        convite = self.chamar("GET", "/api/republica", token=admin.token).corpo["codigoConvite"]
        nomes = ["Ana", "Beto", "Caio", "Duda", "Eva", "Fábio", "Gabi", "Hugo"]
        return admin, [self.registrar(f"{nomes[i]} {n}", codigoConvite=convite) for i in range(moradores)]


def configuracao(**extra: Any) -> Settings:
    base: dict[str, Any] = {
        "db_url": DB_TESTE,
        "jwt_segredo": "segredo-de-teste-com-mais-de-32-caracteres",
        "bcrypt_custo": 4,
        "token_segundos": 30 * 24 * 60 * 60,
        "agendador": False,
        "limite_auth": 100_000,
        "criar_tabelas": True,
    }
    return Settings(**{**base, **extra})


@pytest.fixture
def api() -> Iterator[Api]:
    relogio = RelogioFixo(HOJE)
    motor = criar_motor(DB_TESTE)
    Base.metadata.drop_all(motor)  # cada teste começa com o banco vazio
    try:
        with TestClient(criar_app(configuracao(), relogio, motor)) as cliente:
            yield Api(cliente, relogio)
    finally:
        motor.dispose()


@pytest.fixture
def casa(api: Api) -> tuple[Sessao, Sessao, Sessao]:
    """Uma república com admin e dois moradores (Ana e Beto)."""
    admin, (ana, beto) = api.criar_republica(2)
    return admin, ana, beto
