# Fluxo DMAIC (módulo de processos / Six Sigma)

Cada projeto de melhoria percorre as cinco fases com tollgate entre elas. As
etapas ficam em `dmaic_etapas`, uma por fase, com entregáveis e aprovação.

```mermaid
flowchart LR
  P["Processo\n(+ SIPOC)"] --> D
  subgraph DMAIC
    D["Define\nproblema, meta SMART,\nescopo, SIPOC"] -->|tollgate| M["Measure\nindicadores Y,\nbaseline, coleta"]
    M -->|tollgate| A["Analyze\ncausas-raiz,\nX vitais"]
    A -->|tollgate| I["Improve\nmelhorias,\npiloto"]
    I -->|tollgate| C["Control\npadronização,\nmonitorar Y"]
  end
  C --> G["Ganho realizado\nvs. estimado"]
  M -.-> IND["indicadores_processo\n+ indicador_medicoes"]
  C -.-> IND
```

Melhorias menores não precisam do fluxo completo: `metodo` pode ser `kaizen` ou
`just_do_it`, que dispensam alguns tollgates. O ganho estimado e o realizado
conectam o esforço de melhoria ao objetivo "Implantação de melhoria" do mapa da
área.
