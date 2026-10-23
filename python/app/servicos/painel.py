"""Painel principal: o que exige atenção agora (RF-03.1 e RF-06.5)."""

from typing import Any

from app.dominio.datas import somar_dias
from app.servicos import escala, estoque, financas, lista, notificacoes
from app.servicos.contexto import Contexto, UsuarioAtual


def obter(ctx: Contexto, u: UsuarioAtual) -> dict[str, Any]:
    hoje = ctx.relogio.hoje()
    produtos = estoque.listar(ctx, u, False)  # também executa as rotinas do notificador
    turnos = escala.listar_turnos(ctx, u, somar_dias(hoje, -7), somar_dias(hoje, 14))
    return {
        "hoje": hoje.isoformat(),
        "validadeCritica": [p for p in produtos if p["status"] == "ATIVO" and p["estadoValidade"] == "CRITICA"],
        "estoqueBaixo": [p for p in produtos if p["classificacao"] == "COLETIVO" and p["abaixoDoMinimo"]],
        "itensNaLista": lista.pendentes(ctx, u.republica_id),
        "meuSaldoCentavos": next(
            (s["saldoCentavos"] for s in financas.calcular_saldos(ctx, u.republica_id) if s["usuarioId"] == u.id), 0
        ),
        "turnosDeHoje": [t for t in turnos if t["data"] == hoje.isoformat()],
        "meusTurnos": [t for t in turnos if t["responsavelId"] == u.id and t["status"] == "PENDENTE"],
        "trocasParaResponder": sum(1 for t in escala.listar_trocas(ctx, u) if t["solicitadoId"] == u.id),
        "comprasAguardandoAprovacao": financas.compras_pendentes(ctx, u.republica_id) if u.perfil == "ADMIN" else 0,
        "notificacoesNaoLidas": notificacoes.nao_lidas(ctx, u),
    }
