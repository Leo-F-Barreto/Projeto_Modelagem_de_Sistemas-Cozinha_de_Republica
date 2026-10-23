"""T-46 / RF-17: um produto tem lotes, cada um com sua validade.

RB-11 (FEFO): o consumo baixa sempre o lote que vence primeiro; lotes sem validade saem por último.
RB-04 por lote: quem vence é o lote; no dia do vencimento ele ainda vale.
"""

from dataclasses import dataclass
from datetime import date


@dataclass
class Lote:
    id: int
    quantidade: float
    validade: date | None


@dataclass(frozen=True)
class Baixa:
    lote_id: int
    quantidade: float


def ordem_fefo(lote: Lote) -> tuple[bool, date, int]:
    return (lote.validade is None, lote.validade or date.max, lote.id)


def planejar_consumo(lotes: list[Lote], quantidade: float) -> list[Baixa]:
    """Quanto sai de cada lote, do que vence primeiro para o que vence depois."""
    if quantidade <= 0:
        raise ValueError("quantidade deve ser positiva")
    disponivel = round(sum(lote.quantidade for lote in lotes), 3)
    if quantidade > disponivel:
        raise ValueError(f"quantidade indisponível: há {disponivel}")
    restante = quantidade
    baixas: list[Baixa] = []
    for lote in sorted(lotes, key=ordem_fefo):
        if restante <= 0:
            break
        if lote.quantidade <= 0:
            continue
        sai = min(lote.quantidade, restante)
        baixas.append(Baixa(lote.id, round(sai, 3)))
        restante = round(restante - sai, 3)
    return baixas


def separar_vencidos(lotes: list[Lote], hoje: date) -> tuple[list[Lote], list[Lote]]:
    """Devolve (válidos, vencidos). No dia do vencimento o lote ainda é válido."""
    validos = [lote for lote in lotes if lote.validade is None or lote.validade >= hoje]
    vencidos = [lote for lote in lotes if lote.validade is not None and lote.validade < hoje]
    return validos, vencidos
