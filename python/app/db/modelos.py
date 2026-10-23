"""Modelo de dados. Dinheiro em centavos inteiros; datas de calendário como DATE; instantes em UTC."""

from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _fk(alvo: str, **kw: object) -> ForeignKey:
    return ForeignKey(alvo, **kw)  # type: ignore[arg-type]


class Republica(Base):
    __tablename__ = "republica"
    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(60))
    codigo_convite: Mapped[str] = mapped_column(String(20), unique=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Usuario(Base):
    __tablename__ = "usuario"
    __table_args__ = (
        CheckConstraint("perfil IN ('ADMIN','MORADOR')", name="ck_usuario_perfil"),
        Index("ix_usuario_republica", "republica_id", "ativo"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    republica_id: Mapped[int] = mapped_column(_fk("republica.id"))
    nome: Mapped[str] = mapped_column(String(60))
    # Guardado sempre em minúsculas: a unicidade não depende de maiúsculas.
    email: Mapped[str] = mapped_column(String(120), unique=True)
    senha_hash: Mapped[str] = mapped_column(String(100))
    perfil: Mapped[str] = mapped_column(String(10))
    ativo: Mapped[bool] = mapped_column(default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Produto(Base):
    __tablename__ = "produto"
    __table_args__ = (
        CheckConstraint("quantidade >= 0", name="ck_produto_quantidade"),
        CheckConstraint("classificacao IN ('COLETIVO','INDIVIDUAL')", name="ck_produto_classificacao"),
        CheckConstraint("status IN ('ATIVO','ESGOTADO','VENCIDO','DESCARTADO')", name="ck_produto_status"),
        CheckConstraint("quantidade_minima IS NULL OR quantidade_minima >= 0", name="ck_produto_minimo"),
        # RB-01: item individual sempre tem dono e nunca tem mínimo; item coletivo nunca tem dono.
        CheckConstraint(
            "(classificacao = 'INDIVIDUAL' AND dono_id IS NOT NULL AND quantidade_minima IS NULL)"
            " OR (classificacao = 'COLETIVO' AND dono_id IS NULL)",
            name="ck_produto_propriedade",
        ),
        Index("ix_produto_republica", "republica_id", "status", "validade"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    republica_id: Mapped[int] = mapped_column(_fk("republica.id"))
    nome: Mapped[str] = mapped_column(String(80))
    # Soma dos lotes consumíveis (mantida pelo serviço de estoque).
    quantidade: Mapped[float] = mapped_column(Float)
    unidade: Mapped[str] = mapped_column(String(12))
    # Validade do lote que vence primeiro.
    validade: Mapped[date | None] = mapped_column(Date)
    # RB-05: compartimento físico obrigatório.
    compartimento: Mapped[str] = mapped_column(String(60))
    classificacao: Mapped[str] = mapped_column(String(10))
    dono_id: Mapped[int | None] = mapped_column(_fk("usuario.id"))
    quantidade_minima: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(10))
    criado_por: Mapped[int] = mapped_column(_fk("usuario.id"))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    conferido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Lote(Base):
    """T-46 / RF-17: entradas de um produto, cada uma com sua validade."""

    __tablename__ = "lote"
    __table_args__ = (
        CheckConstraint("quantidade >= 0", name="ck_lote_quantidade"),
        CheckConstraint("status IN ('ATIVO','CONSUMIDO','VENCIDO','DESCARTADO')", name="ck_lote_status"),
        Index("ix_lote_produto", "produto_id", "status", "validade"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    produto_id: Mapped[int] = mapped_column(_fk("produto.id"))
    quantidade: Mapped[float] = mapped_column(Float)
    validade: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="ATIVO")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Consumo(Base):
    """RNF-02.2: histórico só de inserção."""

    __tablename__ = "consumo"
    __table_args__ = (
        CheckConstraint("quantidade > 0", name="ck_consumo_quantidade"),
        Index("ix_consumo_produto", "produto_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    produto_id: Mapped[int] = mapped_column(_fk("produto.id"))
    usuario_id: Mapped[int] = mapped_column(_fk("usuario.id"))
    quantidade: Mapped[float] = mapped_column(Float)
    registrado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ItemLista(Base):
    __tablename__ = "item_lista"
    __table_args__ = (
        CheckConstraint("origem IN ('MANUAL','AUTOMATICA')", name="ck_item_origem"),
        CheckConstraint("status IN ('PENDENTE','COMPRADO')", name="ck_item_status"),
        CheckConstraint("quantidade IS NULL OR quantidade > 0", name="ck_item_quantidade"),
        Index("ix_item_lista_republica", "republica_id", "status"),
        # RF-04: no máximo um item pendente por produto (evita duplicar a sugestão automática).
        Index(
            "ux_item_lista_pendente",
            "produto_id",
            unique=True,
            sqlite_where=text("status = 'PENDENTE' AND produto_id IS NOT NULL"),
            postgresql_where=text("status = 'PENDENTE' AND produto_id IS NOT NULL"),
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    republica_id: Mapped[int] = mapped_column(_fk("republica.id"))
    nome: Mapped[str] = mapped_column(String(80))
    quantidade: Mapped[float | None] = mapped_column(Float)
    unidade: Mapped[str | None] = mapped_column(String(12))
    produto_id: Mapped[int | None] = mapped_column(_fk("produto.id"))
    origem: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10))
    criado_por: Mapped[int | None] = mapped_column(_fk("usuario.id"))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    alterado_por: Mapped[int | None] = mapped_column(_fk("usuario.id"))
    comprado_por: Mapped[int | None] = mapped_column(_fk("usuario.id"))
    comprado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Compra(Base):
    __tablename__ = "compra"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="ck_compra_valor"),
        CheckConstraint("status IN ('PENDENTE','APROVADA','REJEITADA')", name="ck_compra_status"),
        Index("ix_compra_republica", "republica_id", "status", "data"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    republica_id: Mapped[int] = mapped_column(_fk("republica.id"))
    descricao: Mapped[str] = mapped_column(String(120))
    valor_centavos: Mapped[int] = mapped_column(Integer)
    pagador_id: Mapped[int] = mapped_column(_fk("usuario.id"))
    data: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10))
    registrada_por: Mapped[int] = mapped_column(_fk("usuario.id"))
    decidida_por: Mapped[int | None] = mapped_column(_fk("usuario.id"))
    decidida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    motivo_rejeicao: Mapped[str | None] = mapped_column(String(200))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Cota(Base):
    __tablename__ = "cota"
    __table_args__ = (
        CheckConstraint("valor_centavos >= 0", name="ck_cota_valor"),
        Index("ix_cota_usuario", "usuario_id"),
    )
    compra_id: Mapped[int] = mapped_column(_fk("compra.id"), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(_fk("usuario.id"), primary_key=True)
    valor_centavos: Mapped[int] = mapped_column(Integer)


class Fechamento(Base):
    __tablename__ = "fechamento"
    __table_args__ = (UniqueConstraint("republica_id", "periodo", name="uq_fechamento_periodo"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    republica_id: Mapped[int] = mapped_column(_fk("republica.id"))
    periodo: Mapped[str] = mapped_column(String(7))
    fechado_por: Mapped[int] = mapped_column(_fk("usuario.id"))
    fechado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Acerto(Base):
    __tablename__ = "acerto"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="ck_acerto_valor"),
        CheckConstraint("status IN ('PENDENTE','PAGO','SUBSTITUIDO')", name="ck_acerto_status"),
        Index("ix_acerto_fechamento", "fechamento_id", "status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    fechamento_id: Mapped[int] = mapped_column(_fk("fechamento.id"))
    devedor_id: Mapped[int] = mapped_column(_fk("usuario.id"))
    credor_id: Mapped[int] = mapped_column(_fk("usuario.id"))
    valor_centavos: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12))
    confirmado_por: Mapped[int | None] = mapped_column(_fk("usuario.id"))
    confirmado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Turno(Base):
    __tablename__ = "turno"
    __table_args__ = (
        CheckConstraint("tipo IN ('LIMPEZA','REFEICAO')", name="ck_turno_tipo"),
        CheckConstraint("status IN ('PENDENTE','CONCLUIDO')", name="ck_turno_status"),
        UniqueConstraint("republica_id", "data", "tipo", name="uq_turno_dia_tipo"),
        Index("ix_turno_responsavel", "responsavel_id", "status", "data"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    republica_id: Mapped[int] = mapped_column(_fk("republica.id"))
    data: Mapped[date] = mapped_column(Date)
    tipo: Mapped[str] = mapped_column(String(10))
    responsavel_id: Mapped[int] = mapped_column(_fk("usuario.id"))
    status: Mapped[str] = mapped_column(String(10))
    concluido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Troca(Base):
    __tablename__ = "troca"
    __table_args__ = (
        CheckConstraint("status IN ('PENDENTE','ACEITA','RECUSADA','CANCELADA')", name="ck_troca_status"),
        Index("ix_troca_republica", "republica_id", "status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    republica_id: Mapped[int] = mapped_column(_fk("republica.id"))
    turno_solicitante_id: Mapped[int] = mapped_column(_fk("turno.id", ondelete="CASCADE"))
    turno_solicitado_id: Mapped[int] = mapped_column(_fk("turno.id", ondelete="CASCADE"))
    solicitante_id: Mapped[int] = mapped_column(_fk("usuario.id"))
    solicitado_id: Mapped[int] = mapped_column(_fk("usuario.id"))
    status: Mapped[str] = mapped_column(String(10))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decidido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notificacao(Base):
    __tablename__ = "notificacao"
    __table_args__ = (
        # A chave torna o envio idempotente: a mesma ocorrência nunca notifica duas vezes.
        UniqueConstraint("usuario_id", "chave", name="uq_notificacao_chave"),
        Index("ix_notificacao_usuario", "usuario_id", "lida"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(_fk("usuario.id"))
    tipo: Mapped[str] = mapped_column(String(20))
    mensagem: Mapped[str] = mapped_column(Text)
    chave: Mapped[str] = mapped_column(String(80))
    lida: Mapped[bool] = mapped_column(default=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Auditoria(Base):
    __tablename__ = "auditoria"
    __table_args__ = (Index("ix_auditoria_republica", "republica_id", "id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    republica_id: Mapped[int] = mapped_column(_fk("republica.id"))
    usuario_id: Mapped[int] = mapped_column(_fk("usuario.id"))
    acao: Mapped[str] = mapped_column(String(40))
    detalhe: Mapped[str] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
