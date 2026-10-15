# Especificação: Escala de Limpeza e Cozinha
<!-- File: docs/specs/06_escala_tarefas.md -->
<!-- Mantido por: Dev + PO + Agente -->
<!-- Status: Ativo / Baseado no Padrão EARS -->

## 1. Contexto e Visão Geral
A convivência harmoniosa em repúblicas exige previsibilidade e equidade na divisão dos afazeres domésticos da cozinha (lavagem de louça comum, higienização de fogão e geladeira, descarte do lixo e preparo de almoço/jantar coletivo). Este módulo é responsável pela distribuição rotativa automatizada das tarefas entre os moradores ativos, acompanhamento do cumprimento e viabilização de trocas consensuais de turnos.

### Atores Envolvidos
* **Morador:** Consulta suas atribuições, marca tarefas cumpridas e solicita trocas de turnos com outros residentes.
* **Administrador:** Configura os tipos de tarefas, periodicidade e regras da escala.
* **Sistema (Notificador Automatizado):** Gera a grade periódica e envia avisos de lembrete.

---

## 2. Requisitos Funcionais (EARS)

* **RF-06.1 (Geração Automática da Grade Rotativa de Escala)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um novo ciclo semanal de tarefas for iniciado ou configurado pelo Administrador, **THE SYSTEM SHALL** distribuir os turnos de limpeza e cozinha de forma rotativa e balanceada exclusivamente entre os moradores com status "Ativo".

* **RF-06.2 (Marcação de Tarefa Concluída)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** o morador responsável pelo turno marcar a tarefa como "Concluída", **THE SYSTEM SHALL** atualizar o status do turno para cumprido, registrando a data e hora do encerramento e pontuando o morador no histórico de participação da casa.

* **RF-06.3 (Solicitação de Troca de Turno entre Moradores - RF-06 Base)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um morador titular solicitar a troca de um turno atribuído a si indicando outro morador da república, **THE SYSTEM SHALL** criar um pedido de troca com status "Pendente de Confirmação" e notificar o morador destinatário.

* **RF-06.4 (Confirmação e Efetivação da Substituição de Turno)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** o morador convidado aceitar expressamente a proposta de troca pendente, **THE SYSTEM SHALL** transferir a titularidade do turno para o novo morador, atualizar imediatamente o calendário compartilhado da casa e notificar ambos os envolvidos sobre a confirmação da troca.

* **RF-06.5 (Exibição da Escala do Dia em Destaque)**
  * **Padrão EARS:** State-driven
  * **Especificação:** **WHILE** houver tarefas pendentes de execução programadas para a data corrente, **THE SYSTEM SHALL** exibir em destaque no painel principal da república o nome dos moradores responsáveis pelo turno de hoje e o horário previsto.

---

## 3. Tratamento de Exceções e Casos de Borda (EARS - Unwanted Behavior)

* **EX-06.1 (Recusa ou Rejeição de Solicitação de Troca)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** o morador solicitado recusar o pedido de troca de turno ou não responder no prazo de 24 horas antes do início do turno, **THEN THE SYSTEM SHALL** cancelar o pedido de troca e manter a responsabilidade integral sobre o morador titular original.

* **EX-06.2 (Tentativa de Troca de Turno Já Concluído ou Expirado)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um morador tentar iniciar uma solicitação de troca para um turno que já ocorreu no passado ou já foi finalizado como "Concluído", **THEN THE SYSTEM SHALL** rejeitar a operação informando que não é permitido alterar turnos históricos.

* **EX-06.3 (Morador Inativo Incluído em Escala)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** o status de um morador for alterado para "Inativo", **THEN THE SYSTEM SHALL** cancelar automaticamente suas atribuições futuras de escala e redistribuir os turnos pendentes entre os moradores ativos restantes.

* **EX-06.4 (Conclusão por Terceiro Não Autorizado)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um morador tentar marcar como "Concluída" uma tarefa atribuída a outro morador sem ser o titular do turno nem um Administrador, **THEN THE SYSTEM SHALL** solicitar confirmação de cobertura de turno e registrar a ocorrência no histórico para auditoria.

---

## 4. Requisitos Não-Funcionais (EARS)

* **RNF-06.1 (Disponibilidade e Renderização do Calendário)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** renderizar a visão mensal ou semanal da escala de tarefas em tempo inferior a 1,0 segundo sob conexões móveis padrão.

* **RNF-06.2 (Sincronização de Notificações de Turno)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** enviar alerta push/notificação ao morador escalado com antecedência configurável (padrão de 2 horas antes do turno) com taxa de entrega comprovada superior a 99%.

---

## 5. Regras de Negócio Invioláveis (RB)

* **RB-10 (Princípio do Equilíbrio de Carga Doméstica):** O algoritmo de geração da escala deve garantir variância máxima de 1 turno entre o morador com maior e menor número de atribuições em qualquer janela de 30 dias consecutivos.
* **RB-11 (Bilateralidade Obrigatória em Trocas):** Nenhuma troca de turno produz efeitos no sistema sem o consentimento voluntário e explícito de ambas as partes ou uma intervenção deliberada do Administrador da casa.

---

## 6. Critérios de Aceite e Testabilidade (SDD)

- [ ] **CT-06.1 (Geração de Escala Justa):** Com 4 moradores ativos e 28 turnos no mês, cada morador deve receber exatamente 7 turnos.
- [ ] **CT-06.2 (Fluxo Completo de Troca Consensual - RF-06):** Morador A envia proposta de troca para Morador B. Morador B aceita via API. Verificar que o turno agora tem Morador B como responsável e histórico gravado.
- [ ] **CT-06.3 (Cancelamento de Troca por Recusa):** Morador A envia proposta para Morador B. Morador B rejeita. Verificar que a responsabilidade permanece com Morador A.
- [ ] **CT-06.4 (Exclusão Automática de Inativo):** Morador C torna-se inativo; seus turnos pendentes para a próxima semana são redistribuídos entre A e B.
