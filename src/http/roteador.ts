import type { Usuario } from '../servicos/contexto.ts';

export interface Requisicao {
  params: Record<string, string>;
  consulta: URLSearchParams;
  corpo: unknown;
  /** Presente em toda rota não pública. */
  usuario: Usuario;
}

export interface Resposta {
  status: number;
  corpo: unknown;
}

export type Tratador = (req: Requisicao) => unknown | Promise<unknown>;

interface Rota {
  metodo: string;
  padrao: RegExp;
  chaves: string[];
  publica: boolean;
  tratador: Tratador;
}

export const criado = (corpo: unknown): Resposta => ({ status: 201, corpo });
export const semConteudo = (): Resposta => ({ status: 204, corpo: null });

/** Roteador mínimo: método + caminho com parâmetros (":id"). Rotas são autenticadas por padrão. */
export class Roteador {
  rotas: Rota[] = [];

  registrar(metodo: string, caminho: string, tratador: Tratador, opcoes: { publica?: boolean } = {}): void {
    const chaves: string[] = [];
    const padrao = new RegExp(`^${caminho.replace(/:([a-zA-Z]+)/g, (_, chave: string) => {
      chaves.push(chave);
      return '([^/]+)';
    })}$`);
    this.rotas.push({ metodo, padrao, chaves, publica: opcoes.publica ?? false, tratador });
  }

  get(caminho: string, t: Tratador) { this.registrar('GET', caminho, t); }
  post(caminho: string, t: Tratador) { this.registrar('POST', caminho, t); }
  patch(caminho: string, t: Tratador) { this.registrar('PATCH', caminho, t); }
  delete(caminho: string, t: Tratador) { this.registrar('DELETE', caminho, t); }

  resolver(metodo: string, caminho: string): { rota: Rota; params: Record<string, string> } | 'METODO' | null {
    let caminhoExiste = false;
    for (const rota of this.rotas) {
      const m = rota.padrao.exec(caminho);
      if (!m) continue;
      caminhoExiste = true;
      if (rota.metodo !== metodo) continue;
      // O valor bruto basta: parâmetros de rota são sempre ids numéricos, validados por quem os usa.
      const params = Object.fromEntries(rota.chaves.map((chave, i) => [chave, m[i + 1]!]));
      return { rota, params };
    }
    return caminhoExiste ? 'METODO' : null;
  }
}
