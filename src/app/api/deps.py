"""Dependências comuns: contexto com sessão transacional, usuário autenticado e limite de tentativas."""

import time
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request

from app.erros import ErroDominio
from app.servicos.auth import autenticar
from app.servicos.contexto import Contexto, UsuarioAtual


def contexto(request: Request) -> Iterator[Contexto]:
    """Uma transação por requisição: confirma no sucesso, desfaz em qualquer erro."""
    estado = request.app.state
    sessao = estado.sessoes()
    try:
        yield Contexto(s=sessao, relogio=estado.relogio, settings=estado.settings)
        sessao.commit()
    except BaseException:
        sessao.rollback()
        raise
    finally:
        sessao.close()


Ctx = Annotated[Contexto, Depends(contexto)]


def usuario_atual(request: Request, ctx: Ctx) -> UsuarioAtual:
    """RF-07.5: toda rota privada exige `Authorization: Bearer <token>` válido."""
    cabecalho = request.headers.get("authorization", "")
    u = autenticar(ctx, cabecalho[7:]) if cabecalho.startswith("Bearer ") else None
    if u is None:
        raise ErroDominio("NAO_AUTENTICADO", "Sessão inválida ou expirada. Entre novamente.", 401)
    request.state.usuario = u
    return u


Usuario = Annotated[UsuarioAtual, Depends(usuario_atual)]


def limitar_tentativas(request: Request) -> None:
    """Rotas públicas de autenticação: no máximo N tentativas por IP a cada janela."""
    estado = request.app.state
    ip = request.client.host if request.client else "desconhecido"
    agora = time.monotonic()
    janela = estado.settings.janela_auth_segundos
    tentativas = [t for t in estado.tentativas.get(ip, []) if agora - t < janela]
    tentativas.append(agora)
    estado.tentativas[ip] = tentativas
    if len(tentativas) > estado.settings.limite_auth:
        raise ErroDominio("MUITAS_TENTATIVAS", "Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429)
