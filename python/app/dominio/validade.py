"""Glossário: "Validade Crítica" = vencimento a 3 dias ou menos do dia atual (RB-06)."""

from datetime import date
from typing import Literal

from app.dominio.datas import dias_entre

DIAS_VALIDADE_CRITICA = 3

EstadoValidade = Literal["SEM_VALIDADE", "OK", "CRITICA", "VENCIDA"]


def estado_validade(validade: date | None, hoje: date) -> EstadoValidade:
    """No próprio dia do vencimento o item ainda é consumível (CRITICA); só vence no dia seguinte (RB-04)."""
    if validade is None:
        return "SEM_VALIDADE"
    dias = dias_entre(hoje, validade)
    if dias < 0:
        return "VENCIDA"
    if dias <= DIAS_VALIDADE_CRITICA:
        return "CRITICA"
    return "OK"
