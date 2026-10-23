"""RF-05: compras coletivas, rateio, balanço, fechamento mensal e confirmação de acertos."""

from datetime import date
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import aliased

from app.db.modelos import Acerto, Compra, Cota, Fechamento, Usuario
from app.dominio.acerto import simplificar_dividas
from app.dominio.datas import eh_periodo, periodo_de, ultimo_dia_do_periodo
from app.dominio.rateio import ratear
from app.erros import ErroDominio, conflito, invalido, nao_encontrado, proibido
from app.servicos.contexto import Contexto, UsuarioAtual, auditar, exigir_admin, instante, moradores_ativos, reais
from app.servicos.notificacoes import notificar, notificar_admins

_Pagador = aliased(Usuario)
_Registrador = aliased(Usuario)
_Devedor = aliased(Usuario)
_Credor = aliased(Usuario)


def _consulta_compras():  # type: ignore[no-untyped-def]
    return (
        select(Compra, _Pagador.nome, _Registrador.nome)
        .join(_Pagador, _Pagador.id == Compra.pagador_id)
        .join(_Registrador, _Registrador.id == Compra.registrada_por)
    )


def _cotas(ctx: Contexto, compra_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    por_compra: dict[int, list[dict[str, Any]]] = {i: [] for i in compra_ids}
    if compra_ids:
        linhas = ctx.s.execute(
            select(Cota.compra_id, Cota.usuario_id, Usuario.nome, Cota.valor_centavos)
            .join(Usuario, Usuario.id == Cota.usuario_id)
            .where(Cota.compra_id.in_(compra_ids))
            .order_by(Usuario.id)
        )
        for compra_id, usuario_id, nome, valor in linhas:
            por_compra[compra_id].append({"usuarioId": usuario_id, "nome": nome, "valorCentavos": valor})
    return por_compra


def _dto(c: Compra, pagador: str, registrador: str, cotas: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": c.id,
        "descricao": c.descricao,
        "valorCentavos": c.valor_centavos,
        "data": c.data.isoformat(),
        "status": c.status,
        "pagadorId": c.pagador_id,
        "pagadorNome": pagador,
        "registradaPor": c.registrada_por,
        "registradorNome": registrador,
        "motivoRejeicao": c.motivo_rejeicao,
        "cotas": cotas,
    }


def _buscar(ctx: Contexto, u: UsuarioAtual, id_: int) -> tuple[Compra, str, str]:
    linha = ctx.s.execute(_consulta_compras().where(Compra.id == id_, Compra.republica_id == u.republica_id)).first()
    if linha is None:
        raise nao_encontrado("Compra")
    return linha[0], linha[1], linha[2]


def _compra_dto(ctx: Contexto, u: UsuarioAtual, id_: int) -> dict[str, Any]:
    c, p, r = _buscar(ctx, u, id_)
    return _dto(c, p, r, _cotas(ctx, [c.id])[c.id])


def _periodo_fechado(ctx: Contexto, republica_id: int, data: date) -> bool:
    return (
        ctx.s.scalar(
            select(Fechamento.id).where(Fechamento.republica_id == republica_id, Fechamento.periodo == periodo_de(data))
        )
        is not None
    )


def _lancar_rateio(ctx: Contexto, compra: Compra) -> None:
    """RB-02 / EX-05.3: rateio entre quem está ativo no momento da efetivação."""
    ativos = [m.id for m in moradores_ativos(ctx, compra.republica_id)]
    if not ativos:
        raise ErroDominio("SEM_MORADORES_ATIVOS", "Não há moradores ativos para dividir a despesa.")
    if compra.pagador_id not in ativos:
        raise conflito("PAGADOR_INATIVO", "O pagador não é mais um morador ativo; a compra não pode ser efetivada.")
    for usuario_id, valor in ratear(compra.valor_centavos, ativos, compra.pagador_id).items():
        ctx.s.add(Cota(compra_id=compra.id, usuario_id=usuario_id, valor_centavos=valor))
    ctx.s.flush()


def registrar(
    ctx: Contexto, u: UsuarioAtual, descricao: str, valor_centavos: int, pagador_id: int, data: date
) -> dict[str, Any]:
    """RF-05.1: registrada pelo administrador, a compra é efetivada na hora; por morador, fica PENDENTE."""
    if data > ctx.relogio.hoje():
        raise ErroDominio("DATA_FUTURA", "A data da compra não pode estar no futuro.")
    if _periodo_fechado(ctx, u.republica_id, data):
        raise conflito("PERIODO_FECHADO", f"O mês {periodo_de(data)} já foi fechado e não aceita novos lançamentos.")
    pagador = ctx.s.scalar(
        select(Usuario.id).where(
            Usuario.id == pagador_id, Usuario.republica_id == u.republica_id, Usuario.ativo.is_(True)
        )
    )
    if pagador is None:
        raise ErroDominio("PAGADOR_INVALIDO", "O pagador deve ser um morador ativo desta república.")
    na_hora = u.perfil == "ADMIN"
    agora = ctx.relogio.agora()
    compra = Compra(
        republica_id=u.republica_id,
        descricao=descricao,
        valor_centavos=valor_centavos,
        pagador_id=pagador_id,
        data=data,
        status="APROVADA" if na_hora else "PENDENTE",
        registrada_por=u.id,
        decidida_por=u.id if na_hora else None,
        decidida_em=agora if na_hora else None,
        criado_em=agora,
    )
    ctx.s.add(compra)
    ctx.s.flush()
    if na_hora:
        _lancar_rateio(ctx, compra)
        auditar(
            ctx,
            u,
            "COMPRA_REGISTRADA_E_APROVADA",
            {"compraId": compra.id, "valorCentavos": valor_centavos, "pagadorId": pagador_id},
        )
    else:
        notificar_admins(
            ctx,
            u.republica_id,
            "COMPRA_PENDENTE",
            f'{u.nome} registrou a compra "{descricao}" e aguarda aprovação.',
            f"compra-pendente:{compra.id}",
        )
    return _compra_dto(ctx, u, compra.id)


def decidir(ctx: Contexto, u: UsuarioAtual, id_: int, aprovar: bool, motivo: str | None) -> dict[str, Any]:
    """Aprovação pelo administrador. Só a aprovação gera rateio; rejeitar exige motivo."""
    exigir_admin(u)
    compra, _, _ = _buscar(ctx, u, id_)
    if compra.status != "PENDENTE":
        raise conflito("COMPRA_JA_DECIDIDA", "Esta compra já foi aprovada ou rejeitada.")
    if aprovar:
        if _periodo_fechado(ctx, u.republica_id, compra.data):
            raise conflito(
                "PERIODO_FECHADO",
                f"O mês {periodo_de(compra.data)} já foi fechado; rejeite a compra ou registre-a com outra data.",
            )
        _lancar_rateio(ctx, compra)
    elif not motivo:
        raise invalido("Informe o motivo da rejeição.", "MOTIVO_OBRIGATORIO")
    compra.status = "APROVADA" if aprovar else "REJEITADA"
    compra.decidida_por = u.id
    compra.decidida_em = ctx.relogio.agora()
    compra.motivo_rejeicao = None if aprovar else motivo
    ctx.s.flush()
    auditar(ctx, u, "COMPRA_APROVADA" if aprovar else "COMPRA_REJEITADA", {"compraId": id_, "motivo": motivo})
    texto = (
        f'Sua compra "{compra.descricao}" foi aprovada e entrou no rateio.'
        if aprovar
        else f'Sua compra "{compra.descricao}" foi rejeitada: {motivo}'
    )
    notificar(ctx, compra.registrada_por, "COMPRA_DECIDIDA", texto, f"compra-decidida:{id_}")
    return _compra_dto(ctx, u, id_)


def listar(ctx: Contexto, u: UsuarioAtual) -> list[dict[str, Any]]:
    linhas = ctx.s.execute(
        _consulta_compras()
        .where(Compra.republica_id == u.republica_id)
        .order_by(case((Compra.status == "PENDENTE", 0), else_=1), Compra.data.desc(), Compra.id.desc())
        .limit(200)
    ).all()
    cotas = _cotas(ctx, [c.id for c, _, _ in linhas])
    return [_dto(c, p, r, cotas[c.id]) for c, p, r in linhas]


def calcular_saldos(ctx: Contexto, republica_id: int) -> list[dict[str, Any]]:
    """Glossário "Saldo Devedor / Credor": pago em compras aprovadas − próprias cotas, corrigido pelos acertos pagos.
    RB-03: por ser um saldo líquido único, toda dívida anterior é compensada antes de surgir crédito."""
    pago = (
        select(func.coalesce(func.sum(Compra.valor_centavos), 0))
        .where(Compra.pagador_id == Usuario.id, Compra.status == "APROVADA")
        .scalar_subquery()
    )
    cotas = (
        select(func.coalesce(func.sum(Cota.valor_centavos), 0)).where(Cota.usuario_id == Usuario.id).scalar_subquery()
    )
    pagou_acerto = (
        select(func.coalesce(func.sum(Acerto.valor_centavos), 0))
        .where(Acerto.devedor_id == Usuario.id, Acerto.status == "PAGO")
        .scalar_subquery()
    )
    recebeu_acerto = (
        select(func.coalesce(func.sum(Acerto.valor_centavos), 0))
        .where(Acerto.credor_id == Usuario.id, Acerto.status == "PAGO")
        .scalar_subquery()
    )
    linhas = ctx.s.execute(
        select(Usuario.id, Usuario.nome, Usuario.ativo, pago - cotas + pagou_acerto - recebeu_acerto)
        .where(Usuario.republica_id == republica_id)
        .order_by(Usuario.id)
    ).all()
    return [{"usuarioId": i, "nome": n, "ativo": bool(a), "saldoCentavos": int(s)} for i, n, a, s in linhas]


def _transferencias(saldos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nomes = {s["usuarioId"]: s["nome"] for s in saldos}
    return [
        {
            "devedorId": t.devedor_id,
            "credorId": t.credor_id,
            "valorCentavos": t.valor_centavos,
            "devedorNome": nomes[t.devedor_id],
            "credorNome": nomes[t.credor_id],
        }
        for t in simplificar_dividas({s["usuarioId"]: s["saldoCentavos"] for s in saldos})
    ]


def _acertos(ctx: Contexto, fechamento_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    por: dict[int, list[dict[str, Any]]] = {i: [] for i in fechamento_ids}
    if fechamento_ids:
        linhas = ctx.s.execute(
            select(Acerto, _Devedor.nome, _Credor.nome)
            .join(_Devedor, _Devedor.id == Acerto.devedor_id)
            .join(_Credor, _Credor.id == Acerto.credor_id)
            .where(Acerto.fechamento_id.in_(fechamento_ids))
            .order_by(Acerto.id)
        )
        for a, devedor, credor in linhas:
            por[a.fechamento_id].append(_acerto_dto(a, devedor, credor))
    return por


def _acerto_dto(a: Acerto, devedor: str, credor: str) -> dict[str, Any]:
    return {
        "id": a.id,
        "devedorId": a.devedor_id,
        "devedorNome": devedor,
        "credorId": a.credor_id,
        "credorNome": credor,
        "valorCentavos": a.valor_centavos,
        "status": a.status,
        "confirmadoEm": instante(a.confirmado_em),
    }


def balanco(ctx: Contexto, u: UsuarioAtual) -> dict[str, Any]:
    """RF-05.4: "quem deve para quem"."""
    saldos = calcular_saldos(ctx, u.republica_id)
    fechamentos = ctx.s.execute(
        select(Fechamento, Usuario.nome)
        .join(Usuario, Usuario.id == Fechamento.fechado_por)
        .where(Fechamento.republica_id == u.republica_id)
        .order_by(Fechamento.periodo.desc())
    ).all()
    acertos = _acertos(ctx, [f.id for f, _ in fechamentos])
    return {
        "saldos": saldos,
        "transferenciasSugeridas": _transferencias(saldos),
        "fechamentos": [
            {
                "id": f.id,
                "periodo": f.periodo,
                "fechadoEm": instante(f.fechado_em),
                "fechadoPor": nome,
                "acertos": acertos[f.id],
            }
            for f, nome in fechamentos
        ],
    }


def fechar_periodo(ctx: Contexto, u: UsuarioAtual, periodo: str) -> dict[str, Any]:
    """RF-05.5: congela o mês e transforma os saldos correntes em acertos a pagar.
    Acertos pendentes de fechamentos anteriores são substituídos, pois o saldo corrente já os contém."""
    exigir_admin(u)
    if not eh_periodo(periodo):
        raise invalido("Período deve estar no formato AAAA-MM.")
    if periodo > periodo_de(ctx.relogio.hoje()):
        raise ErroDominio("PERIODO_FUTURO", "Não é possível fechar um mês que ainda não começou.")
    if ctx.s.scalar(
        select(Fechamento.id).where(Fechamento.republica_id == u.republica_id, Fechamento.periodo == periodo)
    ):
        raise conflito("PERIODO_FECHADO", f"O mês {periodo} já foi fechado.")
    pendentes = (
        ctx.s.scalar(
            select(func.count()).where(
                Compra.republica_id == u.republica_id,
                Compra.status == "PENDENTE",
                Compra.data <= ultimo_dia_do_periodo(periodo),
            )
        )
        or 0
    )
    if pendentes:
        raise conflito(
            "COMPRAS_PENDENTES",
            f"Há {pendentes} compra(s) aguardando aprovação até {periodo}. Decida-as antes de fechar o mês.",
        )
    anteriores = select(Fechamento.id).where(Fechamento.republica_id == u.republica_id)
    for a in ctx.s.scalars(select(Acerto).where(Acerto.status == "PENDENTE", Acerto.fechamento_id.in_(anteriores))):
        a.status = "SUBSTITUIDO"
    f = Fechamento(republica_id=u.republica_id, periodo=periodo, fechado_por=u.id, fechado_em=ctx.relogio.agora())
    ctx.s.add(f)
    ctx.s.flush()
    transferencias = _transferencias(calcular_saldos(ctx, u.republica_id))
    for t in transferencias:
        a = Acerto(
            fechamento_id=f.id,
            devedor_id=t["devedorId"],
            credor_id=t["credorId"],
            valor_centavos=t["valorCentavos"],
            status="PENDENTE",
        )
        ctx.s.add(a)
        ctx.s.flush()
        notificar(
            ctx,
            t["devedorId"],
            "ACERTO",
            f"Fechamento de {periodo}: você deve {reais(t['valorCentavos'])} para {t['credorNome']}.",
            f"acerto:{a.id}",
        )
    auditar(ctx, u, "PERIODO_FECHADO", {"periodo": periodo, "acertos": len(transferencias)})
    return {"id": f.id, "periodo": periodo, "acertos": _acertos(ctx, [f.id])[f.id]}


def confirmar_acerto(ctx: Contexto, u: UsuarioAtual, id_: int) -> dict[str, Any]:
    """O pagamento acontece fora do sistema (PIX, dinheiro). Confirma quem recebeu ou o administrador; nunca o devedor."""
    linha = ctx.s.execute(
        select(Acerto, _Devedor.nome, _Credor.nome)
        .join(_Devedor, _Devedor.id == Acerto.devedor_id)
        .join(_Credor, _Credor.id == Acerto.credor_id)
        .join(Fechamento, Fechamento.id == Acerto.fechamento_id)
        .where(Acerto.id == id_, Fechamento.republica_id == u.republica_id)
    ).first()
    if linha is None:
        raise nao_encontrado("Acerto")
    a, devedor, credor = linha
    if u.id != a.credor_id and u.perfil != "ADMIN":
        raise proibido("SEM_PERMISSAO", "Apenas quem recebe o pagamento ou o administrador pode confirmá-lo.")
    if u.id == a.devedor_id:
        raise proibido("DEVEDOR_NAO_CONFIRMA", "O devedor não pode confirmar o próprio pagamento.")
    if a.status != "PENDENTE":
        raise conflito("ACERTO_NAO_PENDENTE", "Este acerto já foi pago ou substituído por um fechamento mais recente.")
    a.status = "PAGO"
    a.confirmado_por = u.id
    a.confirmado_em = ctx.relogio.agora()
    ctx.s.flush()
    auditar(ctx, u, "ACERTO_CONFIRMADO", {"acertoId": id_, "valorCentavos": a.valor_centavos})
    notificar(
        ctx,
        a.devedor_id,
        "ACERTO",
        f"{credor} recebeu seu pagamento de {reais(a.valor_centavos)}.",
        f"acerto-pago:{id_}",
    )
    return _acerto_dto(a, devedor, credor)


def compras_pendentes(ctx: Contexto, republica_id: int) -> int:
    return (
        ctx.s.scalar(select(func.count()).where(Compra.republica_id == republica_id, Compra.status == "PENDENTE")) or 0
    )
