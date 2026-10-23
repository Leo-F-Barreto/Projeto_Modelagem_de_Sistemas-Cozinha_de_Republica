# ADR 007: Backend em Python/FastAPI Mantendo a Interface HTML
<!-- File: docs/adr/007-reescrita-python-mantendo-html.md -->
<!-- Status: Aprovado -->
<!-- Data: 2026-10-23 -->
<!-- Decisores: Tech Lead, Equipe de Modelagem de Sistemas -->
<!-- Revisa: ADR 004 -->

## Contexto
Os ADRs 001 a 003 e 005 definiram Python 3, FastAPI, PostgreSQL, bcrypt/JWT e pytest, mas o MVP foi entregue em TypeScript
sobre Node 22, com `node:sqlite`, scrypt e `node:test`. O ADR 004 previa uma SPA em React com TailwindCSS; o que existe é uma
interface em HTML, CSS e JavaScript sem framework (`public/`), já mobile-first e com política de segurança restrita (CSP sem
scripts inline). A decisão da equipe foi reescrever o backend em Python e manter essa interface.

## Decisão
* O backend é reescrito em `python/` com FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PyJWT, bcrypt e APScheduler, preservando
  rotas, campos JSON (camelCase) e códigos de erro da versão anterior.
* A interface de `public/` é mantida e passa a consumir a API (login, cadastro e todas as telas). Não se adota React nem
  TailwindCSS por ora; o ADR 004 fica revisado neste ponto, mantendo os objetivos de mobile-first e acessibilidade.
* Os testes da versão TypeScript são portados para pytest antes de qualquer mudança de comportamento; mudanças de regra
  ficam registradas em `python/MUDANCAS.md` com o texto proposto para as specs.
* O código TypeScript permanece até a equipe aprovar a remoção.

## Consequências

### Positivas
* O código volta a seguir a pilha documentada nos ADRs, com migrações versionadas e banco relacional de produção.
* A interface continua leve, sem etapa de build, e servida pela própria API (mesma origem, CSP estrita).

### Negativas / Riscos Mitigados
* *Risco:* duas implementações convivendo no repositório.
* *Mitigação:* a versão Python é a de referência; a remoção de `src/` e de `package.json` é um passo único e reversível pelo git.
* *Risco:* senhas antigas em scrypt não são aceitas pelo bcrypt.
* *Mitigação:* como o MVP não tinha usuários reais, os moradores recriam a conta; não há migração de hash.
