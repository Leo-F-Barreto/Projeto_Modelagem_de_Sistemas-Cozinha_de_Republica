# Especificação: Lista de Compras Colaborativa e Reposição
<!-- File: docs/specs/04_lista_compras.md -->
<!-- Mantido por: Dev + PO + Agente -->
<!-- Status: Ativo / Baseado no Padrão EARS -->

## 1. Contexto e Visão Geral
A Lista de Compras Colaborativa funciona como a ponte de reposição entre o estoque físico e o planejamento financeiro da casa. Ela automatiza a identificação de mantimentos que estão em falta ou em nível crítico, além de permitir que os moradores adicionem itens manualmente de forma sincronizada, otimizando as idas ao supermercado e evitando compras duplicadas ou esquecimentos.

### Atores Envolvidos
* **Morador:** Consulta a lista no mercado, marca itens adquiridos e adiciona demandas manuais.
* **Sistema:** Insere produtos automaticamente ao detectar que o estoque atingiu o limite de segurança.

---

## 2. Requisitos Funcionais (EARS)

* **RF-04.1 (Inclusão Automática por Nível de Estoque de Segurança)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** a quantidade disponível de um produto de *Uso Coletivo* for decrementada para um valor menor ou igual ao seu estoque mínimo cadastrado, **THE SYSTEM SHALL** adicionar automaticamente o item à lista de compras coletiva com a quantidade sugerida para atingir a meta ideal de estoque.

* **RF-04.2 (Adição Manual de Item à Lista)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** qualquer morador ativo adicionar manualmente um item informando nome, quantidade desejada e categoria de uso coletivo, **THE SYSTEM SHALL** incluir o item na lista de compras compartilhada com indicação do autor do pedido.

* **RF-04.3 (Marcação de Item Comprado em Tempo Real)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um morador assinalar um item como "Comprado" durante a ida ao supermercado, **THE SYSTEM SHALL** atualizar o status do item para "Comprado" e sugerir o direcionamento para o lançamento da despesa coletiva correspondente.

* **RF-04.4 (Remoção ou Edição de Itens da Lista)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um morador solicitar a exclusão de um item adicionado manualmente ou o ajuste da quantidade solicitada, **THE SYSTEM SHALL** atualizar a lista de compras e registrar o responsável pela alteração.

* **RF-04.5 (Visualização e Agrupamento da Lista)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um usuário acessar a lista de compras, **THE SYSTEM SHALL** exibir os itens pendentes ordenados por prioridade (itens com estoque zerado no topo, seguidos de itens com estoque baixo e itens manuais).

---

## 3. Tratamento de Exceções e Casos de Borda (EARS - Unwanted Behavior)

* **EX-04.1 (Item Já Presente na Lista de Compras)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um item de *Uso Coletivo* atingir o estoque mínimo ou for adicionado manualmente quando já existir um registro pendente idêntico na lista, **THEN THE SYSTEM SHALL** consolidar o registro existente recalculando a quantidade recomendada em vez de criar um item duplicado.

* **EX-04.2 (Tentativa de Inserir Item de Consumo Individual na Lista Coletiva)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um usuário tentar inserir um item marcado explicitamente como consumo pessoal na lista de compras coletiva da casa, **THEN THE SYSTEM SHALL** rejeitar a inclusão e orientar o morador a adquirir o produto por conta própria.

* **EX-04.3 (Adição com Quantidade Nula ou Inválida)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** a quantidade solicitada na adição manual for menor ou igual a zero, **THEN THE SYSTEM SHALL** bloquear a operação informando que a quantidade mínima de compra é de 1 unidade ou fração positiva.

---

## 4. Requisitos Não-Funcionais (EARS)

* **RNF-04.1 (Sincronização em Dispositivos Móveis)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** propagar alterações de itens marcados como comprados para todos os dispositivos conectados à lista em tempo inferior a 2 segundos sob conexão móvel (4G/5G/Wi-Fi).

* **RNF-04.2 (Usabilidade em Ambiente de Supermercado)**
  * **Padrão EARS:** State-driven
  * **Especificação:** **WHILE** o usuário estiver acessando a lista de compras em tela de toque mobile, **THE SYSTEM SHALL** fornecer elementos clicáveis (botões de check e contadores) com área de toque mínima de $48 \times 48$ pixels para facilitar o uso com uma única mão.

---

## 5. Regras de Negócio Invioláveis (RB)

* **RB-07 (Prioridade da Reposição Automática):** Itens inseridos automaticamente devido ao esgotamento do estoque coletivo não podem ser removidos da lista por um morador comum sem que haja uma justificativa registrada ou a reposição física do estoque.
* **RB-08 (Vínculo da Compra ao Rateio):** Todo lote de itens marcado como comprado na lista deve gerar uma notificação sugerindo o registro da nota no módulo de Rateio Financeiro, garantindo a integridade do ciclo "Comprar -> Ratear -> Estocar".

---

## 6. Critérios de Aceite e Testabilidade (SDD)

- [ ] **CT-04.1 (Gatilho de Reposição Automática):** O item "Açúcar" tem estoque mínimo 2. Morador consome e deixa saldo 1. O sistema deve criar automaticamente entrada na lista de compras pendente.
- [ ] **CT-04.2 (Evitar Duplicatas na Lista):** Produto já listado com quantidade 2. Novo gatilho pede 1. A quantidade total deve ser ajustada para 3 sem criar uma segunda linha na tabela.
- [ ] **CT-04.3 (Marcação de Comprado):** Morador clica em comprar no item "Leite". O item muda de estado para "Comprado" e fica disponível para associação com o rateio da compra.
- [ ] **CT-04.4 (Validação de Quantidade Positiva):** Tentar submeter compra com quantidade 0; verificar rejeição e mensagem de validação clara.
