"""RF-06: escala rotativa de limpeza e refeição, conclusão de turnos e trocas bilaterais."""

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import aliased

from app.db.modelos import Troca, Turno, Usuario
from app.dominio.datas import somar_dias
from app.dominio.escala import distribuir_turnos
from app.erros import ErroDominio, conflito, nao_encontrado, proibido
from app.servicos.contexto import Contexto, UsuarioAtual, auditar, exigir_admin, moradores_ativos
from app.servicos.notificacoes import notificar

TIPOS = ("LIMPEZA", "REFEICAO")
_Solicitante = aliased(Usuario)
_Solicitado = aliased(Usuario)


def _rotulo(tipo: str) -> str:
    return "limpeza" if tipo == "LIMPEZA" else "refeição"


def _dto(t: Turno, nome: str, hoje: date) -> dict[str, Any]:
    return {
        "id": t.id,
        "data": t.data.isoformat(),
        "tipo": t.tipo,
        "responsavelId": t.responsavel_id,
        "responsavelNome": nome,
        "status": t.status,
        "atrasado": t.status == "PENDENTE" and t.data < hoje,
    }


def _buscar(ctx: Contexto, u: UsuarioAtual, id_: int) -> tuple[Turno, str]:
    linha = ctx.s.execute(
        select(Turno, Usuario.nome)
        .join(Usuario, Usuario.id == Turno.responsavel_id)
        .where(Turno.id == id_, Turno.republica_id == u.republica_id)
    ).first()
    if linha is None:
        raise nao_encontrado("Turno")
    return linha[0], linha[1]


def listar_turnos(ctx: Contexto, u: UsuarioAtual, de: date, ate: date) -> list[dict[str, Any]]:
    hoje = ctx.relogio.hoje()
    linhas = ctx.s.execute(
        select(Turno, Usuario.nome)
        .join(Usuario, Usuario.id == Turno.responsavel_id)
        .where(Turno.republica_id == u.republica_id, Turno.data.between(de, ate))
        .order_by(Turno.data, Turno.tipo)
    ).all()
    return [_dto(t, n, hoje) for t, n in linhas]


def gerar(ctx: Contexto, u: UsuarioAtual, inicio: date, dias: int, tipos: list[str]) -> dict[str, Any]:
    """Datas que já têm turno são preservadas (inclusive trocas feitas); o rodízio continua do último responsável."""
    exigir_admin(u)
    if inicio < ctx.relogio.hoje():
        raise ErroDominio("DATA_PASSADA", "A escala só pode ser gerada de hoje em diante.")
    moradores = [m.id for m in moradores_ativos(ctx, u.republica_id)]
    fim = somar_dias(inicio, dias - 1)
    criados = 0
    for tipo in dict.fromkeys(tipos):
        ocupadas = set(
            ctx.s.scalars(
                select(Turno.data).where(
                    Turno.republica_id == u.republica_id, Turno.tipo == tipo, Turno.data.between(inicio, fim)
                )
            )
        )
        livres = [d for d in (somar_dias(inicio, i) for i in range(dias)) if d not in ocupadas]
        anterior = ctx.s.scalar(
            select(Turno.responsavel_id)
            .where(Turno.republica_id == u.republica_id, Turno.tipo == tipo, Turno.data < inicio)
            .order_by(Turno.data.desc())
            .limit(1)
        )
        # Sem histórico, a refeição começa defasada da limpeza: a mesma pessoa não acumula os dois turnos do dia.
        ultimo = (
            anterior if anterior is not None else (moradores[0] if tipo == "REFEICAO" and len(moradores) > 1 else None)
        )
        for planejado in distribuir_turnos(livres, moradores, ultimo) if livres else []:
            ctx.s.add(
                Turno(
                    republica_id=u.republica_id,
                    data=planejado.data,
                    tipo=tipo,
                    responsavel_id=planejado.responsavel_id,
                    status="PENDENTE",
                )
            )
            criados += 1
    ctx.s.flush()
    auditar(
        ctx, u, "ESCALA_GERADA", {"inicio": inicio.isoformat(), "dias": dias, "tipos": tipos, "turnosCriados": criados}
    )
    return {"turnosCriados": criados, "turnos": listar_turnos(ctx, u, inicio, fim)}


def concluir(ctx: Contexto, u: UsuarioAtual, id_: int) -> dict[str, Any]:
    """RF-06.2: só o responsável, nunca antes do dia do turno, uma única vez."""
    hoje = ctx.relogio.hoje()
    t, nome = _buscar(ctx, u, id_)
    if t.responsavel_id != u.id:
        raise proibido("NAO_RESPONSAVEL", "Apenas o responsável pelo turno pode marcá-lo como cumprido.")
    if t.status != "PENDENTE":
        raise conflito("TURNO_JA_CONCLUIDO", "Este turno já foi concluído.")
    if t.data > hoje:
        raise ErroDominio("TURNO_FUTURO", "Não é possível concluir um turno antes do dia marcado.")
    t.status = "CONCLUIDO"
    t.concluido_em = ctx.relogio.agora()
    ctx.s.flush()
    return _dto(t, nome, hoje)


def _trocavel(t: Turno, hoje: date) -> bool:
    """Só turnos pendentes a partir de amanhã: a troca precisa ser decidida até a véspera."""
    return t.status == "PENDENTE" and t.data > hoje


def _buscar_troca(ctx: Contexto, u: UsuarioAtual, id_: int) -> Troca:
    troca = ctx.s.scalar(select(Troca).where(Troca.id == id_, Troca.republica_id == u.republica_id))
    if troca is None:
        raise nao_encontrado("Solicitação de troca")
    return troca


def _troca_dto(ctx: Contexto, u: UsuarioAtual, troca: Troca) -> dict[str, Any]:
    hoje = ctx.relogio.hoje()
    a, na = _buscar(ctx, u, troca.turno_solicitante_id)
    b, nb = _buscar(ctx, u, troca.turno_solicitado_id)
    nomes = dict(
        ctx.s.execute(
            select(Usuario.id, Usuario.nome).where(Usuario.id.in_((troca.solicitante_id, troca.solicitado_id)))
        )
        .tuples()
        .all()
    )
    return {
        "id": troca.id,
        "status": troca.status,
        "solicitanteId": troca.solicitante_id,
        "solicitanteNome": nomes[troca.solicitante_id],
        "solicitadoId": troca.solicitado_id,
        "solicitadoNome": nomes[troca.solicitado_id],
        "turnoSolicitante": _dto(a, na, hoje),
        "turnoSolicitado": _dto(b, nb, hoje),
    }


def solicitar_troca(ctx: Contexto, u: UsuarioAtual, meu_id: int, outro_id: int) -> dict[str, Any]:
    """RF-06.3: um morador propõe trocar um turno seu pelo turno de outro morador."""
    hoje = ctx.relogio.hoje()
    meu, _ = _buscar(ctx, u, meu_id)
    outro, _ = _buscar(ctx, u, outro_id)
    if meu.responsavel_id != u.id:
        raise proibido("NAO_RESPONSAVEL", "Você só pode oferecer em troca um turno que é seu.")
    if outro.responsavel_id == u.id:
        raise ErroDominio("TROCA_INVALIDA", "O turno desejado já é seu.")
    ids = (meu_id, outro_id)
    aberto = ctx.s.scalar(
        select(Troca.id).where(
            Troca.status == "PENDENTE", Troca.turno_solicitante_id.in_(ids) | Troca.turno_solicitado_id.in_(ids)
        )
    )
    if aberto is not None:
        raise conflito("TROCA_EM_ABERTO", "Já existe uma solicitação de troca em aberto envolvendo um destes turnos.")
    if not _trocavel(meu, hoje) or not _trocavel(outro, hoje):
        raise ErroDominio(
            "TROCA_INVALIDA",
            "Só se trocam turnos pendentes a partir de amanhã; turnos de hoje ou já passados não mudam.",
        )
    troca = Troca(
        republica_id=u.republica_id,
        turno_solicitante_id=meu_id,
        turno_solicitado_id=outro_id,
        solicitante_id=u.id,
        solicitado_id=outro.responsavel_id,
        status="PENDENTE",
        criado_em=ctx.relogio.agora(),
    )
    ctx.s.add(troca)
    ctx.s.flush()
    notificar(
        ctx,
        outro.responsavel_id,
        "TROCA",
        f"{u.nome} quer trocar o turno de {_rotulo(meu.tipo)} de {meu.data} pelo seu de {_rotulo(outro.tipo)} de {outro.data}.",
        f"troca:{troca.id}",
    )
    return _troca_dto(ctx, u, troca)


def responder_troca(ctx: Contexto, u: UsuarioAtual, id_: int, aceitar: bool) -> dict[str, Any]:
    """RF-06.4 / RB-11: com o aceite do convidado, os responsáveis são trocados; a recusa mantém tudo."""
    hoje = ctx.relogio.hoje()
    troca = _buscar_troca(ctx, u, id_)
    if troca.solicitado_id != u.id:
        raise proibido("SEM_PERMISSAO", "Apenas o morador convidado para a troca pode respondê-la.")
    if troca.status != "PENDENTE":
        raise conflito("TROCA_JA_DECIDIDA", "Esta solicitação de troca não está mais em aberto.")
    if aceitar:
        a, _ = _buscar(ctx, u, troca.turno_solicitante_id)
        b, _ = _buscar(ctx, u, troca.turno_solicitado_id)
        ativos = {m.id for m in moradores_ativos(ctx, u.republica_id)}
        valida = (
            _trocavel(a, hoje)
            and _trocavel(b, hoje)
            and a.responsavel_id == troca.solicitante_id
            and b.responsavel_id == troca.solicitado_id
            and {troca.solicitante_id, troca.solicitado_id} <= ativos
        )
        if not valida:
            troca.status = "CANCELADA"
            troca.decidido_em = ctx.relogio.agora()
            ctx.s.commit()  # o cancelamento vale mesmo com a resposta de erro
            raise conflito("TROCA_EXPIRADA", "Os turnos mudaram desde o pedido; a solicitação foi cancelada.")
        a.responsavel_id, b.responsavel_id = troca.solicitado_id, troca.solicitante_id
    troca.status = "ACEITA" if aceitar else "RECUSADA"
    troca.decidido_em = ctx.relogio.agora()
    ctx.s.flush()
    verbo = "aceitou" if aceitar else "recusou"
    notificar(
        ctx,
        troca.solicitante_id,
        "TROCA",
        f"{u.nome} {verbo} sua solicitação de troca de turno.",
        f"troca-resposta:{id_}",
    )
    if aceitar:
        notificar(
            ctx,
            troca.solicitado_id,
            "TROCA",
            "Troca de turno confirmada; o calendário foi atualizado.",
            f"troca-confirmada:{id_}",
        )
    return _troca_dto(ctx, u, troca)


def cancelar_troca(ctx: Contexto, u: UsuarioAtual, id_: int) -> dict[str, Any]:
    troca = _buscar_troca(ctx, u, id_)
    if troca.solicitante_id != u.id:
        raise proibido("SEM_PERMISSAO", "Apenas quem solicitou a troca pode cancelá-la.")
    if troca.status != "PENDENTE":
        raise conflito("TROCA_JA_DECIDIDA", "Esta solicitação de troca não está mais em aberto.")
    troca.status = "CANCELADA"
    troca.decidido_em = ctx.relogio.agora()
    ctx.s.flush()
    return _troca_dto(ctx, u, troca)


def listar_trocas(ctx: Contexto, u: UsuarioAtual) -> list[dict[str, Any]]:
    """Trocas em aberto em que o usuário é parte."""
    trocas = ctx.s.scalars(
        select(Troca)
        .where(
            Troca.republica_id == u.republica_id,
            Troca.status == "PENDENTE",
            (Troca.solicitante_id == u.id) | (Troca.solicitado_id == u.id),
        )
        .order_by(Troca.id.desc())
    )
    return [_troca_dto(ctx, u, t) for t in trocas]
