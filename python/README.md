# CoChef 2.0: backend em Python

Reescrita do servidor do CoChef em **Python 3.12+ / FastAPI**, seguindo os ADRs 001 a 003 e 005.
A interface continua sendo a de `../public/` (HTML, CSS e JavaScript sem framework), agora ligada à API.
O código TypeScript em `../src/` não foi alterado e pode ser removido quando a equipe aprovar a troca.

| Camada | Tecnologia |
| :--- | :--- |
| API | FastAPI + Pydantic v2 (validação na borda, JSON em camelCase como antes) |
| Banco | SQLAlchemy 2 + Alembic; PostgreSQL 16 em produção, SQLite em desenvolvimento e testes |
| Segurança | bcrypt (custo 12), JWT HS256 de 24 h, limite de tentativas no login, cabeçalhos CSP/HSTS |
| Rotinas | APScheduler: vencimentos, alertas, lembretes e trocas expiradas às 00:01 e a cada hora |
| Testes | pytest (122 testes, rodam no SQLite e no PostgreSQL) |

## Como rodar

Com [uv](https://docs.astral.sh/uv/) (ou `pip`), dentro desta pasta:

```bash
uv venv && uv pip install -e ".[dev]"          # ou: python -m venv .venv && pip install -e ".[dev]"
.venv/bin/python -m app.main                   # Windows: .venv\Scripts\python -m app.main
```

Abra <http://localhost:3000>, crie a república e convide os moradores pelo código que aparece em **Moradores**.
Na primeira subida o servidor aplica as migrações e cria `dados/cochef.db`.

Com PostgreSQL via Docker (a partir desta pasta):

```bash
COCHEF_JWT_SEGREDO="um-texto-aleatorio-com-32-ou-mais-caracteres" docker compose up --build
```

As variáveis estão em [.env.example](.env.example).

## Testes e qualidade

```bash
.venv/bin/pytest                                # SQLite em memória
COCHEF_TESTE_DB_URL=postgresql+psycopg://usuario@localhost:5432/cochef_teste .venv/bin/pytest   # PostgreSQL
.venv/bin/ruff check . && .venv/bin/mypy app
```

Os testes da versão TypeScript foram portados um a um (mesmos cenários e códigos de erro) e os 13 testes da fase vermelha
da T-46 (lotes) agora passam, em `tests/test_lotes.py`. Há também testes novos para as decisões abaixo e para a interface.

### Exemplo de falha (de propósito)

`tests/demonstracao/defeito_rateio_demo.py` é a tradução de `tests/demonstracao/defeito-rateio.demo.ts`. Ele aplica as
verificações do rateio a uma cópia com defeito (o centavo residual some) para mostrar como uma falha é apontada.
Não entra na suíte padrão, porque o nome não começa com `test_`. Para rodar:

```bash
.venv/bin/pytest tests/demonstracao/defeito_rateio_demo.py   # esperado: 2 falham, 1 passa (o de controle)
```

### Equivalência com os comandos npm

| TypeScript | Python (dentro de `python/`) |
| :--- | :--- |
| `npm start` | `.venv/bin/python -m app.main` |
| `npm test` | `.venv/bin/pytest` |
| `npm run test:red` | não há mais fase vermelha: os testes de lotes estão em `tests/test_lotes.py` e passam |
| `npm run test:demo-falha` | `.venv/bin/pytest tests/demonstracao/defeito_rateio_demo.py` |

## Estrutura

```
app/
  main.py            criação da aplicação, middleware de segurança, tratamento de erros, agendador
  config.py          configuração por variáveis de ambiente (prefixo COCHEF_)
  relogio.py         "hoje" injetável (fuso America/Sao_Paulo; relógio fixo nos testes)
  dominio/           regras puras: datas, validade, rateio, acerto, escala, lotes (FEFO)
  seguranca/         senha (bcrypt + política) e token (JWT)
  db/                modelos SQLAlchemy, sessão, migrações Alembic
  servicos/          casos de uso (estoque, lista, finanças, escala, república, notificações, rotinas)
  api/               rotas, esquemas Pydantic e dependências (sessão por requisição, autenticação)
tests/               pytest (demonstracao/: exemplo de falha de propósito)
```

Cada requisição roda numa transação: confirma no sucesso e desfaz em qualquer erro.

## O que mudou em relação à versão TypeScript

Comportamento novo ou corrigido (detalhes e texto proposto para as specs em [MUDANCAS.md](MUDANCAS.md)):

1. **Lotes por produto (T-46, RF-17, RB-11):** cada reposição com validade diferente vira um lote; o consumo sai do lote que vence primeiro; quem vence é o lote.
2. **Senhas com bcrypt (custo 12)** e política mínima: 8 caracteres, 1 número e 1 maiúscula (HTTP 422 `SENHA_FRACA`). Senhas antigas em scrypt não migram: é preciso recadastrar.
3. **Token de 24 horas.**
4. **Compartimento físico obrigatório** no cadastro de produto, com filtro por compartimento, classificação e estado.
5. **Lista de compras com quantidade:** itens iguais são consolidados; a sugestão automática repõe até o dobro do mínimo.
6. **Histórico de consumo dos últimos 30 dias.**
7. **Consumo indevido auditado:** a tentativa de baixar item individual alheio fica na trilha de auditoria.
8. **Trocas só de turnos futuros:** pedidos sem resposta expiram na véspera do primeiro turno envolvido.
9. **A interface usa a API:** login e cadastro, dados reais por república, ações de administrador só para administradores.
