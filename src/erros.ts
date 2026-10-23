/** Erro de regra de negócio ou de validação, convertido em resposta HTTP pela camada http. */
export class ErroDominio extends Error {
  codigo: string;
  status: number;

  constructor(codigo: string, mensagem: string, status = 422) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
  }
}

export const naoEncontrado = (oQue: string) => new ErroDominio('NAO_ENCONTRADO', `${oQue} não encontrado(a).`, 404);
export const proibido = (codigo: string, mensagem: string) => new ErroDominio(codigo, mensagem, 403);
export const conflito = (codigo: string, mensagem: string) => new ErroDominio(codigo, mensagem, 409);
