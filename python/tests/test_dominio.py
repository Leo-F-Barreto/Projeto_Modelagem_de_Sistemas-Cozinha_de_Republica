"""Regras puras: datas, validade, rateio, acerto, escala, senha e token."""

import base64
import json
from datetime import date

import pytest

from app.dominio.acerto import Transferencia, simplificar_dividas
from app.dominio.datas import dias_entre, eh_data_iso, somar_dias, ultimo_dia_do_periodo
from app.dominio.escala import distribuir_turnos
from app.dominio.rateio import ratear
from app.dominio.validade import estado_validade
from app.erros import ErroDominio
from app.seguranca.senha import conferir_senha, gerar_hash, validar_politica
from app.seguranca.token import emitir_token, verificar_token

D = date.fromisoformat
SEGREDO_A = "segredo-a-com-pelo-menos-32-caracteres!!"
SEGREDO_B = "segredo-b-com-pelo-menos-32-caracteres!!"


def test_valida_datas_de_calendario() -> None:
    assert eh_data_iso("2026-02-28")
    assert not eh_data_iso("2026-02-30")
    assert not eh_data_iso("10/03/2026")


def test_soma_e_diferenca_atravessam_mes_e_ano_bissexto() -> None:
    assert somar_dias(D("2024-02-28"), 2) == D("2024-03-01")
    assert dias_entre(D("2026-12-30"), D("2027-01-02")) == 3
    assert ultimo_dia_do_periodo("2024-02") == D("2024-02-29")


@pytest.mark.parametrize(
    ("validade", "esperado"),
    [
        ("2026-03-14", "OK"),
        ("2026-03-13", "CRITICA"),
        ("2026-03-10", "CRITICA"),
        ("2026-03-09", "VENCIDA"),
        (None, "SEM_VALIDADE"),
    ],
)
def test_validade_critica_rf03_rb04(validade: str | None, esperado: str) -> None:
    assert estado_validade(D(validade) if validade else None, D("2026-03-10")) == esperado


def test_rateio_exato() -> None:
    assert ratear(9000, [1, 2, 3], 1) == {1: 3000, 2: 3000, 3: 3000}


def test_rb05_residuo_fica_com_pagador() -> None:
    cotas = ratear(10000, [1, 2, 3], 2)
    assert cotas == {1: 3333, 2: 3334, 3: 3333}
    assert sum(cotas.values()) == 10000


def test_soma_das_cotas_sempre_fecha() -> None:
    for n in range(1, 10):
        moradores = list(range(1, n + 1))
        for valor in [1, 7, 99, 100, 101, 1234567]:
            cotas = list(ratear(valor, moradores, 1).values())
            assert sum(cotas) == valor
            assert max(cotas) - min(cotas) < n


@pytest.mark.parametrize(("valor", "moradores"), [(10.5, [1]), (0, [1]), (100, []), (True, [1])])
def test_rateio_rejeita_entradas_invalidas(valor: object, moradores: list[int]) -> None:
    with pytest.raises(ValueError):
        ratear(valor, moradores, 1)  # type: ignore[arg-type]


def test_rb03_um_credor_dois_devedores() -> None:
    assert simplificar_dividas({1: 6000, 2: -3000, 3: -3000}) == [Transferencia(2, 1, 3000), Transferencia(3, 1, 3000)]


def test_rb03_no_maximo_n_menos_1_transferencias_e_zera_saldos() -> None:
    saldos = {1: 5000, 2: -1200, 3: 2500, 4: -4300, 5: -2000}
    ts = simplificar_dividas(saldos)
    assert len(ts) <= len(saldos) - 1
    final = dict(saldos)
    for t in ts:
        final[t.devedor_id] += t.valor_centavos
        final[t.credor_id] -= t.valor_centavos
    assert set(final.values()) == {0}


def test_rb03_casos_limite() -> None:
    assert simplificar_dividas({1: 0, 2: 0}) == []
    with pytest.raises(ValueError):
        simplificar_dividas({1: 100, 2: -50})


DATAS = [D("2026-03-10"), D("2026-03-11"), D("2026-03-12"), D("2026-03-13")]


def test_rodizio_percorre_em_ordem_e_recomeca() -> None:
    assert [t.responsavel_id for t in distribuir_turnos(DATAS, [1, 2, 3], None)] == [1, 2, 3, 1]


def test_rodizio_continua_depois_do_ultimo() -> None:
    assert [t.responsavel_id for t in distribuir_turnos(DATAS, [1, 2, 3], 2)] == [3, 1, 2, 3]


def test_rodizio_se_o_ultimo_saiu_segue_o_proximo() -> None:
    assert [t.responsavel_id for t in distribuir_turnos(DATAS[:2], [1, 4], 2)] == [4, 1]


def test_senha_bcrypt_com_salt_aleatorio() -> None:
    a, b = gerar_hash("Minha-senha-1", 4), gerar_hash("Minha-senha-1", 4)
    assert a.startswith("$2b$04$")
    assert a != b
    assert conferir_senha("Minha-senha-1", a)
    assert not conferir_senha("Outra-senha-1", a)


def test_hash_malformado_e_recusado_sem_estourar() -> None:
    assert not conferir_senha("x", "texto-qualquer")
    assert not conferir_senha("x", "$2b$40$AAAA")


@pytest.mark.parametrize("senha", ["curta1A", "semnumeroAA", "sem-maiuscula-1", "A1" + "x" * 80])
def test_politica_de_senha_recusa_senhas_fracas(senha: str) -> None:
    with pytest.raises(ErroDominio) as erro:
        validar_politica(senha)
    assert (erro.value.codigo, erro.value.status) == ("SENHA_FRACA", 422)


def test_politica_aceita_senha_forte() -> None:
    validar_politica("Senha-forte-1")


def _b64(dados: dict[str, object]) -> str:
    return base64.urlsafe_b64encode(json.dumps(dados).encode()).decode().rstrip("=")


def test_token_valido_expirado_adulterado_ou_de_outro_segredo() -> None:
    token = emitir_token(7, "ADMIN", 1, SEGREDO_A, 1000, 60)
    assert verificar_token(token, SEGREDO_A, 1030) == 7
    assert verificar_token(token, SEGREDO_A, 1060) is None
    assert verificar_token(token, SEGREDO_B, 1030) is None
    c, _, a = token.split(".")
    forjado = _b64({"sub": "1", "iat": 1000, "exp": 9999999999})
    assert verificar_token(f"{c}.{forjado}.{a}", SEGREDO_A, 1030) is None


def test_token_alg_none_e_recusado() -> None:
    cabecalho = _b64({"alg": "none", "typ": "JWT"})
    corpo = _b64({"sub": "1", "exp": 9999999999})
    assert verificar_token(f"{cabecalho}.{corpo}.", SEGREDO_A, 1000) is None
