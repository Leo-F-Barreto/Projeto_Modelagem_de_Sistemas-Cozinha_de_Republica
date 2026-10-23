"""As migrações do Alembic criam exatamente o esquema descrito pelos modelos."""

from pathlib import Path

from alembic import command
from fastapi.testclient import TestClient

from app.db.migracao import configuracao_alembic, migrar
from app.main import criar_app
from app.relogio import RelogioFixo
from tests.conftest import HOJE, SENHA, configuracao


def test_migracoes_batem_com_os_modelos(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'cochef.db'}"
    migrar(url)
    command.check(configuracao_alembic(url))  # falha se os modelos tiverem algo que nenhuma migração cria


def test_servidor_sobe_aplicando_migracoes_e_funciona(tmp_path: Path) -> None:
    ajustes = configuracao(db_url=f"sqlite:///{tmp_path / 'cochef.db'}", criar_tabelas=False, migrar=True)
    with TestClient(criar_app(ajustes, RelogioFixo(HOJE))) as cliente:
        r = cliente.post(
            "/api/auth/registro",
            json={"nome": "Ana", "email": "ana@teste.com", "senha": SENHA, "nomeRepublica": "Casa"},
        )
        assert r.status_code == 201
