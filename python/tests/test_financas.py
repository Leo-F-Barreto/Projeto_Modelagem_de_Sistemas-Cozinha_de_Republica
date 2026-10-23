"""RF-05, RF-08 a RF-10 / RB-02, RB-03, RB-05: compras coletivas, rateio, fechamento e acerto."""

from datetime import datetime

from sqlalchemy import insert

from app.db.modelos import Fechamento
from tests.conftest import HOJE, Api, Sessao

Casa = tuple[Sessao, Sessao, Sessao]


def comprar(api: Api, quem: Sessao, pagador: Sessao, valor: int, **extra: object):  # noqa: ANN201
    corpo = {"descricao": "Mercado", "valorCentavos": valor, "pagadorId": pagador.usuario["id"], "data": HOJE, **extra}
    return api.chamar("POST", "/api/compras", corpo, quem.token)


def balanco(api: Api, s: Sessao) -> dict:
    return api.chamar("GET", "/api/balanco", token=s.token).corpo


def saldos(api: Api, s: Sessao) -> dict[int, int]:
    return {x["usuarioId"]: x["saldoCentavos"] for x in balanco(api, s)["saldos"]}


def ids(*ss: Sessao) -> list[int]:
    return [s.usuario["id"] for s in ss]


def fechar(api: Api, admin: Sessao, periodo: str = "2026-03"):  # noqa: ANN201
    return api.chamar("POST", "/api/fechamentos", {"periodo": periodo}, admin.token)


def tipos(api: Api, s: Sessao, tipo: str) -> int:
    return sum(1 for n in api.chamar("GET", "/api/notificacoes", token=s.token).corpo if n["tipo"] == tipo)


def test_rf05_rb02_compra_do_admin_e_rateada_igualmente(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    r = comprar(api, admin, admin, 9000)
    assert (r.status, r.corpo["status"]) == (201, "APROVADA")
    assert [c["valorCentavos"] for c in r.corpo["cotas"]] == [3000, 3000, 3000]
    assert saldos(api, admin) == dict(zip(ids(admin, ana, beto), [6000, -3000, -3000], strict=True))


def test_rb05_residuo_fica_com_o_pagador(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    comprar(api, admin, ana, 10000)
    s = saldos(api, admin)
    assert s == dict(zip(ids(admin, ana, beto), [-3333, 6666, -3333], strict=True))
    assert sum(s.values()) == 0


def test_rf08_compra_de_morador_fica_pendente_e_avisa_o_admin(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    r = comprar(api, ana, ana, 6000)
    assert (r.corpo["status"], r.corpo["cotas"]) == ("PENDENTE", [])
    assert set(saldos(api, admin).values()) == {0}
    assert tipos(api, admin, "COMPRA_PENDENTE") == 1


def test_rf08_so_o_admin_aprova(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    c = comprar(api, ana, ana, 6000).corpo
    assert api.chamar("POST", f"/api/compras/{c['id']}/aprovacao", {}, ana.token).status == 403
    assert api.chamar("POST", f"/api/compras/{c['id']}/aprovacao", {}, beto.token).status == 403
    assert api.chamar("POST", f"/api/compras/{c['id']}/aprovacao", {}, admin.token).corpo["status"] == "APROVADA"
    assert saldos(api, admin) == dict(zip(ids(admin, ana, beto), [-2000, 4000, -2000], strict=True))
    assert api.chamar("POST", f"/api/compras/{c['id']}/aprovacao", {}, admin.token).status == 409
    assert tipos(api, ana, "COMPRA_DECIDIDA") == 1


def test_rf08_rejeicao_exige_motivo(api: Api, casa: Casa) -> None:
    admin, _, beto = casa
    c = comprar(api, beto, beto, 5000).corpo
    assert api.chamar("POST", f"/api/compras/{c['id']}/rejeicao", {}, admin.token).status == 400
    r = api.chamar("POST", f"/api/compras/{c['id']}/rejeicao", {"motivo": "Era item individual"}, admin.token).corpo
    assert (r["status"], r["motivoRejeicao"]) == ("REJEITADA", "Era item individual")
    assert set(saldos(api, admin).values()) == {0}


def test_rb02_rateio_considera_quem_esta_ativo(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    api.chamar("PATCH", f"/api/moradores/{beto.usuario['id']}", {"ativo": False}, admin.token)
    r = comprar(api, admin, admin, 9000)
    assert [[c["usuarioId"], c["valorCentavos"]] for c in r.corpo["cotas"]] == [
        [ids(admin)[0], 4500],
        [ids(ana)[0], 4500],
    ]
    assert saldos(api, admin)[beto.usuario["id"]] == 0


def test_rb03_pagamento_abate_primeiro_a_divida(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    comprar(api, admin, admin, 9000)
    assert saldos(api, admin)[ana.usuario["id"]] == -3000
    comprar(api, admin, ana, 3000)
    assert saldos(api, admin)[ana.usuario["id"]] == -1000
    comprar(api, admin, ana, 6000)
    assert saldos(api, admin)[ana.usuario["id"]] == 3000
    assert all(t["devedorId"] != ana.usuario["id"] for t in balanco(api, admin)["transferenciasSugeridas"])


def test_rf05_validacoes(api: Api, casa: Casa) -> None:
    admin, _, beto = casa
    assert comprar(api, admin, admin, 0).status == 400
    assert comprar(api, admin, admin, 100, data="2026-03-11").corpo["erro"]["codigo"] == "DATA_FUTURA"
    outra, _ = api.criar_republica()
    assert comprar(api, admin, outra, 100).corpo["erro"]["codigo"] == "PAGADOR_INVALIDO"
    api.chamar("PATCH", f"/api/moradores/{beto.usuario['id']}", {"ativo": False}, admin.token)
    assert comprar(api, admin, beto, 100).corpo["erro"]["codigo"] == "PAGADOR_INVALIDO"


def test_quem_deve_para_quem(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    comprar(api, admin, admin, 9000)
    comprar(api, admin, ana, 3000)
    ts = balanco(api, beto)["transferenciasSugeridas"]
    nome = lambda s: s.usuario["nome"]  # noqa: E731
    assert [[t["devedorNome"], t["credorNome"], t["valorCentavos"]] for t in ts] == [
        [nome(beto), nome(admin), 4000],
        [nome(ana), nome(admin), 1000],
    ]


def test_rf09_fechamento_gera_acertos_e_congela_o_mes(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    comprar(api, admin, admin, 9000)
    f = fechar(api, admin)
    assert f.status == 201
    assert [[a["devedorId"], a["credorId"], a["valorCentavos"], a["status"]] for a in f.corpo["acertos"]] == [
        [ids(ana)[0], ids(admin)[0], 3000, "PENDENTE"],
        [ids(beto)[0], ids(admin)[0], 3000, "PENDENTE"],
    ]
    assert fechar(api, admin).status == 409
    assert comprar(api, admin, admin, 100).corpo["erro"]["codigo"] == "PERIODO_FECHADO"
    assert tipos(api, ana, "ACERTO") == 1


def test_rf09_nao_fecha_mes_futuro_nem_com_compra_pendente(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    assert fechar(api, admin, "2026-04").corpo["erro"]["codigo"] == "PERIODO_FUTURO"
    assert fechar(api, admin, "marco").status == 400
    c = comprar(api, ana, ana, 500).corpo
    assert fechar(api, admin).corpo["erro"]["codigo"] == "COMPRAS_PENDENTES"
    api.chamar("POST", f"/api/compras/{c['id']}/rejeicao", {"motivo": "duplicada"}, admin.token)
    assert fechar(api, admin).status == 201


def test_compra_pendente_de_mes_fechado_nao_pode_ser_aprovada(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    api.relogio.definir("2026-02-20")
    c = comprar(api, ana, ana, 500, data="2026-02-20").corpo
    with api.sessao() as s:
        s.execute(
            insert(Fechamento).values(
                republica_id=admin.usuario["republicaId"],
                periodo="2026-02",
                fechado_por=admin.usuario["id"],
                fechado_em=datetime.now(),
            )
        )
        s.commit()
    r = api.chamar("POST", f"/api/compras/{c['id']}/aprovacao", {}, admin.token)
    assert r.corpo["erro"]["codigo"] == "PERIODO_FECHADO"


def test_rf10_confirmacao_de_pagamento(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    comprar(api, admin, ana, 9000)
    acertos = fechar(api, admin).corpo["acertos"]
    do_beto = next(a for a in acertos if a["devedorId"] == beto.usuario["id"])
    do_admin = next(a for a in acertos if a["devedorId"] == admin.usuario["id"])
    confirmar = lambda a, s: api.chamar("POST", f"/api/acertos/{a['id']}/confirmacao", {}, s.token)  # noqa: E731
    assert confirmar(do_beto, beto).status == 403
    assert confirmar(do_admin, admin).corpo["erro"]["codigo"] == "DEVEDOR_NAO_CONFIRMA"
    assert confirmar(do_beto, ana).corpo["status"] == "PAGO"
    assert confirmar(do_beto, ana).status == 409
    assert saldos(api, admin) == dict(zip(ids(admin, ana, beto), [-3000, 3000, 0], strict=True))
    confirmar(do_admin, ana)
    assert set(saldos(api, admin).values()) == {0}
    assert balanco(api, admin)["transferenciasSugeridas"] == []


def test_rf09_novo_fechamento_substitui_acertos_pendentes(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    api.relogio.definir("2026-02-15")
    comprar(api, admin, admin, 9000, data="2026-02-15")
    fev = fechar(api, admin, "2026-02").corpo["acertos"]
    da_ana = next(a for a in fev if a["devedorId"] == ana.usuario["id"])
    api.chamar("POST", f"/api/acertos/{da_ana['id']}/confirmacao", {}, admin.token)
    api.relogio.definir("2026-03-10")
    comprar(api, admin, admin, 3000)
    mar = fechar(api, admin).corpo["acertos"]
    assert [[a["devedorId"], a["valorCentavos"]] for a in mar] == [
        [beto.usuario["id"], 4000],
        [ana.usuario["id"], 1000],
    ]
    antigo = next(
        a
        for f in balanco(api, admin)["fechamentos"]
        if f["periodo"] == "2026-02"
        for a in f["acertos"]
        if a["devedorId"] == beto.usuario["id"]
    )
    assert antigo["status"] == "SUBSTITUIDO"
    assert api.chamar("POST", f"/api/acertos/{antigo['id']}/confirmacao", {}, admin.token).status == 409


def test_acoes_financeiras_ficam_na_auditoria(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    c = comprar(api, ana, ana, 6000).corpo
    api.chamar("POST", f"/api/compras/{c['id']}/aprovacao", {}, admin.token)
    fechar(api, admin)
    acoes = [a["acao"] for a in api.chamar("GET", "/api/auditoria", token=admin.token).corpo]
    assert acoes == ["PERIODO_FECHADO", "COMPRA_APROVADA"]
