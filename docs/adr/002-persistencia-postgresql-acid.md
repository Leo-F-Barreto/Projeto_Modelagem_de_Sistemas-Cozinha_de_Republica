# ADR 002: Estratégia de Persistência - PostgreSQL 16 com SQLAlchemy e Alembic
<!-- File: docs/adr/002-persistencia-postgresql-acid.md -->
<!-- Status: Aprovado -->
<!-- Data: 2026-10-15 -->
<!-- Decisores: Tech Lead, Equipe de Modelagem de Sistemas -->

## Contexto
O domínio de república compartilhada envolve duas operações de alta sensibilidade transacional:
1. **Controle Financeiro de Rateio (RB-02 e RB-03):** Lançamento de despesas, divisão igualitária entre moradores e compensação cruzada de saldos credores e devedores. Um erro de arredondamento ou inconsistência em acessos concorrentes gera desequilíbrio patrimonial entre os moradores.
2. **Concorrência de Estoque (RF-02):** Múltiplos moradores retirando mantimentos simultaneamente da cozinha não podem gerar saldo de estoque negativo.

Avaliou-se o uso de bancos NoSQL (MongoDB), bancos relacionais embarcados (SQLite) e SGBD relacional robusto (PostgreSQL).

## Decisão
Adota-se o **PostgreSQL 16** como banco de dados relacional primário, operado por meio do **SQLAlchemy 2.0 (ORM)** e gerenciado por migrações versionadas com **Alembic**.

## Justificativa Técnica
1. **Garantias ACID e Atomicidade Contábil:** O PostgreSQL provê suporte a transações estritas com níveis de isolamento configuráveis (`READ COMMITTED` e `SERIALIZABLE`), garantindo que o rateio e a dedução de estoques ocorram de forma atômica (tudo ou nada).
2. **Precisão Numérica com Tipo `NUMERIC(10,2)`:** O suporte a ponto fixo impede dízimas e perdas de centavos que ocorreriam com tipos de ponto flutuante binário (`float`), atendendo ao requisito RNF-05.1.
3. **Controle de Concorrência e Bloqueios:** O uso de `SELECT FOR UPDATE` ou controle otimista via colunas de versão impede que duas requisições de baixa consumam mais unidades do que as realmente existentes no armário.
4. **Integridade Referencial Forte:** Chaves estrangeiras, constraints de checagem (`CHECK (quantidade >= 0)`) e integridade relacional entre moradores e suas repúblicas são verificadas a nível de banco.
5. **Histórico Versionado de Esquema (Alembic):** Todas as alterações estruturais na base ficam gravadas em scripts de migração no Git, viabilizando reversões (rollbacks) seguras.

## Consequências

### Positivas
* Blindagem total contra inconsistências financeiras e estoques negativos.
* Trilha de auditoria relacional com integridade garantida.
* Facilidade de queries complexas para relatórios de balanço e gastos mensais.

### Negativas / Riscos Mitigados
* *Risco:* Necessidade de instância do serviço PostgreSQL em execução local ou contêiner (Docker).
* *Mitigação:* Configuração de `docker-compose.yml` para subida instantânea de ambiente local para testes e desenvolvimento.

## Conformidade
* Cumpre estritamente as regras de negócio RB-02, RB-03 e os requisitos não-funcionais RNF-01.2 e RNF-05.1.
