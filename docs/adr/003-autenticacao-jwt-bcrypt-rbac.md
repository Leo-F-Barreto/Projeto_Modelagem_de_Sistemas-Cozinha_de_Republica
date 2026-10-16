# ADR 003: Arquitetura de Autenticação e Controle de Acesso - JWT, bcrypt e RBAC
<!-- File: docs/adr/003-autenticacao-jwt-bcrypt-rbac.md -->
<!-- Status: Aprovado -->
<!-- Data: 2026-10-15 -->
<!-- Decisores: Tech Lead, Equipe de Modelagem de Sistemas -->

## Contexto
O CoChef atende moradores acessando a plataforma via smartphones no supermercado e computadores na casa. O sistema necessita de uma estratégia de autenticação segura, desacoplada e escalável que elimine estados em memória no servidor (para facilitar reinicializações rápidas e suporte a microsserviços futuros), além de impor barreiras inegociáveis para proteção de propriedade individual e governança da república. Avaliou-se sessões tradicionais baseadas em cookies de servidor com Redis vs tokens stateless JWT.

## Decisão
Adota-se **Tokens JWT (JSON Web Tokens)** assinados com algoritmo **HS256** para autenticação stateless, **bcrypt** (work factor 12 com salt dinâmico) para armazenamento de senhas e **RBAC (Role-Based Access Control)** para autorização em endpoints privados.

## Justificativa Técnica
1. **Stateless e Escalabilidade:** O servidor valida a integridade do token verificando a assinatura digital da chave secreta sem consultar tabela de sessões em cada requisição, atendendo ao requisito de tempo de verificação < 20ms (RNF-07.2).
2. **Desacoplamento Mobile-First:** O cabeçalho padrão `Authorization: Bearer <token>` é nativamente suportado por clientes web, PWA e eventuais clientes mobile nativos futuros sem complicações de cookies cross-domain ou restrições de SameSite.
3. **Resistência a Ataques de Força Bruta:** O algoritmo `bcrypt` com custo 12 exige esforço computacional intencional para verificação de senhas, tornando ataques de dicionário e tabelas rainbow inviáveis.
4. **Proteção de Propriedade e RBAC Nativo:** O payload do token carrega o `user_id` e a `role` (`MORADOR` ou `ADMIN`). A extração da identidade ocorre exclusivamente a partir do token assinado, impedindo que requisições falsifiquem o autor de uma baixa de estoque individual (atendendo ao requisito EX-02.1 / RF-07).

## Consequências

### Positivas
* Alta performance na validação de rotas autenticadas.
* Menor consumo de infraestrutura (dispensa servidor de cache Redis no MVP).
* Facilidade na criação de testes de API automatizados com geração sintética de tokens válidos e expirados.

### Negativas / Riscos Mitigados
* *Risco:* Dificuldade de revogação imediata antes do término de 24 horas.
* *Mitigação:* Prazo de validade estrito de 24 horas (`exp`) e lista negra simples de revogação (*token denylist*) persistida em banco apenas para moradores desligados da moradia (inativos).

## Conformidade
* Cumpre diretamente os requisitos RNF-02, RNF-07.1, RNF-07.2 e as diretrizes de segurança da [Constituição do Projeto](../../constitution.md).
