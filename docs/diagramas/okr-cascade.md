# Desdobramento de OKR (cascade)

Do mapa estratégico até a atividade diária. O elo do desdobramento é
`okrs.parent_okr_id`; a ponte para execução é `atividades.key_result_id`.

```mermaid
flowchart TD
  ME["Mapa estratégico\n(objetivos_estrategicos)\n4 perspectivas BSC"] --> OC["OKR corporativo\nnivel = corporativo"]
  OC --> OD1["OKR Diretoria\n(Adm-Financeiro)"]
  OC --> OD2["OKR Diretoria\n(Operações e Eng.)"]
  OD1 --> OG1["OKR Gerência\n(Controladoria)"]
  OD1 --> OG2["OKR Gerência\n(Tesouraria)"]
  OG1 --> OI1["OKR Individual\n(Especialista)"]
  OG1 --> KR["Key Results\nmeta / atual / farol"]
  KR --> CH["Check-ins\n(histórico)"]
  OI1 --> AT["Atividades\nanual -> trimestral -> mensal\n-> semanal -> diário"]
  KR --> AT
```

Cada nível enxerga a árvore abaixo de si (o gestor vê o mapa desdobrado da área) e
o elo acima (a que objetivo estratégico aquilo serve). O farol sobe pela árvore:
o atingimento dos KRs filhos alimenta a leitura do OKR pai.
