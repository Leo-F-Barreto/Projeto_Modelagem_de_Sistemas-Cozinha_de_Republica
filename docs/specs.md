### 1\. Requisitos Funcionais (RF)

* **RF-01 (Cadastro e Classificação de Estoque)**
* **Padrão EARS**: Event-driven
* **Especificação**: **WHEN** o morador cadastrar um novo produto no estoque, **THE SYSTEM SHALL** registrar o nome, quantidade, data de validade e a classificação do item (*Uso Coletivo* ou *Uso Individual*).
* **RF-02 (Baixa/Consumo de Alimentos)**
* **Padrão EARS**: Event-driven
* **Especificação**: **WHEN** o morador registrar o consumo de um item estocado, **THE SYSTEM SHALL** decrementar a quantidade em estoque e atualizar o histórico de consumo da república.
* **RF-03 (Alerta Automatizado de Validade)**
* **Padrão EARS**: State-driven
* **Especificação**: **WHILE** houver produtos estocados com data de vencimento inferior a 3 dias, **THE SYSTEM SHALL** exibir um destaque de *Validade Crítica* no painel principal e enviar uma notificação aos moradores.
* **RF-04 (Gerenciamento da Lista de Compras)**
* **Padrão EARS**: Event-driven
* **Especificação**: **WHEN** um produto de *Uso Coletivo* atingir a quantidade mínima de segurança cadastrada, **THE SYSTEM SHALL** incluir automaticamente o item na lista de compras coletiva.
* **RF-05 (Registro e Rateio de Compras Coletivas)**
* **Padrão EARS**: Event-driven
* **Especificação**: **WHEN** o morador responsável registrar uma nota fiscal/compra coletiva informando o valor total e o pagador, **THE SYSTEM SHALL** recalcular o saldo individual de cada morador ativo e registrar os débitos/créditos no acerto financeiro.
* **RF-06 (Gestão e Troca de Escalas de Cozinha)**
* **Padrão EARS**: Event-driven
* **Especificação**: **WHEN** dois moradores solicitarem a troca de um turno na escala de limpeza ou preparo de refeições, **THE SYSTEM SHALL** registrar a substituição e atualizar o calendário compartilhado da casa.
* **RF-07 (Tratamento de Exceção – Baixa de Item Alheio)**
* **Padrão EARS**: Unwanted behavior
* **Especificação**: **IF** um morador tentar dar baixa em um produto classificado como *Uso Individual* pertencente a outro morador, **THEN THE SYSTEM SHALL** bloquear a ação e exibir uma mensagem informando a restrição de propriedade.


### 2\. Requisitos Não-Funcionais (RNF)

* **RNF-01 (Desempenho/Desempenho em Consultas)**
* **Padrão EARS**: Ubiquitous
* **Especificação**: **THE SYSTEM SHALL** responder às consultas de estoque e saldo financeiro em tempo inferior a 1,5 segundos (P95) para requisições sob carga normal.
* **RNF-02 (Segurança e Proteção de Credenciais)**
* **Padrão EARS**: Ubiquitous
* **Especificação**: **THE SYSTEM SHALL** armazenar as senhas dos usuários utilizando o algoritmo de hashing *bcrypt* com *salt* e exigir autenticação via token JWT para todas as requisições privadas da API.
* **RNF-03 (Disponibilidade Operacional)**
* **Padrão EARS**: Ubiquitous
* **Especificação**: **THE SYSTEM SHALL** manter uma taxa de disponibilidade de no mínimo 99,0% calculada mensalmente.
* **RNF-04 (Usabilidade Responsiva Mobile-First)**
* **Padrão EARS**: State-driven
* **Especificação**: **WHILE** o sistema estiver sendo acessado em dispositivos móveis, **THE SYSTEM SHALL** adaptar sua interface para telas com largura a partir de 360px sem perda de funcionalidade ou sobreposição de componentes.


### 3\. Regras de Negócio (RB)

* **RB-01 (Política de Propriedade Individual)**
* **Especificação**: Produtos cadastrados como *Uso Individual* pertencem exclusivamente ao morador que os cadastrou; nenhum outro morador pode alterar suas propriedades ou dar baixa sem autorização.
* **RB-02 (Divisão Igualitária de Itens Coletivos)**
* **Especificação**: O custo de qualquer compra registrada sob a categoria *Uso Coletivo* deve ser dividido em partes exatamente iguais entre todos os moradores cadastrados como ativos no momento do lançamento da nota
* **RB-03 (Compensação Implicita de Saldos)**
* **Especificação**: O valor gasto por um morador em uma compra coletiva deve ser abatido de suas dívidas acumuladas em compras anteriores feitas por outros membros antes de gerar saldo credor.
* **RB-04 (Incapaz de Consumo por Vencimento)**
* **Especificação**: Qualquer item estocado cuja data de validade seja ultrapassada sem consumo deve ter seu status alterado para "Vencido/Descartado" e seu valor deduzido do estoque ativo, não podendo mais ser selecionado para consumo.
