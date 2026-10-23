# Tasks — CoChef | Cozinha de República

> Backlog técnico derivado das especificações de `docs/specs/`. A especificação continua sendo a fonte de verdade; se uma regra mudar, atualizar a especificação antes do código e dos testes.

## Legenda

- `[x] Concluído/verificado`: há implementação ou teste no repositório e a tarefa foi verificada nesta rodada.
- `[ ] Pendente`: ainda precisa ser implementado, validado ou demonstrado.
- **P0**: bloqueia execução ou entrega; **P1**: requisito essencial do MVP; **P2**: melhoria ou evolução planejada.

## P0 — Reprodutibilidade e entrega do checkpoint

- [x] **T-01 — Restaurar configuração de execução**
  - **Origem:** estrutura existente em `src/` e `tests/`.
  - **Entrega:** `package.json` com comandos explícitos para iniciar a aplicação, executar a suíte estável e executar testes da fase vermelha.
  - **Aceite:** `npm test` executa `tests/*.test.ts` com Node 22.6+; `npm run test:red` executa apenas `tests/red/*.red.ts`.
- [x] **T-02 — Criar a página inicial navegável do protótipo**
  - **Origem:** `src/http/app.ts` serve `public/index.html` na rota `/`.
  - **Entrega:** `public/index.html`, `public/styles.css` e `public/app.js`, com painel, estoque, compras, finanças, escala e moradores; interações demonstrativas e armazenamento local do navegador.
  - **Aceite:** a rota `/` responde 200; navegação entre módulos funciona; ações demonstrativas atualizam a interface e permanecem após recarregar a página.
- [x] **T-03 — Adicionar teste de fumaça do protótipo**
  - **Origem:** entrega funcional, RNF de usabilidade e teste de cabeçalhos já existente em `tests/auth.test.ts`.
  - **Entrega:** `tests/prototipo.test.ts` valida existência, conteúdo essencial e pontos básicos de responsividade/acessibilidade do HTML.
  - **Aceite:** testes não dependem de serviços externos nem de dados reais.
- [x] **T-04 — Organizar os testes exploratórios de lotes**
  - **Origem:** `red-phase-T-46.md` (T-46 / US-16).
  - **Entrega:** `tests/red/lotes.red.ts`, separado da suíte estável; comando `npm run test:red` documentado.
  - **Aceite:** a suíte vermelha pode falhar enquanto a funcionalidade não estiver pronta, sem fazer a suíte estável falhar por desenho.
- [ ] **T-05 — Registrar evidência reproduzível do checkpoint**
  - **Dependências:** T-01 a T-04.
  - **Entrega:** registrar versão do Node, saída de `npm test`, saída de `npm run test:red` e screenshots do protótipo em `docs/review/`.
  - **Aceite:** cada evidência informa data, comando executado, resultado e limitações conhecidas.

## P1 — Requisitos do MVP

### Estoque e propriedade — `docs/specs/01_gestao_estoque.md`

- [x] **T-10 — Cadastro e consulta de produtos**
  - **Rastreabilidade:** RF-01.1, RF-01.4, RF-01.5, RF-01.6; RB-05.
  - **Verificação:** cadastro valida nome, quantidade, unidade, classificação e compartimento; consulta permite localizar produtos; estoque baixo é destacado.
  - **Aceite:** item sem compartimento ou com dados obrigatórios inválidos não é aceito; item coletivo pode ter estoque mínimo.
- [x] **T-11 — Proteger propriedade de item individual**
  - **Rastreabilidade:** RF-01.2; RB-01; CT-01.2 e CT-01.4.
  - **Verificação:** testes de API cobrem proprietário, bloqueio de alteração e bloqueio de consumo por outro morador.
  - **Aceite:** o morador comum não altera, repõe ou descarta item individual alheio; preservar o estado quando a operação é recusada.
- [ ] **T-12 — Completar matriz de testes de cadastro**
  - **Rastreabilidade:** CT-01.1 a CT-01.4.
  - **Aceite:** todos os casos de aceite são referenciados por teste automatizado e identificados pelo código CT correspondente.

### Consumo e histórico — `docs/specs/02_consumo_baixa.md`

- [x] **T-20 — Implementar baixa de consumo com validação de quantidade**
  - **Rastreabilidade:** RF-02.1 a RF-02.4; RB-01 e RB-04; CT-02.1 a CT-02.4.
  - **Verificação:** testes cobrem baixa parcial, esgotamento, histórico, excedente e item individual alheio.
  - **Aceite:** quantidade nunca fica negativa; tentativas inválidas não alteram o saldo; baixa válida deixa registro de histórico.
- [ ] **T-21 — Completar rastreabilidade dos casos CT-02**
  - **Aceite:** cada CT da especificação tem vínculo explícito para o teste correspondente e evidência de execução.

### Validade e notificações — `docs/specs/03_monitoramento_validade.md`

- [x] **T-30 — Classificar validade e sinalizar janela crítica**
  - **Rastreabilidade:** RF-03.1, RF-03.2, RF-03.3; RB-04 e RB-06; CT-03.1.
  - **Verificação:** teste de domínio cobre 3 dias, dia do vencimento, produto sem validade e produto vencido.
  - **Aceite:** validade crítica significa vencimento em até 72 horas; item com validade ultrapassada não fica disponível para consumo.
- [ ] **T-31 — Concluir cobertura da rotina de validade e descarte**
  - **Rastreabilidade:** RF-03.4, RF-03.5; CT-03.2 a CT-03.4.
  - **Aceite:** rotina atualiza o status, registra descarte confirmado e direciona notificações coletivas/individuais aos destinatários corretos.

### Lista de compras — `docs/specs/04_lista_compras.md`

- [x] **T-40 — Gerar reposição automática para estoque coletivo baixo**
  - **Rastreabilidade:** RF-04.1; RB-07; CT-04.1 e CT-04.2.
  - **Verificação:** testes existentes cobrem inclusão automática, ausência de duplicata, exclusão da sugestão após reposição e separação de itens individuais.
  - **Aceite:** item coletivo entra na lista uma única vez ao atingir o limite definido e deixa de ser sugerido quando o estoque é reposto acima do mínimo.
- [x] **T-41 — Gerenciar itens manuais da lista**
  - **Rastreabilidade:** RF-04.2 a RF-04.5; RB-07 e RB-08.
  - **Verificação:** testes existentes cobrem adicionar, marcar comprado e permissões para remover.
  - **Aceite:** quantidade inválida é recusada; item comprado sugere registro da nota no módulo financeiro.
- [ ] **T-42 — Fechar cobertura dos casos CT-04**
  - **Aceite:** CT-04.1 a CT-04.4 têm referência direta a testes automatizados e evidência atualizada.

### Rateio financeiro — `docs/specs/05_rateio_financeiro.md`

- [x] **T-50 — Registrar, aprovar e ratear compras coletivas**
  - **Rastreabilidade:** RF-05.1, RF-05.2; RB-02 e RB-05; CT-05.1, CT-05.3 e CT-05.4.
  - **Verificação:** testes existentes cobrem aprovação de despesa, divisão entre moradores ativos, centavos residuais e entradas inválidas.
  - **Aceite:** rateio usa apenas moradores ativos no lançamento; valor é positivo; cotas em centavos somam exatamente o total.
- [x] **T-51 — Compensar saldos e sugerir transferências**
  - **Rastreabilidade:** RF-05.3 e RF-05.4; RB-03; CT-05.2.
  - **Verificação:** testes de domínio cobrem compensação e simplificação de dívidas; testes de serviço cobrem saldos e transferências.
  - **Aceite:** compensações mantêm o saldo agregado em zero e evitam transferências desnecessárias.
- [x] **T-52 — Fechar mês e preservar trilha financeira**
  - **Rastreabilidade:** RF-05.5; RB-09; RNF-05.1; CT-05.1 a CT-05.4 relacionados ao fechamento.
  - **Verificação:** testes cobrem bloqueio de mês futuro, compras pendentes, confirmação de pagamento e auditoria.
  - **Aceite:** lançamentos de período fechado não são editados/excluídos; ajustes são feitos como lançamentos compensatórios.

### Escala e trocas — `docs/specs/06_escala_tarefas.md`

- [x] **T-60 — Gerar escala rotativa e tratar moradores inativos**
  - **Rastreabilidade:** RF-06.1 e RF-06.5; RB-10; CT-06.1 e CT-06.4.
  - **Verificação:** testes cobrem rodízio, continuidade da escala e remoção de inativos de turnos futuros.
  - **Aceite:** todos os moradores ativos participam da rotação, com carga equilibrada no período especificado.
- [x] **T-61 — Implementar conclusão de tarefa e solicitação de troca**
  - **Rastreabilidade:** RF-06.2 a RF-06.4; RB-11; CT-06.2 e CT-06.3.
  - **Verificação:** suíte existente cobre escala, troca e gestão de moradores.
  - **Aceite:** uma troca só surte efeito após consentimento explícito de ambas as partes ou intervenção administrativa; recusa preserva o responsável original.
- [ ] **T-62 — Validar equilíbrio de 30 dias e exibir evidências**
  - **Aceite:** adicionar teste explícito da diferença máxima de um turno em qualquer janela de 30 dias consecutivos e salvar resultado.

### Autenticação, papéis e isolamento — `docs/specs/07_autenticacao_moradores.md`

- [x] **T-70 — Cadastro, login, tokens e RBAC**
  - **Rastreabilidade:** RF-07.1, RF-07.2, RF-07.4, RF-07.5; RNF-07.1 e RNF-07.2.
  - **Verificação:** testes cobrem senha com hash, login, token expirado/adulterado, autorização e isolamento entre repúblicas.
  - **Aceite:** senha em texto puro nunca é persistida/devolvida; rota privada exige sessão válida; morador comum não executa ação administrativa.
- [x] **T-71 — Inativação segura de morador**
  - **Rastreabilidade:** RF-07.3; RB-12 e RB-13.
  - **Verificação:** testes cobrem inativação, acesso revogado, escalas futuras e preservação histórica.
  - **Aceite:** não apagar fisicamente o histórico nem permitir que a república fique sem administrador ativo.
- [ ] **T-72 — Alinhar especificação, algoritmo de hash e critérios de aceite**
  - **Observação:** a especificação menciona bcrypt em CT-07.1, enquanto a implementação/testes do domínio usam scrypt. Registrar decisão em ADR e atualizar o critério de teste antes de alterar o código.
  - **Aceite:** decisão documentada e consistente entre `docs/specs/07_autenticacao_moradores.md`, ADR, código e testes.

## P1 — T-46 | Lotes por produto (fase vermelha)

- [ ] **T-80 — Aprovar atualização da especificação de lotes**
  - **Origem:** `red-phase-T-46.md`, US-16 e revisão de arquitetura A-02.
  - **Requisitos propostos:** RF-17 e RB-11; extensão de RF-03, RF-04 e RB-04.
  - **Aceite:** atualizar a especificação antes de promover os testes para a suíte estável; definir contrato para `planejarConsumo(lotes, quantidade)` e `separarVencidos(lotes, hoje)`.
- [ ] **T-81 — Implementar regras puras de lote e FEFO**
  - **Arquivo esperado:** `src/dominio/lotes.ts`.
  - **Aceite:** consome primeiro o lote com vencimento mais próximo; lote sem validade sai por último; quantidade acima do disponível gera `RangeError`; no dia do vencimento o lote ainda é consumível.
- [ ] **T-82 — Persistir lotes e integrá-los ao estoque/API**
  - **Aceite:** validade por lote não é sobrescrita por nova entrada; entradas com mesma validade acumulam no mesmo lote; estoque disponível é a soma dos lotes consumíveis.
- [ ] **T-83 — Integrar lote com validade, painel e lista de compras**
  - **Aceite:** alertas consideram cada lote; lote vencido deixa de contar como estoque ativo; o produto só fica vencido quando todos os lotes estiverem vencidos; a quantidade restante é comparada ao estoque mínimo.
- [ ] **T-84 — Promover testes T-46 após fase verde**
  - **Arquivo atual:** `tests/red/lotes.red.ts`.
  - **Aceite:** depois da implementação e revisão, mover/adequar testes verdes para `tests/lotes.test.ts`, integrar no `npm test` e documentar os resultados. Até lá, manter explicitamente a suíte como fase vermelha.

## P2 — Qualidade, segurança e documentação da entrega

- [ ] **T-90 — Revisão de segurança e comportamento de erro**
  - **Origem:** `docs/seguranca.md`, RNFs e suíte de autenticação.
  - **Aceite:** revisar validação de entrada, exposição de dados, autorização por república, cabeçalhos de segurança, rate limiting e mensagens de erro; registrar achados em `docs/review/`.
- [ ] **T-91 — Revisar desempenho e concorrência**
  - **Origem:** RNF-01.1, RNF-02.1, RNF-05.2 e documentos de arquitetura.
  - **Aceite:** guardar resultados reproduzíveis dos testes de desempenho, concorrência e atomicidade; não depender apenas de medições manuais.
- [ ] **T-92 — Atualizar README com setup e demonstração**
  - **Aceite:** documentar Node mínimo, `npm test`, `npm run test:red`, `npm start`, porta/configuração, perfis de usuário e limitações do protótipo. Deixar claro que os dados do HTML são locais e fictícios.
- [ ] **T-93 — Vincular tarefas a Issues/PRs**
  - **Aceite:** cada entrega relevante tem issue, responsável, prioridade, critério de aceite e evidência em PR; mover os cartões de Kanban conforme o estado real.

## Registro inicial de execução

- **Suíte estável antes deste checkpoint:** 84 testes identificados; 83 passaram e 1 falhou porque `GET /` retornava 404 sem `public/index.html`.
- **Resultado após este checkpoint:** 90 testes aprovados, 0 falhas; 14 suítes. A execução validou também que HTML, CSS e JavaScript são servidos pela aplicação com tipos MIME corretos.
- **Fase vermelha T-46:** mantida separada; 13 falhas esperadas até as regras por lote serem implementadas. Não contabilizar como suíte verde.
