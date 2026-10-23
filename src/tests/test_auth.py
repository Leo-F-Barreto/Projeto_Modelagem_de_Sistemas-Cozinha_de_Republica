"""RF-07 / RNF-07: autenticação, perfis, isolamento e entradas malformadas."""

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.modelos import Usuario
from app.main import criar_app
from app.relogio import RelogioFixo
from tests.conftest import HOJE, SENHA, Api, configuracao

PRIVADAS = [
    "/api/eu",
    "/api/painel",
    "/api/produtos",
    "/api/lista",
    "/api/compras",
    "/api/balanco",
    "/api/escala",
    "/api/republica",
    "/api/notificacoes",
    "/api/auditoria",
    "/api/consumos",
]


def produto(**extra: object) -> dict[str, object]:
    return {
        "nome": "Arroz",
        "quantidade": 5,
        "unidade": "kg",
        "classificacao": "COLETIVO",
        "compartimento": "Armário",
        **extra,
    }


def test_quem_cria_vira_admin_e_convidado_vira_morador(api: Api) -> None:
    admin, (ana,) = api.criar_republica(1)
    assert admin.usuario["perfil"] == "ADMIN"
    assert ana.usuario["perfil"] == "MORADOR"
    assert ana.usuario["republicaId"] == admin.usuario["republicaId"]


def test_cadastro_valida_campos(api: Api) -> None:
    base = {"nome": "Ana", "email": "ana@teste.com", "senha": SENHA}
    assert api.chamar("POST", "/api/auth/registro", base).status == 400
    assert (
        api.chamar(
            "POST", "/api/auth/registro", {**base, "nomeRepublica": "Casa", "codigoConvite": "ABCDEF123456"}
        ).status
        == 400
    )
    assert (
        api.chamar("POST", "/api/auth/registro", {**base, "nomeRepublica": "Casa", "email": "sem-arroba"}).status == 400
    )
    r = api.chamar("POST", "/api/auth/registro", {**base, "codigoConvite": "NAOEXISTE000"})
    assert r.corpo["erro"]["codigo"] == "CONVITE_INVALIDO"


def test_ex075_senha_fraca_e_recusada_com_422(api: Api) -> None:
    base = {"nome": "Ana", "email": "ana@teste.com", "nomeRepublica": "Casa"}
    for senha in ["curta", "senha-sem-numero-A", "senha-forte-1"]:
        r = api.chamar("POST", "/api/auth/registro", {**base, "senha": senha})
        assert (r.status, r.corpo["erro"]["codigo"]) == (422, "SENHA_FRACA"), senha


def test_email_nao_pode_ser_reutilizado(api: Api) -> None:
    dados = {"nome": "Bia", "email": "bia@teste.com", "senha": SENHA, "nomeRepublica": "Casa da Bia"}
    assert api.chamar("POST", "/api/auth/registro", dados).status == 201
    r = api.chamar("POST", "/api/auth/registro", {**dados, "email": "BIA@teste.com"})
    assert (r.status, r.corpo["erro"]["codigo"]) == (409, "EMAIL_EM_USO")


def test_rnf02_senha_nunca_gravada_em_claro_nem_devolvida(api: Api) -> None:
    senha = "Segredo-do-caio-9"
    r = api.chamar(
        "POST",
        "/api/auth/registro",
        {"nome": "Caio", "email": "caio@teste.com", "senha": senha, "nomeRepublica": "Casa"},
    )
    assert senha not in str(r.corpo)
    with api.sessao() as s:
        hash_ = s.scalar(select(Usuario.senha_hash).where(Usuario.email == "caio@teste.com"))
    assert hash_.startswith("$2b$")
    assert senha not in hash_


def test_sessao_tem_token_bearer_com_expiracao(api: Api) -> None:
    admin, _ = api.criar_republica()
    r = api.chamar("POST", "/api/auth/login", {"email": admin.email, "senha": SENHA})
    assert r.corpo["tokenType"] == "bearer"
    assert r.corpo["expiraEm"] == api.relogio.segundos() + 30 * 24 * 60 * 60


def test_login_senha_errada_e_email_inexistente_dao_a_mesma_resposta(api: Api) -> None:
    admin, _ = api.criar_republica()
    ok = api.chamar("POST", "/api/auth/login", {"email": admin.email.upper(), "senha": SENHA})
    assert ok.status == 200 and ok.corpo["token"]
    errada = api.chamar("POST", "/api/auth/login", {"email": admin.email, "senha": "Senha-errada-1"})
    inexistente = api.chamar("POST", "/api/auth/login", {"email": "ninguem@teste.com", "senha": SENHA})
    assert errada.status == 401
    assert errada.corpo == inexistente.corpo


def test_toda_rota_privada_exige_token_valido(api: Api) -> None:
    for caminho in PRIVADAS:
        assert api.chamar("GET", caminho).status == 401, caminho
        assert api.chamar("GET", caminho, token="token.invalido.aqui").status == 401, caminho


def test_token_expira(api: Api) -> None:
    admin, _ = api.criar_republica()
    assert api.chamar("GET", "/api/eu", token=admin.token).status == 200
    api.relogio.definir("2026-04-08")
    assert api.chamar("GET", "/api/eu", token=admin.token).status == 200
    api.relogio.definir("2026-04-09")
    assert api.chamar("GET", "/api/eu", token=admin.token).status == 401


def test_isolamento_entre_republicas(api: Api) -> None:
    a, _ = api.criar_republica()
    b, _ = api.criar_republica()
    p = api.chamar("POST", "/api/produtos", produto(), a.token).corpo
    assert api.chamar("GET", "/api/produtos", token=b.token).corpo == []
    assert api.chamar("POST", f"/api/produtos/{p['id']}/consumo", {"quantidade": 1}, b.token).status == 404
    assert api.chamar("PATCH", f"/api/moradores/{a.usuario['id']}", {"ativo": False}, b.token).status == 404


def test_morador_comum_nao_acessa_funcoes_de_admin(api: Api) -> None:
    admin, (ana,) = api.criar_republica(1)
    t = ana.token
    assert api.chamar("POST", "/api/republica/convite", {}, t).status == 403
    assert api.chamar("GET", "/api/auditoria", token=t).status == 403
    assert api.chamar("POST", "/api/fechamentos", {"periodo": "2026-03"}, t).status == 403
    assert api.chamar("POST", "/api/escala", {"inicio": HOJE, "dias": 7, "tipos": ["LIMPEZA"]}, t).status == 403
    assert api.chamar("PATCH", f"/api/moradores/{admin.usuario['id']}", {"perfil": "MORADOR"}, t).status == 403
    assert (
        "codigoConvite" not in api.chamar("GET", "/api/republica", token=t).corpo
        or api.chamar("GET", "/api/republica", token=t).corpo["codigoConvite"] is None
    )


def test_entradas_malformadas_dao_4xx_nunca_500(api: Api) -> None:
    admin, _ = api.criar_republica()
    t = admin.token
    assert api.chamar("POST", "/api/produtos", produto(quantidade="muito"), t).status == 400
    assert api.chamar("POST", "/api/produtos", produto(quantidade=-1), t).status == 400
    assert api.chamar("POST", "/api/produtos", produto(classificacao="OUTRA"), t).status == 400
    assert api.chamar("POST", "/api/produtos", produto(validade="2026-02-31"), t).status == 400
    sem_compartimento = produto()
    del sem_compartimento["compartimento"]
    assert api.chamar("POST", "/api/produtos", sem_compartimento, t).status == 400
    assert api.chamar("POST", "/api/produtos/abc/consumo", {"quantidade": 1}, t).status == 400
    compra = {"descricao": "x", "valorCentavos": 10.5, "pagadorId": 1, "data": HOJE}
    assert api.chamar("POST", "/api/compras", compra, t).status == 400
    assert api.chamar("GET", "/api/nao-existe", token=t).status == 404
    assert api.chamar("DELETE", "/api/produtos", token=t).status == 405
    bruto = api.cliente.post(
        "/api/produtos",
        content=b"{quebrado",
        headers={"Authorization": f"Bearer {t}", "Content-Type": "application/json"},
    )
    assert bruto.status_code == 400
    grande = api.cliente.post(
        "/api/produtos",
        content=b"x" * (65 * 1024),
        headers={"Authorization": f"Bearer {t}", "Content-Type": "application/json"},
    )
    assert grande.status_code == 413
    assert api.chamar("GET", "/api/eu", token=t).status == 200


def test_injecao_de_sql_e_tratada_como_texto(api: Api) -> None:
    admin, _ = api.criar_republica()
    nome = "Feijão'); DROP TABLE produto; --"
    assert api.chamar("POST", "/api/produtos", produto(nome=nome), admin.token).status == 201
    assert api.chamar("GET", "/api/produtos", token=admin.token).corpo[0]["nome"] == nome


def test_cabecalhos_de_seguranca_e_travessia_de_diretorio(api: Api) -> None:
    r = api.cliente.get("/")
    assert r.status_code == 200
    politica = r.headers["content-security-policy"]
    assert "default-src 'self'" in politica and "script-src 'self'" in politica
    assert "unsafe-inline" not in politica.split("script-src")[1].split(";")[0]
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["x-request-id"]
    assert api.cliente.get("/..%2f..%2fpyproject.toml").status_code == 404
    assert api.cliente.get("/saude").json() == {"status": "ok"}


def test_limite_de_tentativas_de_autenticacao() -> None:
    with TestClient(criar_app(configuracao(limite_auth=3), RelogioFixo(HOJE))) as cliente:

        def tentar() -> int:
            return cliente.post(
                "/api/auth/login", json={"email": "x@teste.com", "senha": "Qualquer-senha-1"}
            ).status_code

        assert [tentar(), tentar(), tentar()] == [401, 401, 401]
        assert tentar() == 429
