"""RNF-07.1: senhas guardadas só como hash bcrypt com salt aleatório e custo mínimo 12."""

import re

import bcrypt

from app.erros import ErroDominio

_TAMANHO_MAXIMO_BYTES = 72  # limite do próprio bcrypt


def validar_politica(senha: str) -> None:
    """EX-07.5: ao menos 8 caracteres, 1 número e 1 letra maiúscula; senão HTTP 422."""
    problemas = []
    if len(senha) < 8:
        problemas.append("ao menos 8 caracteres")
    if not re.search(r"\d", senha):
        problemas.append("ao menos 1 número")
    if not re.search(r"[A-ZÀ-Ý]", senha):
        problemas.append("ao menos 1 letra maiúscula")
    if len(senha.encode("utf-8")) > _TAMANHO_MAXIMO_BYTES:
        problemas.append(f"no máximo {_TAMANHO_MAXIMO_BYTES} bytes")
    if problemas:
        raise ErroDominio("SENHA_FRACA", "A senha precisa ter " + ", ".join(problemas) + ".", 422)


def gerar_hash(senha: str, custo: int) -> str:
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt(rounds=custo)).decode("ascii")


def conferir_senha(senha: str, hash_: str) -> bool:
    dados = senha.encode("utf-8")
    if len(dados) > _TAMANHO_MAXIMO_BYTES:
        return False
    try:
        return bcrypt.checkpw(dados, hash_.encode("ascii"))
    except ValueError:
        return False
