"""Aplica as migrações do Alembic na subida do servidor (o esquema nunca é criado "na mão" em produção)."""

from pathlib import Path

from alembic import command
from alembic.config import Config


def configuracao_alembic(db_url: str) -> Config:
    """Configuração montada em código, para funcionar também com o pacote instalado (sem o alembic.ini ao lado)."""
    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parent / "migracoes"))
    cfg.set_main_option("sqlalchemy.url", db_url.replace("%", "%%"))
    return cfg


def migrar(db_url: str) -> None:
    command.upgrade(configuracao_alembic(db_url), "head")
