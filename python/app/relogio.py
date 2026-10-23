"""Fonte de tempo injetável: validade e escala dependem de "hoje", e os testes precisam controlá-lo."""

from datetime import UTC, date, datetime, time
from typing import Protocol
from zoneinfo import ZoneInfo


class Relogio(Protocol):
    def hoje(self) -> date: ...
    def agora(self) -> datetime: ...
    def segundos(self) -> int: ...


class RelogioReal:
    def __init__(self, fuso: str) -> None:
        self._fuso = ZoneInfo(fuso)

    def hoje(self) -> date:
        """Data corrente no fuso da república (RNF-03.2)."""
        return datetime.now(self._fuso).date()

    def agora(self) -> datetime:
        return datetime.now(UTC)

    def segundos(self) -> int:
        return int(self.agora().timestamp())


class RelogioFixo:
    """Relógio parado ao meio-dia UTC da data definida; usado nos testes."""

    def __init__(self, data: date | str) -> None:
        self.definir(data)

    def definir(self, data: date | str) -> None:
        self._data = date.fromisoformat(data) if isinstance(data, str) else data

    def hoje(self) -> date:
        return self._data

    def agora(self) -> datetime:
        return datetime.combine(self._data, time(12, 0), tzinfo=UTC)

    def segundos(self) -> int:
        return int(self.agora().timestamp())
