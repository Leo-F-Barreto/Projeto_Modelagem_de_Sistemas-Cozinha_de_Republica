"""Rotas da API. Cada rota valida a entrada e delega a um serviço; nenhuma regra de negócio mora aqui."""

from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Path, Query, Response

from app.api import schemas as sc
from app.api.deps import Ctx, Usuario, limitar_tentativas
from app.dominio.datas import somar_dias
from app.erros import ErroDominio
from app.servicos import auth, escala, estoque, financas, lista, notificacoes, painel, republica
from app.servicos.rotinas import executar_rotinas

api = APIRouter(prefix="/api")
IdRota = Annotated[int, Path(gt=0)]


# --- Autenticação (públicas) ---
@api.post("/auth/registro", status_code=201, dependencies=[Depends(limitar_tentativas)])
def registrar(dados: sc.Registro, ctx: Ctx) -> dict[str, Any]:
    return auth.registrar(ctx, dados.nome, dados.email, dados.senha, dados.nome_republica, dados.codigo_convite)


@api.post("/auth/login", dependencies=[Depends(limitar_tentativas)])
def login(dados: sc.Login, ctx: Ctx) -> dict[str, Any]:
    return auth.entrar(ctx, dados.email, dados.senha)


@api.get("/eu")
def eu(u: Usuario) -> dict[str, Any]:
    return u.dto()


@api.get("/painel")
def obter_painel(ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return painel.obter(ctx, u)


# --- República e moradores ---
@api.get("/republica")
def obter_republica(ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return republica.obter(ctx, u)


@api.post("/republica/convite")
def regenerar_convite(ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return republica.regenerar_convite(ctx, u)


@api.get("/auditoria")
def auditoria(ctx: Ctx, u: Usuario) -> list[dict[str, Any]]:
    return republica.listar_auditoria(ctx, u)


@api.patch("/moradores/{id}")
def alterar_morador(id: IdRota, dados: sc.AlteracaoMorador, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return republica.alterar_morador(ctx, u, id, dados.perfil, dados.ativo)


# --- Estoque ---
@api.get("/produtos")
def listar_produtos(
    ctx: Ctx,
    u: Usuario,
    todos: Literal["0", "1"] = "0",
    classificacao: Literal["COLETIVO", "INDIVIDUAL"] | None = None,
    compartimento: Annotated[str | None, Query(max_length=60)] = None,
    estado: Literal["SEM_VALIDADE", "OK", "CRITICA", "VENCIDA"] | None = None,
) -> list[dict[str, Any]]:
    filtros = {"classificacao": classificacao, "compartimento": compartimento, "estado": estado}
    return estoque.listar(ctx, u, todos == "1", filtros)


@api.post("/produtos", status_code=201)
def cadastrar_produto(dados: sc.NovoProduto, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return estoque.cadastrar(ctx, u, dados.model_dump())


@api.patch("/produtos/{id}")
def editar_produto(id: IdRota, dados: sc.EdicaoProduto, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return estoque.editar(ctx, u, id, dados.model_dump(exclude_unset=True))


@api.post("/produtos/{id}/consumo")
def consumir(id: IdRota, dados: sc.Movimento, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return estoque.consumir(ctx, u, id, dados.quantidade)


@api.post("/produtos/{id}/reposicao")
def repor(id: IdRota, dados: sc.Reposicao, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return estoque.repor(ctx, u, id, dados.quantidade, dados.validade)


@api.post("/produtos/{id}/descarte")
def descartar(id: IdRota, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return estoque.descartar(ctx, u, id)


@api.get("/consumos")
def historico(ctx: Ctx, u: Usuario) -> list[dict[str, Any]]:
    return estoque.historico(ctx, u)


# --- Lista de compras ---
@api.get("/lista")
def listar_lista(ctx: Ctx, u: Usuario) -> list[dict[str, Any]]:
    executar_rotinas(ctx, u.republica_id)  # vencimentos do dia podem gerar sugestões (RF-04)
    return lista.listar(ctx, u)


@api.post("/lista", status_code=201)
def adicionar_item(dados: sc.NovoItemLista, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    if dados.classificacao == "INDIVIDUAL":
        raise ErroDominio(
            "ITEM_INDIVIDUAL", "Itens de consumo pessoal não entram na lista coletiva: compre-os por conta própria."
        )
    return lista.adicionar(ctx, u, dados.nome, dados.quantidade, dados.unidade)


@api.patch("/lista/{id}")
def ajustar_item(id: IdRota, dados: sc.AjusteItemLista, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return lista.editar_quantidade(ctx, u, id, dados.quantidade)


@api.post("/lista/{id}/comprado")
def marcar_comprado(id: IdRota, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return lista.marcar_comprado(ctx, u, id)


@api.delete("/lista/{id}", status_code=204)
def remover_item(id: IdRota, ctx: Ctx, u: Usuario) -> Response:
    lista.remover(ctx, u, id)
    return Response(status_code=204)


# --- Finanças ---
@api.get("/compras")
def listar_compras(ctx: Ctx, u: Usuario) -> list[dict[str, Any]]:
    return financas.listar(ctx, u)


@api.post("/compras", status_code=201)
def registrar_compra(dados: sc.NovaCompra, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return financas.registrar(ctx, u, dados.descricao, dados.valor_centavos, dados.pagador_id, dados.data)


@api.post("/compras/{id}/aprovacao")
def aprovar_compra(id: IdRota, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return financas.decidir(ctx, u, id, True, None)


@api.post("/compras/{id}/rejeicao")
def rejeitar_compra(id: IdRota, ctx: Ctx, u: Usuario, dados: sc.Rejeicao | None = None) -> dict[str, Any]:
    return financas.decidir(ctx, u, id, False, dados.motivo if dados else None)


@api.get("/balanco")
def balanco(ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return financas.balanco(ctx, u)


@api.post("/fechamentos", status_code=201)
def fechar(dados: sc.NovoFechamento, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return financas.fechar_periodo(ctx, u, dados.periodo)


@api.post("/acertos/{id}/confirmacao")
def confirmar_acerto(id: IdRota, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return financas.confirmar_acerto(ctx, u, id)


# --- Escala ---
@api.get("/escala")
def obter_escala(ctx: Ctx, u: Usuario, de: date | None = None, ate: date | None = None) -> dict[str, Any]:
    executar_rotinas(ctx, u.republica_id)  # expira trocas cujo turno já chegou
    hoje = ctx.relogio.hoje()
    inicio, fim = de or somar_dias(hoje, -7), ate or somar_dias(hoje, 30)
    return {"turnos": escala.listar_turnos(ctx, u, inicio, fim), "trocas": escala.listar_trocas(ctx, u)}


@api.post("/escala", status_code=201)
def gerar_escala(dados: sc.NovaEscala, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return escala.gerar(ctx, u, dados.inicio, dados.dias, list(dados.tipos))


@api.post("/turnos/{id}/conclusao")
def concluir_turno(id: IdRota, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return escala.concluir(ctx, u, id)


@api.post("/trocas", status_code=201)
def solicitar_troca(dados: sc.NovaTroca, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return escala.solicitar_troca(ctx, u, dados.meu_turno_id, dados.outro_turno_id)


@api.post("/trocas/{id}/aceite")
def aceitar_troca(id: IdRota, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return escala.responder_troca(ctx, u, id, True)


@api.post("/trocas/{id}/recusa")
def recusar_troca(id: IdRota, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return escala.responder_troca(ctx, u, id, False)


@api.post("/trocas/{id}/cancelamento")
def cancelar_troca(id: IdRota, ctx: Ctx, u: Usuario) -> dict[str, Any]:
    return escala.cancelar_troca(ctx, u, id)


# --- Notificações ---
@api.get("/notificacoes")
def listar_notificacoes(ctx: Ctx, u: Usuario) -> list[dict[str, Any]]:
    return notificacoes.listar(ctx, u)


@api.post("/notificacoes/lidas", status_code=204)
def marcar_todas(ctx: Ctx, u: Usuario) -> Response:
    notificacoes.marcar_todas_lidas(ctx, u)
    return Response(status_code=204)


@api.post("/notificacoes/{id}/lida", status_code=204)
def marcar_uma(id: IdRota, ctx: Ctx, u: Usuario) -> Response:
    notificacoes.marcar_lida(ctx, u, id)
    return Response(status_code=204)
