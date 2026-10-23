"""Esquema inicial do CoChef 2.0 (14 tabelas, incluindo `lote`).

Revisão: 0001
Anterior: (nenhuma)
Criada em: 2026-10-23 01:48:16.097941
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:

    op.create_table(
        "republica",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(length=60), nullable=False),
        sa.Column("codigo_convite", sa.String(length=20), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo_convite"),
    )
    op.create_table(
        "usuario",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("republica_id", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(length=60), nullable=False),
        sa.Column("email", sa.String(length=120), nullable=False),
        sa.Column("senha_hash", sa.String(length=100), nullable=False),
        sa.Column("perfil", sa.String(length=10), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("perfil IN ('ADMIN','MORADOR')", name="ck_usuario_perfil"),
        sa.ForeignKeyConstraint(
            ["republica_id"],
            ["republica.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    with op.batch_alter_table("usuario", schema=None) as batch_op:
        batch_op.create_index("ix_usuario_republica", ["republica_id", "ativo"], unique=False)

    op.create_table(
        "auditoria",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("republica_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("acao", sa.String(length=40), nullable=False),
        sa.Column("detalhe", sa.Text(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["republica_id"],
            ["republica.id"],
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("auditoria", schema=None) as batch_op:
        batch_op.create_index("ix_auditoria_republica", ["republica_id", "id"], unique=False)

    op.create_table(
        "compra",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("republica_id", sa.Integer(), nullable=False),
        sa.Column("descricao", sa.String(length=120), nullable=False),
        sa.Column("valor_centavos", sa.Integer(), nullable=False),
        sa.Column("pagador_id", sa.Integer(), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("registrada_por", sa.Integer(), nullable=False),
        sa.Column("decidida_por", sa.Integer(), nullable=True),
        sa.Column("decidida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo_rejeicao", sa.String(length=200), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('PENDENTE','APROVADA','REJEITADA')", name="ck_compra_status"),
        sa.CheckConstraint("valor_centavos > 0", name="ck_compra_valor"),
        sa.ForeignKeyConstraint(
            ["decidida_por"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["pagador_id"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["registrada_por"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["republica_id"],
            ["republica.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("compra", schema=None) as batch_op:
        batch_op.create_index("ix_compra_republica", ["republica_id", "status", "data"], unique=False)

    op.create_table(
        "fechamento",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("republica_id", sa.Integer(), nullable=False),
        sa.Column("periodo", sa.String(length=7), nullable=False),
        sa.Column("fechado_por", sa.Integer(), nullable=False),
        sa.Column("fechado_em", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["fechado_por"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["republica_id"],
            ["republica.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("republica_id", "periodo", name="uq_fechamento_periodo"),
    )
    op.create_table(
        "notificacao",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("mensagem", sa.Text(), nullable=False),
        sa.Column("chave", sa.String(length=80), nullable=False),
        sa.Column("lida", sa.Boolean(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("usuario_id", "chave", name="uq_notificacao_chave"),
    )
    with op.batch_alter_table("notificacao", schema=None) as batch_op:
        batch_op.create_index("ix_notificacao_usuario", ["usuario_id", "lida"], unique=False)

    op.create_table(
        "produto",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("republica_id", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(length=80), nullable=False),
        sa.Column("quantidade", sa.Float(), nullable=False),
        sa.Column("unidade", sa.String(length=12), nullable=False),
        sa.Column("validade", sa.Date(), nullable=True),
        sa.Column("compartimento", sa.String(length=60), nullable=False),
        sa.Column("classificacao", sa.String(length=10), nullable=False),
        sa.Column("dono_id", sa.Integer(), nullable=True),
        sa.Column("quantidade_minima", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("criado_por", sa.Integer(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("conferido_em", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "(classificacao = 'INDIVIDUAL' AND dono_id IS NOT NULL AND quantidade_minima IS NULL) OR (classificacao = 'COLETIVO' AND dono_id IS NULL)",
            name="ck_produto_propriedade",
        ),
        sa.CheckConstraint("classificacao IN ('COLETIVO','INDIVIDUAL')", name="ck_produto_classificacao"),
        sa.CheckConstraint("status IN ('ATIVO','ESGOTADO','VENCIDO','DESCARTADO')", name="ck_produto_status"),
        sa.CheckConstraint("quantidade >= 0", name="ck_produto_quantidade"),
        sa.CheckConstraint("quantidade_minima IS NULL OR quantidade_minima >= 0", name="ck_produto_minimo"),
        sa.ForeignKeyConstraint(
            ["criado_por"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["dono_id"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["republica_id"],
            ["republica.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("produto", schema=None) as batch_op:
        batch_op.create_index("ix_produto_republica", ["republica_id", "status", "validade"], unique=False)

    op.create_table(
        "turno",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("republica_id", sa.Integer(), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("responsavel_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("concluido_em", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('PENDENTE','CONCLUIDO')", name="ck_turno_status"),
        sa.CheckConstraint("tipo IN ('LIMPEZA','REFEICAO')", name="ck_turno_tipo"),
        sa.ForeignKeyConstraint(
            ["republica_id"],
            ["republica.id"],
        ),
        sa.ForeignKeyConstraint(
            ["responsavel_id"],
            ["usuario.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("republica_id", "data", "tipo", name="uq_turno_dia_tipo"),
    )
    with op.batch_alter_table("turno", schema=None) as batch_op:
        batch_op.create_index("ix_turno_responsavel", ["responsavel_id", "status", "data"], unique=False)

    op.create_table(
        "acerto",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("fechamento_id", sa.Integer(), nullable=False),
        sa.Column("devedor_id", sa.Integer(), nullable=False),
        sa.Column("credor_id", sa.Integer(), nullable=False),
        sa.Column("valor_centavos", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("confirmado_por", sa.Integer(), nullable=True),
        sa.Column("confirmado_em", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('PENDENTE','PAGO','SUBSTITUIDO')", name="ck_acerto_status"),
        sa.CheckConstraint("valor_centavos > 0", name="ck_acerto_valor"),
        sa.ForeignKeyConstraint(
            ["confirmado_por"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["credor_id"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["devedor_id"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["fechamento_id"],
            ["fechamento.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("acerto", schema=None) as batch_op:
        batch_op.create_index("ix_acerto_fechamento", ["fechamento_id", "status"], unique=False)

    op.create_table(
        "consumo",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Float(), nullable=False),
        sa.Column("registrado_em", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("quantidade > 0", name="ck_consumo_quantidade"),
        sa.ForeignKeyConstraint(
            ["produto_id"],
            ["produto.id"],
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("consumo", schema=None) as batch_op:
        batch_op.create_index("ix_consumo_produto", ["produto_id"], unique=False)

    op.create_table(
        "cota",
        sa.Column("compra_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("valor_centavos", sa.Integer(), nullable=False),
        sa.CheckConstraint("valor_centavos >= 0", name="ck_cota_valor"),
        sa.ForeignKeyConstraint(
            ["compra_id"],
            ["compra.id"],
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
        ),
        sa.PrimaryKeyConstraint("compra_id", "usuario_id"),
    )
    with op.batch_alter_table("cota", schema=None) as batch_op:
        batch_op.create_index("ix_cota_usuario", ["usuario_id"], unique=False)

    op.create_table(
        "item_lista",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("republica_id", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(length=80), nullable=False),
        sa.Column("quantidade", sa.Float(), nullable=True),
        sa.Column("unidade", sa.String(length=12), nullable=True),
        sa.Column("produto_id", sa.Integer(), nullable=True),
        sa.Column("origem", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("criado_por", sa.Integer(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("alterado_por", sa.Integer(), nullable=True),
        sa.Column("comprado_por", sa.Integer(), nullable=True),
        sa.Column("comprado_em", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("origem IN ('MANUAL','AUTOMATICA')", name="ck_item_origem"),
        sa.CheckConstraint("status IN ('PENDENTE','COMPRADO')", name="ck_item_status"),
        sa.CheckConstraint("quantidade IS NULL OR quantidade > 0", name="ck_item_quantidade"),
        sa.ForeignKeyConstraint(
            ["alterado_por"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["comprado_por"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["criado_por"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["produto_id"],
            ["produto.id"],
        ),
        sa.ForeignKeyConstraint(
            ["republica_id"],
            ["republica.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("item_lista", schema=None) as batch_op:
        batch_op.create_index("ix_item_lista_republica", ["republica_id", "status"], unique=False)
        batch_op.create_index(
            "ux_item_lista_pendente",
            ["produto_id"],
            unique=True,
            sqlite_where=sa.text("status = 'PENDENTE' AND produto_id IS NOT NULL"),
            postgresql_where=sa.text("status = 'PENDENTE' AND produto_id IS NOT NULL"),
        )

    op.create_table(
        "lote",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Float(), nullable=False),
        sa.Column("validade", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('ATIVO','CONSUMIDO','VENCIDO','DESCARTADO')", name="ck_lote_status"),
        sa.CheckConstraint("quantidade >= 0", name="ck_lote_quantidade"),
        sa.ForeignKeyConstraint(
            ["produto_id"],
            ["produto.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("lote", schema=None) as batch_op:
        batch_op.create_index("ix_lote_produto", ["produto_id", "status", "validade"], unique=False)

    op.create_table(
        "troca",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("republica_id", sa.Integer(), nullable=False),
        sa.Column("turno_solicitante_id", sa.Integer(), nullable=False),
        sa.Column("turno_solicitado_id", sa.Integer(), nullable=False),
        sa.Column("solicitante_id", sa.Integer(), nullable=False),
        sa.Column("solicitado_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decidido_em", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('PENDENTE','ACEITA','RECUSADA','CANCELADA')", name="ck_troca_status"),
        sa.ForeignKeyConstraint(
            ["republica_id"],
            ["republica.id"],
        ),
        sa.ForeignKeyConstraint(
            ["solicitado_id"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(
            ["solicitante_id"],
            ["usuario.id"],
        ),
        sa.ForeignKeyConstraint(["turno_solicitado_id"], ["turno.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["turno_solicitante_id"], ["turno.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("troca", schema=None) as batch_op:
        batch_op.create_index("ix_troca_republica", ["republica_id", "status"], unique=False)


def downgrade() -> None:

    with op.batch_alter_table("troca", schema=None) as batch_op:
        batch_op.drop_index("ix_troca_republica")

    op.drop_table("troca")
    with op.batch_alter_table("lote", schema=None) as batch_op:
        batch_op.drop_index("ix_lote_produto")

    op.drop_table("lote")
    with op.batch_alter_table("item_lista", schema=None) as batch_op:
        batch_op.drop_index(
            "ux_item_lista_pendente",
            sqlite_where=sa.text("status = 'PENDENTE' AND produto_id IS NOT NULL"),
            postgresql_where=sa.text("status = 'PENDENTE' AND produto_id IS NOT NULL"),
        )
        batch_op.drop_index("ix_item_lista_republica")

    op.drop_table("item_lista")
    with op.batch_alter_table("cota", schema=None) as batch_op:
        batch_op.drop_index("ix_cota_usuario")

    op.drop_table("cota")
    with op.batch_alter_table("consumo", schema=None) as batch_op:
        batch_op.drop_index("ix_consumo_produto")

    op.drop_table("consumo")
    with op.batch_alter_table("acerto", schema=None) as batch_op:
        batch_op.drop_index("ix_acerto_fechamento")

    op.drop_table("acerto")
    with op.batch_alter_table("turno", schema=None) as batch_op:
        batch_op.drop_index("ix_turno_responsavel")

    op.drop_table("turno")
    with op.batch_alter_table("produto", schema=None) as batch_op:
        batch_op.drop_index("ix_produto_republica")

    op.drop_table("produto")
    with op.batch_alter_table("notificacao", schema=None) as batch_op:
        batch_op.drop_index("ix_notificacao_usuario")

    op.drop_table("notificacao")
    op.drop_table("fechamento")
    with op.batch_alter_table("compra", schema=None) as batch_op:
        batch_op.drop_index("ix_compra_republica")

    op.drop_table("compra")
    with op.batch_alter_table("auditoria", schema=None) as batch_op:
        batch_op.drop_index("ix_auditoria_republica")

    op.drop_table("auditoria")
    with op.batch_alter_table("usuario", schema=None) as batch_op:
        batch_op.drop_index("ix_usuario_republica")

    op.drop_table("usuario")
    op.drop_table("republica")
