"""Esquemas de entrada (Pydantic v2). O JSON da API usa camelCase, como na versão anterior."""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StringConstraints
from pydantic.alias_generators import to_camel


class Entrada(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True, extra="ignore"
    )


def Texto(minimo: int = 1, maximo: int = 120) -> type[str]:  # noqa: N802
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=minimo, max_length=maximo)]  # type: ignore[return-value]


Quantidade = Annotated[float, Field(gt=0, le=1_000_000)]
Minimo = Annotated[float, Field(ge=0, le=1_000_000)]
Id = Annotated[int, Field(gt=0)]


class Registro(Entrada):
    nome: Texto(2, 60)  # type: ignore[valid-type]
    email: Texto(5, 120)  # type: ignore[valid-type]
    senha: Annotated[str, Field(min_length=1, max_length=128)]
    nome_republica: Texto(2, 60) | None = None  # type: ignore[valid-type]
    codigo_convite: Texto(6, 20) | None = None  # type: ignore[valid-type]


class Login(Entrada):
    email: Texto(1, 120)  # type: ignore[valid-type]
    senha: Annotated[str, Field(min_length=1, max_length=128)]


class AlteracaoMorador(Entrada):
    perfil: Literal["ADMIN", "MORADOR"] | None = None
    ativo: StrictBool | None = None


class NovoProduto(Entrada):
    nome: Texto(1, 80)  # type: ignore[valid-type]
    quantidade: Quantidade
    unidade: Texto(1, 12)  # type: ignore[valid-type]
    validade: date | None = None
    compartimento: Texto(2, 60)  # type: ignore[valid-type]
    classificacao: Literal["COLETIVO", "INDIVIDUAL"]
    quantidade_minima: Minimo | None = None


class EdicaoProduto(Entrada):
    nome: Texto(1, 80) | None = None  # type: ignore[valid-type]
    unidade: Texto(1, 12) | None = None  # type: ignore[valid-type]
    compartimento: Texto(2, 60) | None = None  # type: ignore[valid-type]
    validade: date | None = None
    quantidade_minima: Minimo | None = None


class Movimento(Entrada):
    quantidade: Quantidade


class Reposicao(Entrada):
    quantidade: Quantidade
    validade: date | None = None


class NovoItemLista(Entrada):
    nome: Texto(1, 80)  # type: ignore[valid-type]
    quantidade: Quantidade = 1
    unidade: Texto(1, 12) | None = None  # type: ignore[valid-type]
    # EX-04.2: item marcado como pessoal não entra na lista coletiva.
    classificacao: Literal["COLETIVO", "INDIVIDUAL"] = "COLETIVO"


class AjusteItemLista(Entrada):
    quantidade: Quantidade


class NovaCompra(Entrada):
    descricao: Texto(1, 120)  # type: ignore[valid-type]
    valor_centavos: Annotated[int, Field(ge=1, le=10_000_000, strict=True)]
    pagador_id: Id
    data: date


class Rejeicao(Entrada):
    motivo: Texto(1, 200) | None = None  # type: ignore[valid-type]


class NovoFechamento(Entrada):
    periodo: Texto(7, 7)  # type: ignore[valid-type]


class NovaEscala(Entrada):
    inicio: date
    dias: Annotated[int, Field(ge=1, le=60)]
    tipos: Annotated[list[Literal["LIMPEZA", "REFEICAO"]], Field(min_length=1)]


class NovaTroca(Entrada):
    meu_turno_id: Id
    outro_turno_id: Id
