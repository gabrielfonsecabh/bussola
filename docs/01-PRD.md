# 01 - PRD (visão de produto)

## Problema

Muitas empresas têm uma estratégia bem desenhada (ciclo plurianual, uma Estrela do
Norte como margem operacional, mapa em 4 perspectivas, bônus por indicadores). Mas
ela vive em apresentações, planilhas por área e reuniões. Falta um lugar único
onde a estratégia desça até a atividade diária, onde projetos e iniciativas de IA
tenham dono e prazo, onde processos sejam mapeados e melhorados com método, e onde
o Kit mínimo de gestão de cada área seja visível e cobrável.

A Bússola é esse lugar.

## Objetivo do produto

Dar a cada gestor o mapa completo e desdobrado da sua área, e a cada colaborador
a clareza do que fazer hoje, mantendo a linha direta entre a atividade diária e o
objetivo estratégico e o bônus. Controle completo, do macro anual ao diário.

## Personas

| Persona | Nível | O que precisa |
|---|---|---|
| Diretoria | Diretor | Ver o mapa da diretoria, aprovar OKRs, acompanhar EBITDA/faturamento e o Kit de gestão das gerências |
| Gerência | Gerente | Desdobrar OKR da diretoria para a área, gerir projetos/sprints, publicar OPR, manter o Kit em dia |
| Coordenação / Especialista | Especialista | Tocar projetos e melhorias, mover atividades, registrar check-ins de KR |
| Colaborador | Colaborador | Ver suas atividades do dia/semana, atualizar status, enxergar como contribui para o OKR |
| Comitês (S&Op, Orçamento, IA, LGPD) | Transversal | Enxergar itens de várias áreas num recorte de comitê |

## Os quatro módulos (todos no v1)

### 1. Desdobramento de OKR

Do corporativo ao individual. Objetivos estratégicos (do mapa) viram OKRs
corporativos, que se desdobram em OKRs de diretoria, de gerência e individuais.
Cada OKR tem Key Results com meta, atual, farol e histórico de check-ins. O gestor
vê a árvore inteira da sua área e repassa. Ligado às 4 perspectivas do BSC.

### 2. Projetos, Sprints e Atividades

Projetos e iniciativas de IA com responsável, patrocinador, categoria (estrutural,
melhoria, IA, gestão de projetos, comitê), prazos e progresso. Sprints por área.
Atividades com horizonte anual, trimestral, mensal, semanal ou diário, ligadas a
projeto, sprint e/ou Key Result. Quadro kanban e visão de cronograma (T1-T4).

### 3. Processos e Six Sigma

Cadastro de processos com dono e SIPOC. Projetos de melhoria no fluxo DMAIC
(Define, Measure, Analyze, Improve, Control) com tollgates, meta SMART, ganho
estimado e realizado. Indicadores de processo (Y e X) com medições ao longo do
tempo. Também acomoda Kaizen e Just Do It para melhorias menores.

### 4. Kit mínimo de gestão + OPR + Bônus

O Kit mínimo de gestão de cada área (mapa estratégico da área + processos e
procedimentos + OPR) com status e percentual, exatamente como pesa no bônus
setorial. OPR (One Page Report) mensal por área. Configuração do modelo de bônus
(indicadores globais, como EBITDA e faturamento; setoriais, com o Kit; e
individuais, como assiduidade) e a régua de pagamento por nível.

## Recortes transversais

- **Multi-empresa**: holding e empresas controladas. Seletor de
  empresa no shell. Um usuário pode pertencer a mais de uma empresa.
- **Comitês**: agrupam itens (OKRs, projetos, processos) de várias áreas num
  painel de comitê.
- **Dashboards**: painel executivo (Estrela do Norte, mapa por perspectiva,
  faróis), painel por área, e o painel de bônus.

## Fora de escopo (v1)

- Folha, ponto e cálculo financeiro do bônus em dinheiro (a Bússola mede o
  atingimento; o pagamento continua no processo atual).
- Integração automática com o ERP para indicadores (fica preparada, mas
  os valores entram por lançamento manual ou importação no v1).
- App mobile nativo (o layout é responsivo; app nativo é futuro).
- Automação executável dos agentes de IA (a Bússola gerencia as iniciativas de
  IA; executar os agentes é outro trilho).

## Métricas de sucesso

- 100% das áreas com Kit mínimo de gestão cadastrado e OPR do mês publicado.
- Todo OKR corporativo com desdobramento até o nível individual.
- Todo projeto e melhoria com responsável e prazo, sem "órfãos".
- Tempo para responder "de onde vem esse número?" medido em cliques, não em
  reuniões (via drill-down).

## Princípios de produto

- A estratégia é a raiz: nada de OKR, projeto ou processo solto sem ligação com o
  mapa ou com uma área.
- Confiança acima de tudo: nenhum número vazio renderizado como zero; todo total
  é auditável até o lançamento.
- Enxuto por padrão: estrutura organizacional enxuta, então a ferramenta não pode
  exigir mais burocracia do que a gestão real.
