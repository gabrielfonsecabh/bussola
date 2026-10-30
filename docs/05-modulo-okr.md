# 05 - Módulo OKR (desdobramento estratégico)

## Objetivo do módulo

Levar a estratégia da raiz (mapa estratégico, 4 perspectivas, Estrela do Norte)
até a atividade diária, dando a cada gestor o mapa desdobrado da sua área e a
cada colaborador a linha direta entre o que ele faz e o objetivo.

## Conceitos

- **Objetivo estratégico**: item do mapa (ex.: "Disciplina de custos e capital de giro").
  Ligado a uma perspectiva. Vem do planejamento estratégico.
- **OKR**: um Objetivo desdobrável em quatro níveis (corporativo, diretoria,
  gerência, individual). O desdobramento é a árvore `parent_okr_id`.
- **Key Result**: resultado mensurável do OKR. Meta, atual, peso, direção, farol.
- **Check-in**: registro periódico do valor de um KR, com comentário e autor.

## Regras de desdobramento

- Um OKR corporativo nasce de um objetivo estratégico.
- Um OKR de diretoria referencia um OKR corporativo como pai.
- Um OKR de gerência referencia um de diretoria; um individual referencia um de
  gerência (ou de diretoria, quando a área não tem gerência intermediária).
- O ciclo é anual, com KRs podendo ter recorte trimestral (`trimestre` de 1 a 4;
  nulo = anual).
- O farol do OKR é derivado dos KRs filhos ponderados pelo peso, comparado ao
  tempo decorrido do ciclo (evita "verde" só porque o ano mal começou).

## Faróis (calculados no banco)

- `atingimento = (atual - baseline) / (meta - baseline)`, respeitando `direcao`.
- Comparação com o esperado pelo tempo decorrido do ciclo define a cor:
  - verde (`success`): no ritmo ou à frente.
  - amarelo (`warning`): atrás, mas recuperável.
  - vermelho (`destructive`): risco real de não bater.
- A regra vive numa função/`view`, não no componente. Cores via token semântico.

## Telas

1. **Mapa estratégico** (por empresa): as 4 perspectivas com seus objetivos,
   como no planejamento estratégico. Clicar num objetivo abre os OKRs corporativos ligados.
2. **Árvore de OKR** (por área): visão hierárquica do desdobramento. O gestor vê
   sua área e tudo abaixo; expande até o individual. Aplica drill-down: clicar num
   OKR abre painel lateral (sheet) com KRs, check-ins e atividades ligadas.
3. **Meu OKR** (por pessoa): os OKRs e KRs de que sou dono, com o botão de
   check-in inline (dialog).
4. **Check-in de KR**: dialog para registrar valor, data e comentário. Atualiza
   `atual` e recalcula o farol.

Todas as telas de árvore e mapa seguem o padrão de detalhamento progressivo:
row inteira clicável, detalhe em sheet, ação inline (check-in), exportar o estado
filtrado.

## RPCs (funções no banco)

- `app.okr_desdobrar(p_okr_id uuid, p_para_area uuid, ...)` - cria OKR filho
  herdando contexto do pai. Gate por `okr.edit`.
- `app.okr_arvore(p_area_id uuid, p_ano int)` - retorna a árvore agregada com
  farol calculado, para a tela sem puxar linha a linha. `statement_timeout` alto,
  ordenação por chave única.
- `app.kr_checkin(p_kr_id uuid, p_valor numeric, p_data date, p_comentario text)`
  - insere check-in, atualiza `atual`, recalcula farol. Deriva o tenant do KR.

## Permissões

| Chave | Quem |
|---|---|
| `okr.view` | todos da empresa |
| `okr.edit` | gerente+, ou dono do OKR |
| `okr.delete` | company_admin |
| `okr.checkin` | dono do KR e superiores na área |

## Critérios de aceite

- Um objetivo estratégico do mapa gera OKR corporativo e desce até o individual
  sem perder a ligação (dá para navegar de baixo para cima e de cima para baixo).
- Registrar um check-in muda o farol na tela sem recarregar a página inteira.
- A árvore de uma área com centenas de OKRs abre sem timeout (agregação no banco).
- Um usuário de outra empresa não vê nem edita OKRs que não são dele (teste
  negativo passa).
