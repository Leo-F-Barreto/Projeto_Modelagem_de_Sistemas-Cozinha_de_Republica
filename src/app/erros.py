"""Erro de regra de negócio ou de validação, convertido em resposta HTTP pela camada de API."""


class ErroDominio(Exception):
    def __init__(self, codigo: str, mensagem: str, status: int = 422) -> None:
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem = mensagem
        self.status = status


def nao_encontrado(o_que: str) -> ErroDominio:
    return ErroDominio("NAO_ENCONTRADO", f"{o_que} não encontrado(a).", 404)


def proibido(codigo: str, mensagem: str) -> ErroDominio:
    return ErroDominio(codigo, mensagem, 403)


def conflito(codigo: str, mensagem: str) -> ErroDominio:
    return ErroDominio(codigo, mensagem, 409)


def invalido(mensagem: str, codigo: str = "VALIDACAO") -> ErroDominio:
    return ErroDominio(codigo, mensagem, 400)
