"""T-46 / RF-17, RB-11 e extensões de RB-04, RF-03 e RF-04: lotes por produto (antiga fase vermelha, agora verde)."""

from datetime import date

import pytest

from app.dominio.lotes import Baixa, Lote, planejar_consumo, separar_vencidos
from tests.conftest import Api, Sessao

Casa = tuple[Sessao, Sessao, Sessao]
D = date.fromisoformat


# --- Unidade: regra pura -----------------------------------------------------------------------


def test_rb11_consome_primeiro_o_que_vence_antes_mesmo_cadastrado_depois() -> None:
    lotes = [Lote(1, 3, D("2026-03-25")), Lote(2, 2, D("2026-03-12"))]
    assert planejar_consumo(lotes, 1) == [Baixa(2, 1)]


def test_rb11_quando_um_lote_nao_basta_completa_com_o_proximo() -> None:
    lotes = [Lote(1, 3, D("2026-03-25")), Lote(2, 2, D("2026-03-12"))]
    assert planejar_consumo(lotes, 4) == [Baixa(2, 2), Baixa(1, 2)]


def test_rb11_lote_sem_validade_sai_por_ultimo() -> None:
    lotes = [Lote(1, 5, None), Lote(2, 1, D("2026-04-01"))]
    assert planejar_consumo(lotes, 2) == [Baixa(2, 1), Baixa(1, 1)]


def test_rf02_pedir_mais_que_a_soma_dos_lotes_e_recusado() -> None:
    with pytest.raises(ValueError):
        planejar_consumo([Lote(1, 1, None), Lote(2, 1.5, D("2026-04-01"))], 3)


def test_rb04_no_dia_do_vencimento_o_lote_vale_no_seguinte_vence() -> None:
    lotes = [Lote(1, 1, D("2026-03-12")), Lote(2, 1, D("2026-03-20")), Lote(3, 1, None)]
    validos, vencidos = separar_vencidos(lotes, D("2026-03-12"))
    assert ([lote.id for lote in validos], vencidos) == ([1, 2, 3], [])
    validos, vencidos = separar_vencidos(lotes, D("2026-03-13"))
    assert ([lote.id for lote in validos], [lote.id for lote in vencidos]) == ([2, 3], [1])


# --- Integração: comportamento visto pela API --------------------------------------------------


def cadastrar(api: Api, s: Sessao, **dados: object) -> dict:
    corpo = {"unidade": "un", "classificacao": "COLETIVO", "compartimento": "Geladeira", **dados}
    return api.chamar("POST", "/api/produtos", corpo, s.token).corpo


def repor(api: Api, s: Sessao, p: dict, quantidade: float, validade: str | None = None) -> dict:
    return api.chamar(
        "POST", f"/api/produtos/{p['id']}/reposicao", {"quantidade": quantidade, "validade": validade}, s.token
    ).corpo


def lotes(p: dict) -> list[list[object]]:
    return [[lote["quantidade"], lote["validade"]] for lote in p["lotes"]]


def ver(api: Api, s: Sessao, p: dict) -> dict:
    return next(x for x in api.chamar("GET", "/api/produtos?todos=1", token=s.token).corpo if x["id"] == p["id"])


def test_rf17_cadastro_cria_o_primeiro_lote(api: Api, casa: Casa) -> None:
    admin, _, _ = casa
    p = cadastrar(api, admin, nome="Presunto", quantidade=2, validade="2026-03-12")
    assert lotes(p) == [[2, "2026-03-12"]]


def test_rf17_repor_com_outra_validade_cria_segundo_lote(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Presunto", quantidade=2, validade="2026-03-12")
    r = repor(api, ana, p, 3, "2026-03-25")
    assert r["quantidade"] == 5
    assert r["validade"] == "2026-03-12", "a validade exibida é a do lote que vence primeiro"
    assert lotes(r) == [[2, "2026-03-12"], [3, "2026-03-25"]]


def test_rf17_repor_com_a_mesma_validade_soma_no_lote(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Arroz", quantidade=1, validade="2026-06-01")
    assert lotes(repor(api, ana, p, 2, "2026-06-01")) == [[3, "2026-06-01"]]


def test_rb11_consumo_baixa_primeiro_o_lote_que_vence_antes(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Presunto", quantidade=3, validade="2026-03-25")
    repor(api, admin, p, 2, "2026-03-12")
    r = api.chamar("POST", f"/api/produtos/{p['id']}/consumo", {"quantidade": 3}, ana.token).corpo
    assert lotes(r) == [[2, "2026-03-25"]], "o lote de 12/03 acabou e o de 25/03 perdeu 1 unidade"


def test_rb04_lote_vencido_sai_e_produto_segue_ativo(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Iogurte", quantidade=2, validade="2026-03-12")
    repor(api, admin, p, 5, "2026-03-30")
    api.relogio.definir("2026-03-13")
    atual = ver(api, ana, p)
    assert (atual["quantidade"], atual["status"]) == (5, "ATIVO"), "unidades vencidas não contam como estoque"
    assert lotes(atual) == [[5, "2026-03-30"]]


def test_rb04_produto_so_fica_vencido_quando_todos_os_lotes_vencem(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Queijo", quantidade=1, validade="2026-03-12")
    repor(api, admin, p, 1, "2026-03-14")
    api.relogio.definir("2026-03-13")
    atual = ver(api, ana, p)
    assert [atual["status"], lotes(atual)] == ["ATIVO", [[1, "2026-03-14"]]]
    api.relogio.definir("2026-03-15")
    assert ver(api, ana, p)["status"] == "VENCIDO"


def test_rf03_lote_perto_de_vencer_aparece_no_painel_mesmo_com_lote_novo(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Presunto", quantidade=1, validade="2026-03-12")
    repor(api, admin, p, 3, "2026-03-30")
    painel = api.chamar("GET", "/api/painel", token=ana.token).corpo
    assert [x["nome"] for x in painel["validadeCritica"]] == ["Presunto"]


def test_rf04_vencimento_de_lote_que_deixa_o_total_no_minimo_poe_na_lista(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    p = cadastrar(api, admin, nome="Ovos", quantidade=3, validade="2026-03-11", quantidadeMinima=2)
    repor(api, admin, p, 2, "2026-03-30")
    assert api.chamar("GET", "/api/lista", token=ana.token).corpo == []
    api.relogio.definir("2026-03-12")
    pendentes = [i["nome"] for i in api.chamar("GET", "/api/lista", token=ana.token).corpo if i["status"] == "PENDENTE"]
    assert pendentes == ["Ovos"]


def test_editar_validade_com_varios_lotes_e_recusado(api: Api, casa: Casa) -> None:
    admin, _, _ = casa
    p = cadastrar(api, admin, nome="Leite", quantidade=1, validade="2026-03-20")
    r = api.chamar("PATCH", f"/api/produtos/{p['id']}", {"validade": "2026-03-22"}, admin.token)
    assert lotes(r.corpo) == [[1, "2026-03-22"]]
    repor(api, admin, p, 1, "2026-03-28")
    r = api.chamar("PATCH", f"/api/produtos/{p['id']}", {"validade": "2026-03-25"}, admin.token)
    assert (r.status, r.corpo["erro"]["codigo"]) == (409, "VARIOS_LOTES")
