"""RB-03: transforma saldos líquidos (positivo = credor, negativo = devedor) em transferências mínimas."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Transferencia:
    devedor_id: int
    credor_id: int
    valor_centavos: int


def simplificar_dividas(saldos: dict[int, int]) -> list[Transferencia]:
    """Estratégia gulosa: o maior devedor paga o maior credor (empates pelo menor id); no máximo n-1 transferências."""
    total = sum(saldos.values())
    if total != 0:
        raise ValueError(f"saldos não fecham em zero (soma = {total})")

    devedores = [[i, -v] for i, v in saldos.items() if v < 0]
    credores = [[i, v] for i, v in saldos.items() if v > 0]
    transferencias: list[Transferencia] = []
    while devedores and credores:
        devedores.sort(key=lambda x: (-x[1], x[0]))
        credores.sort(key=lambda x: (-x[1], x[0]))
        devedor, credor = devedores[0], credores[0]
        valor = min(devedor[1], credor[1])
        transferencias.append(Transferencia(devedor[0], credor[0], valor))
        devedor[1] -= valor
        credor[1] -= valor
        if devedor[1] == 0:
            devedores.pop(0)
        if credor[1] == 0:
            credores.pop(0)
    return transferencias
