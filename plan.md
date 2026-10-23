# Plano técnico — CoChef

## 1. Objetivo

Evoluir o CoChef mantendo rastreabilidade entre as regras EARS de `docs/specs/`, os módulos de domínio, os serviços/API e os testes. A entrega de checkpoint contempla um `tasks.md` executável, comandos de teste reproduzíveis, evidência da suíte e um protótipo navegável.

## 2. Arquitetura de referência

- **Interface:** HTML/CSS/JavaScript em `public/index.html`, servido pela aplicação HTTP existente. No checkpoint, os dados do protótipo são fictícios e persistidos apenas no `localStorage` do navegador.
- **API:** servidor HTTP nativo do Node em `src/`, com roteamento em `src/http/`.
- **Serviços:** regras de aplicação separadas em `src/servicos/` para estoque, lista, finanças, escala, autenticação e notificações.
- **Domínio:** funções determinísticas para data/validade, rateio, acerto e distribuição de turnos em `src/dominio/`.
- **Persistência:** SQLite, encapsulado em `src/db.ts`.
- **Segurança:** autenticação por token, hashing de senha e autorização por papéis/república; decisões relevantes registradas em `docs/adr/` e diretrizes em `docs/seguranca.md`.
- **Testes:** `node:test` e `node:assert/strict`; unidade de domínio e testes de integração HTTP usam a infraestrutura em `tests/apoio.ts`.

## 3. Sequência de implementação

### Etapa A — Recuperar execução e evidência (concluída neste checkpoint)

1. Definir comandos oficiais e versão mínima do Node em `package.json`.
2. Criar a página em `public/index.html`, exigida pelo servidor para a rota `/`.
3. Adicionar testes de fumaça para os módulos essenciais do HTML.
4. Separar o contrato de T-46 em `tests/red/lotes.red.ts`, sem misturá-lo à suíte estável antes da implementação.
5. Registrar os comandos e os resultados em `docs/review/checkpoint-2026-10-22.md`.

### Etapa B — Manter e ampliar o MVP (em validação contínua)

1. Preservar as validações e regras do estoque: propriedade individual, compartimento, quantidade e validade.
2. Garantir que consumo, histórico, vencimento e reposição mantenham o estado consistente.
3. Cobrir a lista colaborativa, incluindo sugestão automática, prevenção de duplicatas e vínculo com compras.
4. Validar rateio em centavos, saldo agregado zero, fechamento mensal e trilha de auditoria.
5. Validar escala rotativa, trocas bilaterais e efeitos da inativação de morador.
6. Revisar isolamento entre repúblicas, papéis, sessão e tratamento seguro de entradas inválidas.
7. Completar o vínculo dos casos CT das especificações para testes e evidências.

### Etapa C — T-46: lotes por produto (pendente)

1. Atualizar a especificação antes do código: registrar RF-17, RB-11 e as extensões de validade/estoque/lista propostas em `red-phase-T-46.md`.
2. Implementar as funções puras `planejarConsumo(lotes, quantidade)` e `separarVencidos(lotes, hoje)` em `src/dominio/lotes.ts`.
3. Adicionar persistência para lotes e integrar entrada, reposição, consumo FEFO, painel de validade e lista de compras.
4. Executar `npm run test:red`, investigar falhas não relacionadas ao comportamento esperado e avançar gradualmente para verde.
5. Promover os testes para `tests/lotes.test.ts` e incluí-los em `npm test` apenas após a implementação e revisão.

## 4. Estratégia de verificação

| Camada | O que comprova | Comando/evidência |
|---|---|---|
| Unidade de domínio | Validade, datas, rateio em centavos, compensação de saldos, escala, segurança de token/senha | `npm test` |
| Integração/API | Persistência, permissões, isolamento, consumo, alertas, lista, finanças e escala | `npm test` |
| Protótipo estático | Módulos principais, formulários, comportamento responsivo e persistência demonstrativa local | `npm test` e acesso a `/` |
| Regressão de lotes | Contrato novo de FEFO, validades independentes e alertas por lote | `npm run test:red` até a etapa verde |
| Smoke de execução | Servidor inicia e página inicial tem resposta 200 com cabeçalhos de segurança | `npm start` e requisição HTTP local |

## 5. Critérios de pronto

Uma tarefa só pode ser encerrada quando:

- os requisitos/IDs de regra e os critérios de aceite estiverem apontados em `tasks.md`;
- o código estiver alinhado à especificação aprovada;
- testes automatizados cobrirem cenário válido, inválido e bordas relevantes;
- a suíte estável continuar passando;
- a evidência estiver anexada em `docs/review/` ou no Pull Request;
- decisões arquiteturais novas estiverem registradas em ADR quando forem relevantes.

## 6. Riscos e decisões a resolver

- **Lotes:** T-46 é uma mudança de modelo de domínio; não promover a fase vermelha para a suíte estável antes de implementar persistência e integração.
- **Hash de senha:** `docs/specs/07_autenticacao_moradores.md` cita bcrypt em CT-07.1, enquanto o código e os testes atuais utilizam scrypt. Registrar decisão e alinhar especificação/ADR/testes antes de mudar a tecnologia.
- **Runtime:** a execução usa recursos experimentais do Node 22, incluindo type stripping e SQLite. A versão mínima está documentada no `package.json` e no `README.md`.
- **Protótipo:** a interface facilita demonstração e teste de fluxo, mas não é um cliente integrado à API e não realiza pagamentos reais. A persistência local não deve ser apresentada como persistência multiusuário.
