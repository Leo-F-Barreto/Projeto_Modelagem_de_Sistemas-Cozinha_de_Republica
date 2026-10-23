"""RF-06.1 / RB-10: escala rotativa entre os moradores ativos."""

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class TurnoPlanejado:
    data: date
    responsavel_id: int


def distribuir_turnos(
    datas: list[date], moradores: list[int], ultimo_responsavel_id: int | None
) -> list[TurnoPlanejado]:
    """Percorre as datas em rodízio por id, continuando depois de quem fez o último turno.
    Se essa pessoa saiu da casa, segue quem viria depois dela por id."""
    if not moradores:
        raise ValueError("escala exige ao menos um morador ativo")
    fila = sorted(moradores)
    indice = 0
    if ultimo_responsavel_id is not None:
        indice = next((i for i, m in enumerate(fila) if m > ultimo_responsavel_id), 0)
    planejados = []
    for data in datas:
        planejados.append(TurnoPlanejado(data, fila[indice % len(fila)]))
        indice += 1
    return planejados
