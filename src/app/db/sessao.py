"""Motor e fábrica de sessões. SQLite (arquivo ou memória) para desenvolvimento e testes; PostgreSQL em produção."""

from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.modelos import Base


def criar_motor(url: str) -> Engine:
    if url.startswith("sqlite"):
        if url in ("sqlite://", "sqlite:///:memory:"):
            motor = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        else:
            Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
            motor = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(motor, "connect")
        def _pragmas(conexao, _registro):  # type: ignore[no-untyped-def]
            cursor = conexao.cursor()
            cursor.execute("PRAGMA foreign_keys = ON")
            if url not in ("sqlite://", "sqlite:///:memory:"):
                cursor.execute("PRAGMA journal_mode = WAL")
            cursor.close()

        return motor
    return create_engine(url, pool_pre_ping=True)


def fabrica_sessoes(motor: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=motor, expire_on_commit=False, autoflush=True)


def criar_tabelas(motor: Engine) -> None:
    Base.metadata.create_all(motor)
