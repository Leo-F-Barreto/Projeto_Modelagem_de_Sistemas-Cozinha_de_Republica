# Especificação: Monitoramento de Validade e Alertas Críticos
<!-- File: docs/specs/03_monitoramento_validade.md -->
<!-- Mantido por: Dev + PO + Agente -->
<!-- Status: Ativo / Baseado no Padrão EARS -->

## 1. Contexto e Visão Geral
O monitoramento contínuo da data de validade dos alimentos estocados é uma funcionalidade essencial para eliminar o desperdício alimentar e prevenir riscos à saúde dos moradores. O sistema analisa proativamente as datas de vencimento em relação ao tempo real, alertando os moradores com antecedência calculada e desabilitando o consumo de produtos vencidos.

### Atores Envolvidos
* **Morador:** Visualiza alertas em destaque e recebe notificações sobre produtos que exigem consumo rápido.
* **Sistema (Notificador Automatizado):** Realiza a checagem cronológica diária e altera os estados dos itens.

---

## 2. Requisitos Funcionais (EARS)

* **RF-03.1 (Destaque Contínuo de Validade Crítica)**
  * **Padrão EARS:** State-driven
  * **Especificação:** **WHILE** houver produtos em estoque com prazo de validade inferior ou igual a 3 dias a partir da data atual e com status "Ativo", **THE SYSTEM SHALL** exibir um painel com banner de destaque visual categorizado como *Validade Crítica* no topo do painel principal da república.

* **RF-03.2 (Disparo de Notificação para Itens Coletivos Críticos)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** a rotina diária de verificação identificar que um produto de *Uso Coletivo* entrou em estado de *Validade Crítica*, **THE SYSTEM SHALL** disparar uma notificação de alerta a todos os moradores ativos cadastrados na casa, informando o nome do produto, compartimento e dias restantes.

* **RF-03.3 (Disparo de Notificação para Itens Individuais Críticos)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** a rotina diária de verificação identificar que um produto de *Uso Individual* entrou em estado de *Validade Crítica*, **THE SYSTEM SHALL** disparar uma notificação de alerta direcionada prioritariamente ao morador proprietário do item.

* **RF-03.4 (Transição Automática para Status Vencido)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** a data corrente ultrapassar a data de validade registrada de qualquer produto ainda não consumido, **THE SYSTEM SHALL** alterar automaticamente o status do produto para "Vencido/Descartado" e registrá-lo na fila de descarte físico da cozinha.

* **RF-03.5 (Confirmação Manual de Descarte)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um morador confirmar o descarte no lixo de um produto com status "Vencido/Descartado", **THE SYSTEM SHALL** dar baixa final no registro arquivando o item no relatório de perdas e desperdícios da república.

---

## 3. Tratamento de Exceções e Casos de Borda (EARS - Unwanted Behavior)

* **EX-03.1 (Falha no Canal de Notificação Externa)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** o serviço externo de envio de notificações (push/e-mail/chat) falhar ou estiver inacessível, **THEN THE SYSTEM SHALL** registrar o erro no log de eventos, enfileirar nova tentativa com backoff exponencial e manter o alerta visível no painel web/mobile.

* **EX-03.2 (Produto com Data de Validade Inválida ou Nula)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um produto estocado apresentar data de validade nula ou em formato ilegível, **THEN THE SYSTEM SHALL** assinalar o item como "Validade Pendente de Verificação" e notificar o morador que o cadastrou para correção imediata.

* **EX-03.3 (Tentativa de Restaurar Item Vencido)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um usuário tentar alterar manualmente o status de um item de "Vencido/Descartado" de volta para "Ativo" sem alterar a data de validade para o futuro, **THEN THE SYSTEM SHALL** bloquear a operação e exigir a comprovação de extensão de validade válida.

---

## 4. Requisitos Não-Funcionais (EARS)

* **RNF-03.1 (Agendamento e Precisão Temporal)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** executar a rotina de verificação de validades pontualmente à 00:01 (horário local oficial configurado para a república) todos os dias, com tempo total de processamento inferior a 60 segundos.

* **RNF-03.2 (Consistência de Fuso Horário)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** padronizar o armazenamento de datas em UTC no banco de dados e computar as diferenças de dias utilizando o fuso horário geográfico cadastrado nas configurações da república.

---

## 5. Regras de Negócio Invioláveis (RB)

* **RB-04 (Incapacidade de Consumo por Vencimento):** Qualquer item estocado cuja data de validade seja ultrapassada sem consumo deve ter seu status alterado para "Vencido/Descartado" e seu valor deduzido do estoque ativo, não podendo mais ser selecionado para consumo sob hipótese alguma.
* **RB-06 (Definição Estrita do Período de Validade Crítica):** Considera-se em *Validade Crítica* todo item cujo intervalo entre a data atual e a data de vencimento seja menor ou igual a 72 horas (3 dias corridos).

---

## 6. Critérios de Aceite e Testabilidade (SDD)

- [ ] **CT-03.1 (Cálculo de Validade Crítica - 3 dias):** Produto com validade em `D+2`. A rotina deve marcá-lo como crítica e exibir no banner principal.
- [ ] **CT-03.2 (Transição Automática de Vencimento):** Produto com validade em `D-1`. A rotina deve alterar status para "Vencido/Descartado" e indisponibilizá-lo para consumo.
- [ ] **CT-03.3 (Notificação Segmentada Coletiva vs Individual):** Simular rotina diária com 1 item coletivo crítico e 1 item individual crítico; verificar que todos os moradores recebem aviso do coletivo e apenas o dono recebe o individual.
- [ ] **CT-03.4 (Bloqueio de Consumo de Vencido):** Chamar rota de consumo para item com status "Vencido/Descartado"; certificar retorno de erro e nenhuma alteração na quantidade.
