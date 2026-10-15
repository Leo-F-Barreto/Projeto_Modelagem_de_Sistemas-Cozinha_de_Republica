# Constituição do Projeto: Cozinha de República (CoChef)
<!-- File: constitution.md -->
<!-- Mantido por: Tech Lead -->
<!-- Status: Inviolável e Vinculante para Desenvolvedores e Agentes de IA -->

Este documento estabelece as leis fundamentais, diretrizes arquiteturais, padrões de qualidade e regras inegociáveis de engenharia para o desenvolvimento do sistema **Cozinha de República (CoChef)**. Ele serve como o contrato primário de alinhamento entre humanos e agentes autônomos de IA dentro do fluxo de **Spec-Driven Development (SDD)**.

---

## 1. Princípio Fundamental: O Primado da Especificação (SDD)

1. **A Spec é a Fonte Única da Verdade (SSOT):** O código fonte e a suíte de testes são meras derivações executáveis da especificação. Nenhuma funcionalidade deve ser codificada sem que esteja previamente formalizada em um documento de especificação (`docs/specs/*.md`).
2. **O Código é Descartável; a Intenção Não:** Com o uso de agentes de IA, reescrever código tornou-se rápido e de baixo custo. O patrimônio durável do projeto reside na clareza formal dos requisitos expressos na sintaxe EARS e ancorados em testes automatizados.
3. **Regra de Ouro da Sincronização & CI:** Especificação e código correspondente **mudam no mesmo Pull Request (PR)**. Qualquer alteração de comportamento no código que não venha acompanhada da atualização correspondente na especificação deve ser sumariamente bloqueada pelo pipeline de Integração Contínua (CI) e pela revisão humana.
4. **Tolerância Zero a Desvios Silenciosos:**
   * **Drift:** É vedada qualquer discrepância em que o código execute comportamento diferente do estipulado ou deixe de implementar cláusulas `SHALL`.
   * **Sobre-implementação (Gold-Plating):** A IA ou desenvolvedor não deve implementar funcionalidades, métodos ou fluxos além do que foi estritamente pedido na spec. A especificação define inclusive o que **não** deve ser feito.
5. **Combate ao *Spec Theater*:** Especificação desatualizada ou decorativa é pior do que a ausência de especificação. Toda cláusula descrita na spec deve ser ativa, testada e governar as decisões reais de engenharia.

---

## 2. Padrão de Engenharia de Requisitos: Sintaxe EARS

Todas as especificações funcionais, não-funcionais e regras de tratamento de erros devem obedecer rigorosamente à sintaxe **EARS (Easy Approach to Requirements Syntax)**, eliminando ambiguidades e adjetivos vagos.

### Padrões EARS Permitidos e Obrigatoriedade

| Tipo de Padrão | Sintaxe Formal | Aplicação Primária |
| :--- | :--- | :--- |
| **Ubiquitous** | `THE SYSTEM SHALL <ação>.` | Invariantes globais, restrições contínuas e requisitos não-funcionais fundamentais. |
| **Event-driven** | `WHEN <gatilho>, THE SYSTEM SHALL <ação>.` | Reações reativas a eventos iniciados por atores ou gatilhos temporais. |
| **State-driven** | `WHILE <estado>, THE SYSTEM SHALL <ação>.` | Comportamentos e restrições ativas enquanto o sistema estiver em determinado estado. |
| **Optional feature** | `WHERE <recurso incluído>, THE SYSTEM SHALL <ação>.` | Comportamentos atrelados a módulos opcionais, feature flags ou permissões específicas. |
| **Unwanted behavior** | `IF <condição anômala>, THEN THE SYSTEM SHALL <ação>.` | Tratamento de exceções, erros, validações e casos de borda. |

### Regra de Ouro de Cobertura de Erros
* Para todo requisito `WHEN` (caminho feliz/evento), é **obrigatório** questionar *"e se falhar?"* e redigir o respectivo requisito `IF / THEN` (Unwanted behavior) tratando falha, dado corrompido, permissão negada ou estado inconsistente.
* Requisitos Não-Funcionais (RNF) devem possuir **métricas numéricas mensuráveis** (ex: tempo em ms/percentil P95, disponibilidade percentual, limites de memória) para evitar o anti-padrão do "Requisito Zumbi".

---

## 3. Protocolo de Execução com Agentes de IA

Para garantir previsibilidade e evitar alucinações arquiteturais, o trabalho com agentes de IA segue o protocolo:

1. **Leitura de Contexto Obrigatória:** Antes de gerar ou modificar código, o agente deve carregar:
   * A presente Constituição (`constitution.md`).
   * A especificação do módulo em questão (`docs/specs/<modulo>.md`).
   * O Glossário de Domínio (`docs/glossario.md`) para respeitar a Linguagem Ubíqua da república.
2. **Uma Task por Vez (Menor Escopo Possível):** Jamais forneça o projeto inteiro ou múltiplas tarefas simultâneas para o agente. A execução deve ser estritamente atômica e focada.
3. **Propriedades Invioláveis das Tasks Atômicas:**
   * **Sessão Única:** Concluível em menos de 90 minutos, até 400 linhas de código e menos de 8.000 tokens de contexto.
   * **Verificação Binária:** Critério de aceite sem ambiguidade (Passou ou Falhou).
   * **Dependência Declarada:** Lista explícita de pré-requisitos necessários.
   * **Rastreabilidade Direta:** Citação das cláusulas EARS exatas cobertas pela tarefa. Tamanho máximo admitido: **S** ou **M** (tarefas tamanho **L** devem ser obrigatoriamente decompostas).
4. **Autoria e Controle Humano:** O desenvolvedor humano dirige o agente e responde pela arquitetura. A IA é uma ferramenta de aceleração; o pensamento crítico, a validação de aderência e a decisão permanecem sob responsabilidade humana.

---

## 4. Revisão Multidimensional de Qualidade (Human-in-the-Loop)

Toda entrega antes de ser submetida a Pull Request deve ser avaliada sob quatro dimensões inegociáveis, rompendo a "armadilha da sintaxe" (código com sintaxe bonita que esconde falhas sistêmicas):

### Dimensão A: Arquitetura e Domínio
* O código respeita os padrões modulares e a separação clara de responsabilidades?
* Utilizou exclusivamente a linguagem ubíqua do domínio (ex: *Morador Ativo*, *Item Coletivo*, *Item Individual*, *Validade Crítica*, *Saldo Devedor/Credor*)?
* Foi evitada a importação de bibliotecas redundantes ou pesadas para resolver problemas triviais?

### Dimensão B: Performance e Recursos
* As consultas ao banco de dados são otimizadas? É expressamente proibida a ocorrência do problema **N+1**.
* Há vazamento de memória ou criação desnecessária de instâncias em loops de processamento?
* O tempo de resposta respeita as metas estabelecidas na spec (ex: consultas de estoque < 1,5s sob carga normal; endpoints críticos < 500ms P95)?

### Dimensão C: Segurança e Observabilidade
* Todos os inputs recebidos de clientes/APIs são rigorosamente sanitizados e validados contra regras de tipo e limites?
* O sistema exige autenticação via JWT válido para todos os endpoints protegidos?
* Senhas de usuários são obrigatoriamente criptografadas com `bcrypt` (ou Argon2) com salt dinâmico?
* Logs estruturados foram implementados para registrar eventos críticos (consumo de itens, rateio financeiro, alterações de escala) sem vazar dados sensíveis?

### Dimensão D: Ancoragem em Ferramentas e CI
* O código adere aos padrões de linting e formatação estática do projeto (ex: flake8, ruff ou Black para Python).
* Toda a suíte de testes automatizados passa com 100% de sucesso localmente e no CI.

---

## 5. Estratégia de Testes e Pirâmide de Qualidade

1. **Derivação Direta (EARS -> Teste):** Cada cláusula `SHALL` expressa na especificação deve corresponder a no mínimo um caso de teste automatizado implementado em `pytest`.
2. **Mapeamento de Testes:**
   * Requisitos **Ubiquitous:** Testes de invariantes e contratos estáticos.
   * Requisitos **WHEN (Event-driven):** Testes unitários e de integração de fluxo com sucesso.
   * Requisitos **WHILE (State-driven):** Testes de transição e persistência de estados.
   * Requisitos **WHERE (Optional):** Testes com feature flags/perfis ativados e desativados.
   * Requisitos **IF/THEN (Unwanted behavior):** Testes de erro, validação de limites e asserção de exceções esperadas (`pytest.raises`).
3. **Execução Automatizada:** Nenhum código é mesclado se quebrar testes estáveis anteriores (garantia estrita contra regressões).

---

## 6. Governança do Repositório e Gestão de Git

1. **Branch Principal (`main` / `master`) Sagrada:** Contém unicamente código estável, especificado e testado. É terminantemente proibido o commit direto na `main`.
2. **Branches Semânticas:**
   * Features: `feature/<nome-curto-da-tarefa>`
   * Correções: `bugfix/<descricao-erro>`
   * Refatorações: `refactor/<alvo>`
3. **Commits Semânticos e Atômicos:**
   * Mensagens no imperativo, concisas (máximo 50 caracteres no título): `Fix: ...`, `Feat: ...`, `Spec: ...`, `Test: ...`.
   * Um único escopo lógico por commit.
4. **Pull Requests Obrigatórios:** Merges são realizados apenas após aprovação por revisão humana e sucesso verde no pipeline de CI.

---

## 7. Mapa de Governança dos Artefatos SDD

| Artefato | Localização | Pergunta Respondida | Responsável Primário |
| :--- | :--- | :--- | :--- |
| **Constituição** | `constitution.md` | *Quais princípios e regras são invioláveis?* | Tech Lead |
| **Especificações** | `docs/specs/*.md` | *O que o sistema deve fazer? (Comportamento observável)* | Dev + PO + Agente de IA |
| **Planos Técnicos** | `docs/plans/*.md` | *Em que ordem técnica as peças serão construídas?* | Dev Líder |
| **Tarefas Atômicas** | `docs/tasks/*.md` | *Como decompor a entrega em etapas binárias?* | Dev da Feature |
| **Código e Testes** | `src/` e `tests/` | *Como executa e como provar que atende à spec?* | Dev + Agente de IA + QA |
