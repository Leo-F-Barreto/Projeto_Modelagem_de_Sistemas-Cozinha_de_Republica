"""DEMONSTRAÇÃO DE FALHA — este arquivo falha de propósito.

Tradução de tests/demonstracao/defeito-rateio.demo.ts.

Simula um defeito realista: alguém "simplifica" o rateio e esquece a linha que entrega os centavos
residuais ao pagador (RB-05). Os testes abaixo são exatamente as verificações da suíte oficial
(tests/test_dominio.py), aplicadas à versão defeituosa, para mostrar como a falha é apontada.

Não faz parte da suíte padrão (o nome não começa com test_). Para rodar:
    pytest tests/demonstracao/defeito_rateio_demo.py
Resultado esperado: 2 testes falham e 1 (o de controle) passa.
"""

from app.dominio.rateio import ratear


def ratear_com_defeito(valor_centavos: int, moradores: list[int], _pagador_id: int) -> dict[int, int]:
    """Cópia de app/dominio/rateio.py com o defeito: o resto da divisão é descartado."""
    participantes = sorted(set(moradores))
    base = valor_centavos // len(participantes)
    return {morador: base for morador in participantes}  # DEFEITO: falta somar o resto na cota do pagador


def test_rb05_100_reais_entre_3_moradores_deve_fechar_em_100_reais() -> None:
    cotas = ratear_com_defeito(10000, [1, 2, 3], 2)
    assert sum(cotas.values()) == 10000, (
        f"a soma das cotas deu {sum(cotas.values())} centavos: 1 centavo sumiu do rateio"
    )


def test_rb05_o_pagador_id_2_fica_com_o_centavo_residual() -> None:
    assert ratear_com_defeito(10000, [1, 2, 3], 2) == {1: 3333, 2: 3334, 3: 3333}


def test_controle_a_implementacao_real_passa_nas_mesmas_verificacoes() -> None:
    cotas = ratear(10000, [1, 2, 3], 2)
    assert sum(cotas.values()) == 10000
    assert cotas == {1: 3333, 2: 3334, 3: 3333}
