# Fase vermelha — T-46: lotes por produto

| | |
| :--- | :--- |
| **Tarefa** | T-46 — Lotes por produto, cada um com sua validade |
| **Origem** | US-16 ("Como morador, quero controlar lotes com validades diferentes do mesmo produto"); revisão de arquitetura A-02 |
| **Requisitos propostos** | RF-17 (novo), RB-11 (nova), RB-04, RF-03 e RF-04 (estendidas a lotes) |
| **Arquivo de testes** | `tests/red/lotes.red.ts` |
| **Como rodar** | `npm run test:red` |
| **Data** | 22/10/2026 |
| **Resultado** | **13 testes, 0 aprovados, 13 reprovados**, como esperado nesta fase |

## 1. O que é a fase vermelha

No ciclo do TDD (*vermelho → verde → refatorar*), a fase vermelha vem antes do código: escrevem-se os testes do comportamento desejado e confirma-se que **eles falham**. Isso prova duas coisas:

1. **A funcionalidade ainda não existe.** Se um teste novo já passasse, ele não estaria testando nada de novo.
2. **O teste é capaz de falhar, e falha pelo motivo certo.** Um teste que nunca foi visto vermelho pode estar passando por acidente.


## 2. O problema que a T-46 resolve

Hoje um produto tem **uma única validade** (achado A-02). Ao repor um produto ativo com outra data, a validade nova **sobrescreve** a antiga, e o estoque passa a fingir que tudo vence na data mais distante:

> A casa tem 1 presunto que vence em 12/03. Alguém repõe 3 presuntos que vencem em 30/03. O sistema passa a dizer que os 4 vencem em 30/03: o presunto de 12/03 **some do alerta de validade crítica** e, depois de vencido, **continua contando como estoque**.

Os testes desta fase reproduzem exatamente esse defeito.

## 3. Requisitos propostos

Pelo fluxo do projeto, a spec muda primeiro. Texto proposto para a [spec.md](../spec.md), no mesmo formato EARS:

- **RF-17 — Lotes de um produto** *(event-driven)*
  **WHEN** um morador cadastrar ou repuser um produto informando uma validade, **THE SYSTEM SHALL** registrar a entrada como um lote do produto, somando-a ao lote existente quando a validade for igual. A quantidade do produto é a soma dos lotes consumíveis, e a validade exibida é a do lote que vence primeiro.
- **RB-11 — Primeiro a vencer, primeiro a sair (FEFO).** O consumo baixa sempre o lote de validade mais próxima; se ele não bastar, completa com o seguinte. Lotes sem validade saem por último.
- **RB-04 (extensão).** Quem vence é o lote, não o produto: o lote vencido sai do estoque e o produto continua ativo com os lotes restantes. O produto só passa a *Vencido* quando todos os seus lotes vencerem.
- **RF-03 e RF-04 (extensão).** O alerta de validade crítica considera cada lote, e o mínimo de segurança considera a quantidade que resta depois de retirar os lotes vencidos.

## 4. Os testes

### 4.1 Unidade — regra pura (`src/dominio/lotes.ts`, a criar)

| # | Teste | Regra |
| :-: | :--- | :--- |
| 1 | consome primeiro o lote que vence antes, mesmo que tenha sido cadastrado depois | RB-11 |
| 2 | quando um lote não basta, completa com o próximo a vencer | RB-11 |
| 3 | lote sem validade é o último a sair | RB-11 |
| 4 | pedir mais do que a soma dos lotes é recusado | RF-02 |
| 5 | no dia do vencimento o lote vale; no dia seguinte, vence sozinho | RB-04 |

Os testes definem o contrato do módulo: `planejarConsumo(lotes, quantidade)` devolve quanto sai de cada lote, e `separarVencidos(lotes, hoje)` separa os lotes vencidos dos consumíveis.

### 4.2 Integração — comportamento visto pela API

| # | Teste | Regra |
| :-: | :--- | :--- |
| 6 | o cadastro cria o primeiro lote do produto | RF-17 |
| 7 | repor com outra validade cria um segundo lote, sem sobrescrever o primeiro | RF-17 |
| 8 | repor com a mesma validade soma no lote existente | RF-17 |
| 9 | o consumo baixa primeiro o lote que vence antes | RB-11 |
| 10 | o lote vencido sai do estoque e o produto continua ativo com o restante | RB-04 |
| 11 | o produto só fica VENCIDO quando todos os lotes vencem | RB-04 |
| 12 | um lote perto de vencer aparece no painel mesmo havendo lote novo | RF-03 |
| 13 | se o vencimento de um lote deixa o total no mínimo, o produto entra na lista de compras | RF-04 |

Os testes de integração usam a mesma infraestrutura da suíte oficial (`tests/apoio.ts`): aplicação inteira, SQLite em memória e relógio fixo em 10/03/2026, avançado explicitamente quando o teste precisa que um lote vença.

## 5. Resultado da execução

```
$ npm run test:red

▶ VERMELHO T-46 / RB-11: consumo por lotes (unidade)
  ✖ RB-11: consome primeiro o lote que vence antes, mesmo que tenha sido cadastrado depois
  ✖ RB-11: quando um lote não basta, completa com o próximo a vencer
  ✖ RB-11: lote sem validade é o último a sair
  ✖ RF-02: pedir mais do que a soma dos lotes é recusado
  ✖ RB-04 por lote: no dia do vencimento o lote vale; no dia seguinte, vence sozinho
✖ VERMELHO T-46 / RB-11: consumo por lotes (unidade)
▶ VERMELHO T-46 / RF-17: lotes por produto (API)
  ✖ RF-17: o cadastro cria o primeiro lote do produto
  ✖ RF-17: repor com outra validade cria um segundo lote, sem sobrescrever o primeiro
  ✖ RF-17: repor com a mesma validade soma no lote existente
  ✖ RB-11: o consumo baixa primeiro o lote que vence antes
  ✖ RB-04 por lote: o lote vencido sai do estoque e o produto continua ativo com o restante
  ✖ RB-04 por lote: o produto só fica VENCIDO quando todos os lotes vencem
  ✖ RF-03 por lote: um lote perto de vencer aparece no painel mesmo havendo lote novo
  ✖ RF-04 por lote: se o vencimento de um lote deixa o total no mínimo, o produto entra na lista de compras
✖ VERMELHO T-46 / RF-17: lotes por produto (API)
ℹ tests 13
ℹ suites 2
ℹ pass 0
ℹ fail 13
```

A suíte estável não é afetada pelos testes da fase vermelha: após este checkpoint, `npm test` passa com **90 de 90 aprovados**. O comando testa apenas arquivos `tests/*.test.ts`; o arquivo `tests/red/lotes.red.ts` fica deliberadamente separado até a implementação chegar à fase verde.

## 6. Cada teste falha pelo motivo certo

Conferir o motivo de cada falha é a parte mais importante desta fase. Uma falha por erro de digitação ou de montagem do teste não prova nada.

| # | Mensagem de erro | Por que é o motivo certo |
| :-: | :--- | :--- |
| 1–5 | `ERR_MODULE_NOT_FOUND: Cannot find module 'src/dominio/lotes.ts'` | O módulo de regras de lote ainda não existe. É a primeira falha esperada do TDD; quando ele for criado, os testes passarão a apontar o comportamento de cada função. |
| 6 | `o produto deve expor seus lotes` — esperado `[[2, '2026-03-12']]`, veio `undefined` | A API ainda não tem o conceito de lote. |
| 7 | `a validade exibida é a do lote que vence primeiro, não a do último reposto` — esperado `'2026-03-12'`, veio `'2026-03-25'` | **É o defeito A-02 em ação:** a reposição sobrescreveu a validade do lote mais antigo. |
| 8 | esperado `[[3, '2026-06-01']]`, veio `undefined` | Não há lotes para somar. |
| 9 | `o lote de 12/03 acabou e o de 25/03 perdeu 1 unidade` — veio `undefined` | O consumo baixa um número único, sem saber de qual lote. |
| 10 | `as 2 unidades vencidas não podem continuar contando como estoque` — **`7 !== 5`** | **Defeito real:** depois de 12/03, o estoque ainda conta as 2 unidades vencidas. |
| 11 | esperado `['ATIVO', [[1, '2026-03-14']]]`, veio lotes `undefined` | O status até coincide hoje (ATIVO), mas o produto não sabe que perdeu um lote. |
| 12 | `repor com validade longa não pode esconder o lote que está vencendo` — esperado `['Presunto']`, veio `[]` | **Defeito real:** o presunto que vence em 2 dias desapareceu do alerta de validade crítica. |
| 13 | esperado `['Ovos']`, veio `[]` | **Defeito real:** sobram só 2 ovos válidos (o mínimo), mas eles não entram na lista de compras porque o sistema ainda conta os 3 vencidos. |

Os testes 7, 10, 12 e 13 têm valor duplo: além de especificar a funcionalidade nova, mostram que o comportamento atual causa problemas concretos para os moradores (comida vencida contada como estoque e alerta de validade escondido).

## 7. Próximo passo: fase verde


1. **Spec:** incluir RF-17 e RB-11, estender RB-04, RF-03 e RF-04, e acrescentar uma linha ao histórico de mudanças.
2. **ADR-006:** registrar a decisão de modelar lotes (tabela `lote` ligada a `produto`), que altera o ADR-003.
3. **Domínio:** criar `src/dominio/lotes.ts` com `planejarConsumo` e `separarVencidos`, o que deve deixar os testes 1–5 verdes.
4. **Banco:** criar a tabela `lote` (produto, quantidade, validade) e migrar cada produto existente para um lote único com a sua validade atual.
5. **Serviços:** `cadastrarProduto` e `reporProduto` passam a gravar lotes; `consumirProduto` usa `planejarConsumo`; a rotina do notificador (`rotinas.ts`) vence lotes em vez de produtos; o DTO passa a expor `lotes`. Isso deve deixar os testes 6–13 verdes.
6. **Regressão:** `npm test` precisa continuar com 90 de 90. Atenção ao teste "reposição de produto vencido substitui o lote e exige nova validade", que deve continuar valendo.
7. **Promoção:** renomear `tests/red/lotes.red.ts` para `tests/lotes.test.ts` (que passa a entrar no `npm test` e no CI), atualizar a matriz de rastreabilidade e o `tasks.md`.

Depois da fase verde vem a refatoração, com os 103 testes (90 + 13) como rede de segurança, ajustando a contagem se novos testes estáveis forem adicionados antes da promoção.
