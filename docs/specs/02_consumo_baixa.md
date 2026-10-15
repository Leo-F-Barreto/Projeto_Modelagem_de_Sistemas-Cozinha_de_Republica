# Especificação: Consumo e Baixa de Alimentos
<!-- File: docs/specs/02_consumo_baixa.md -->
<!-- Mantido por: Dev + PO + Agente -->
<!-- Status: Ativo / Baseado no Padrão EARS -->

## 1. Contexto e Visão Geral
Esta especificação rege os fluxos de consumo e baixa de mantimentos e insumos estocados na cozinha da república. Toda retirada de itens do armário ou da geladeira deve ser registrada para manter a fidedignidade do estoque, alimentar o histórico de uso coletivo e impedir conflitos de convivência decorrentes do consumo indevido de itens individuais.

### Atores Envolvidos
* **Morador:** Registra o consumo de itens coletivos ou de itens individuais sob sua posse.
* **Sistema:** Valida permissões de propriedade, atualiza o saldo de estoque e audita a movimentação.

---

## 2. Requisitos Funcionais (EARS)

* **RF-02.1 (Baixa de Item de Uso Coletivo)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um morador autenticado registrar o consumo de uma quantidade $Q$ de um produto classificado como *Uso Coletivo*, **THE SYSTEM SHALL** subtrair $Q$ do estoque disponível do produto e gravar um evento no histórico de consumo contendo data, hora, ID do morador e quantidade consumida.

* **RF-02.2 (Baixa de Item de Uso Individual pelo Dono)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** o legítimo proprietário registrar o consumo de seu produto de *Uso Individual*, **THE SYSTEM SHALL** subtrair a quantidade consumida do estoque e atualizar o status do item.

* **RF-02.3 (Esgotamento Completo de Estoque)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** o consumo registrado fizer com que o saldo remanescente do produto chegue a zero, **THE SYSTEM SHALL** alterar o status do produto para "Esgotado" e remover o item da visualização ativa de itens disponíveis.

* **RF-02.4 (Consulta ao Histórico de Consumo)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** qualquer morador solicitar o histórico de consumo de itens coletivos, **THE SYSTEM SHALL** retornar a listagem cronológica decrescente dos consumos realizados nos últimos 30 dias.

---

## 3. Tratamento de Exceções e Casos de Borda (EARS - Unwanted Behavior)

* **EX-02.1 (Tentativa de Baixa em Item Individual Alheio - RF-07)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um morador tentar registrar consumo de um produto classificado como *Uso Individual* pertencente a outro morador, **THEN THE SYSTEM SHALL** bloquear imediatamente a operação, registrar tentativa indevida no log de auditoria e exibir a mensagem "Ação não permitida: Este produto pertence exclusivamente a [Nome do Dono]".

* **EX-02.2 (Consumo Superior ao Saldo em Estoque)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** a quantidade solicitada para baixa for superior à quantidade atualmente disponível no estoque, **THEN THE SYSTEM SHALL** rejeitar a operação e alertar que o saldo disponível é insuficiente.

* **EX-02.3 (Tentativa de Consumo de Item Marcado como Vencido)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um morador tentar dar baixa para consumo em um item cujo status seja "Vencido/Descartado", **THEN THE SYSTEM SHALL** impedir a operação e exibir mensagem informando que o produto expirou e deve ser descartado por razões sanitárias.

* **EX-02.4 (Valor de Baixa Negativo ou Zerado)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** o morador submeter quantidade consumida menor ou igual a zero, **THEN THE SYSTEM SHALL** rejeitar o comando exibindo erro de validação.

---

## 4. Requisitos Não-Funcionais (EARS)

* **RNF-02.1 (Atomicidade e Concorrência na Baixa)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** empregar controle de concorrência pessimista ou otimista nas operações de decremento de estoque para garantir que duas baixas simultâneas nunca resultem em estoque negativo ou inconsistência de saldo.

* **RNF-02.2 (Imutabilidade do Histórico de Consumo)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** persistir os registros de histórico de consumo como registros imutáveis (apenas inserção permitida, sem operações de update ou delete manual via interface).

---

## 5. Regras de Negócio Invioláveis (RB)

* **RB-01 (Inviolabilidade do Item Individual):** Sob hipótese alguma o sistema permitirá que morador não-proprietário reduza a contagem de estoque de item individual alheio.
* **RB-04 (Inadmissibilidade de Consumo de Vencidos):** Produtos com status "Vencido/Descartado" perdem a aptidão para consumo alimentício no sistema e só admitem a operação de descarte físico definitivo.

---

## 6. Critérios de Aceite e Testabilidade (SDD)

- [ ] **CT-02.1 (Baixa Parcial Coletiva):** Item coletivo tem 10 unidades. Morador consome 3. O saldo restante deve ser 7 e deve haver 1 registro criado no histórico de consumo.
- [ ] **CT-02.2 (Baixa Total e Status Esgotado):** Item tem 2 unidades. Morador consome 2. O saldo remanescente torna-se 0 e status vira "Esgotado".
- [ ] **CT-02.3 (Bloqueio de Consumo de Item Alheio - RF-07):** Morador 2 tenta consumir item individual do Morador 1. O sistema retorna HTTP 403, mensagem de restrição e o saldo permanece inalterado.
- [ ] **CT-02.4 (Rejeição de Quantidade Excedente):** Estoque de 1kg de farinha. Morador tenta dar baixa em 1.5kg. O sistema recusa com HTTP 400 Bad Request.
