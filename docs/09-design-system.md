# 09 - Design system e UI

Este documento fixa as escolhas visuais da Bússola. Regra-mãe: toda cor que um componente usa
resolve para um token semântico. No instante em que um componente nomeia um tom
(`green-600`, um hex), o design system acabou.

## Stack de UI

React + Tailwind + shadcn/ui. Fonte Inter. Dark mode via classe. Radius 10px.

## Tokens

Camada de tokens em `src/index.css` (`:root` com valores HSL sem `hsl()`, `.dark`
redefinindo só o que muda). Além dos tokens base, os quatro estados que o shadcn
não traz: `success`, `warning` (foreground escuro), `info`, `destructive`. A
sidebar tem paleta própria (escura mesmo no tema claro).

### Cor de marca da Bússola

O `--primary` puxa o azul/petróleo institucional e o verde da marca
entra como `success`/acento. O importante
é ter um `--primary` só, e o verde como acento, não espalhado.

## Uso semântico (faróis e status)

| Situação | Token |
|---|---|
| KR no ritmo, projeto em dia, Kit em_dia, meta batida | `success` |
| Atrás do ritmo, prazo apertado, Kit atrasado, over budget | `warning` (texto escuro) |
| Informativo, neutro | `info` |
| Falhou, cancelado, vermelho de risco | `destructive` |
| Rótulo secundário, ajuda | `text-muted-foreground` |

Os faróis de OKR, projeto e Kit usam exatamente esses tokens. A cor vem do banco
(a regra calcula o estado); o componente só mapeia estado para token.

## App shell

Quatro arquivos, uma responsabilidade cada: `AppLayout`,
`AppSidebar`, `AppHeader`, `AppLayoutContext`. O `AppHeader` tem `title`
obrigatório. Sidebar escura permanente separa navegação de conteúdo.

### Seletor de empresa no shell

Multi-empresa: o seletor de empresa (holding e controladas) fica ao lado do título,
no shell, nunca por página. É a resposta sempre visível para "qual empresa estou
vendo?". Trocar de empresa refiltra tudo (o `company_id` ativo entra nas queries).

### Navegação (sidebar)

Grupos que espelham os módulos:

- Estratégia: Mapa estratégico, Árvore de OKR, Meu OKR
- Execução: Portfólio de projetos, Sprints (kanban), Minhas atividades, Cronograma
- Processos: Inventário, Melhorias (DMAIC), Indicadores
- Gestão: Kit de gestão, OPR, Bônus
- Painéis: Executivo, Por área, Comitês
- Administração: Empresas, Áreas, Pessoas, Permissões

## Primitives a construir (shadcn não traz)

Primitivos que o shadcn não traz: `searchable-select`, `multi-select-searchable`,
`table-pagination`, `column-filter-header`, `active-filters-bar`. Construir cedo,
com API estável, para não nascerem doze filtros diferentes. A Bússola é densa em
dimensões (áreas, pessoas, projetos), então esses componentes são inevitáveis.

## Telas de relatório e drill-down

Toda tela que parte de um agregado (mapa, árvore de OKR, portfólio, Kit, bônus)
segue o detalhamento progressivo:

- Linha inteira clicável, não um chevron minúsculo.
- Detalhe em sheet (quando precisa comparar com a tabela atrás) ou dialog (quando
  é uma decisão focada). Nunca `navigate()` para detalhe que deveria ser camada.
- Filtro viaja para o banco; identidade de linha pode ficar no cliente.
- Agregação no banco: a tela pede o total, não as linhas para somar.
- Nunca renderizar vazio como zero; distinguir "sem correspondência" de "falhou".
- Exportar sempre o estado filtrado.

## Gráficos

Para qualquer gráfico (tendência de indicador, faróis, waterfall de variação),
manter as cores
alinhadas aos tokens semânticos.

## Acessibilidade

Contraste conforme os foregrounds decididos por token (amber = texto escuro).
Componentes shadcn já são acessíveis; preservar foco, labels e navegação por
teclado nos primitives construídos.
