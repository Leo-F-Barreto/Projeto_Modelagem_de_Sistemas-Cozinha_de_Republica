import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

type Param = string | number | bigint | null;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS republica (
  id             INTEGER PRIMARY KEY,
  nome           TEXT NOT NULL,
  codigo_convite TEXT NOT NULL UNIQUE,
  criado_em      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuario (
  id           INTEGER PRIMARY KEY,
  republica_id INTEGER NOT NULL REFERENCES republica(id),
  nome         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash   TEXT NOT NULL,
  perfil       TEXT NOT NULL CHECK (perfil IN ('ADMIN','MORADOR')),
  ativo        INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_usuario_republica ON usuario(republica_id, ativo);

CREATE TABLE IF NOT EXISTS produto (
  id                INTEGER PRIMARY KEY,
  republica_id      INTEGER NOT NULL REFERENCES republica(id),
  nome              TEXT NOT NULL,
  quantidade        REAL NOT NULL CHECK (quantidade >= 0),
  unidade           TEXT NOT NULL,
  validade          TEXT,
  classificacao     TEXT NOT NULL CHECK (classificacao IN ('COLETIVO','INDIVIDUAL')),
  dono_id           INTEGER REFERENCES usuario(id),
  quantidade_minima REAL CHECK (quantidade_minima IS NULL OR quantidade_minima >= 0),
  status            TEXT NOT NULL CHECK (status IN ('ATIVO','ESGOTADO','VENCIDO','DESCARTADO')),
  criado_por        INTEGER NOT NULL REFERENCES usuario(id),
  criado_em         TEXT NOT NULL,
  -- RB-01: item individual sempre tem dono; item coletivo nunca tem.
  CHECK ((classificacao = 'INDIVIDUAL' AND dono_id IS NOT NULL AND quantidade_minima IS NULL)
      OR (classificacao = 'COLETIVO' AND dono_id IS NULL))
);
CREATE INDEX IF NOT EXISTS ix_produto_republica ON produto(republica_id, status, validade);

CREATE TABLE IF NOT EXISTS consumo (
  id            INTEGER PRIMARY KEY,
  produto_id    INTEGER NOT NULL REFERENCES produto(id),
  usuario_id    INTEGER NOT NULL REFERENCES usuario(id),
  quantidade    REAL NOT NULL CHECK (quantidade > 0),
  registrado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_consumo_produto ON consumo(produto_id);

CREATE TABLE IF NOT EXISTS item_lista (
  id           INTEGER PRIMARY KEY,
  republica_id INTEGER NOT NULL REFERENCES republica(id),
  nome         TEXT NOT NULL,
  produto_id   INTEGER REFERENCES produto(id),
  origem       TEXT NOT NULL CHECK (origem IN ('MANUAL','AUTOMATICA')),
  status       TEXT NOT NULL CHECK (status IN ('PENDENTE','COMPRADO')),
  criado_por   INTEGER REFERENCES usuario(id),
  criado_em    TEXT NOT NULL,
  comprado_por INTEGER REFERENCES usuario(id),
  comprado_em  TEXT
);
CREATE INDEX IF NOT EXISTS ix_item_lista_republica ON item_lista(republica_id, status);
-- RF-04: no máximo um item pendente por produto (evita duplicar a sugestão automática).
CREATE UNIQUE INDEX IF NOT EXISTS ux_item_lista_pendente ON item_lista(produto_id) WHERE status = 'PENDENTE' AND produto_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS compra (
  id               INTEGER PRIMARY KEY,
  republica_id     INTEGER NOT NULL REFERENCES republica(id),
  descricao        TEXT NOT NULL,
  valor_centavos   INTEGER NOT NULL CHECK (valor_centavos > 0),
  pagador_id       INTEGER NOT NULL REFERENCES usuario(id),
  data             TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('PENDENTE','APROVADA','REJEITADA')),
  registrada_por   INTEGER NOT NULL REFERENCES usuario(id),
  decidida_por     INTEGER REFERENCES usuario(id),
  decidida_em      TEXT,
  motivo_rejeicao  TEXT,
  criado_em        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_compra_republica ON compra(republica_id, status, data);

CREATE TABLE IF NOT EXISTS cota (
  compra_id      INTEGER NOT NULL REFERENCES compra(id),
  usuario_id     INTEGER NOT NULL REFERENCES usuario(id),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  PRIMARY KEY (compra_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS ix_cota_usuario ON cota(usuario_id);

CREATE TABLE IF NOT EXISTS fechamento (
  id           INTEGER PRIMARY KEY,
  republica_id INTEGER NOT NULL REFERENCES republica(id),
  periodo      TEXT NOT NULL,
  fechado_por  INTEGER NOT NULL REFERENCES usuario(id),
  fechado_em   TEXT NOT NULL,
  UNIQUE (republica_id, periodo)
);

CREATE TABLE IF NOT EXISTS acerto (
  id             INTEGER PRIMARY KEY,
  fechamento_id  INTEGER NOT NULL REFERENCES fechamento(id),
  devedor_id     INTEGER NOT NULL REFERENCES usuario(id),
  credor_id      INTEGER NOT NULL REFERENCES usuario(id),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  status         TEXT NOT NULL CHECK (status IN ('PENDENTE','PAGO','SUBSTITUIDO')),
  confirmado_por INTEGER REFERENCES usuario(id),
  confirmado_em  TEXT
);
CREATE INDEX IF NOT EXISTS ix_acerto_fechamento ON acerto(fechamento_id, status);

CREATE TABLE IF NOT EXISTS turno (
  id             INTEGER PRIMARY KEY,
  republica_id   INTEGER NOT NULL REFERENCES republica(id),
  data           TEXT NOT NULL,
  tipo           TEXT NOT NULL CHECK (tipo IN ('LIMPEZA','REFEICAO')),
  responsavel_id INTEGER NOT NULL REFERENCES usuario(id),
  status         TEXT NOT NULL CHECK (status IN ('PENDENTE','CONCLUIDO')),
  concluido_em   TEXT,
  UNIQUE (republica_id, data, tipo)
);
CREATE INDEX IF NOT EXISTS ix_turno_responsavel ON turno(responsavel_id, status, data);

CREATE TABLE IF NOT EXISTS troca (
  id                   INTEGER PRIMARY KEY,
  republica_id         INTEGER NOT NULL REFERENCES republica(id),
  turno_solicitante_id INTEGER NOT NULL REFERENCES turno(id) ON DELETE CASCADE,
  turno_solicitado_id  INTEGER NOT NULL REFERENCES turno(id) ON DELETE CASCADE,
  solicitante_id       INTEGER NOT NULL REFERENCES usuario(id),
  solicitado_id        INTEGER NOT NULL REFERENCES usuario(id),
  status               TEXT NOT NULL CHECK (status IN ('PENDENTE','ACEITA','RECUSADA','CANCELADA')),
  criado_em            TEXT NOT NULL,
  decidido_em          TEXT
);
CREATE INDEX IF NOT EXISTS ix_troca_republica ON troca(republica_id, status);

CREATE TABLE IF NOT EXISTS notificacao (
  id         INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  tipo       TEXT NOT NULL,
  mensagem   TEXT NOT NULL,
  chave      TEXT NOT NULL,
  lida       INTEGER NOT NULL DEFAULT 0 CHECK (lida IN (0,1)),
  criado_em  TEXT NOT NULL,
  -- A chave torna o envio idempotente: a mesma ocorrência nunca notifica duas vezes.
  UNIQUE (usuario_id, chave)
);
CREATE INDEX IF NOT EXISTS ix_notificacao_usuario ON notificacao(usuario_id, lida);

CREATE TABLE IF NOT EXISTS auditoria (
  id           INTEGER PRIMARY KEY,
  republica_id INTEGER NOT NULL REFERENCES republica(id),
  usuario_id   INTEGER NOT NULL REFERENCES usuario(id),
  acao         TEXT NOT NULL,
  detalhe      TEXT NOT NULL,
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_auditoria_republica ON auditoria(republica_id, id);
`;

/** Fachada fina sobre o SQLite embutido do Node: consultas parametrizadas e transações. */
export class Banco {
  sql: DatabaseSync;

  constructor(caminho: string) {
    if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
    this.sql = new DatabaseSync(caminho);
    this.sql.exec('PRAGMA foreign_keys = ON;');
    if (caminho !== ':memory:') this.sql.exec('PRAGMA journal_mode = WAL;');
    this.sql.exec(ESQUEMA);
  }

  um<T>(sql: string, ...params: Param[]): T | undefined {
    return this.sql.prepare(sql).get(...params) as T | undefined;
  }

  todos<T>(sql: string, ...params: Param[]): T[] {
    return this.sql.prepare(sql).all(...params) as T[];
  }

  executar(sql: string, ...params: Param[]): { id: number; alteradas: number } {
    const r = this.sql.prepare(sql).run(...params);
    return { id: Number(r.lastInsertRowid), alteradas: Number(r.changes) };
  }

  /** Executa `fn` atomicamente. Chamadas aninhadas participam da transação externa. */
  transacao<T>(fn: () => T): T {
    if (this.sql.isTransaction) return fn();
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      const resultado = fn();
      this.sql.exec('COMMIT');
      return resultado;
    } catch (erro) {
      this.sql.exec('ROLLBACK');
      throw erro;
    }
  }

  fechar(): void {
    this.sql.close();
  }
}
