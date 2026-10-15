# Especificação: Gestão de Estoque e Categorização
<!-- File: docs/specs/01_gestao_estoque.md -->
<!-- Mantido por: Dev + PO + Agente -->
<!-- Status: Ativo / Baseado no Padrão EARS -->

## 1. Contexto e Visão Geral
O módulo de Gestão de Estoque é responsável pelo controle centralizado de todos os itens alimentícios, temperos e materiais de uso comum ou individual armazenados nas dependências compartilhadas da cozinha (armários, geladeira e despensa). O sistema distingue claramente itens de consumo compartilhado de itens exclusivos de um único morador, prevenindo compras duplicadas e garantindo organização.

### Atores Envolvidos
* **Morador:** Consulta, cadastra e atualiza itens de sua propriedade ou de uso comum.
* **Administrador:** Gerencia parâmetros globais e configurações de estoque mínimo.
* **Sistema (Notificador):** Monitora níveis de estoque e valida consistência dos dados.

---

## 2. Requisitos Funcionais (EARS)

* **RF-01.1 (Cadastro de Novo Produto no Estoque)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** o morador cadastrar um novo produto informando nome, quantidade, unidade de medida, data de validade, compartimento de armazenamento e classificação (*Uso Coletivo* ou *Uso Individual*), **THE SYSTEM SHALL** persistir o registro no estoque e disponibilizá-lo para consulta imediata no painel.

* **RF-01.2 (Vinculação de Propriedade Individual)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um produto for cadastrado sob a classificação *Uso Individual*, **THE SYSTEM SHALL** associar obrigatoriamente o identificador do morador autenticado como único proprietário do item.

* **RF-01.3 (Definição de Estoque Mínimo para Itens Coletivos)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um produto de *Uso Coletivo* for cadastrado ou editado, **THE SYSTEM SHALL** registrar o valor de estoque mínimo de segurança para fins de monitoramento de reposição.

* **RF-01.4 (Consulta e Filtragem de Estoque)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** qualquer morador solicitar a visualização do estoque, **THE SYSTEM SHALL** retornar a listagem de produtos permitindo filtros por classificação (*Coletivo* / *Individual*), localização (armário, geladeira, despensa) e status de validade.

* **RF-01.5 (Atualização de Dados Cadastrais)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** o proprietário de um item individual ou qualquer morador para um item coletivo enviar alterações de dados cadastrais (ex: localização ou quantidade conferida), **THE SYSTEM SHALL** atualizar os dados do produto no banco e registrar a data da última conferência.

* **RF-01.6 (Exibição de Estoque Baixo)**
  * **Padrão EARS:** State-driven
  * **Especificação:** **WHILE** a quantidade disponível de um item de *Uso Coletivo* for menor ou igual ao seu estoque mínimo estipulado, **THE SYSTEM SHALL** exibir indicador visual de "Estoque Crítico / Necessita Reposição" na interface.

---

## 3. Tratamento de Exceções e Casos de Borda (EARS - Unwanted Behavior)

* **EX-01.1 (Campos Obrigatórios Ausentes)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** o morador submeter o formulário de cadastro de produto sem preencher nome, quantidade válida (> 0) ou data de validade, **THEN THE SYSTEM SHALL** rejeitar o cadastro e exibir mensagem informando os campos faltantes.

* **EX-01.2 (Data de Validade no Passado)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** a data de validade informada para um novo produto for anterior ou igual à data corrente no momento do cadastro, **THEN THE SYSTEM SHALL** rejeitar o cadastro e notificar que não é permitido cadastrar produtos já vencidos.

* **EX-01.3 (Tentativa de Modificação de Item Alheio)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um morador tentar alterar as propriedades cadastrais de um produto de *Uso Individual* pertencente a outro morador, **THEN THE SYSTEM SHALL** bloquear a operação e retornar erro de permissão com código HTTP 403 Forbidden.

* **EX-01.4 (Quantidade Negativa ou Nula)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** o valor de quantidade informado em qualquer operação de cadastro ou ajuste for menor ou igual a zero, **THEN THE SYSTEM SHALL** rejeitar a transação emitindo alerta de valor inválido.

---

## 4. Requisitos Não-Funcionais (EARS)

* **RNF-01.1 (Tempo de Resposta em Consultas)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** retornar o resultado de consultas e filtragens de estoque em tempo inferior a 800 milissegundos para bases de dados com até 10.000 itens sob condições normais de rede.

* **RNF-01.2 (Integridade Transacional)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** executar atualizações de quantidade e status de produtos dentro de transações com suporte a atomicidade (ACID), prevenindo inconsistências em acessos concorrentes.

---

## 5. Regras de Negócio Invioláveis (RB)

* **RB-01 (Propriedade Exclusiva de Itens Individuais):** Produtos classificados como *Uso Individual* pertencem unicamente ao morador que os cadastrou. Nenhum outro residente possui direito de alterar parâmetros, transferir posse ou descartar o item sem a autorização expressa do dono.
* **RB-05 (Identificação de Compartimento):** Nenhum item pode ser armazenado no sistema sem que seu compartimento físico (ex: "Geladeira - Gaveta Inferior", "Armário 2 - Prateleira 3") esteja declarado, garantindo localizabilidade rápida na cozinha física.

---

## 6. Critérios de Aceite e Testabilidade (SDD)

- [ ] **CT-01.1 (Cadastro Coletivo com Sucesso):** Enviar POST com dados completos de item coletivo; verificar persistência, status 201 Created e presença na listagem geral.
- [ ] **CT-01.2 (Cadastro Individual com Proprietário):** Cadastrar item individual com Morador A logado; verificar se o campo `morador_id` é gravado com o ID do Morador A.
- [ ] **CT-01.3 (Bloqueio de Validade Passada):** Tentar cadastrar item com validade ontem; confirmar que o sistema retorna erro 400 Bad Request e nenhum registro é inserido.
- [ ] **CT-01.4 (Bloqueio de Alteração Indevida):** Morador B tenta atualizar localização do item individual do Morador A; verificar resposta 403 Forbidden e integridade do registro.
