# 06 - Módulo Projetos, Sprints e Atividades

## Objetivo do módulo

Gerir tudo que a companhia faz com projetos e com IA: responsável, patrocinador,
prazo, progresso, ligado ao OKR que serve. E gerir a execução em sprints e
atividades, do horizonte anual ao diário. Este módulo é o "roadmap" e o "plano de
ação" da planilha de planejamento, agora vivo e integrado.

## Conceitos

- **Projeto**: um esforço com início e fim (ou uma iniciativa de IA). Categoria
  espelha o mapa da área: estrutural, melhoria, ia, gestao_projetos, comite.
- **Sprint**: janela de execução de uma área (ex.: quinzenal ou mensal), com
  objetivo e status.
- **Atividade**: a unidade de trabalho. Pode pertencer a um projeto, a uma sprint
  e/ou a um Key Result, e ter subtarefas. O campo `horizonte` (anual, trimestral,
  mensal, semanal, diario) é o que permite ir do macro ao dia a dia numa mesma
  base de dados.

## Como os horizontes se conectam

Uma atividade anual ("Migração CPC full") se quebra em atividades trimestrais,
que viram mensais, semanais e diárias via `parent_atividade_id`. O colaborador
filtra por "diário" e vê só o que importa hoje; o diretor filtra por "anual" e vê
o macro. A mesma tabela, recortada por horizonte.

## Vínculos com a estratégia

- `projetos.okr_id` liga o projeto ao OKR que ele move.
- `atividades.key_result_id` liga a atividade ao KR que ela avança.
- Assim, mover uma atividade para "concluído" pode alimentar o progresso do
  projeto e sinalizar avanço no KR (via check-in sugerido, não automático no v1).

## Telas

1. **Portfólio de projetos** (por área e por empresa): tabela densa com filtros
   (categoria, status, responsável, prazo), totais no rodapé, drill-down para o
   projeto.
2. **Projeto** (detalhe): dados, cronograma T1-T4, atividades do projeto, OKR
   ligado, progresso.
3. **Kanban de sprint**: colunas por status (a_fazer, fazendo, revisao,
   concluido, bloqueado), cartões arrastáveis, filtro por responsável e horizonte.
4. **Minhas atividades**: a lista pessoal, agrupada por horizonte, com foco no
   "hoje" e "esta semana".
5. **Cronograma / roadmap**: visão de linha do tempo dos projetos por trimestre,
   equivalente ao roadmap da planilha de planejamento.

## RPCs

- `app.projeto_progresso(p_projeto_id uuid)` - recalcula `progresso_pct` a partir
  das atividades concluídas (agrega no banco).
- `app.sprint_resumo(p_sprint_id uuid)` - contadores por status para o topo do
  kanban, sem puxar todos os cartões.
- `app.atividade_mover(p_id uuid, p_status text, p_ordem int)` - move e reordena;
  trata concorrência; deriva tenant da linha.

## Permissões

| Chave | Quem |
|---|---|
| `projeto.view` / `atividade.view` | todos da empresa |
| `projeto.edit` | gerente+, responsável do projeto |
| `atividade.edit` | responsável e superiores na área |
| `projeto.delete` | company_admin |
| `sprint.manage` | gerente+ |

## Critérios de aceite

- Uma atividade anual pode ser desdobrada em diárias e cada nível é filtrável.
- Concluir atividades atualiza o progresso do projeto (via RPC, não no cliente).
- O kanban reflete a mudança de status na hora e trata "0 linhas" como erro.
- Um projeto sem responsável ou sem prazo é sinalizado (não deveria existir
  "órfão").
- Exportar o portfólio respeita os filtros ativos da tela.
