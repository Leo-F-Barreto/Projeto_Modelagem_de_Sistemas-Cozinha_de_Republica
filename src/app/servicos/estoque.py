"""RF-01 a RF-03 e T-46: estoque por lotes, consumo FEFO, reposição e descarte."""

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import aliased

from app.db.modelos import Consumo, Lote, Produto, Usuario
from app.dominio import lotes as regras_lotes
from app.dominio.datas import dias_entre
from app.dominio.validade import estado_validade
from app.erros import ErroDominio, conflito, nao_encontrado, proibido
from app.servicos.contexto import Contexto, UsuarioAtual, auditar, instante
from app.servicos.lista import concluir_sugestao, sugerir_reposicao
from app.servicos.rotinas import executar_rotinas, recalcular

log = logging.getLogger("cochef")
_Dono = aliased(Usuario)


def arredondar(n: float) -> float:
    return round(n, 3)


def _lotes_ativos(ctx: Contexto, produto_id: int) -> list[Lote]:
    return list(
        ctx.s.scalars(select(Lote).where(Lote.produto_id == produto_id, Lote.status == "ATIVO", Lote.quantidade > 0))
    )


def _dto(
    ctx: Contexto, p: Produto, dono_nome: str | None, u: UsuarioAtual, hoje: date, lotes: list[Lote] | None = None
) -> dict[str, Any]:
    if lotes is None:
        lotes = _lotes_ativos(ctx, p.id) if p.status in ("ATIVO", "ESGOTADO") else []
    lotes = sorted(
        lotes, key=lambda lote: regras_lotes.ordem_fefo(regras_lotes.Lote(lote.id, lote.quantidade, lote.validade))
    )
    return {
        "id": p.id,
        "nome": p.nome,
        "quantidade": p.quantidade,
        "unidade": p.unidade,
        "validade": p.validade.isoformat() if p.validade else None,
        "compartimento": p.compartimento,
        "classificacao": p.classificacao,
        "donoId": p.dono_id,
        "donoNome": dono_nome,
        "quantidadeMinima": p.quantidade_minima,
        "status": p.status,
        "estadoValidade": estado_validade(p.validade, hoje),
        "diasParaVencer": None if p.validade is None else dias_entre(hoje, p.validade),
        "abaixoDoMinimo": p.quantidade_minima is not None and p.quantidade <= p.quantidade_minima,
        # RB-01: a interface usa isto para esconder ações; o servidor revalida.
        "meu": p.classificacao == "COLETIVO" or p.dono_id == u.id,
        "lotes": [
            {
                "id": lote.id,
                "quantidade": lote.quantidade,
                "validade": lote.validade.isoformat() if lote.validade else None,
            }
            for lote in lotes
        ],
        "conferidoEm": instante(p.conferido_em),
    }


def _buscar(ctx: Contexto, u: UsuarioAtual, id_: int, *, travar: bool = False) -> tuple[Produto, str | None]:
    consulta = (
        select(Produto, _Dono.nome)
        .outerjoin(_Dono, _Dono.id == Produto.dono_id)
        .where(Produto.id == id_, Produto.republica_id == u.republica_id)
    )
    if travar:
        # RNF-02.1: trava a linha do produto durante a baixa (efetivo no PostgreSQL).
        consulta = consulta.with_for_update(of=Produto)
    linha = ctx.s.execute(consulta).first()
    if linha is None:
        raise nao_encontrado("Produto")
    return linha[0], linha[1]


def _exigir_propriedade(p: Produto, dono_nome: str | None, u: UsuarioAtual) -> None:
    """RB-01 / RF-07: só o dono movimenta um item individual."""
    if p.classificacao == "INDIVIDUAL" and p.dono_id != u.id:
        raise proibido(
            "PROPRIEDADE_INDIVIDUAL",
            f"Ação não permitida: este item é de uso individual e pertence exclusivamente a {dono_nome or 'outro morador'}.",
        )


def _verificar_minimo(ctx: Contexto, p: Produto) -> None:
    """RF-04.1: coletivo no mínimo de segurança (ou abaixo, ou vencido) entra na lista de compras."""
    if p.classificacao != "COLETIVO" or p.quantidade_minima is None or p.status == "DESCARTADO":
        return
    if p.status == "VENCIDO" or p.quantidade <= p.quantidade_minima:
        sugerir_reposicao(ctx, p)


def listar(
    ctx: Contexto, u: UsuarioAtual, incluir_inativos: bool, filtros: dict[str, str | None] | None = None
) -> list[dict[str, Any]]:
    executar_rotinas(ctx, u.republica_id)
    hoje = ctx.relogio.hoje()
    consulta = (
        select(Produto, _Dono.nome)
        .outerjoin(_Dono, _Dono.id == Produto.dono_id)
        .where(Produto.republica_id == u.republica_id)
    )
    if not incluir_inativos:
        consulta = consulta.where(Produto.status.in_(("ATIVO", "ESGOTADO")))
    filtros = filtros or {}
    if filtros.get("classificacao"):
        consulta = consulta.where(Produto.classificacao == filtros["classificacao"])
    if filtros.get("compartimento"):
        consulta = consulta.where(Produto.compartimento.ilike(f"%{filtros['compartimento']}%"))
    consulta = consulta.order_by(Produto.status, Produto.validade.is_(None), Produto.validade, Produto.nome)
    linhas = ctx.s.execute(consulta).all()

    # Uma única consulta para todos os lotes (evita N+1).
    ids = [p.id for p, _ in linhas if p.status in ("ATIVO", "ESGOTADO")]
    por_produto: dict[int, list[Lote]] = {i: [] for i in ids}
    if ids:
        for lote in ctx.s.scalars(
            select(Lote).where(Lote.produto_id.in_(ids), Lote.status == "ATIVO", Lote.quantidade > 0)
        ):
            por_produto[lote.produto_id].append(lote)
    dtos = [_dto(ctx, p, nome, u, hoje, por_produto.get(p.id, [])) for p, nome in linhas]
    if filtros.get("estado"):
        dtos = [d for d in dtos if d["estadoValidade"] == filtros["estado"]]
    return dtos


def cadastrar(ctx: Contexto, u: UsuarioAtual, dados: dict[str, Any]) -> dict[str, Any]:
    """RF-01.1 a RF-01.3 e RF-17: cadastro e classificação; a quantidade inicial vira o primeiro lote."""
    hoje = ctx.relogio.hoje()
    validade: date | None = dados.get("validade")
    if validade is not None and validade < hoje:
        raise ErroDominio("VALIDADE_PASSADA", "Não é possível cadastrar um produto que já está vencido.")
    if dados["classificacao"] == "INDIVIDUAL" and dados.get("quantidade_minima") is not None:
        raise ErroDominio("MINIMO_APENAS_COLETIVO", "Quantidade mínima só se aplica a itens de uso coletivo.")
    agora = ctx.relogio.agora()
    p = Produto(
        republica_id=u.republica_id,
        nome=dados["nome"],
        quantidade=arredondar(dados["quantidade"]),
        unidade=dados["unidade"],
        validade=validade,
        compartimento=dados["compartimento"],
        classificacao=dados["classificacao"],
        dono_id=u.id if dados["classificacao"] == "INDIVIDUAL" else None,
        quantidade_minima=dados.get("quantidade_minima"),
        status="ATIVO",
        criado_por=u.id,
        criado_em=agora,
        conferido_em=agora,
    )
    ctx.s.add(p)
    ctx.s.flush()
    ctx.s.add(Lote(produto_id=p.id, quantidade=p.quantidade, validade=validade, status="ATIVO", criado_em=agora))
    ctx.s.flush()
    _verificar_minimo(ctx, p)
    p, dono = _buscar(ctx, u, p.id)
    return _dto(ctx, p, dono, u, hoje)


def consumir(ctx: Contexto, u: UsuarioAtual, id_: int, quantidade: float) -> dict[str, Any]:
    """RF-02 (baixa), RF-07 (item alheio), RB-04 (vencido não é consumível) e RB-11 (FEFO)."""
    executar_rotinas(ctx, u.republica_id)
    p, dono = _buscar(ctx, u, id_, travar=True)
    try:
        _exigir_propriedade(p, dono, u)
    except ErroDominio:
        # EX-02.1: a tentativa indevida fica registrada na auditoria e no log.
        auditar(ctx, u, "CONSUMO_INDEVIDO", {"produtoId": p.id, "donoId": p.dono_id, "quantidade": quantidade})
        log.warning("consumo_indevido", extra={"usuario_id": u.id, "produto_id": p.id, "dono_id": p.dono_id})
        ctx.s.commit()
        raise
    if p.status in ("VENCIDO", "DESCARTADO"):
        raise conflito(
            "PRODUTO_INDISPONIVEL",
            "Produto vencido ou descartado não pode ser consumido; ele deve ser descartado por razões sanitárias.",
        )
    if p.status == "ESGOTADO":
        raise conflito("PRODUTO_ESGOTADO", "Não há estoque deste produto.")
    if quantidade > p.quantidade:
        raise ErroDominio(
            "QUANTIDADE_INSUFICIENTE", f"Quantidade indisponível: há apenas {p.quantidade:g} {p.unidade} em estoque."
        )
    lotes = _lotes_ativos(ctx, p.id)
    por_id = {lote.id: lote for lote in lotes}
    plano = regras_lotes.planejar_consumo(
        [regras_lotes.Lote(lote.id, lote.quantidade, lote.validade) for lote in lotes], quantidade
    )
    for baixa in plano:
        lote = por_id[baixa.lote_id]
        lote.quantidade = arredondar(lote.quantidade - baixa.quantidade)
        if lote.quantidade <= 0:
            lote.quantidade = 0
            lote.status = "CONSUMIDO"
    ctx.s.add(Consumo(produto_id=p.id, usuario_id=u.id, quantidade=quantidade, registrado_em=ctx.relogio.agora()))
    ctx.s.flush()
    recalcular(ctx, p)
    p.status = "ATIVO" if p.quantidade > 0 else "ESGOTADO"
    ctx.s.flush()
    _verificar_minimo(ctx, p)
    return _dto(ctx, p, dono, u, ctx.relogio.hoje())


def repor(ctx: Contexto, u: UsuarioAtual, id_: int, quantidade: float, validade: date | None) -> dict[str, Any]:
    """RF-17: a entrada vira um lote; com a mesma validade, soma no lote existente."""
    executar_rotinas(ctx, u.republica_id)
    hoje = ctx.relogio.hoje()
    p, dono = _buscar(ctx, u, id_, travar=True)
    _exigir_propriedade(p, dono, u)
    if p.status == "DESCARTADO":
        raise conflito("PRODUTO_INDISPONIVEL", "Produto descartado não pode ser reposto; cadastre um novo.")
    if validade is not None and validade < hoje:
        raise ErroDominio("VALIDADE_PASSADA", "A validade do novo lote não pode estar no passado.")
    if p.validade is not None and validade is None:
        raise ErroDominio("VALIDADE_OBRIGATORIA", "Informe a validade do novo lote.")
    existente = next((lote for lote in _lotes_ativos(ctx, p.id) if lote.validade == validade), None)
    if existente is not None:
        existente.quantidade = arredondar(existente.quantidade + quantidade)
    else:
        ctx.s.add(
            Lote(
                produto_id=p.id,
                quantidade=arredondar(quantidade),
                validade=validade,
                status="ATIVO",
                criado_em=ctx.relogio.agora(),
            )
        )
    ctx.s.flush()
    recalcular(ctx, p)
    p.status = "ATIVO"
    p.conferido_em = ctx.relogio.agora()
    ctx.s.flush()
    if p.quantidade_minima is None or p.quantidade > p.quantidade_minima:
        concluir_sugestao(ctx, p.id, u.id)
    return _dto(ctx, p, dono, u, hoje)


def editar(ctx: Contexto, u: UsuarioAtual, id_: int, dados: dict[str, Any]) -> dict[str, Any]:
    """RF-01.5: atualização cadastral; registra a data da última conferência."""
    hoje = ctx.relogio.hoje()
    p, dono = _buscar(ctx, u, id_)
    _exigir_propriedade(p, dono, u)
    if p.status not in ("ATIVO", "ESGOTADO"):
        raise conflito("PRODUTO_INDISPONIVEL", "Produto vencido ou descartado não pode ser editado.")
    if dados.get("validade") is not None and dados["validade"] < hoje:
        raise ErroDominio("VALIDADE_PASSADA", "A validade não pode estar no passado.")
    if dados.get("quantidade_minima") is not None and p.classificacao == "INDIVIDUAL":
        raise ErroDominio("MINIMO_APENAS_COLETIVO", "Quantidade mínima só se aplica a itens de uso coletivo.")
    for campo in ("nome", "unidade", "compartimento"):
        if campo in dados:
            setattr(p, campo, dados[campo])
    if "quantidade_minima" in dados:
        p.quantidade_minima = dados["quantidade_minima"]
    if "validade" in dados:
        lotes = _lotes_ativos(ctx, p.id)
        if len(lotes) > 1:
            raise conflito(
                "VARIOS_LOTES", "O produto tem mais de um lote; ajuste a validade repondo ou consumindo por lote."
            )
        for lote in lotes:
            lote.validade = dados["validade"]
        p.validade = dados["validade"]
    p.conferido_em = ctx.relogio.agora()
    ctx.s.flush()
    recalcular(ctx, p)
    _verificar_minimo(ctx, p)
    return _dto(ctx, p, dono, u, hoje)


def descartar(ctx: Contexto, u: UsuarioAtual, id_: int) -> dict[str, Any]:
    """RF-03.5: descarte (estragou, venceu). Estado terminal; os lotes vão para o relatório de perdas."""
    p, dono = _buscar(ctx, u, id_)
    _exigir_propriedade(p, dono, u)
    if p.classificacao == "COLETIVO" and u.perfil != "ADMIN" and p.criado_por != u.id:
        raise proibido("SEM_PERMISSAO", "Apenas quem cadastrou o item coletivo ou o administrador pode descartá-lo.")
    if p.status == "DESCARTADO":
        raise conflito("PRODUTO_INDISPONIVEL", "Produto já descartado.")
    for lote in ctx.s.scalars(select(Lote).where(Lote.produto_id == p.id, Lote.status.in_(("ATIVO", "VENCIDO")))):
        lote.status = "DESCARTADO"
    p.status = "DESCARTADO"
    ctx.s.flush()
    return _dto(ctx, p, dono, u, ctx.relogio.hoje(), [])


def historico(ctx: Contexto, u: UsuarioAtual) -> list[dict[str, Any]]:
    """RF-02.4: consumos dos últimos 30 dias, do mais recente para o mais antigo.
    Consumos de itens individuais só aparecem para o próprio dono."""
    limite = ctx.relogio.agora() - timedelta(days=30)
    linhas = ctx.s.execute(
        select(Consumo.id, Produto.nome, Produto.unidade, Consumo.quantidade, Usuario.nome, Consumo.registrado_em)
        .join(Produto, Produto.id == Consumo.produto_id)
        .join(Usuario, Usuario.id == Consumo.usuario_id)
        .where(
            Produto.republica_id == u.republica_id,
            Consumo.registrado_em >= limite,
            (Produto.classificacao == "COLETIVO") | (Produto.dono_id == u.id),
        )
        .order_by(Consumo.id.desc())
        .limit(200)
    ).all()
    return [
        {"id": i, "produto": nome, "unidade": un, "quantidade": q, "morador": m, "registradoEm": instante(em)}
        for i, nome, un, q, m, em in linhas
    ]
