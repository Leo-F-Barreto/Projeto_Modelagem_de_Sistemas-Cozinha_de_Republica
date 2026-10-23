# Mudanças de comportamento na versão Python e texto proposto para as specs

Pela constituição do projeto, spec e código mudam juntos. Esta lista registra cada diferença em relação à versão
TypeScript e o texto EARS proposto para cada spec. Os testes que cobrem cada item estão indicados.

| # | Spec | Mudança | Teste |
| :-: | :--- | :--- | :--- |
| 1 | 01, 02, 03, 04 | **RF-17 / RB-11 (lotes, FEFO)**, com RB-04, RF-03 e RF-04 estendidas a lotes, como descrito em `red-phase-T-46.md`. Editar a validade de um produto com mais de um lote ativo é recusado (409 `VARIOS_LOTES`). Repor um produto que tem validade exige informar a validade do novo lote (422 `VALIDADE_OBRIGATORIA`). | `tests/test_lotes.py` |
| 2 | 07 | **RNF-07.1:** hash bcrypt com custo 12. **EX-07.5:** senha com ao menos 8 caracteres, 1 número e 1 letra maiúscula, senão HTTP 422 `SENHA_FRACA`. | `test_dominio.py`, `test_auth.py` |
| 3 | 07 | **RF-07.2:** o token expira em 24 horas. Resposta de sessão inclui `tokenType: "bearer"` e `expiraEm`. | `test_auth.py` |
| 4 | 01 | **RF-01:** WHEN um morador cadastrar um produto, THE SYSTEM SHALL exigir o compartimento físico (2 a 60 caracteres). A listagem aceita os filtros `compartimento`, `classificacao` e `estado`. | `test_estoque.py`, `test_auth.py` |
| 5 | 04 | **RF-04:** cada item da lista tem quantidade e unidade; adicionar um item com o mesmo nome de um pendente soma as quantidades; `PATCH /api/lista/{id}` ajusta a quantidade. A sugestão automática usa `max(2 × mínimo − atual, mínimo, 1)`. Itens marcados como individuais não entram na lista coletiva (`ITEM_INDIVIDUAL`). | `test_estoque.py` |
| 6 | 02 | **RF-02:** o histórico de consumo mostra os últimos 30 dias. | `test_estoque.py` |
| 7 | 02 | **RB-01:** IF um morador tentar baixar item individual de outro, THEN THE SYSTEM SHALL recusar (403) e registrar `CONSUMO_INDEVIDO` na auditoria. | `test_estoque.py` |
| 8 | 06 | **RF-06.3:** só se trocam turnos pendentes a partir de amanhã. **RF-06.4:** o pedido sem resposta é cancelado na véspera do primeiro turno envolvido, pela rotina ou no aceite tardio (`TROCA_EXPIRADA`). | `test_escala.py` |
| 9 | globais | Valores em centavos inteiros (mantido); datas no fuso `America/Sao_Paulo`; corpo de requisição limitado a 64 KB (413); 10 tentativas de login/cadastro por IP a cada 60 s (429). | `test_auth.py` |

## Mantido como estava

- Validade continua opcional (produtos sem validade nunca entram em alerta).
- Ao desativar um morador, os turnos futuros pendentes dele são removidos (não redistribuídos); a próxima geração da escala preenche as lacunas.
- Códigos de erro e formato `{"erro": {"codigo", "mensagem"}}`, rotas e nomes dos campos JSON.

## Arquitetura

- [ADR-006](../docs/adr/006-lotes-por-produto.md): lotes por produto.
- [ADR-007](../docs/adr/007-reescrita-python-mantendo-html.md): backend em Python/FastAPI, interface HTML mantida (revisa o ADR-004).
