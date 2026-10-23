"""Aplicação FastAPI: API em /api, interface HTML de public/ em /, cabeçalhos de segurança e rotinas agendadas."""

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import Engine, text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.rotas import api
from app.config import Settings
from app.db.sessao import criar_motor, criar_tabelas, fabrica_sessoes
from app.erros import ErroDominio
from app.relogio import Relogio, RelogioReal
from app.servicos.contexto import Contexto
from app.servicos.rotinas import executar_rotinas_globais

log = logging.getLogger("cochef")

CABECALHOS_SEGURANCA = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}
_CODIGOS_HTTP = {404: "NAO_ENCONTRADO", 405: "METODO_NAO_PERMITIDO", 413: "CORPO_GRANDE", 415: "TIPO_NAO_SUPORTADO"}


def _erro(status: int, codigo: str, mensagem: str, **extra: Any) -> JSONResponse:
    return JSONResponse(
        {"erro": {"codigo": codigo, "mensagem": mensagem, **extra}},
        status_code=status,
        headers={"Cache-Control": "no-store"},
    )


def _registrar(evento: dict[str, Any]) -> None:
    log.info(json.dumps({"em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **evento}, ensure_ascii=False))


def rodar_rotinas(app: FastAPI) -> None:
    """Ator "Sistema / Notificador Automatizado" (RNF-03.1): roda na subida, às 00:01 e a cada hora."""
    inicio = time.perf_counter()
    sessao = app.state.sessoes()
    try:
        n = executar_rotinas_globais(Contexto(sessao, app.state.relogio, app.state.settings))
        sessao.commit()
        _registrar(
            {
                "nivel": "info",
                "evento": "rotinas",
                "republicas": n,
                "duracaoMs": round((time.perf_counter() - inicio) * 1000),
            }
        )
    except Exception as erro:  # noqa: BLE001
        sessao.rollback()
        _registrar({"nivel": "erro", "evento": "rotinas", "mensagem": str(erro)})
    finally:
        sessao.close()


def criar_app(settings: Settings | None = None, relogio: Relogio | None = None, motor: Engine | None = None) -> FastAPI:
    settings = settings or Settings()
    motor = motor or criar_motor(settings.db_url)

    @asynccontextmanager
    async def ciclo(app: FastAPI) -> AsyncIterator[None]:
        agendador = None
        if settings.agendador:
            from apscheduler.schedulers.background import BackgroundScheduler

            rodar_rotinas(app)
            agendador = BackgroundScheduler(timezone=settings.fuso)
            agendador.add_job(rodar_rotinas, "cron", hour=0, minute=1, args=[app], id="rotina-diaria")
            agendador.add_job(rodar_rotinas, "interval", hours=1, args=[app], id="rotina-horaria")
            agendador.start()
        _registrar({"nivel": "info", "evento": "servidor_iniciado"})
        yield
        if agendador:
            agendador.shutdown(wait=False)

    app = FastAPI(
        title="CoChef", version="2.0.0", lifespan=ciclo, description="Gestão colaborativa da cozinha de uma república."
    )
    if settings.criar_tabelas:
        criar_tabelas(motor)
    elif settings.migrar:
        from app.db.migracao import migrar

        migrar(settings.db_url)
    app.state.settings = settings
    app.state.relogio = relogio or RelogioReal(settings.fuso)
    app.state.motor = motor
    app.state.sessoes = fabrica_sessoes(motor)
    app.state.tentativas = {}

    @app.middleware("http")
    async def seguranca_e_log(request: Request, chamar_proximo: Any) -> Response:
        inicio = time.perf_counter()
        id_requisicao = str(uuid.uuid4())
        tamanho = request.headers.get("content-length")
        if tamanho and tamanho.isdigit() and int(tamanho) > 64 * 1024:
            resposta: Response = _erro(413, "CORPO_GRANDE", "Corpo da requisição excede o limite permitido.")
        else:
            try:
                resposta = await chamar_proximo(request)
            except Exception as erro:  # noqa: BLE001
                _registrar({"nivel": "erro", "idRequisicao": id_requisicao, "mensagem": repr(erro)})
                resposta = _erro(500, "ERRO_INTERNO", "Erro interno. Tente novamente.", idRequisicao=id_requisicao)
        for nome, valor in CABECALHOS_SEGURANCA.items():
            resposta.headers[nome] = valor
        resposta.headers["X-Request-Id"] = id_requisicao
        if request.url.path.startswith("/api/"):
            u = getattr(request.state, "usuario", None)
            _registrar(
                {
                    "nivel": "info",
                    "idRequisicao": id_requisicao,
                    "metodo": request.method,
                    "caminho": request.url.path,
                    "status": resposta.status_code,
                    "duracaoMs": round((time.perf_counter() - inicio) * 1000),
                    "usuarioId": u.id if u else None,
                    "republicaId": u.republica_id if u else None,
                }
            )
        return resposta

    @app.exception_handler(ErroDominio)
    async def _erro_dominio(_: Request, erro: ErroDominio) -> JSONResponse:
        return _erro(erro.status, erro.codigo, erro.mensagem)

    @app.exception_handler(RequestValidationError)
    async def _erro_validacao(_: Request, erro: RequestValidationError) -> JSONResponse:
        primeiro = erro.errors()[0] if erro.errors() else {}
        if primeiro.get("type") == "json_invalid":
            return _erro(400, "JSON_INVALIDO", "O corpo da requisição não é um JSON válido.")
        campo = ".".join(str(p) for p in primeiro.get("loc", ()) if p not in ("body", "query", "path"))
        return _erro(400, "VALIDACAO", f'Campo "{campo}" inválido: {primeiro.get("msg", "valor inválido")}.')

    @app.exception_handler(StarletteHTTPException)
    async def _erro_http(_: Request, erro: StarletteHTTPException) -> JSONResponse:
        codigo = _CODIGOS_HTTP.get(erro.status_code, "ERRO_HTTP")
        mensagem = {404: "Recurso não encontrado.", 405: "Método não permitido."}.get(
            erro.status_code, str(erro.detail)
        )
        return _erro(erro.status_code, codigo, mensagem)

    @app.get("/saude", include_in_schema=False)
    def saude() -> dict[str, str]:
        with motor.connect() as conexao:
            conexao.execute(text("SELECT 1"))
        return {"status": "ok"}

    app.include_router(api)
    if settings.publico.is_dir():
        app.mount("/", StaticFiles(directory=settings.publico, html=True), name="publico")
    return app


def main() -> None:
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    settings = Settings()
    uvicorn.run(criar_app(settings), host="0.0.0.0", port=settings.porta)


if __name__ == "__main__":
    main()
