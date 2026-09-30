# Projeto Modelagem de Sistemas - Cozinha de Republica
Projeto da disciplina de Modelagem de Sistemas

Integrantes do grupo:
- Kauê Stang - 10438583
- Leonardo Fernandes Barreto - 10735590
- Rafael Carreno Morra Cirone

# Cozinha de República (CoChef)

> **Visão do Projeto:** Prover uma plataforma centralizada e colaborativa para a gestão de cozinhas em moradias compartilhadas, otimizando o consumo de alimentos, eliminando o desperdício por prazos de validade expirados e garantindo transparência financeira e organização na convivência entre os moradores.

## Objetivo Principal
Transformar a rotina da cozinha em um processo organizado e previsível, automatizando o controle de estoque comum e individual, o planejamento de compras, a divisão de despesas e a escala de tarefas da casa.

---

## Definição do Problema

### Contexto e Dores Atuais
* **Falta de controle de estoque e validade:** Moradores compram itens duplicados por não saberem o que há no armário ou na geladeira, enquanto produtos existentes estragam esquecidos.
* **Conflitos na divisão financeira:** Dificuldade em registrar compras coletivas (como temperos, gás ou produtos de limpeza) versus itens de uso estritamente individual, gerando desequilíbrio e atritos no rateio.
* **Desorganização nas tarefas:** Ausência de acompanhamento claro sobre quem é o responsável do dia pela limpeza ou pelo preparo das refeições coletivas.

### Impactos
Prejuízo financeiro para os moradores, desperdício recorrente de alimentos, perda de tempo e desgastes no convívio diário.

### A Oportunidade
Criar um sistema web/mobile focado que funcione como um organzador para a rotina da cozinha, integrando estoque, lista de compras, finanças e escalas em uma única plataforma.

---

## Público-Alvo e Atores do Sistema

**Público-Alvo:** Estudantes universitários e jovens profissionais (faixa etária de 18 a 30 anos) que residem em repúblicas, pensionatos ou apartamentos compartilhados.

### Atores do Sistema (Modelagem de Papéis)
* **Morador (Ator Principal):** Usuário comum que dá baixa ou insere itens no estoque, consulta validades, adiciona produtos à lista de compras e marca tarefas cumpridas na escala.
* **Administrador / Morador Responsável:** Usuário com privilégios para gerenciar as configurações da república, aprovar despesas coletivas e fechar os balanços mensais de acerto de contas.
* **Sistema / Notificador Automatizado:** Ator interno do sistema responsável por disparar alertas de itens próximos do vencimento, estoque crítico e avisos de tarefas pendentes.

---

## Escopo do Projeto

Para garantir um desenvolvimento pragmático, testável e focado na entrega de valor, o projeto está dividido entre o Produto Mínimo Viável (MVP) e iterações futuras.

### Dentro do Escopo (MVP)
* **Gestão de Estoque e Validade:** Cadastro de produtos categorizados por tipo (Uso Coletivo vs. Uso Individual), com alertas visuais e notificações para produtos próximos do vencimento.
* **Lista de Compras Colaborativa:** Adição manual de itens e sugestão automática de compras para produtos abaixo do nível mínimo de estoque.
* **Rateio e Gestão Financeira:** Registro de notas e comprovantes de compras coletivas com cálculo automático do balanço ("quem deve para quem").
* **Escala de Limpeza e Cozinha:** Criação e acompanhamento de escala rotativa para limpeza do ambiente e preparo de refeições comuns.

### Fora do Escopo (Iterações Futuras)
* Processamento e liquidação automática de pagamentos via chave PIX/gateway bancário dentro do aplicativo (no MVP, o acerto financeiro será registrado e verificado manualmente).
* Integração com APIs de e-commerce de supermercados para compras online automatizadas.
* Módulo de recomendação de receitas via Inteligência Artificial (a prioridade inicial é estritamente a gestão do domínio de estoque e finanças).
