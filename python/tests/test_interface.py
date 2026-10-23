"""Interface HTML mantida (public/), agora ligada à API em vez de dados de demonstração no navegador."""

import re

from app.config import PUBLICO_PADRAO
from tests.conftest import Api

HTML = (PUBLICO_PADRAO / "index.html").read_text(encoding="utf-8")
JS = (PUBLICO_PADRAO / "app.js").read_text(encoding="utf-8")
CSS = (PUBLICO_PADRAO / "styles.css").read_text(encoding="utf-8")


def test_pagina_declara_idioma_viewport_e_arquivos_da_mesma_origem() -> None:
    assert re.search(r"<!doctype html>", HTML, re.I)
    assert '<html lang="pt-BR">' in HTML
    assert 'name="viewport"' in HTML
    assert 'href="/styles.css"' in HTML
    assert 'src="/app.js"' in HTML
    assert not re.search(r"<script>([\s\S]*?)</script>", HTML, re.I), "JavaScript deve vir de arquivo da mesma origem"


def test_expoe_os_modulos_do_mvp() -> None:
    for modulo in ["dashboard", "stock", "shopping", "finance", "schedule", "people"]:
        assert f'data-view="{modulo}"' in HTML, modulo


def test_tem_formularios_de_acesso_estoque_lista_e_rateio() -> None:
    for id_ in ["login-form", "register-form", "item-form", "shopping-form", "expense-form"]:
        assert f'id="{id_}"' in HTML, id_
    assert re.search("rateado igualmente entre os moradores ativos", HTML, re.I)
    assert re.search("Compartimento físico", HTML, re.I)
    assert re.search("não realiza pagamento bancário", HTML, re.I)
    assert "prefers-reduced-motion" in CSS


def test_dados_vem_da_api_e_nao_de_demonstracao_local() -> None:
    assert "fetch(`/api${caminho}`" in JS
    assert "Authorization = `Bearer ${sessao.token}`" in JS
    assert "cochef-demo-v1" not in JS, "o protótipo com dados fictícios foi substituído"
    for rota in [
        "/auth/login",
        "/auth/registro",
        "/produtos",
        "/lista",
        "/compras",
        "/balanco",
        "/escala",
        "/trocas",
        "/fechamentos",
    ]:
        assert f"'{rota}" in JS or f"`{rota}" in JS, rota


def test_textos_vindos_do_servidor_sao_escapados() -> None:
    assert "const escapeHtml" in JS
    assert "eval(" not in JS and "new Function" not in JS


def test_arquivos_estaticos_com_tipos_mime_corretos(api: Api) -> None:
    pagina, css, js = api.cliente.get("/"), api.cliente.get("/styles.css"), api.cliente.get("/app.js")
    assert (pagina.status_code, css.status_code, js.status_code) == (200, 200, 200)
    assert "text/html" in pagina.headers["content-type"]
    assert "text/css" in css.headers["content-type"]
    assert "javascript" in js.headers["content-type"]


def test_politica_de_seguranca_so_permite_scripts_da_propria_origem(api: Api) -> None:
    politica = api.cliente.get("/").headers["content-security-policy"]
    assert "script-src 'self'" in politica
    assert "unsafe-inline" not in politica.split("script-src")[1].split(";")[0]
    assert "connect-src 'self'" in politica
