"""Ambiente do Alembic: usa a URL da configuração da aplicação e os modelos de app.db.modelos."""

from alembic import context
from sqlalchemy import Connection

from app.config import Settings
from app.db.modelos import Base
from app.db.sessao import criar_motor

alvo = Base.metadata


def _configurar(conexao: Connection | None = None, url: str | None = None) -> None:
    sqlite = (conexao.dialect.name if conexao is not None else (url or "")).startswith("sqlite")
    # SQLite não altera colunas no lugar: o modo "batch" recria a tabela quando preciso.
    context.configure(
        connection=conexao,
        url=url,
        target_metadata=alvo,
        render_as_batch=sqlite,
        compare_type=True,
        literal_binds=conexao is None,
    )


def offline() -> None:
    _configurar(url=context.config.get_main_option("sqlalchemy.url") or Settings().db_url)
    with context.begin_transaction():
        context.run_migrations()


def online() -> None:
    conexao_externa = context.config.attributes.get("conexao")
    if conexao_externa is not None:
        _configurar(conexao_externa)
        with context.begin_transaction():
            context.run_migrations()
        return
    motor = criar_motor(context.config.get_main_option("sqlalchemy.url") or Settings().db_url)
    with motor.connect() as conexao:
        _configurar(conexao)
        with context.begin_transaction():
            context.run_migrations()
    motor.dispose()


if context.is_offline_mode():
    offline()
else:
    online()
