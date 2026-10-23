"""RF-01 a RF-04 / RB-01, RB-04, RB-08: estoque, validade e lista de compras."""

import time
from datetime import datetime

from sqlalchemy import insert, select

from app.db.modelos import Auditoria, Lote, Produto
from tests.conftest import HOJE, SENHA, Api, Sessao

Casa = tuple[Sessao, Sessao, Sessao]


def cadastrar(api: Api, s: Sessao, **dados: object) -> dict:
    corpo = {"quantidade": 4, "unidade": "un", "classificacao": "COLETIVO", "compartimento": "Geladeira", **dados}
    r = api.chamar("POST", "/api/produtos", corpo, s.token)
    return r.corpo


def consumir(api: Api, s: Sessao, p: dict, quantidade: float):  # noqa: ANN201
    return api.chamar("POST", f"/api/produtos/{p['id']}/consumo", {"quantidade": quantidade}, s.token)


def produtos(api: Api, s: Sessao, todos: bool = False) -> list[dict]:
    return api.chamar("GET", "/api/produtos" + ("?todos=1" if todos else ""), token=s.token).corpo


def lista(api: Api, s: Sessao) -> list[dict]:
    return api.chamar("GET", "/api/lista", token=s.token).corpo


def notificacoes(api: Api, s: Sessao, tipo: str | None = None) -> list[dict]:
    ns = api.chamar("GET", "/api/notificacoes", token=s.token).corpo
    return [n for n in ns if tipo is None or n["tipo"] == tipo]


def test_rf01_cadastro_registra_os_dados(api: Api, casa: Casa) -> None:
    _, ana, _ = casa
    r = api.chamar(
        "POST",
        "/api/produtos",
        {
            "nome": "Leite",
            "quantidade": 2,
            "unidade": "L",
            "validade": "2026-03-20",
            "classificacao": "COLETIVO",
            "compartimento": "Geladeira",
        },
        ana.token,
    )
    assert r.status == 201
    c = r.corpo
    assert (
        c["nome"],
        c["quantidade"],
        c["validade"],
        c["classificacao"],
        c["status"],
        c["donoId"],
        c["compartimento"],
    ) == ("Leite", 2, "2026-03-20", "COLETIVO", "ATIVO", None, "Geladeira")


def test_rb01_item_individual_pertence_a_quem_cadastrou(api: Api, casa: Casa) -> None:
    _, ana, beto = casa
    p = cadastrar(api, ana, nome="Iogurte da Ana", classificacao="INDIVIDUAL")
    assert p["donoId"] == ana.usuario["id"]
    visto = next(x for x in produtos(api, beto) if x["id"] == p["id"])
    assert visto["meu"] is False
    assert visto["donoNome"] == ana.usuario["nome"]


def test_rf01_nao_aceita_vencido_nem_minimo_em_individual(api: Api, casa: Casa) -> None:
    _, ana, _ = casa
    assert cadastrar(api, ana, nome="Queijo", validade="2026-03-09")["erro"]["codigo"] == "VALIDADE_PASSADA"
    r = cadastrar(api, ana, nome="Queijo", classificacao="INDIVIDUAL", quantidadeMinima=1)
    assert r["erro"]["codigo"] == "MINIMO_APENAS_COLETIVO"


def test_rf03_filtros_por_compartimento_classificacao_e_estado(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    cadastrar(api, admin, nome="Leite", compartimento="Geladeira", validade="2026-03-11")
    cadastrar(api, admin, nome="Arroz", compartimento="Armário")
    cadastrar(api, ana, nome="Whey", compartimento="Armário", classificacao="INDIVIDUAL")
    nomes = lambda q: sorted(p["nome"] for p in api.chamar("GET", "/api/produtos" + q, token=ana.token).corpo)  # noqa: E731
    assert nomes("?compartimento=Armário") == ["Arroz", "Whey"]
    assert nomes("?classificacao=INDIVIDUAL") == ["Whey"]
    assert nomes("?estado=CRITICA") == ["Leite"]


def test_rf02_consumo_decrementa_e_entra_no_historico(api: Api, casa: Casa) -> None:
    admin, _, beto = casa
    p = cadastrar(api, admin, nome="Ovos", quantidade=12)
    r = consumir(api, beto, p, 5)
    assert (r.status, r.corpo["quantidade"]) == (200, 7)
    h = api.chamar("GET", "/api/consumos", token=admin.token).corpo[0]
    assert (h["produto"], h["quantidade"], h["morador"]) == ("Ovos", 5, beto.usuario["nome"])


def test_historico_mostra_so_os_ultimos_30_dias(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Ovos", quantidade=12)
    consumir(api, ana, p, 1)
    api.relogio.definir("2026-04-10")
    entrar = lambda s: api.chamar("POST", "/api/auth/login", {"email": s.email, "senha": SENHA}).corpo["token"]  # noqa: E731
    ana.token, admin.token = entrar(ana), entrar(admin)
    consumir(api, ana, p, 2)
    assert [h["quantidade"] for h in api.chamar("GET", "/api/consumos", token=admin.token).corpo] == [2]


def test_rf02_nao_consome_mais_do_que_ha_e_zerado_fica_esgotado(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Manteiga", quantidade=1.5)
    demais = consumir(api, ana, p, 2)
    assert (demais.status, demais.corpo["erro"]["codigo"]) == (422, "QUANTIDADE_INSUFICIENTE")
    consumir(api, ana, p, 0.5)
    fim = consumir(api, ana, p, 1).corpo
    assert (fim["quantidade"], fim["status"]) == (0, "ESGOTADO")
    assert consumir(api, ana, p, 1).corpo["erro"]["codigo"] == "PRODUTO_ESGOTADO"


def test_rb01_baixa_em_item_alheio_bloqueada_e_auditada(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    p = cadastrar(api, ana, nome="Chocolate da Ana", classificacao="INDIVIDUAL")
    for intruso in (beto, admin):
        r = consumir(api, intruso, p, 1)
        assert (r.status, r.corpo["erro"]["codigo"]) == (403, "PROPRIEDADE_INDIVIDUAL")
        assert "uso individual" in r.corpo["erro"]["mensagem"]
    assert next(x for x in produtos(api, ana) if x["id"] == p["id"])["quantidade"] == 4
    with api.sessao() as s:
        assert s.scalars(select(Auditoria.acao)).all().count("CONSUMO_INDEVIDO") == 2
    assert consumir(api, ana, p, 1).status == 200


def test_rb01_outro_morador_nao_edita_repoe_nem_descarta_item_alheio(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    p = cadastrar(api, ana, nome="Granola da Ana", classificacao="INDIVIDUAL")
    assert api.chamar("PATCH", f"/api/produtos/{p['id']}", {"nome": "Granola do Beto"}, beto.token).status == 403
    assert api.chamar("POST", f"/api/produtos/{p['id']}/reposicao", {"quantidade": 1}, beto.token).status == 403
    assert api.chamar("POST", f"/api/produtos/{p['id']}/descarte", {}, admin.token).status == 403


def test_rf03_validade_critica_no_painel_e_notificacao_unica(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    cadastrar(api, admin, nome="Presunto", validade="2026-03-13")
    cadastrar(api, admin, nome="Arroz", validade="2026-03-14")
    painel = api.chamar("GET", "/api/painel", token=ana.token).corpo
    assert [p["nome"] for p in painel["validadeCritica"]] == ["Presunto"]
    for s in (admin, ana, beto):
        api.chamar("GET", "/api/painel", token=s.token)
        ns = notificacoes(api, s, "VALIDADE_CRITICA")
        assert len(ns) == 1
        assert "Presunto" in ns[0]["mensagem"]


def test_rf03_alerta_acompanha_o_estado(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Frango", quantidade=1, validade="2026-03-20")
    criticos = lambda: len(api.chamar("GET", "/api/painel", token=ana.token).corpo["validadeCritica"])  # noqa: E731
    assert criticos() == 0
    api.relogio.definir("2026-03-17")
    assert criticos() == 1
    consumir(api, ana, p, 1)
    assert criticos() == 0


def test_rf03_critica_de_item_individual_so_notifica_o_dono(api: Api, casa: Casa) -> None:
    _, ana, beto = casa
    cadastrar(api, ana, nome="Iogurte da Ana", classificacao="INDIVIDUAL", validade="2026-03-11")
    api.chamar("GET", "/api/painel", token=beto.token)
    assert notificacoes(api, beto) == []
    assert len(notificacoes(api, ana, "VALIDADE_CRITICA")) == 1


def test_rb04_vencido_sai_do_estoque_e_nao_pode_ser_consumido(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    p = cadastrar(api, admin, nome="Iogurte", validade="2026-03-12")
    api.relogio.definir("2026-03-12")
    assert consumir(api, ana, p, 1).status == 200
    api.relogio.definir("2026-03-13")
    r = consumir(api, ana, p, 1)
    assert (r.status, r.corpo["erro"]["codigo"]) == (409, "PRODUTO_INDISPONIVEL")
    assert all(x["id"] != p["id"] for x in produtos(api, ana))
    assert next(x for x in produtos(api, ana, True) if x["id"] == p["id"])["status"] == "VENCIDO"
    assert len(notificacoes(api, beto, "PRODUTO_VENCIDO")) == 1


def test_rf04_minimo_coloca_item_na_lista_uma_unica_vez(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    p = cadastrar(api, admin, nome="Café", quantidade=3, quantidadeMinima=1)
    consumir(api, ana, p, 1)
    assert lista(api, ana) == []
    consumir(api, ana, p, 1)
    itens = lista(api, beto)
    assert [(i["nome"], i["origem"], i["status"]) for i in itens] == [("Café", "AUTOMATICA", "PENDENTE")]
    consumir(api, ana, p, 1)
    assert len(lista(api, beto)) == 1
    assert len(notificacoes(api, beto, "ESTOQUE_MINIMO")) == 1


def test_rf04_quantidade_sugerida_repoe_o_dobro_do_minimo(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Café", quantidade=3, quantidadeMinima=2)
    consumir(api, ana, p, 1)
    assert lista(api, ana)[0]["quantidade"] == 2  # 2*2 - 2
    consumir(api, ana, p, 2)
    assert lista(api, ana)[0]["quantidade"] == 4  # esgotado: 2*2 - 0


def test_rf04_individual_e_coletivo_sem_minimo_nao_vao_para_a_lista(api: Api, casa: Casa) -> None:
    _, ana, _ = casa
    ind = cadastrar(api, ana, nome="Whey da Ana", quantidade=1, classificacao="INDIVIDUAL")
    col = cadastrar(api, ana, nome="Sal", quantidade=1)
    consumir(api, ana, ind, 1)
    consumir(api, ana, col, 1)
    assert lista(api, ana) == []


def test_rf04_reposicao_acima_do_minimo_da_baixa_na_sugestao(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    p = cadastrar(api, admin, nome="Detergente", quantidade=1, quantidadeMinima=1)
    assert len(lista(api, ana)) == 1
    r = api.chamar("POST", f"/api/produtos/{p['id']}/reposicao", {"quantidade": 3}, beto.token)
    assert r.corpo["quantidade"] == 4
    item = lista(api, ana)[0]
    assert (item["status"], item["compradorNome"]) == ("COMPRADO", beto.usuario["nome"])


def test_reposicao_de_vencido_exige_nova_validade(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Leite", quantidade=2, validade="2026-03-11", quantidadeMinima=1)
    api.relogio.definir("2026-03-15")
    produtos(api, admin)
    assert len([i for i in lista(api, ana) if i["status"] == "PENDENTE"]) == 1
    sem = api.chamar("POST", f"/api/produtos/{p['id']}/reposicao", {"quantidade": 6}, ana.token)
    assert sem.corpo["erro"]["codigo"] == "VALIDADE_OBRIGATORIA"
    r = api.chamar(
        "POST", f"/api/produtos/{p['id']}/reposicao", {"quantidade": 6, "validade": "2026-03-30"}, ana.token
    ).corpo
    assert (r["quantidade"], r["status"], r["validade"]) == (6, "ATIVO", "2026-03-30")


def test_lista_manual_adicionar_comprar_e_remover(api: Api, casa: Casa) -> None:
    _, ana, beto = casa
    item = api.chamar("POST", "/api/lista", {"nome": "Papel toalha"}, ana.token).corpo
    assert (item["origem"], item["quantidade"]) == ("MANUAL", 1)
    assert api.chamar("DELETE", f"/api/lista/{item['id']}", token=beto.token).status == 403
    assert api.chamar("POST", f"/api/lista/{item['id']}/comprado", {}, beto.token).corpo["status"] == "COMPRADO"
    assert api.chamar("POST", f"/api/lista/{item['id']}/comprado", {}, beto.token).status == 409
    outro = api.chamar("POST", "/api/lista", {"nome": "Esponja"}, ana.token).corpo
    assert api.chamar("DELETE", f"/api/lista/{outro['id']}", token=ana.token).status == 204


def test_lista_consolida_itens_iguais_e_ajusta_quantidade(api: Api, casa: Casa) -> None:
    _, ana, beto = casa
    a = api.chamar("POST", "/api/lista", {"nome": "Banana", "quantidade": 6, "unidade": "un"}, ana.token).corpo
    b = api.chamar("POST", "/api/lista", {"nome": "banana", "quantidade": 4}, beto.token).corpo
    assert b["id"] == a["id"]
    assert b["quantidade"] == 10
    ajuste = api.chamar("PATCH", f"/api/lista/{a['id']}", {"quantidade": 3}, beto.token).corpo
    assert ajuste["quantidade"] == 3
    assert len(lista(api, ana)) == 1


def test_lista_recusa_item_individual(api: Api, casa: Casa) -> None:
    _, ana, _ = casa
    r = api.chamar("POST", "/api/lista", {"nome": "Meu whey", "classificacao": "INDIVIDUAL"}, ana.token)
    assert r.corpo["erro"]["codigo"] == "ITEM_INDIVIDUAL"


def test_descarte_de_coletivo_so_por_quem_cadastrou_ou_admin(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    p = cadastrar(api, ana, nome="Tomate")
    assert api.chamar("POST", f"/api/produtos/{p['id']}/descarte", {}, beto.token).status == 403
    assert api.chamar("POST", f"/api/produtos/{p['id']}/descarte", {}, admin.token).corpo["status"] == "DESCARTADO"
    assert consumir(api, ana, p, 1).status == 409


def test_rnf01_desempenho_com_2000_produtos_e_500_compras(api: Api) -> None:
    admin, moradores = api.criar_republica(5)
    agora = datetime.fromisoformat("2026-03-10T12:00:00+00:00")
    rep = admin.usuario["republicaId"]
    with api.sessao() as s:
        ids = s.scalars(
            insert(Produto).returning(Produto.id),
            [
                {
                    "republica_id": rep,
                    "nome": f"Produto {i}",
                    "quantidade": 5,
                    "unidade": "un",
                    "compartimento": "Armário",
                    "validade": datetime.fromisoformat(f"2026-0{4 + i % 5}-1{i % 9}").date(),
                    "classificacao": "COLETIVO",
                    "quantidade_minima": 1,
                    "status": "ATIVO",
                    "criado_por": admin.usuario["id"],
                    "criado_em": agora,
                }
                for i in range(2000)
            ],
        ).all()
        s.execute(
            insert(Lote),
            [
                {
                    "produto_id": pid,
                    "quantidade": 5,
                    "status": "ATIVO",
                    "criado_em": agora,
                    "validade": datetime.fromisoformat(f"2026-0{4 + i % 5}-1{i % 9}").date(),
                }
                for i, pid in enumerate(ids)
            ],
        )
        s.commit()
    for i in range(500):
        pagador = admin.usuario["id"] if i % 2 == 0 else moradores[i % 5].usuario["id"]
        r = api.chamar(
            "POST",
            "/api/compras",
            {"descricao": f"Compra {i}", "valorCentavos": 1000 + i, "pagadorId": pagador, "data": HOJE},
            admin.token,
        )
        assert r.status == 201
    for caminho in ["/api/produtos", "/api/balanco", "/api/painel", "/api/compras"]:
        inicio = time.perf_counter()
        r = api.chamar("GET", caminho, token=admin.token)
        duracao = time.perf_counter() - inicio
        assert r.status == 200
        assert duracao < 1.5, f"{caminho} levou {duracao:.2f} s"
