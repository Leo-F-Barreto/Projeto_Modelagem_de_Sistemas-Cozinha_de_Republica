import type { Contexto, Perfil, Usuario } from './contexto.ts';
import { ErroDominio, conflito } from '../erros.ts';
import { conferirSenha, gerarHash } from '../seguranca/senha.ts';
import { emitirToken, verificarToken } from '../seguranca/token.ts';
import { gerarCodigoConvite } from './republica.ts';

export interface Cadastro {
  nome: string; email: string; senha: string;
  /** Informe um dos dois: criar uma república (vira ADMIN) ou entrar em uma existente (vira MORADOR). */
  nomeRepublica?: string; codigoConvite?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sessao(ctx: Contexto, u: Usuario) {
  return { token: emitirToken(u.id, ctx.config.segredoJwt, ctx.relogio.segundos(), ctx.config.duracaoTokenSeg), usuario: u };
}

export async function registrar(ctx: Contexto, dados: Cadastro) {
  if (!EMAIL.test(dados.email)) throw new ErroDominio('VALIDACAO', 'E-mail inválido.', 400);
  if (Boolean(dados.nomeRepublica) === Boolean(dados.codigoConvite)) {
    throw new ErroDominio('VALIDACAO', 'Informe o nome da nova república ou um código de convite (apenas um dos dois).', 400);
  }
  // O hash é caro e assíncrono: calculado antes da transação, que é síncrona e curta.
  const senhaHash = await gerarHash(dados.senha, ctx.config.scryptLogN);

  const usuario = ctx.db.transacao((): Usuario => {
    if (ctx.db.um('SELECT 1 AS x FROM usuario WHERE email = ?', dados.email)) {
      throw conflito('EMAIL_EM_USO', 'Já existe uma conta com este e-mail.');
    }
    let republicaId: number;
    let perfil: Perfil;
    if (dados.nomeRepublica) {
      republicaId = ctx.db.executar('INSERT INTO republica (nome, codigo_convite, criado_em) VALUES (?, ?, ?)',
        dados.nomeRepublica, gerarCodigoConvite(), ctx.relogio.agora()).id;
      perfil = 'ADMIN';
    } else {
      const r = ctx.db.um<{ id: number }>('SELECT id FROM republica WHERE codigo_convite = ?', dados.codigoConvite!.toUpperCase());
      if (!r) throw new ErroDominio('CONVITE_INVALIDO', 'Código de convite inválido.');
      republicaId = r.id;
      perfil = 'MORADOR';
    }
    const { id } = ctx.db.executar(
      'INSERT INTO usuario (republica_id, nome, email, senha_hash, perfil, ativo, criado_em) VALUES (?, ?, ?, ?, ?, 1, ?)',
      republicaId, dados.nome, dados.email.toLowerCase(), senhaHash, perfil, ctx.relogio.agora());
    return { id, republicaId, nome: dados.nome, perfil };
  });
  return sessao(ctx, usuario);
}

// Hash de uma senha qualquer, usado para que o login de e-mail inexistente custe o mesmo que o de e-mail válido.
let hashIsca: Promise<string> | undefined;

export async function entrar(ctx: Contexto, email: string, senha: string) {
  const linha = ctx.db.um<{ id: number; republica_id: number; nome: string; perfil: Perfil; ativo: number; senha_hash: string }>(
    'SELECT id, republica_id, nome, perfil, ativo, senha_hash FROM usuario WHERE email = ?', email);
  hashIsca ??= gerarHash('senha-isca', ctx.config.scryptLogN);
  const confere = await conferirSenha(senha, linha?.senha_hash ?? (await hashIsca));
  // Mensagem única para e-mail inexistente, senha errada e conta desativada: não revela quais contas existem.
  if (!linha || !confere || linha.ativo !== 1) throw new ErroDominio('CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.', 401);
  return sessao(ctx, { id: linha.id, republicaId: linha.republica_id, nome: linha.nome, perfil: linha.perfil });
}

/**
 * Resolve o token para um usuário. Perfil e situação são relidos do banco a cada requisição:
 * desativar um morador ou rebaixar um administrador tem efeito imediato, mesmo com token ainda válido.
 */
export function autenticar(ctx: Contexto, token: string): Usuario | null {
  const id = verificarToken(token, ctx.config.segredoJwt, ctx.relogio.segundos());
  if (id === null) return null;
  const linha = ctx.db.um<{ id: number; republica_id: number; nome: string; perfil: Perfil }>(
    'SELECT id, republica_id, nome, perfil FROM usuario WHERE id = ? AND ativo = 1', id);
  return linha ? { id: linha.id, republicaId: linha.republica_id, nome: linha.nome, perfil: linha.perfil } : null;
}
