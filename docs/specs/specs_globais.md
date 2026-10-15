# Índice e Consolidação Geral de Especificações (CoChef)
<!-- File: docs/specs/specs_globais.md -->
<!-- Mantido por: Dev + PO + Agente -->
<!-- Status: Ativo / Baseado no Padrão EARS -->

Este documento centraliza e consolida os requisitos gerais e a arquitetura de especificações do sistema **Cozinha de República (CoChef)**, seguindo a metodologia **Spec-Driven Development (SDD)** e o padrão **EARS (Easy Approach to Requirements Syntax)**.

Em alinhamento com a [Constituição do Projeto](../../constitution.md), cada função principal do sistema possui um documento de especificação detalhado e autônomo, contendo seus fluxos funcionais, tratamento formal de exceções (`IF/THEN`), requisitos não-funcionais mensuráveis e critérios de aceite verificáveis binariamente.

---

## 1. Mapa de Especificações por Função do Sistema

| Módulo / Função | Documento de Especificação | Escopo e Responsabilidade Principal |
| :--- | :--- | :--- |
| **01. Gestão de Estoque** | [01_gestao_estoque.md](./01_gestao_estoque.md) | Cadastro, categorização (Coletivo vs Individual), localização e níveis de segurança. |
| **02. Consumo e Baixa** | [02_consumo_baixa.md](./02_consumo_baixa.md) | Baixa de alimentos, controle de posse individual, histórico e auditoria de consumo. |
| **03. Validade e Alertas** | [03_monitoramento_validade.md](./03_monitoramento_validade.md) | Monitoramento contínuo de validade crítica (≤ 3 dias), alertas visuais e descarte de vencidos. |
| **04. Lista de Compras** | [04_lista_compras.md](./04_lista_compras.md) | Reposição automática por estoque mínimo, adições manuais e marcação de compra em tempo real. |
| **05. Rateio Financeiro** | [05_rateio_financeiro.md](./05_rateio_financeiro.md) | Registro de compras coletivas, rateio igualitário, compensação contábil cruzada e liquidação. |
| **06. Escalas da Cozinha** | [06_escala_tarefas.md](./06_escala_tarefas.md) | Geração rotativa de tarefas, registro de cumprimento e protocolo bilateral de troca de turnos. |
| **07. Autenticação e Usuários** | [07_autenticacao_moradores.md](./07_autenticacao_moradores.md) | Autenticação JWT, senhas bcrypt com salt, papéis administrativos e status Ativo/Inativo. |

---

## 2. Requisitos Funcionais Consolidados (RF)

* **RF-01 (Cadastro e Classificação de Estoque)**
  * **Padrão EARS**: Event-driven
  * **Especificação**: **WHEN** o morador cadastrar um novo produto no estoque, **THE SYSTEM SHALL** registrar o nome, quantidade, data de validade e a classificação do item (*Uso Coletivo* ou *Uso Individual*).
  * *Detalhamento*: [01_gestao_estoque.md](./01_gestao_estoque.md)

* **RF-02 (Baixa/Consumo de Alimentos)**
  * **Padrão EARS**: Event-driven
  * **Especificação**: **WHEN** o morador registrar o consumo de um item estocado, **THE SYSTEM SHALL** decrementar a quantidade em estoque e atualizar o histórico de consumo da república.
  * *Detalhamento*: [02_consumo_baixa.md](./02_consumo_baixa.md)

* **RF-03 (Alerta Automatizado de Validade)**
  * **Padrão EARS**: State-driven
  * **Especificação**: **WHILE** houver produtos estocados com data de vencimento inferior a 3 dias, **THE SYSTEM SHALL** exibir um destaque de *Validade Crítica* no painel principal e enviar uma notificação aos moradores.
  * *Detalhamento*: [03_monitoramento_validade.md](./03_monitoramento_validade.md)

* **RF-04 (Gerenciamento da Lista de Compras)**
  * **Padrão EARS**: Event-driven
  * **Especificação**: **WHEN** um produto de *Uso Coletivo* atingir a quantidade mínima de segurança cadastrada, **THE SYSTEM SHALL** incluir automaticamente o item na lista de compras coletiva.
  * *Detalhamento*: [04_lista_compras.md](./04_lista_compras.md)

* **RF-05 (Registro e Rateio de Compras Coletivas)**
  * **Padrão EARS**: Event-driven
  * **Especificação**: **WHEN** o morador responsável registrar uma nota fiscal/compra coletiva informando o valor total e o pagador, **THE SYSTEM SHALL** recalcular o saldo individual de cada morador ativo e registrar os débitos/créditos no acerto financeiro.
  * *Detalhamento*: [05_rateio_financeiro.md](./05_rateio_financeiro.md)

* **RF-06 (Gestão e Troca de Escalas de Cozinha)**
  * **Padrão EARS**: Event-driven
  * **Especificação**: **WHEN** dois moradores solicitarem a troca de um turno na escala de limpeza ou preparo de refeições, **THE SYSTEM SHALL** registrar a substituição e atualizar o calendário compartilhado da casa.
  * *Detalhamento*: [06_escala_tarefas.md](./06_escala_tarefas.md)

* **RF-07 (Tratamento de Exceção – Baixa de Item Alheio)**
  * **Padrão EARS**: Unwanted behavior
  * **Especificação**: **IF** um morador tentar dar baixa em um produto classificado como *Uso Individual* pertencente a outro morador, **THEN THE SYSTEM SHALL** bloquear a ação e exibir uma mensagem informando a restrição de propriedade.
  * *Detalhamento*: [02_consumo_baixa.md](./02_consumo_baixa.md)

---

## 3. Requisitos Não-Funcionais Consolidados (RNF)

* **RNF-01 (Desempenho em Consultas e Processamento)**
  * **Padrão EARS**: Ubiquitous
  * **Especificação**: **THE SYSTEM SHALL** responder às consultas de estoque e saldo financeiro em tempo inferior a 1,5 segundos para requisições sob carga normal.

* **RNF-02 (Segurança e Proteção de Credenciais)**
  * **Padrão EARS**: Ubiquitous
  * **Especificação**: **THE SYSTEM SHALL** armazenar as senhas dos usuários utilizando o algoritmo de hashing *bcrypt* com *salt* e exigir autenticação via token JWT para todas as requisições privadas da API.
  * *Detalhamento*: [07_autenticacao_moradores.md](./07_autenticacao_moradores.md)

* **RNF-03 (Disponibilidade Operacional)**
  * **Padrão EARS**: Ubiquitous
  * **Especificação**: **THE SYSTEM SHALL** manter uma taxa de disponibilidade de no mínimo 99,0% calculada mensalmente.

* **RNF-04 (Usabilidade Responsiva Mobile-First)**
  * **Padrão EARS**: State-driven
  * **Especificação**: **WHILE** o sistema estiver sendo acessado em dispositivos móveis, **THE SYSTEM SHALL** adaptar sua interface para telas com largura a partir de 360px sem perda de funcionalidade ou sobreposição de componentes.

---

## 4. Regras de Negócio Globais (RB)

* **RB-01 (Política de Propriedade Individual)**
  * **Especificação**: Produtos cadastrados como *Uso Individual* pertencem exclusivamente ao morador que os cadastrou; nenhum outro morador pode alterar suas propriedades ou dar baixa sem autorização.
* **RB-02 (Divisão Igualitária de Itens Coletivos)**
  * **Especificação**: O custo de qualquer compra registrada sob a categoria *Uso Coletivo* deve ser dividido em partes exatamente iguais entre todos os moradores cadastrados como ativos no momento do lançamento da nota.
* **RB-03 (Compensação Implícita de Saldos)**
  * **Especificação**: O valor gasto por um morador em uma compra coletiva deve ser abatido de suas dívidas acumuladas em compras anteriores feitas por outros membros antes de gerar saldo credor.
* **RB-04 (Incapaz de Consumo por Vencimento)**
  * **Especificação**: Qualquer item estocado cuja data de validade seja ultrapassada sem consumo deve ter seu status alterado para "Vencido/Descartado" e seu valor deduzido do estoque ativo, não podendo mais ser selecionado para consumo.
