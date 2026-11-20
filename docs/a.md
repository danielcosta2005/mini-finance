# Tarefa — Desenvolvimento do frontend MiniFinance

Você é um engenheiro de software frontend sênior, especializado em React, TypeScript, arquitetura frontend, UX/UI e testes automatizados.

Sua tarefa é desenvolver o frontend completo do **MiniFinance**, uma aplicação web para gerenciamento de finanças pessoais.

O sistema deve possuir uma interface responsiva, intuitiva e consistente, com a aparência de um produto financeiro cuidadosamente desenhado, seguindo o guia da seção 4.

O frontend consumirá uma API REST desenvolvida separadamente com Node.js, Hono, Drizzle ORM e PostgreSQL.

## 1. Stack tecnológica

Utilize obrigatoriamente:

- Node.js LTS
- React + Vite
- TypeScript com modo strict
- Biome para lint e formatação
- Vitest para testes unitários
- React Testing Library
- MSW (Mock Service Worker)
- jsdom para simulação do DOM
- Playwright para testes end-to-end

Bibliotecas adicionais recomendadas:

- Tailwind CSS
- shadcn/ui
- React Router
- TanStack Query
- React Hook Form + Zod
- Recharts
- Lucide React
- date-fns
- `@fontsource/ibm-plex-sans` (fonte self-hosted, sem dependência de CDN externo)

Utilize versões estáveis, atualizadas e compatíveis. Evite dependências desnecessárias.

## 2. Integração com o backend

Antes de implementar as funcionalidades:

1. Inspecione a documentação e os contratos disponíveis da API.
2. Identifique os endpoints, métodos HTTP, formatos de request/response, autenticação e tratamento de erros.
3. Crie uma camada de comunicação HTTP centralizada.
4. Defina tipos TypeScript para as entidades e respostas.
5. Organize o consumo da API por módulos de domínio.

**Importante:**

- O frontend deve consumir a API real, sem simular dados na implementação final.
- O MSW deve ser utilizado nos testes e, se necessário, no desenvolvimento inicial.
- Não invente endpoints incompatíveis com a API existente.
- Caso faltem endpoints, documente as dependências e implemente o frontend de forma que a integração posterior seja simples.
- Utilize variáveis de ambiente para configurações.
- Não armazene tokens ou informações sensíveis em localStorage.
- A autenticação utiliza sessões com cookies HttpOnly.
- Configure o cliente HTTP para enviar cookies corretamente.
- Respeite os mecanismos de proteção CSRF definidos no backend.
- Utilize caminhos relativos `/api/...` e configure um proxy no Vite durante o desenvolvimento.
- Não dependa do proxy de desenvolvimento em produção. Documente como disponibilizar frontend e API sob a mesma origem por meio de um proxy ou infraestrutura apropriada.

## 3. Funcionalidades e páginas

### 3.1. Autenticação

Implemente:

- Página de cadastro.
- Página de login.
- Logout.
- Proteção de rotas privadas.
- Persistência de sessão após atualizar a página.
- Redirecionamento para login quando a sessão expirar.

Crie formulários com validação, mensagens de erro e indicadores de carregamento.

### 3.2. Dashboard

Desenvolva um painel financeiro com:

- Saldo total consolidado.
- Total de receitas no mês.
- Total de despesas no mês.
- Resultado financeiro mensal.
- Gráfico de evolução de receitas e despesas.
- Gráfico de distribuição de gastos por categoria.
- Resumo das contas.
- Próximas despesas recorrentes.
- Resumo dos orçamentos mensais.

Permita selecionar o mês de referência.

Todos os dados devem ser carregados da API.

A composição visual do dashboard segue a seção 4.3 (faixa de resumo, fluxo de caixa, maiores categorias e últimas transações), sem grade de cards de indicadores.

### 3.3. Contas financeiras

Implemente uma página para gerenciar contas.

Funcionalidades:

- Listar contas financeiras.
- Criar conta.
- Editar conta.
- Excluir conta, respeitando restrições da API.
- Visualizar saldo por conta.
- Realizar transferências entre contas.

Apresente os saldos e os dados de maneira organizada, em lista ou tabela com valores alinhados à direita.

### 3.4. Transações

Desenvolva uma interface de gerenciamento de movimentações.

Funcionalidades:

- Cadastrar receitas.
- Cadastrar despesas.
- Editar movimentações.
- Excluir movimentações.
- Selecionar conta e categoria.
- Filtrar por período, tipo, categoria e conta.
- Ordenar movimentações.
- Paginar resultados.

Utilize uma tabela responsiva com indicação de receitas e despesas por sinal (`+` / `−`), conforme a seção 4.4.

O formulário de criação deve ser acessível pelo botão primário "Nova transação", abrindo um drawer lateral (`Sheet`).

### 3.5. Categorias

Permita:

- Criar categorias.
- Editar categorias.
- Excluir categorias.
- Diferenciar categorias de receitas e despesas.

Utilize uma interface simples. Categorias são identificadas pelo nome e pelo tipo (receita ou despesa), em texto. Não atribua uma cor própria a cada categoria. Ícone da Lucide é opcional, sempre na cor do texto.

### 3.6. Cartões de crédito

Crie uma página para gerenciamento de cartões.

Funcionalidades:

- Cadastrar cartões.
- Definir limite, fechamento e vencimento.
- Visualizar limite total e disponível.
- Registrar compras no cartão.
- Registrar compras parceladas.
- Consultar faturas por mês.
- Visualizar parcelas de cada compra.
- Pagar faturas utilizando uma conta financeira.

Dê atenção especial à apresentação das faturas e ao histórico de compras.

O usuário deve conseguir identificar facilmente valores em aberto, valores pagos e vencimentos. O estado da fatura (aberta, fechada, paga, vencida) deve aparecer como rótulo em texto, nunca apenas por cor.

### 3.7. Orçamentos

Implemente planejamento de gastos por categoria.

Funcionalidades:

- Criar orçamento mensal.
- Definir limite de gastos.
- Editar e excluir orçamentos.
- Visualizar valor utilizado.
- Visualizar percentual consumido.
- Identificar orçamentos próximos do limite ou excedidos.

Utilize barras de progresso finas e sólidas. A barra usa a cor `accent` em condição normal, `warning` a partir de 80% e `destructive` acima de 100%, sempre acompanhada de texto ("82% utilizado", "Limite excedido em R$ 120,00").

### 3.8. Recorrências

Crie uma interface para despesas e receitas recorrentes.

Funcionalidades:

- Cadastrar recorrência.
- Definir valor, categoria, conta e periodicidade.
- Listar recorrências ativas.
- Editar e cancelar recorrências.
- Visualizar próximas ocorrências.

A geração efetiva das transações recorrentes é responsabilidade do backend.

### 3.9. Metas financeiras

Implemente:

- Criação de metas.
- Definição de valor-alvo e prazo.
- Registro de aportes.
- Visualização do progresso.
- Histórico de aportes.

Apresente o progresso das metas com barras finas e percentual em texto, seguindo os mesmos padrões das barras de orçamento.

## 4. Design e experiência do usuário

### 4.1 Princípios

O MiniFinance é uma ferramenta de trabalho com números. A interface deve parecer um livro-caixa bem diagramado: densidade confortável, alinhamento rigoroso, cor reservada para significado.

1. **Hierarquia por tipografia e alinhamento**, não por caixas, sombras ou cor.
2. **Cor só quando informa**: tipo de valor, estado, alerta, série de gráfico.
3. **Bordas de 1px no lugar de sombras.** Sombra apenas em elementos sobrepostos (dialog, drawer, popover, dropdown).
4. **Um único destaque por tela.** Se tudo é enfatizado, nada é.

### 4.2 Layout principal

- **Sidebar**: 240px no desktop. Em tablet vira rail de 56px (só ícones, com tooltip). No mobile vira `Sheet` aberto por botão no header.
- **Header**: 56px, borda inferior de 1px. Título da página à esquerda; seletor de período (quando aplicável) e menu do usuário à direita.
- **Conteúdo**: `max-w-[1280px]`, padding de 24px (16px no mobile).
- **Formulários de criar/editar**: `Sheet` (drawer) lateral de 440px. `Dialog` somente para confirmações (excluir, descartar alterações).
- **Wordmark**: "MiniFinance" em texto, peso 600. Sem ícone em quadrado arredondado.

### 4.3 Composição do dashboard

Em vez de uma fileira de KPI cards:

1. **Faixa de resumo**: um único container com borda, dividido por linhas finas em 3 colunas (Saldo, Receitas, Despesas do período). Só o saldo usa 28px; os outros usam 20px. Rótulo de 13px em cor muted acima do valor, variação em texto simples (`+R$ 320,00 vs. outubro`).
2. **Fluxo de caixa** (gráfico principal, ~2/3 da largura) ao lado de **Maiores categorias** (lista com valor e barra horizontal fina, ~1/3).
3. **Últimas transações** em tabela.

Os demais itens exigidos em 3.2 (resumo das contas, próximas recorrências, resumo dos orçamentos) entram como listas compactas abaixo, em seções separadas por espaço e título.

Nada de cards dentro de cards. Seções são separadas por espaço e título, não por container.

### 4.4 Design system

**Stack**: Tailwind + shadcn/ui, com tokens via CSS variables em `globals.css`. Nenhum valor de cor hardcoded em componente.

#### Cores

Neutros levemente frios (sem bege), um único acento em azul-petróleo, e semânticas separadas do acento.

| Token | Claro | Escuro |
|---|---|---|
| `background` | `#F7F8F9` | `#0F1216` |
| `card` / `popover` | `#FFFFFF` | `#161A20` |
| `border` / `input` | `#E3E6EA` | `#262C35` |
| `foreground` | `#14181F` | `#E8EBEF` |
| `muted-foreground` | `#5B6470` | `#98A1AE` |
| `muted` (hover de linha, nav ativa) | `#EEF0F3` | `#1C2128` |
| `primary` (botão principal) | `#14181F` | `#E8EBEF` |
| `accent` (foco, links, série principal) | `#0E6F7E` | `#4FB3C2` |
| `income` (receita) | `#1F7A4D` | `#4CC38A` |
| `expense` (despesa) | `#A8402F` | `#E0705C` |
| `warning` | `#9A6700` | `#E0A93B` |
| `destructive` (erro) | `#C4222B` | `#F0616A` |

Regras de uso:

- O botão principal é **tinta (quase preto)**, não colorido. O petróleo aparece em foco, links, item ativo e série principal de gráfico.
- **Cor nunca é o único sinal.** Receita e despesa sempre vêm com sinal (`+` / `−`) e/ou rótulo. Isso também garante acessibilidade para daltonismo.
- Em tabelas, o valor fica na cor do texto com sinal. A cor semântica aparece em totais, variações e gráficos.
- `expense` e `destructive` ficam em contextos separados: o primeiro só em valores e gráficos, o segundo só em validação, alertas e ações destrutivas.
- Contraste mínimo WCAG AA (4.5:1 para texto) nos dois temas.

#### Cores de categorias e gráficos

- Gráficos usam **no máximo 5 cores distintas**: uma rampa de 4 tons do acento (petróleo, do escuro ao claro) mais cinza para "Outras".
- Categorias são identificadas por **rótulo direto** (nome ao lado da barra ou fatia), não por legenda de cores.
- Sem gradiente de preenchimento. Linhas de 2px, barras sólidas, grade horizontal em `border`, sem grade vertical.
- Tooltip mostra data, categoria e valor formatado. Eixo Y com valores abreviados (`R$ 2 mil`).
- Gráfico de pizza evitado; preferir barras horizontais ordenadas.

#### Tipografia

Uma única superfamília: **IBM Plex Sans** (pesos 400, 500, 600). Ela tem personalidade técnica sem ser exótica, suporte completo a PT-BR e algarismos tabulares. `IBM Plex Mono` só para identificadores e códigos, nunca para valores monetários.

| Uso | Tamanho / peso |
|---|---|
| Título de página | 24px / 600 |
| Título de seção | 16px / 600 |
| Corpo, tabelas, inputs | 14px / 400 |
| Rótulos, metadados | 13px / 400, muted |
| Valor de destaque (saldo) | 28px / 600 |
| Valor secundário | 20px / 600 |

- Todo valor numérico usa `font-variant-numeric: tabular-nums` e é **alinhado à direita** em tabelas.
- Sem texto em gradiente, sem itálico decorativo, sem caixa-alta espaçada em rótulos.
- Line-height 1.5 no corpo, 1.25 em títulos.

#### Espaçamento, bordas e raios

- Escala base de 4px: `4, 8, 12, 16, 24, 32, 48`. Espaço entre seções: 32px. Padding interno de container: 16 a 24px.
- `--radius: 0.375rem` (6px). Inputs e botões 6px, containers 8px, badges 4px. Arredondamento total (`rounded-full`) só em avatar.
- Containers: `border` de 1px, sem sombra.

#### Estados e interação

- **Hover**: fundo `muted` em linhas de tabela, itens de menu e botões secundários. Botão primário escurece/clareia ~8%.
- **Focus-visible**: anel de 2px na cor `accent` com offset de 2px, em todos os elementos interativos. Nunca remover outline sem substituto.
- **Item de navegação ativo**: fundo `muted` + peso 600. Sem barra colorida lateral.
- **Disabled**: opacidade 50% e `cursor-not-allowed`.
- **Transições**: 120 a 150ms, apenas `color`, `background-color`, `opacity`. Respeitar `prefers-reduced-motion`. Sem animações decorativas ou indicadores pulsando.
- **Tema**: claro, escuro e "seguir sistema", com a preferência persistida (preferência de tema não é dado sensível; não usar localStorage para tokens ou dados de sessão).

#### Padrões de componentes

**Tabelas**
- Linhas de 40px, cabeçalho fixo (sticky), sem zebra, divisória de 1px entre linhas.
- Colunas: data, descrição, categoria (texto, sem pill colorida), valor (direita, tabular).
- Ações por linha em menu `⋯`. Ordenação e filtros acima da tabela.
- Mobile: cada linha vira item de lista com descrição e valor na primeira linha, categoria e data na segunda.
- Estado vazio: uma frase direta e uma ação ("Nenhuma transação neste período. Adicionar transação").

**Formulários**
- Rótulo acima do campo, inputs de 36px, erro em texto 13px abaixo do campo na cor `destructive`.
- Valores em BRL com máscara (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`), datas em `dd/mm/aaaa`.
- Tipo da transação (receita/despesa) como controle segmentado no topo do drawer.
- Botão primário à direita no rodapé do drawer, secundário "Cancelar" ao lado.

**Cards e indicadores**
- Usar container com borda apenas para agrupar informação relacionada. Sem cabeçalho com ícone decorativo.
- Indicadores em faixa de resumo ou lista, não em grade de cards idênticos.

**Formatação de valores**
- `R$ 1.234,56`. Negativos com sinal tipográfico: `−R$ 1.234,56`.
- Percentuais com uma casa decimal e vírgula (`12,5%`).

#### Texto da interface

- PT-BR direto e específico. Títulos informam conteúdo: "Fluxo de caixa de novembro", não "Visão geral incrível".
- Botões com verbo + objeto: "Salvar transação", "Excluir categoria".
- Sem linguagem de marketing, sem travessões em textos da interface, sem exclamações.

#### Tokens de referência (`globals.css`)

Tailwind v4 / shadcn (mapear para `hsl` se o projeto estiver no v3):

```css
:root {
  --radius: 0.375rem;
  --background: #F7F8F9;
  --foreground: #14181F;
  --card: #FFFFFF;
  --card-foreground: #14181F;
  --popover: #FFFFFF;
  --popover-foreground: #14181F;
  --primary: #14181F;
  --primary-foreground: #FFFFFF;
  --muted: #EEF0F3;
  --muted-foreground: #5B6470;
  --accent: #0E6F7E;
  --accent-foreground: #FFFFFF;
  --border: #E3E6EA;
  --input: #E3E6EA;
  --ring: #0E6F7E;
  --destructive: #C4222B;
  --income: #1F7A4D;
  --expense: #A8402F;
  --warning: #9A6700;
}

.dark {
  --background: #0F1216;
  --foreground: #E8EBEF;
  --card: #161A20;
  --card-foreground: #E8EBEF;
  --popover: #161A20;
  --popover-foreground: #E8EBEF;
  --primary: #E8EBEF;
  --primary-foreground: #0F1216;
  --muted: #1C2128;
  --muted-foreground: #98A1AE;
  --accent: #4FB3C2;
  --accent-foreground: #0F1216;
  --border: #262C35;
  --input: #262C35;
  --ring: #4FB3C2;
  --destructive: #F0616A;
  --income: #4CC38A;
  --expense: #E0705C;
  --warning: #E0A93B;
}
```

### 4.5 Anti-AI-slop (restrições obrigatórias)

ANTI-AI-SLOP RULES — STRICT DESIGN CONSTRAINTS

Avoid the following overused AI-generated design patterns and visual clichés:

**Color & Typography**

1. No purple-to-blue gradients or generic tech-inspired gradient palettes.
2. Do not default to Inter for every text element. Choose typography intentionally, considering personality, readability, and hierarchy.
3. No gradient-colored headlines or gradient text.
4. No beige backgrounds paired with fashionable italic serif typography as a shortcut to looking premium.
5. No arbitrary combinations of trendy fonts. Establish a coherent typographic system.

**Decorative Elements**

6. No floating pill badges such as "Introducing", "New", or "Coming Soon" unless they communicate actual product information.
7. No glowing halos, radial light effects, or decorative gradients behind headings or hero sections.
8. No frosted glass cards or excessive glassmorphism.
9. No decorative icons inside rounded squares above every section heading.
10. No pulsing status indicators or decorative animated dots.

**Layout & Composition**

11. No repetitive grids of three identical feature cards.
12. No unnecessary nested cards or containers within containers.
13. No colored vertical stripes or accent bars attached to every card.
14. No arbitrary numbered section labels such as tiny "01", "02", "03".
15. No excessive rounded corners or pill-shaped elements.
16. No repetitive component patterns merely to fill empty space.
17. No oversized decorative statistics with disproportionately small labels.

**Copywriting**

18. Avoid generic marketing language such as "Supercharge your workflow", "Unlock your potential", or "Take control like never before".
19. No unnecessary em dashes or artificial marketing-style sentences.
20. Use direct, specific, product-oriented language.
21. Every heading must communicate actual information or functionality.

**Financial Product Specific Constraints**

22. Do not use green gradients as a substitute for financial brand identity.
23. Do not turn every financial metric into an oversized KPI card.
24. Do not represent every expense category with a different saturated color.
25. Do not prioritize decorative charts over data readability.
26. Avoid excessive dashboard cards. Use tables, grouped information, charts, lists, and typography where they are more appropriate.
27. Do not use visual emphasis indiscriminately. Reserve strong colors and large typography for genuinely important financial information.

Design principle: Originality through composition, typography, proportion, and restraint, not decoration.

### 4.6 Quality gate final

Antes de concluir cada tela, o agente deve verificar e registrar no PR:

1. Todas as cores vêm de tokens? Existe algum hex ou classe de cor fixa em componente?
2. Cada cor semântica está acompanhada de sinal, ícone ou rótulo?
3. Há mais de um elemento competindo por destaque na tela?
4. Existe container dentro de container, sombra em elemento que não é sobreposto, ou raio maior que 8px?
5. Valores numéricos estão alinhados à direita com algarismos tabulares?
6. A tela funciona em 375px, 768px e 1280px, nos dois temas?
7. Foco por teclado visível em todos os controles?
8. Algum elemento pode ser removido sem perda de informação? Se sim, remover.

Além disso, o agente deve responder às perguntas do gate de design:

- Este elemento cumpre uma função ou propósito visual real?
- O layout continuaria distintivo sem gradientes, sombras e elementos decorativos?
- A hierarquia visual é intencional?
- A interface parece um produto financeiro desenhado com cuidado, e não um template SaaS genérico gerado por IA?
- Existem componentes desnecessários que podem ser removidos?

Se uma decisão visual lembrar uma convenção reconhecível de template gerado por IA, substitua-a por uma alternativa intencional.

### 4.7 UX

Todas as páginas devem contemplar:

- Loading states.
- Empty states.
- Error states.
- Feedback de sucesso e erro.
- Validação de formulários.
- Confirmação de ações destrutivas (`Dialog`).
- Navegação consistente.
- Acessibilidade básica por teclado e tecnologias assistivas.

Priorize clareza e usabilidade em vez de animações excessivas.

## 5. Arquitetura do frontend

Organize o projeto por funcionalidades, mantendo responsabilidades separadas.

Estrutura de referência:

```text
src/
├── app/
│   ├── router/
│   └── providers/
├── components/
│   ├── ui/
│   └── layout/
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── accounts/
│   ├── transactions/
│   ├── categories/
│   ├── cards/
│   ├── budgets/
│   ├── recurrences/
│   └── goals/
├── hooks/
├── lib/
│   ├── api/
│   ├── utils/
│   └── validations/
├── types/
└── main.tsx

tests/
├── setup.ts
├── mocks/
└── e2e/
```

Cada feature pode conter seus componentes, hooks, schemas, serviços de API e testes.

Diretrizes:

1. Evite componentes excessivamente grandes.
2. Separe lógica de negócio da apresentação.
3. Centralize as chamadas HTTP.
4. Utilize TanStack Query para estado do servidor.
5. Evite duplicar o estado retornado pela API.
6. Utilize invalidação de queries após mutations.
7. Evite `useEffect` desnecessários.
8. Reutilize componentes de formulários e feedback.
9. Utilize tipos explícitos e evite `any`.
10. Não introduza gerenciamento global de estado sem necessidade.
11. Centralize a formatação de valores, datas e percentuais em `lib/utils` (ex.: `formatCurrency`, `formatPercent`) e use-a em todos os componentes, conforme a seção 4.4.

Formate valores monetários com `Intl.NumberFormat`, usando `pt-BR` e BRL.

Os valores financeiros recebidos em centavos devem ser convertidos somente para apresentação. Evite erros de precisão em cálculos e preserve os valores originais enviados ao backend.

## 6. Testes unitários e de componentes

Configure Vitest, React Testing Library, jsdom, jest-dom, user-event e MSW.

Implemente testes para:

- Renderização dos componentes principais.
- Validação de formulários.
- Interação do usuário com formulários.
- Exibição de mensagens de erro.
- Estados de carregamento.
- Estados vazios.
- Tabelas e filtros.
- Componentes de saldo.
- Barras de progresso dos orçamentos.
- Indicadores financeiros.
- Fluxos de autenticação na interface.
- Tratamento de respostas da API.
- Comportamento de mutations e atualização de dados.
- Funções de formatação (BRL, sinal tipográfico `−`, percentual com vírgula).

Utilize MSW para simular respostas HTTP nos testes unitários e de componentes.

Não faça mocks diretos de toda a camada HTTP quando o MSW puder verificar o comportamento real dos hooks e componentes.

Priorize testes de comportamento, com queries acessíveis da React Testing Library.

Configure relatórios de cobertura e busque pelo menos 80% de cobertura de statements, branches, functions e lines do código relevante.

## 7. Testes E2E com Playwright

Implemente pelo menos cinco testes end-to-end completos.

Esses testes devem utilizar a aplicação real, o backend real e um PostgreSQL de testes isolado.

Não utilize MSW nem mocks de API nos testes E2E.

### E2E 1 — Autenticação
- Cadastrar usuário.
- Realizar login.
- Acessar dashboard.
- Atualizar a página e verificar a sessão.
- Realizar logout.

### E2E 2 — Contas e transferências
- Criar duas contas financeiras.
- Realizar uma transferência.
- Verificar a atualização dos saldos.
- Confirmar que o saldo consolidado permanece correto.

### E2E 3 — Transações e orçamentos
- Criar orçamento mensal.
- Cadastrar despesas na categoria.
- Verificar consumo do orçamento.
- Exceder o limite.
- Verificar o alerta apresentado na interface.

### E2E 4 — Cartão de crédito
- Cadastrar cartão.
- Registrar uma compra parcelada.
- Consultar as faturas.
- Verificar a distribuição das parcelas.
- Pagar uma fatura e verificar a atualização do estado.

### E2E 5 — Recorrências
- Cadastrar uma despesa recorrente.
- Verificar a próxima ocorrência.
- Executar o fluxo de processamento previsto pela API em ambiente de testes.
- Consultar a movimentação gerada.
- Confirmar que não existem lançamentos duplicados.

Utilize seletores semânticos e estáveis.

Os testes devem ser independentes, reproduzíveis e não depender de tempos arbitrários.

Crie uma estratégia de inicialização, preparação e limpeza do ambiente E2E, utilizando Docker para o backend e PostgreSQL quando necessário.

Documente como executar os testes completos localmente e no CI.

Se a API ainda não oferecer algum fluxo necessário, registre a dependência em vez de substituir o E2E por uma simulação.

## 8. CI/CD

Configure GitHub Actions para executar automaticamente:

- Instalação de dependências.
- Typecheck.
- Lint com Biome.
- Testes unitários.
- Cobertura de testes.
- Build de produção.
- Testes E2E com Playwright.

Execute typecheck, lint, testes unitários e build em Ubuntu, Windows e macOS.

Configure os testes E2E integrados com backend e PostgreSQL em um job Ubuntu com Docker.

Documente eventuais limitações de execução conteinerizada nos outros sistemas operacionais.

Publique relatórios de cobertura e artifacts úteis para depuração de falhas do Playwright.

## 9. Scripts npm

Disponibilize scripts equivalentes a:

- `dev`
- `build`
- `preview`
- `typecheck`
- `lint`
- `format`
- `check`
- `test:unit`
- `test:coverage`
- `test:e2e`

O comando `test:e2e` deve oferecer uma forma reproduzível de executar a suíte com seus serviços necessários, sem depender de um banco de desenvolvimento previamente configurado.

## 10. Critérios de aceite

O trabalho estará concluído quando:

1. Todas as páginas e funcionalidades planejadas estiverem implementadas.
2. O frontend estiver integrado aos endpoints disponíveis da API real.
3. O layout estiver responsivo (375px, 768px e 1280px) nos temas claro e escuro.
4. Os formulários possuírem validação e feedback.
5. A autenticação funcionar com cookies e rotas protegidas.
6. As listagens possuírem filtros e estados apropriados.
7. O TypeScript compilar sem erros.
8. O Biome executar sem erros.
9. Os testes unitários passarem.
10. Os cinco testes E2E passarem com backend e banco reais.
11. O build de produção funcionar.
12. O README documentar instalação, execução, integração com API, variáveis de ambiente e testes.
13. O quality gate da seção 4.6 tiver sido aplicado a cada tela e registrado nos PRs, sem violações das regras da seção 4.5.

## 11. Modo de execução

Antes de implementar:

1. Inspecione o repositório e identifique o que já existe.
2. Analise a documentação disponível da API.
3. Defina a arquitetura e a organização das features.
4. Identifique dependências e incompatibilidades.
5. Leia integralmente a seção 4. Os tokens, a tipografia e as regras de composição são decisões já tomadas, não sugestões. Não os substitua por padrões do shadcn/ui ou por escolhas próprias sem justificativa registrada.

Depois, implemente progressivamente:

**Fase 1:** setup, design system (tokens da seção 4.4, tema claro/escuro, fonte, componentes base), layout, roteamento e cliente HTTP.

**Fase 2:** autenticação, contas, categorias e transações.

**Fase 3:** dashboard, gráficos e orçamentos.

**Fase 4:** cartões, faturas, recorrências e metas.

**Fase 5:** testes unitários, testes E2E, acessibilidade, responsividade e refinamentos.

Valide o funcionamento após cada fase, execute os comandos disponíveis e corrija os erros encontrados. Ao final de cada fase, aplique o quality gate da seção 4.6 às telas entregues.

Não deixe componentes com dados fictícios como implementação final.

Não substitua funcionalidades reais por placeholders.

Quando algum requisito depender de uma API ainda não disponível, documente claramente a pendência.

Ao final, apresente um resumo do que foi desenvolvido, a arquitetura adotada, os testes executados, os resultados obtidos e eventuais pendências.