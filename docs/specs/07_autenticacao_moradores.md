# Especificação: Autenticação, Usuários e Gestão de República
<!-- File: docs/specs/07_autenticacao_moradores.md -->
<!-- Mantido por: Dev + PO + Agente -->
<!-- Status: Ativo / Baseado no Padrão EARS -->

## 1. Contexto e Visão Geral
Este módulo gerencia o ciclo de vida dos usuários (moradores) dentro da plataforma Cozinha de República (CoChef), assegurando o controle rigoroso de autenticação, autorização de acesso a recursos, proteção criptográfica de credenciais e gestão de papéis hierárquicos (Morador Comum vs Administrador / Morador Responsável) e status de residência (Ativo vs Inativo).

### Atores Envolvidos
* **Morador Comum:** Registra-se, autentica-se e acessa suas informações e operações rotineiras da casa.
* **Administrador / Morador Responsável:** Gerencia parâmetros da república, cadastra/inativa moradores e aprova alterações críticas.
* **Sistema:** Valida tokens JWT, criptografa senhas e aplica barreiras de segurança nas rotas.

---

## 2. Requisitos Funcionais (EARS)

* **RF-07.1 (Cadastro de Novo Morador)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um novo usuário submeter formulário de cadastro com nome completo, e-mail único, telefone e senha válida, **THE SYSTEM SHALL** criar o registro de usuário com status inicial "Ativo" e perfil de "Morador Comum", gerando identificador único no sistema.

* **RF-07.2 (Autenticação e Emissão de Token de Sessão)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** o morador submeter requisição de login com e-mail e senha correspondentes ao registro persistido, **THE SYSTEM SHALL** gerar e retornar um token de acesso assinado digitalmente no padrão JWT (JSON Web Token) contendo o ID do usuário, perfil e prazo de expiração de 24 horas.

* **RF-07.3 (Alteração de Status para Morador Inativo)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** o Administrador registrar o desligamento de um morador da república, **THE SYSTEM SHALL** alterar o status do morador para "Inativo", revogar seus tokens de sessão ativos e suspender sua participação em novos rateios e escalas de tarefas.

* **RF-07.4 (Concessão de Privilégios de Administrador)**
  * **Padrão EARS:** Event-driven
  * **Especificação:** **WHEN** um Administrador em exercício promover outro morador ativo ao perfil de "Administrador / Morador Responsável", **THE SYSTEM SHALL** atualizar as permissões do perfil do usuário e registrar a delegação no log de governança.

* **RF-07.5 (Validação Contínua de Sessão)**
  * **Padrão EARS:** State-driven
  * **Especificação:** **WHILE** o morador interagir com rotas protegidas da API, **THE SYSTEM SHALL** validar a assinatura criptográfica e o prazo de validade do token JWT presente no cabeçalho `Authorization: Bearer <token>`.

---

## 3. Tratamento de Exceções e Casos de Borda (EARS - Unwanted Behavior)

* **EX-07.1 (Tentativa de Cadastro com E-mail Já Existente)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um novo usuário tentar se cadastrar utilizando um endereço de e-mail já registrado na base de dados, **THEN THE SYSTEM SHALL** rejeitar o cadastro com código HTTP 409 Conflict informando a duplicidade do identificador.

* **EX-07.2 (Credenciais de Login Incorretas)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** forem fornecidas credenciais de login inválidas (e-mail inexistente ou senha divergente), **THEN THE SYSTEM SHALL** rejeitar a autenticação com código HTTP 401 Unauthorized e mensagem genérica "E-mail ou senha inválidos", prevenindo ataques de enumeração de contas.

* **EX-07.3 (Token JWT Expirado, Malformado ou Revogado)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** uma requisição a endpoint privado apresentar token JWT expirado, com assinatura inválida ou manipulada, **THEN THE SYSTEM SHALL** recusar o acesso com código HTTP 401 Unauthorized e exigir novo login.

* **EX-07.4 (Tentativa de Acesso a Rota Administrativa por Morador Comum)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** um usuário autenticado com perfil de "Morador Comum" tentar executar operações exclusivas de administração (ex: fechar balanço ou inativar membros), **THEN THE SYSTEM SHALL** bloquear a operação com código HTTP 403 Forbidden.

* **EX-07.5 (Política de Senha Fraca)**
  * **Padrão EARS:** Unwanted behavior
  * **Especificação:** **IF** a senha submetida no cadastro ou alteração possuir menos de 8 caracteres ou não conter ao menos 1 número e 1 letra maiúscula, **THEN THE SYSTEM SHALL** rejeitar a submissão com código HTTP 422 Unprocessable Entity e detalhar os requisitos de complexidade exigidos.

---

## 4. Requisitos Não-Funcionais (EARS)

* **RNF-07.1 (Proteção de Credenciais com Hashing Seguro - RNF-02 Base)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** armazenar as senhas dos moradores exclusivamente como digests computados pelo algoritmo `bcrypt` com fator de custo (*work factor*) mínimo igual a 12 e *salt* gerado aleatoriamente por usuário, sendo proibido o trânsito ou armazenamento em texto plano.

* **RNF-07.2 (Tempo de Validação de Token JWT)**
  * **Padrão EARS:** Ubiquitous
  * **Especificação:** **THE SYSTEM SHALL** verificar e decodificar tokens JWT de requisições privadas em tempo inferior a 20 milissegundos por requisição sob regime de concorrência normal.

---

## 5. Regras de Negócio Invioláveis (RB)

* **RB-12 (Princípio da Não-Vacância Administrativa):** A república deve possuir obrigatoriamente no mínimo um Administrador ativo com mandato válido. O sistema não permitirá que o único Administrador restante renuncie ou inative sua própria conta sem antes transferir o privilégio administrativo para outro morador ativo.
* **RB-13 (Efeitos da Inativação):** A inativação de um morador congela seu saldo contábil no estado em que se encontra, cancela suas escalas futuras e retém seu histórico para fins de auditoria, sendo vedada a exclusão física do registro do banco de dados (exclusão puramente lógica / soft delete).

---

## 6. Critérios de Aceite e Testabilidade (SDD)

- [ ] **CT-07.1 (Cadastro e Hashing de Senha):** Cadastrar morador com senha "SenhaForte123". Verificar no banco que a coluna de senha contém hash bcrypt válido (`$2b$12$...`) e não a string pura.
- [ ] **CT-07.2 (Login e Validação de JWT):** Enviar POST `/auth/login` com credenciais válidas; verificar retorno de token JWT com tempo de expiração e claims corretos.
- [ ] **CT-07.3 (Bloqueio de Rota Administrativa para Morador Comum):** Utilizar token de Morador Comum na rota `/admin/fechar-balanco`; verificar retorno estrito de HTTP 403 Forbidden.
- [ ] **CT-07.4 (Bloqueio de E-mail Duplicado):** Cadastrar morador com e-mail já existente; verificar retorno imediato de HTTP 409 Conflict.
