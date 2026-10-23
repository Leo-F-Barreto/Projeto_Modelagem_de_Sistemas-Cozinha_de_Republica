# Evidência de checkpoint — 22/10/2026

## Escopo

- Backlog de tasks derivado das sete especificações em `docs/specs/`.
- Configuração mínima de comandos Node, página inicial do protótipo e teste de fumaça.
- Organização dos testes de T-46 na fase vermelha (`tests/red/lotes.red.ts`).

## Ambiente

- Node.js 22.16.0.
- Sem dependências npm externas para a suíte atual; a execução usa `--experimental-strip-types` e o módulo `node:sqlite` experimental do Node 22.

## Resultado da suíte estável

Comando:

```bash
npm test
```

Resultado após adicionar `public/index.html`, `public/styles.css`, `public/app.js` e os testes de fumaça do protótipo:

```text
# tests 90
# pass 90
# fail 0
```

A falha anterior em `tests/auth.test.ts` no teste de cabeçalhos de segurança ocorria porque a rota `/` tentava servir `public/index.html`, que não existia no arquivo ZIP recebido. A página e os assets locais foram adicionados; o servidor respondeu 200 para `/`, `/styles.css` e `/app.js`, preservando `script-src 'self'` na política CSP.

## Resultado da fase vermelha T-46

Comando:

```bash
npm run test:red
```

Resultado observado:

```text
# tests 13
# pass 0
# fail 13
```

Falhas intencionais nesta etapa de TDD: o módulo `src/dominio/lotes.ts` e a integração de lotes com a API/estoque ainda não foram implementados. Os testes definem o comportamento esperado (lotes com validades independentes, consumo FEFO, exclusão de lotes vencidos do saldo disponível e alertas por lote). Depois da implementação, os testes devem ser promovidos para a suíte estável.

## Limitações conhecidas

- O protótipo HTML usa dados fictícios no armazenamento local do navegador e não chama a API.
- A T-46 permanece pendente; os testes vermelhos não são evidência de funcionalidade pronta.
- A especificação de autenticação cita bcrypt em um critério, enquanto a implementação/testes existentes usam scrypt. A decisão deve ser reconciliada em ADR e na especificação antes de alterar a implementação.

## Próxima ação sugerida

Executar as tarefas T-80 a T-84 em `tasks.md`, começando por atualizar a especificação de lotes e validar os critérios com o grupo antes de implementar o módulo de domínio e persistência.
