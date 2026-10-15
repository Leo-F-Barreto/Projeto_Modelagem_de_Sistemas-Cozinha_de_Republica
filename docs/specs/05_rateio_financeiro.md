# Especificação: Registro e Rateio Financeiro de Compras Coletivas
<!-- File: docs/specs/05_rateio_financeiro.md -->
<!-- Mantido por: Dev + PO + Agente -->
<!-- Status: Ativo / Baseado no Padrão EARS -->

## 1. Contexto e Visão Geral
O módulo de Rateio Financeiro gerencia a contabilidade interna da república no que tange às despesas compartilhadas da cozinha (mantimentos comuns, gás, produtos de limpeza e itens básicos). O objetivo central é eliminar atritos interpessoais automatizando a divisão igualitária dos gastos, calculando a compensação cruzada de saldos credores e devedores e mantendo a transparência contábil de quem deve para quem.

### Atores Envolvidos
* **Morador:** Registra compras realizadas informando comprovante e valor gasto; consulta seu extrato e débitos.
* **Administrador / Morador Responsável:** Aprova notas fiscais e oficializa o fechamento periódico do balanço de acerto de contas.
* **Sistema:** Calcula as quotas-partes, realiza a compensação contábil e atualiza os saldos.

---

## 2. Requisitos Funcionais (EARS)

* **RF-05.1 (Registro de Compra Coletiva - RF-05 Base)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um morador registrar uma despesa coletiva informando valor total, descrição dos itens, data da compra e o morador pagador, **THE SYSTEM SHALL** criar o registro da despesa, anexar o comprovante opcional e disparar o recálculo imediato do rateio.

* **RF-05.2 (Divisão Igualitária da Despesa entre Moradores Ativos)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** uma despesa coletiva de valor $V$ for processada pelo sistema, **THE SYSTEM SHALL** identificar o número total de moradores ativos $N$ no instante do lançamento e debitar uma quota-parte de $\frac{V}{N}$ no saldo individual de cada morador ativo (incluindo o pagador), creditando o valor integral $V$ na conta do morador pagador.

* **RF-05.3 (Compensação Implícita e Automática de Saldos Cruzados)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** uma nova despesa ou pagamento for creditado a um morador, **THE SYSTEM SHALL** abater prioritariamente seus débitos pré-existentes perante a república antes de constituir ou expandir saldo líquido credor para o mesmo.

* **RF-05.4 (Consulta da Matriz de Liquidação "Quem Deve Para Quem")**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** qualquer morador solicitar a visualização do acerto de contas, **THE SYSTEM SHALL** exibir o saldo líquido individual (positivo/credor ou negativo/devedor) e uma matriz simplificada de transferências mínimas recomendadas para liquidação dos débitos.

* **RF-05.5 (Fechamento e Liquidação de Balanço)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** o Administrador confirmar a quitação dos pagamentos de um ciclo (comprovando os acertos manuais realizados entre moradores), **THE SYSTEM SHALL** consolidar o balanço do ciclo anterior como "Liquidado", zerar os saldos liquidados e abrir um novo ciclo financeiro.

---

## 3. Tratamento de Exceções e Casos de Borda (EARS - Unwanted Behavior)

* **EX-05.1 (Valor Total Inválido ou Menor ou Igual a Zero)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** o morador submeter uma compra coletiva com valor total menor ou igual a $R\$\ 0,00$, **THEN THE SYSTEM SHALL** rejeitar o lançamento e exibir a mensagem de erro "O valor da compra deve ser um montante monetário positivo".

* **EX-05.2 (Ausência de Moradores Ativos)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** a quantidade de moradores marcados com status "Ativo" na república for igual a zero no momento do rateio, **THEN THE SYSTEM SHALL** bloquear o lançamento informando a impossibilidade matemática de divisão.

* **EX-05.3 (Tentativa de Rateio com Moradores Inativos)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** existirem moradores cadastrados na república com status "Inativo" no momento do registro da compra, **THEN THE SYSTEM SHALL** excluí-los compulsoriamente do cálculo da quota-parte, particionando a despesa estritamente entre os membros ativos.

* **EX-05.4 (Tratamento de Resto em Divisões com Centavos Fracionários)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** a divisão do valor total $V$ pelo número de moradores ativos $N$ resultar em centavos residuais não divisíveis (dízima periódica), **THEN THE SYSTEM SHALL** alocar a diferença residual de $R\$\ 0,01$ no débito do morador pagador para preservar o somatório exato de partidas dobradas contábeis.

* **EX-05.5 (Usuário Não-Administrador Tentando Fechar Balanço)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um morador sem perfil de Administrador tentar executar a liquidação ou fechamento de balanço contábil, **THEN THE SYSTEM SHALL** rejeitar a requisição com HTTP 403 Forbidden.

---

## 4. Requisitos Não-Funcionais (EARS)

* **RNF-05.1 (Precisão Monetária e Ausência de Arredondamento Flutuante)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** executar todas as operações aritméticas financeiras utilizando tipos de precisão decimal exata (ex: `Decimal` em Python ou colunas `NUMERIC(10,2)` no banco de dados), sendo terminantemente proibido o uso de números de ponto flutuante binário (`float`) que possam introduzir imprecisões de centavos.

* **RNF-05.2 (Desempenho no Recálculo de Saldos)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** recalcular a matriz completa de compensação de saldos em tempo inferior a 500 milissegundos para repúblicas com até 50 moradores e 2.000 lançamentos no ciclo aberto.

---

## 5. Regras de Negócio Invioláveis (RB)

* **RB-02 (Divisão Igualitária de Itens Coletivos):** O custo de qualquer compra registrada sob a categoria *Uso Coletivo* deve ser dividido em partes exatamente iguais entre todos os moradores cadastrados como ativos no momento do lançamento da nota.
* **RB-03 (Compensação Implícita de Saldos):** O valor gasto por um morador em uma compra coletiva deve ser abatido de suas dívidas acumuladas em compras anteriores feitas por outros membros antes de gerar saldo credor.
* **RB-09 (Irrevogabilidade de Despesas Faturadas):** Uma despesa coletiva pertencente a um ciclo já fechado e liquidado não pode ser editada nem excluída do sistema, devendo eventuais estornos ser lançados como novos lançamentos compensatórios no ciclo vigente.

---

## 6. Critérios de Aceite e Testabilidade (SDD)

- [ ] **CT-05.1 (Rateio Simples de Compra Coletiva):** Três moradores ativos (A, B, C). Morador A paga R$ 60,00. Quota-parte de R$ 20,00 para cada. Saldo final: A = +R$ 40,00; B = -R$ 20,00; C = -R$ 20,00.
- [ ] **CT-05.2 (Compensação Implícita Cruzada - RB-03):** Cenário anterior (B deve R$ 20). Em seguida, Morador B paga nova compra de R$ 30,00 (quota de R$ 10 para cada). Saldo de B: -R$ 20 + R$ 30 - R$ 10 = R$ 0,00.
- [ ] **CT-05.3 (Isolamento de Morador Inativo):** 3 moradores (2 ativos, 1 inativo). Compra de R$ 100,00. O sistema deve dividir entre 2 moradores (R$ 50 para cada), sem imputar débito ao inativo.
- [ ] **CT-05.4 (Rejeição de Valor Negativo ou Zero):** Tentar registrar compra com valor R$ 0,00 ou -R$ 15,00. O sistema deve retornar erro 400 Bad Request.
