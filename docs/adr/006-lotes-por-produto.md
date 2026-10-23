# ADR 006: Lotes por Produto com Consumo FEFO
<!-- File: docs/adr/006-lotes-por-produto.md -->
<!-- Status: Aprovado -->
<!-- Data: 2026-10-23 -->
<!-- Decisores: Tech Lead, Equipe de Modelagem de Sistemas -->

## Contexto
Um produto tinha uma única validade (achado A-02 da revisão de arquitetura). Ao repor um produto com outra data, a validade
nova sobrescrevia a antiga: o item mais antigo sumia do alerta de validade crítica e, depois de vencido, continuava contando
como estoque. A fase vermelha da T-46 (`red-phase-T-46.md`) registrou 13 testes que reproduzem o defeito.

## Decisão
Criar a tabela `lote` (produto, quantidade, validade, status). O produto passa a ser um agregado dos seus lotes:
* A quantidade do produto é a soma dos lotes ativos; a validade exibida é a do lote que vence primeiro.
* Repor com a mesma validade soma no lote existente; com outra validade, cria um lote novo (RF-17).
* O consumo baixa primeiro o lote que vence antes; lotes sem validade saem por último (RB-11, FEFO).
* Quem vence é o lote: o produto só fica *Vencido* quando todos os seus lotes vencerem (RB-04 estendida).
* Alertas de validade crítica e o mínimo de segurança consideram cada lote (RF-03 e RF-04 estendidas).

As regras puras ficam em `app/dominio/lotes.py` (`planejar_consumo`, `separar_vencidos`), sem acesso a banco.

## Consequências

### Positivas
* Estoque e alertas refletem o que de fato está na cozinha.
* As regras de lote são testáveis isoladamente e reaproveitadas pela rotina diária.

### Negativas / Riscos Mitigados
* *Risco:* editar a validade de um produto com vários lotes é ambíguo.
* *Mitigação:* a edição de validade só é aceita com um único lote ativo (409 `VARIOS_LOTES`); nos demais casos, repõe-se ou consome-se o lote.
* *Risco:* a quantidade do produto é um valor derivado.
* *Mitigação:* é recalculada na mesma transação de cada movimento, com trava de linha do produto no PostgreSQL.
