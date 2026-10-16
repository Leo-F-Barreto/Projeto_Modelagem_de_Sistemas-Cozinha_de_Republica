# ADR 001: Escolha do Framework Backend - FastAPI com Python 3.13
<!-- File: docs/adr/001-escolha-stack-backend.md -->
<!-- Status: Aprovado -->
<!-- Data: 2026-10-15 -->
<!-- Decisores: Tech Lead, Equipe de Modelagem de Sistemas -->

## Contexto
O sistema **Cozinha de República (CoChef)** requer uma API rápida, confiável e com tipagem robusta para implementar a especificação formal derivada em EARS. O sistema envolve fluxos síncronos frequentes (consultas de estoque em supermercados, requisições de baixa por moradores) e regras de domínio que precisam ser rigorosamente validadas para evitar o anti-padrão de "alucinação de agentes" e dados corrompidos. Avaliou-se alternativas no ecossistema Python (FastAPI, Flask e Django REST Framework).

## Decisão
Decidiu-se adotar **Python 3.13** com o microframework **FastAPI** (versão 0.115+) associado ao **Pydantic v2** e **Uvicorn** como servidor ASGI.

## Justificativa Técnica
1. **Validação Estrita de Esquemas com Pydantic v2:** A camada de entrada do FastAPI executa validação de tipos, restrições numéricas e intervalos de datas em alta velocidade (compilado em Rust internamente pelo Pydantic), garantindo que os requisitos `IF / THEN` de dados inválidos sejam interceptados antes de atingir o domínio.
2. **Documentação OpenAPI/Swagger Automática:** O FastAPI gera a especificação OpenAPI em tempo de execução, permitindo que agentes de IA e desenvolvedores consumam os contratos de API com fidelidade sem divergências.
3. **Desempenho e Concorrência Assíncrona:** A arquitetura baseada em ASGI e suporte a `async/await` viabiliza o atendimento ao requisito RNF-01 (resposta a consultas em < 1,5s sob carga) com baixo consumo de memória.
4. **Alinhamento com SDD e Agentes de IA:** A tipagem estática e os esquemas explícitos reduzem drasticamente o débito de contexto para agentes de IA operando via MCP ou ferramentas de código.

## Consequências

### Positivas
* Detecção imediata de dados malformados na fronteira da aplicação.
* Produtividade acelerada na escrita de testes com `TestClient` (baseado em HTTPX).
* Suporte nativo à injeção de dependências para isolamento de casos de uso e repositórios.

### Negativas / Riscos Mitigados
* *Risco:* Maior rigor exigido na definição de esquemas Pydantic.
* *Mitigação:* As especificações EARS já detalham rigorosamente os campos e formatos esperados em `docs/specs/*.md`.

## Conformidade
* Atende integralmente às restrições de Arquitetura da [Constituição do Projeto](../../constitution.md#4-revisão-multidimensional-de-qualidade-human-in-the-loop) e aos requisitos de desempenho RNF-01.
