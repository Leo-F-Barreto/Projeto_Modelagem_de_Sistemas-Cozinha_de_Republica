"""República, moradores e auditoria (RF-07.3, RF-07.4, RB-12, RB-13)."""

import json
from typing import Any

from sqlalchemy import delete, func, select, update

from app.db.modelos import Auditoria, Compra, Republica, Troca, Turno, Usuario
from app.erros import ErroDominio, conflito, nao_encontrado
from app.servicos.auth import gerar_codigo_convite
from app.servicos.contexto import Contexto, UsuarioAtual, auditar, exigir_admin, instante
from app.servicos.financas import calcular_saldos


def obter(ctx: Contexto, u: UsuarioAtual) -> dict[str, Any]:
    rep = ctx.s.get(Republica, u.republica_id)
    assert rep is not None
    admin = u.perfil == "ADMIN"
    membros = ctx.s.scalars(
        select(Usuario).where(Usuario.republica_id == u.republica_id).order_by(Usuario.ativo.desc(), Usuario.nome)
    )
    dto: dict[str, Any] = {
        "id": rep.id,
        "nome": rep.nome,
        "membros": [
            {"id": m.id, "nome": m.nome, "perfil": m.perfil, "ativo": m.ativo, **({"email": m.email} if admin else {})}
            for m in membros
        ],
    }
    # O código de convite dá acesso à casa: só o administrador o enxerga.
    if admin:
        dto["codigoConvite"] = rep.codigo_convite
    return dto


def regenerar_convite(ctx: Contexto, u: UsuarioAtual) -> dict[str, Any]:
    exigir_admin(u)
    rep = ctx.s.get(Republica, u.republica_id)
    assert rep is not None
    rep.codigo_convite = gerar_codigo_convite()
    ctx.s.flush()
    auditar(ctx, u, "CONVITE_REGENERADO", {})
    return {"codigoConvite": rep.codigo_convite}


def alterar_morador(ctx: Contexto, u: UsuarioAtual, id_: int, perfil: str | None, ativo: bool | None) -> dict[str, Any]:
    """RB-12: a república nunca fica sem administrador ativo.
    RB-13: inativar é lógico; quem tem saldo ou compra pendente precisa acertar antes.
    Ao inativar, os turnos futuros pendentes saem da escala e as trocas abertas são canceladas."""
    exigir_admin(u)
    alvo = ctx.s.scalar(select(Usuario).where(Usuario.id == id_, Usuario.republica_id == u.republica_id))
    if alvo is None:
        raise nao_encontrado("Morador")
    novo_perfil = perfil or alvo.perfil
    novo_ativo = alvo.ativo if ativo is None else ativo

    if alvo.perfil == "ADMIN" and alvo.ativo and not (novo_perfil == "ADMIN" and novo_ativo):
        outros = (
            ctx.s.scalar(
                select(func.count()).where(
                    Usuario.republica_id == u.republica_id,
                    Usuario.perfil == "ADMIN",
                    Usuario.ativo.is_(True),
                    Usuario.id != id_,
                )
            )
            or 0
        )
        if outros == 0:
            raise conflito(
                "ULTIMO_ADMIN", "A república precisa de ao menos um administrador ativo. Promova outro morador antes."
            )

    if alvo.ativo and not novo_ativo:
        saldo = next(s["saldoCentavos"] for s in calcular_saldos(ctx, u.republica_id) if s["usuarioId"] == id_)
        if saldo != 0:
            lado = "credor" if saldo > 0 else "devedor"
            raise ErroDominio(
                "SALDO_PENDENTE",
                f"{alvo.nome} tem saldo {lado} em aberto. Faça o fechamento e confirme os acertos antes de desativá-lo.",
            )
        pendentes = ctx.s.scalar(select(func.count()).where(Compra.pagador_id == id_, Compra.status == "PENDENTE")) or 0
        if pendentes:
            raise ErroDominio(
                "COMPRAS_PENDENTES", f"{alvo.nome} tem compras aguardando aprovação. Decida-as antes de desativá-lo."
            )
        hoje = ctx.relogio.hoje()
        ctx.s.execute(
            update(Troca)
            .where(Troca.status == "PENDENTE", (Troca.solicitante_id == id_) | (Troca.solicitado_id == id_))
            .values(status="CANCELADA", decidido_em=ctx.relogio.agora())
        )
        ctx.s.execute(delete(Turno).where(Turno.responsavel_id == id_, Turno.status == "PENDENTE", Turno.data >= hoje))

    alvo.perfil = novo_perfil
    alvo.ativo = novo_ativo
    ctx.s.flush()
    auditar(ctx, u, "MORADOR_ALTERADO", {"moradorId": id_, "perfil": novo_perfil, "ativo": novo_ativo})
    return {"id": id_, "nome": alvo.nome, "perfil": novo_perfil, "ativo": novo_ativo}


def listar_auditoria(ctx: Contexto, u: UsuarioAtual) -> list[dict[str, Any]]:
    exigir_admin(u)
    linhas = ctx.s.execute(
        select(Auditoria, Usuario.nome)
        .join(Usuario, Usuario.id == Auditoria.usuario_id)
        .where(Auditoria.republica_id == u.republica_id)
        .order_by(Auditoria.id.desc())
        .limit(100)
    )
    return [
        {
            "id": a.id,
            "acao": a.acao,
            "detalhe": json.loads(a.detalhe),
            "usuario": nome,
            "criadoEm": instante(a.criado_em),
        }
        for a, nome in linhas
    ]
