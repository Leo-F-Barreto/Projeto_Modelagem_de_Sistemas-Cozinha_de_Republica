"""RF-07: cadastro, login e resolução da sessão."""

import re
import secrets
from typing import Any

from sqlalchemy import func, select

from app.db.modelos import Republica, Usuario
from app.erros import ErroDominio, conflito, invalido
from app.seguranca.senha import conferir_senha, gerar_hash, validar_politica
from app.seguranca.token import emitir_token, verificar_token
from app.servicos.contexto import Contexto, UsuarioAtual

_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_hash_isca: dict[int, str] = {}


def gerar_codigo_convite() -> str:
    return secrets.token_hex(6).upper()


def _sessao(ctx: Contexto, u: UsuarioAtual) -> dict[str, Any]:
    token = emitir_token(
        u.id, u.perfil, u.republica_id, ctx.settings.segredo(), ctx.relogio.segundos(), ctx.settings.token_segundos
    )
    return {
        "token": token,
        "tokenType": "bearer",
        "expiraEm": ctx.relogio.segundos() + ctx.settings.token_segundos,
        "usuario": u.dto(),
    }


def registrar(
    ctx: Contexto, nome: str, email: str, senha: str, nome_republica: str | None, codigo_convite: str | None
) -> dict[str, Any]:
    """Quem cria uma república vira ADMIN; quem entra por convite vira MORADOR (RF-07.1)."""
    if not _EMAIL.match(email):
        raise invalido("E-mail inválido.")
    if bool(nome_republica) == bool(codigo_convite):
        raise invalido("Informe o nome da nova república ou um código de convite (apenas um dos dois).")
    validar_politica(senha)
    email = email.lower()
    if ctx.s.scalar(select(Usuario.id).where(func.lower(Usuario.email) == email)) is not None:
        raise conflito("EMAIL_EM_USO", "Já existe uma conta com este e-mail.")
    agora = ctx.relogio.agora()
    if nome_republica:
        rep = Republica(nome=nome_republica, codigo_convite=gerar_codigo_convite(), criado_em=agora)
        ctx.s.add(rep)
        ctx.s.flush()
        republica_id, perfil = rep.id, "ADMIN"
    else:
        assert codigo_convite is not None
        encontrada = ctx.s.scalar(select(Republica.id).where(Republica.codigo_convite == codigo_convite.upper()))
        if encontrada is None:
            raise ErroDominio("CONVITE_INVALIDO", "Código de convite inválido.")
        republica_id, perfil = encontrada, "MORADOR"
    usuario = Usuario(
        republica_id=republica_id,
        nome=nome,
        email=email,
        senha_hash=gerar_hash(senha, ctx.settings.bcrypt_custo),
        perfil=perfil,
        ativo=True,
        criado_em=agora,
    )
    ctx.s.add(usuario)
    ctx.s.flush()
    return _sessao(ctx, UsuarioAtual(usuario.id, republica_id, nome, perfil))


def entrar(ctx: Contexto, email: str, senha: str) -> dict[str, Any]:
    """EX-07.2: mesma resposta (e mesmo custo) para e-mail inexistente, senha errada e conta desativada."""
    linha = ctx.s.scalar(select(Usuario).where(func.lower(Usuario.email) == email.lower()))
    custo = ctx.settings.bcrypt_custo
    if custo not in _hash_isca:
        _hash_isca[custo] = gerar_hash("Senha-isca-1", custo)
    confere = conferir_senha(senha, linha.senha_hash if linha else _hash_isca[custo])
    if linha is None or not confere or not linha.ativo:
        raise ErroDominio("CREDENCIAIS_INVALIDAS", "E-mail ou senha inválidos.", 401)
    return _sessao(ctx, UsuarioAtual(linha.id, linha.republica_id, linha.nome, linha.perfil))


def autenticar(ctx: Contexto, token: str) -> UsuarioAtual | None:
    """Perfil e situação são relidos do banco a cada requisição: desativar ou rebaixar vale na hora (RF-07.3)."""
    usuario_id = verificar_token(token, ctx.settings.segredo(), ctx.relogio.segundos())
    if usuario_id is None:
        return None
    u = ctx.s.scalar(select(Usuario).where(Usuario.id == usuario_id, Usuario.ativo.is_(True)))
    return UsuarioAtual(u.id, u.republica_id, u.nome, u.perfil) if u else None
