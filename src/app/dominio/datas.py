"""Operações sobre datas de calendário e períodos contábeis (AAAA-MM)."""

import calendar
import re
from datetime import date, timedelta

_PERIODO = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_DATA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def eh_data_iso(valor: str) -> bool:
    if not _DATA.match(valor):
        return False
    try:
        date.fromisoformat(valor)
    except ValueError:
        return False
    return True


def somar_dias(data: date, dias: int) -> date:
    return data + timedelta(days=dias)


def dias_entre(de: date, ate: date) -> int:
    """Quantos dias faltam de `de` até `ate` (negativo se `ate` já passou)."""
    return (ate - de).days


def periodo_de(data: date) -> str:
    return data.isoformat()[:7]


def eh_periodo(valor: str) -> bool:
    return bool(_PERIODO.match(valor))


def ultimo_dia_do_periodo(periodo: str) -> date:
    ano, mes = (int(p) for p in periodo.split("-"))
    return date(ano, mes, calendar.monthrange(ano, mes)[1])
