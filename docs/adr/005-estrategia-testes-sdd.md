# ADR 005: Estratégia de Testes Automatizados e Garantia SDD com Pytest
<!-- File: docs/adr/005-estrategia-testes-sdd.md -->
<!-- Status: Aprovado -->
<!-- Data: 2026-10-15 -->
<!-- Decisores: Tech Lead, Equipe de Modelagem de Sistemas -->

## Contexto
Conforme detalhado nos slides da disciplina e na [Constituição do Projeto](../../constitution.md), em **Spec-Driven Development (SDD)** o código é derivado da especificação, e os testes automáticos servem como âncora binária da conformidade.
Dois riscos críticos minam projetos assistidos por agentes de IA:
1. **Drift:** O código evolui com comportamento divergente da especificação formal.
2. **Sobre-implementação (Gold-Plating):** O desenvolvedor ou IA cria métodos não previstos na spec, gerando dívida técnica crônica.

Faz-se necessária uma metodologia rigorosa de testes automatizados que estabeleça mapeamento 1:1 entre as cláusulas EARS e os casos de teste.

## Decisão
Adota-se **Pytest** como o framework único de testes automatizados, organizado em uma pirâmide clara de testes unitários e de integração de API, integrado à pipeline de CI via **GitHub Actions**.

## Regras da Estratégia de Testes

1. **Mapeamento Formal EARS $\to$ Casos de Teste:**
   * **Requisitos Ubiquitous:** Testes de invariantes de modelo e integridade de tipos.
   * **Requisitos WHEN (Event-driven):** Testes de fluxo nominal com asserções de saída esperada.
   * **Requisitos WHILE (State-driven):** Testes de persistência de estado e condições de permanência.
   * **Requisitos IF / THEN (Unwanted behavior):** Testes obrigatórios de exceção utilizando `with pytest.raises(ExceptionClass)` ou checagem de códigos HTTP 4xx/5xx com mensagens assertivas.
2. **Propriedade Binária:** Critérios de aceite devem passar ou falhar sem intermediários ou alertas silenciosos.
3. **Bloqueio de PRs sem Testes:** É proibido mesclar qualquer Pull Request de funcionalidade sem que os respectivos testes em `tests/` tenham sido implementados e executados com 100% de aprovação.
4. **Isolamento com Fixtures do Pytest:**
   * Banco de dados de teste isolado por transação com rollback automático entre testes (`@pytest.fixture(scope="function")`).
   * Geração sintética de moradores, itens de estoque e tokens JWT pré-configurados.

## Consequências

### Positivas
* Eliminação de regressões quando novos recursos forem codificados.
* Verificação imediata da fidelidade das implementações de agentes de IA contra as especificações em `docs/specs/*.md`.
* Confiança incondicional no deploy contínuo da aplicação.

### Negativas / Riscos Mitigados
* *Risco:* Tempo gasto na escrita de testes para cada cláusula de exceção.
* *Mitigação:* A existência prévia das cláusulas EARS bem redigidas torna a escrita do caso de teste trivial e orientada por contrato.

## Conformidade
* Cumpre diretamente os princípios I, II e V da [Constituição do Projeto](../../constitution.md) e a pirâmide de testes apresentada na aula de Qualidade e Testes de Software.
