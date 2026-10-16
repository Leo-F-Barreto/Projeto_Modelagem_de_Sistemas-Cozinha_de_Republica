# ADR 004: Estratégia de Frontend e Interface - SPA Mobile-First (PWA) com React e TailwindCSS
<!-- File: docs/adr/004-frontend-mobile-first-pwa.md -->
<!-- Status: Aprovado -->
<!-- Data: 2026-10-15 -->
<!-- Decisores: Tech Lead, Equipe de Modelagem de Sistemas -->

## Contexto
O perfil de usuários da república (jovens universitários de 18 a 30 anos) utiliza primariamente smartphones para interagir com o sistema:
* No supermercado, consultando e marcando itens da lista de compras com uma mão.
* Na cozinha, escaneando rapidamente o que está no armário ou marcando a louça do dia como lavada.

O requisito não-funcional RNF-04 estabelece usabilidade adaptativa para telas a partir de 360px sem perda de funcionalidade. Avaliou-se:
1. Desenvolver aplicativos móveis nativos separados (Flutter ou React Native).
2. Renderização tradicional do lado do servidor (SSR com Jinja2).
3. Single Page Application (SPA) com Progressive Web App (PWA) utilizando React, Vite e TailwindCSS.

## Decisão
Decidiu-se pela abordagem de **Single Page Application (SPA) Mobile-First com recursos PWA**, utilizando **React 18+**, **Vite** como bundler e **TailwindCSS** para estilização utilitária responsiva.

## Justificativa Técnica
1. **Desenvolvimento Unificado e Agilidade:** Uma única base de código atende perfeitamente tanto o navegador do smartphone quanto o navegador desktop sem a sobrecarga de homologação e publicação em lojas de aplicativos (Google Play / Apple App Store).
2. **Capacidades PWA para o Supermercado:** Com Service Workers e Web App Manifest, o morador pode "instalar" o CoChef na tela inicial do celular. Em caso de oscilação momentânea de sinal de rede no interior do supermercado, a aplicação mantém a visualização da lista em cache local.
3. **Responsividade Mobile-First com TailwindCSS:** Permite aplicar regras de layout fluidas com foco inicial em telas estreitas (360px a 430px) e áreas de clique confortáveis ($48 \times 48\text{px}$), expandindo progressivamente para layouts em grid em tablets e desktops.
4. **Desempenho com Vite:** Tempo de inicialização e hot-reload quase instantâneos, com build otimizado e split de pacotes.

## Consequências

### Positivas
* Atendimento imediato ao requisito RNF-04.
* Redução de atrito de adoção entre moradores da república (basta acessar o link ou escanear um QR code na geladeira).
* Separação estrita entre a camada de apresentação e a API backend.

### Negativas / Riscos Mitigados
* *Risco:* Dependência de JavaScript habilitado no cliente.
* *Mitigação:* Compatível com 100% dos navegadores modernos em uso pelos estudantes (Chrome, Safari, Firefox).

## Conformidade
* Cumpre o requisito RNF-04 e as especificações de usabilidade de [docs/specs/04_lista_compras.md](./04_lista_compras.md).
