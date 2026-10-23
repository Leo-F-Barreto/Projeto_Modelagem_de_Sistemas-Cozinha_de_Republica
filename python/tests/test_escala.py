"""RF-06, RF-11, RF-12 / RB-06, RB-07: escala de tarefas, trocas e gestão de moradores."""

from tests.conftest import HOJE, SENHA, Api, Sessao

Casa = tuple[Sessao, Sessao, Sessao]


def gerar(api: Api, admin: Sessao, dias: int = 6, tipos: list[str] | None = None, inicio: str = HOJE):  # noqa: ANN201
    return api.chamar(
        "POST", "/api/escala", {"inicio": inicio, "dias": dias, "tipos": tipos or ["LIMPEZA"]}, admin.token
    )


def escala(api: Api, s: Sessao) -> dict:
    return api.chamar("GET", "/api/escala", token=s.token).corpo


def turno_de(api: Api, admin: Sessao, s: Sessao, n: int = 0) -> dict:
    return [
        t for t in escala(api, admin)["turnos"] if t["responsavelId"] == s.usuario["id"] and t["tipo"] == "LIMPEZA"
    ][n]


def pedir(api: Api, s: Sessao, meu: dict, outro: dict):  # noqa: ANN201
    return api.chamar("POST", "/api/trocas", {"meuTurnoId": meu["id"], "outroTurnoId": outro["id"]}, s.token)


def ids(*ss: Sessao) -> list[int]:
    return [s.usuario["id"] for s in ss]


def test_rf11_escala_rotativa(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    r = gerar(api, admin)
    assert (r.status, r.corpo["turnosCriados"]) == (201, 6)
    assert [t["responsavelId"] for t in r.corpo["turnos"]] == ids(admin, ana, beto) * 2


def test_rf11_limpeza_e_refeicao_do_dia_com_pessoas_diferentes(api: Api, casa: Casa) -> None:
    admin, _, _ = casa
    turnos = gerar(api, admin, 3, ["LIMPEZA", "REFEICAO"]).corpo["turnos"]
    for data in ["2026-03-10", "2026-03-11", "2026-03-12"]:
        do_dia = [t for t in turnos if t["data"] == data]
        assert len(do_dia) == 2
        assert do_dia[0]["responsavelId"] != do_dia[1]["responsavelId"]


def test_rf11_gerar_de_novo_nao_duplica_e_continua_o_rodizio(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    gerar(api, admin, 4)
    assert gerar(api, admin, 4).corpo["turnosCriados"] == 0
    mais = gerar(api, admin, 2, inicio="2026-03-14")
    assert [t["responsavelId"] for t in mais.corpo["turnos"]] == ids(ana, beto)


def test_rf11_parametros_invalidos(api: Api, casa: Casa) -> None:
    admin, _, _ = casa
    assert gerar(api, admin, 3, inicio="2026-03-09").corpo["erro"]["codigo"] == "DATA_PASSADA"
    assert gerar(api, admin, 61).status == 400
    assert gerar(api, admin, 3, ["FAXINA"]).status == 400


def test_conclusao_de_turno(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    gerar(api, admin)
    hoje_do_admin, futuro_da_ana = turno_de(api, admin, admin), turno_de(api, admin, ana)
    concluir = lambda t, s: api.chamar("POST", f"/api/turnos/{t['id']}/conclusao", {}, s.token)  # noqa: E731
    assert concluir(hoje_do_admin, ana).corpo["erro"]["codigo"] == "NAO_RESPONSAVEL"
    assert concluir(futuro_da_ana, ana).corpo["erro"]["codigo"] == "TURNO_FUTURO"
    assert concluir(hoje_do_admin, admin).corpo["status"] == "CONCLUIDO"
    assert concluir(hoje_do_admin, admin).status == 409


def test_lembrete_do_turno_de_hoje_e_turno_atrasado(api: Api, casa: Casa) -> None:
    admin, _, _ = casa
    gerar(api, admin)
    api.chamar("GET", "/api/painel", token=admin.token)
    ns = api.chamar("GET", "/api/notificacoes", token=admin.token).corpo
    assert sum(1 for n in ns if n["tipo"] == "TAREFA_PENDENTE") == 1
    api.relogio.definir("2026-03-11")
    assert turno_de(api, admin, admin)["atrasado"] is True


def test_rf06_troca_aceita_atualiza_o_calendario(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    gerar(api, admin)
    da_ana, do_beto = turno_de(api, admin, ana), turno_de(api, admin, beto)
    p = pedir(api, ana, da_ana, do_beto)
    assert (p.status, p.corpo["status"]) == (201, "PENDENTE")
    assert len(escala(api, beto)["trocas"]) == 1
    assert turno_de(api, admin, ana)["id"] == da_ana["id"]
    assert api.chamar("POST", f"/api/trocas/{p.corpo['id']}/aceite", {}, ana.token).status == 403
    assert api.chamar("POST", f"/api/trocas/{p.corpo['id']}/aceite", {}, admin.token).status == 403
    assert api.chamar("POST", f"/api/trocas/{p.corpo['id']}/aceite", {}, beto.token).corpo["status"] == "ACEITA"
    turnos = {t["id"]: t for t in escala(api, admin)["turnos"]}
    assert turnos[da_ana["id"]]["responsavelId"] == beto.usuario["id"]
    assert turnos[do_beto["id"]]["responsavelId"] == ana.usuario["id"]
    ns = api.chamar("GET", "/api/notificacoes", token=ana.token).corpo
    assert any(n["tipo"] == "TROCA" and "aceitou" in n["mensagem"] for n in ns)


def test_rf06_recusa_e_cancelamento(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    gerar(api, admin)
    da_ana, do_beto = turno_de(api, admin, ana), turno_de(api, admin, beto)
    p1 = pedir(api, ana, da_ana, do_beto).corpo
    assert api.chamar("POST", f"/api/trocas/{p1['id']}/recusa", {}, beto.token).corpo["status"] == "RECUSADA"
    p2 = pedir(api, ana, da_ana, do_beto).corpo
    assert api.chamar("POST", f"/api/trocas/{p2['id']}/cancelamento", {}, beto.token).status == 403
    assert api.chamar("POST", f"/api/trocas/{p2['id']}/cancelamento", {}, ana.token).corpo["status"] == "CANCELADA"
    assert turno_de(api, admin, ana)["id"] == da_ana["id"]
    assert api.chamar("POST", f"/api/trocas/{p2['id']}/aceite", {}, beto.token).status == 409


def test_rf06_regras_do_pedido(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    gerar(api, admin)
    do_admin, da_ana, da_ana2, do_beto = (
        turno_de(api, admin, admin),
        turno_de(api, admin, ana),
        turno_de(api, admin, ana, 1),
        turno_de(api, admin, beto),
    )
    assert pedir(api, ana, do_beto, do_admin).corpo["erro"]["codigo"] == "NAO_RESPONSAVEL"
    assert pedir(api, ana, da_ana, da_ana2).corpo["erro"]["codigo"] == "TROCA_INVALIDA"
    assert pedir(api, ana, da_ana, do_beto).status == 201
    assert pedir(api, admin, do_admin, do_beto).corpo["erro"]["codigo"] == "TROCA_EM_ABERTO"
    api.chamar("POST", f"/api/turnos/{do_admin['id']}/conclusao", {}, admin.token)
    assert pedir(api, ana, da_ana2, do_admin).corpo["erro"]["codigo"] == "TROCA_INVALIDA"


def test_rf06_turno_de_hoje_nao_entra_em_troca(api: Api, casa: Casa) -> None:
    admin, _, beto = casa
    gerar(api, admin)
    r = pedir(api, admin, turno_de(api, admin, admin), turno_de(api, admin, beto))
    assert r.corpo["erro"]["codigo"] == "TROCA_INVALIDA"


def test_rf06_aceite_tardio_cancela_o_pedido(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    gerar(api, admin)
    p = pedir(api, ana, turno_de(api, admin, ana), turno_de(api, admin, beto)).corpo
    api.relogio.definir("2026-03-12")
    r = api.chamar("POST", f"/api/trocas/{p['id']}/aceite", {}, beto.token)
    assert r.corpo["erro"]["codigo"] == "TROCA_EXPIRADA"
    assert escala(api, beto)["trocas"] == []


def test_troca_expira_sozinha_quando_o_turno_chega(api: Api, casa: Casa) -> None:
    admin, ana, beto = casa
    gerar(api, admin)
    pedir(api, ana, turno_de(api, admin, ana), turno_de(api, admin, beto))
    api.relogio.definir("2026-03-11")
    assert escala(api, beto)["trocas"] == []


def test_rf12_rb06_republica_nunca_fica_sem_admin(api: Api, casa: Casa) -> None:
    admin, ana, _ = casa
    eu = admin.usuario["id"]
    patch = lambda alvo, dados: api.chamar("PATCH", f"/api/moradores/{alvo}", dados, admin.token)  # noqa: E731
    assert patch(eu, {"perfil": "MORADOR"}).corpo["erro"]["codigo"] == "ULTIMO_ADMIN"
    assert patch(eu, {"ativo": False}).corpo["erro"]["codigo"] == "ULTIMO_ADMIN"
    assert patch(ana.usuario["id"], {"perfil": "ADMIN"}).status == 200
    assert patch(eu, {"perfil": "MORADOR"}).status == 200
    assert api.chamar("POST", "/api/republica/convite", {}, admin.token).status == 403
    assert api.chamar("POST", "/api/republica/convite", {}, ana.token).status == 200


def test_rf12_rb07_saldo_em_aberto_impede_desativar(api: Api, casa: Casa) -> None:
    admin, _, beto = casa
    api.chamar(
        "POST",
        "/api/compras",
        {"descricao": "Gás", "valorCentavos": 9000, "pagadorId": admin.usuario["id"], "data": HOJE},
        admin.token,
    )
    r = api.chamar("PATCH", f"/api/moradores/{beto.usuario['id']}", {"ativo": False}, admin.token)
    assert (r.status, r.corpo["erro"]["codigo"]) == (422, "SALDO_PENDENTE")
    acertos = api.chamar("POST", "/api/fechamentos", {"periodo": "2026-03"}, admin.token).corpo["acertos"]
    do_beto = next(a for a in acertos if a["devedorId"] == beto.usuario["id"])
    api.chamar("POST", f"/api/acertos/{do_beto['id']}/confirmacao", {}, admin.token)
    assert api.chamar("PATCH", f"/api/moradores/{beto.usuario['id']}", {"ativo": False}, admin.token).status == 200


def test_rb07_compra_pendente_impede_desativar(api: Api, casa: Casa) -> None:
    admin, _, beto = casa
    api.chamar(
        "POST",
        "/api/compras",
        {"descricao": "Feira", "valorCentavos": 3000, "pagadorId": beto.usuario["id"], "data": HOJE},
        beto.token,
    )
    r = api.chamar("PATCH", f"/api/moradores/{beto.usuario['id']}", {"ativo": False}, admin.token)
    assert r.corpo["erro"]["codigo"] == "COMPRAS_PENDENTES"


def test_rf12_desativar_encerra_acesso_e_tira_da_escala(api: Api, casa: Casa) -> None:
    admin, _, beto = casa
    gerar(api, admin)
    assert api.chamar("PATCH", f"/api/moradores/{beto.usuario['id']}", {"ativo": False}, admin.token).status == 200
    assert api.chamar("GET", "/api/eu", token=beto.token).status == 401
    assert api.chamar("POST", "/api/auth/login", {"email": beto.email, "senha": SENHA}).status == 401
    turnos = escala(api, admin)["turnos"]
    assert all(t["responsavelId"] != beto.usuario["id"] for t in turnos)
    assert len(turnos) == 4
    regerada = gerar(api, admin).corpo
    assert regerada["turnosCriados"] == 2
    assert all(t["responsavelId"] != beto.usuario["id"] for t in regerada["turnos"])


def test_convite_regenerado_invalida_o_anterior(api: Api, casa: Casa) -> None:
    admin, _, _ = casa
    antigo = api.chamar("GET", "/api/republica", token=admin.token).corpo["codigoConvite"]
    novo = api.chamar("POST", "/api/republica/convite", {}, admin.token).corpo["codigoConvite"]
    assert novo != antigo
    dados = {"nome": "Intruso", "email": "intruso@teste.com", "senha": SENHA}
    assert (
        api.chamar("POST", "/api/auth/registro", {**dados, "codigoConvite": antigo}).corpo["erro"]["codigo"]
        == "CONVITE_INVALIDO"
    )
    assert api.chamar("POST", "/api/auth/registro", {**dados, "codigoConvite": novo}).status == 201
