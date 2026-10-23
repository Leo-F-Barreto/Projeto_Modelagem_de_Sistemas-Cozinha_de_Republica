"""Configuração lida do ambiente (e de um arquivo .env), com os mesmos nomes da versão anterior."""

import secrets
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ_PYTHON = Path(__file__).resolve().parent.parent
PUBLICO_PADRAO = RAIZ_PYTHON.parent / "public"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="COCHEF_", env_file=".env", extra="ignore")

    porta: int = Field(default=3000, validation_alias="PORT")
    db_url: str = "sqlite:///dados/cochef.db"
    jwt_segredo: str | None = None
    fuso: str = "America/Sao_Paulo"
    # RNF-07.1: bcrypt com fator de custo mínimo 12 (os testes usam 4 para rodar rápido).
    bcrypt_custo: int = 12
    # RF-07.2: o token vale 24 horas.
    token_segundos: int = 24 * 60 * 60
    # Segurança: tentativas de login/cadastro por IP a cada janela.
    limite_auth: int = 10
    janela_auth_segundos: int = 60
    agendador: bool = True
    # Na subida, aplica as migrações do Alembic. Os testes usam criar_tabelas (create_all) com SQLite em memória.
    migrar: bool = True
    criar_tabelas: bool = False
    publico: Path = PUBLICO_PADRAO

    @field_validator("jwt_segredo")
    @classmethod
    def _segredo_longo(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 32:
            raise ValueError("COCHEF_JWT_SEGREDO deve ter ao menos 32 caracteres.")
        return v

    def segredo(self) -> str:
        """O segredo nunca fica no código: em desenvolvimento é gerado uma vez e guardado ao lado do banco."""
        if self.jwt_segredo:
            return self.jwt_segredo
        pasta = Path("dados")
        if self.db_url.startswith("sqlite:///") and self.db_url != "sqlite:///:memory:":
            pasta = Path(self.db_url.removeprefix("sqlite:///")).parent
        arquivo = pasta / ".segredo-jwt"
        if arquivo.exists():
            self.jwt_segredo = arquivo.read_text(encoding="utf-8").strip()
        else:
            pasta.mkdir(parents=True, exist_ok=True)
            self.jwt_segredo = secrets.token_urlsafe(48)
            arquivo.write_text(self.jwt_segredo, encoding="utf-8")
            arquivo.chmod(0o600)
        return self.jwt_segredo
