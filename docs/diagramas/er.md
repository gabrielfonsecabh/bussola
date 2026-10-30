# Diagrama ER (referência)

Versão de referência do modelo. O ER macro comentado está em
`docs/03-modelo-de-dados.md`; aqui fica o detalhe por domínio.

## Tenant e organização

```mermaid
erDiagram
  companies {
    uuid id PK
    text razao_social
    text nome_fantasia
    text tipo "holding|controlada"
    uuid parent_company_id FK
  }
  company_users {
    uuid id PK
    uuid company_id FK
    uuid user_id FK
    bool is_admin
    bool is_active
    text nivel
    text cargo
  }
  profiles {
    uuid user_id PK
    text nome
    text email
  }
  areas {
    uuid id PK
    uuid company_id FK
    uuid parent_area_id FK
    text nome
    text tipo "diretoria|gerencia|especialista|comite"
    uuid responsavel_user_id FK
  }
  companies ||--o{ company_users : ""
  companies ||--o{ areas : ""
  areas ||--o{ areas : ""
```

## OKR

```mermaid
erDiagram
  objetivos_estrategicos {
    uuid id PK
    uuid company_id FK
    uuid perspectiva_id FK
    text titulo
    text ciclo
    bool is_estrela_do_norte
  }
  okrs {
    uuid id PK
    uuid company_id FK
    uuid parent_okr_id FK
    uuid area_id FK
    uuid objetivo_estrategico_id FK
    uuid owner_user_id FK
    text nivel
    int ano
    int trimestre
    text status
  }
  key_results {
    uuid id PK
    uuid okr_id FK
    text tipo
    numeric baseline
    numeric meta
    numeric atual
    numeric peso
    text farol
  }
  kr_checkins {
    uuid id PK
    uuid key_result_id FK
    date data
    numeric valor
  }
  objetivos_estrategicos ||--o{ okrs : ""
  okrs ||--o{ okrs : ""
  okrs ||--o{ key_results : ""
  key_results ||--o{ kr_checkins : ""
```

## Projetos, sprints, atividades

```mermaid
erDiagram
  projetos {
    uuid id PK
    uuid company_id FK
    uuid area_id FK
    uuid okr_id FK
    text categoria
    text status
    numeric progresso_pct
  }
  sprints {
    uuid id PK
    uuid company_id FK
    uuid area_id FK
    date data_inicio
    date data_fim
    text status
  }
  atividades {
    uuid id PK
    uuid company_id FK
    uuid projeto_id FK
    uuid sprint_id FK
    uuid key_result_id FK
    uuid parent_atividade_id FK
    text horizonte
    text status
  }
  projetos ||--o{ atividades : ""
  sprints ||--o{ atividades : ""
  atividades ||--o{ atividades : ""
```

## Processos / Six Sigma

```mermaid
erDiagram
  processos {
    uuid id PK
    uuid company_id FK
    uuid area_id FK
    uuid dono_user_id FK
    text tipo
    int nivel_maturidade
  }
  processo_sipoc {
    uuid id PK
    uuid processo_id FK
    jsonb steps
  }
  projetos_melhoria {
    uuid id PK
    uuid company_id FK
    uuid processo_id FK
    text metodo
    text fase_atual
    numeric ganho_estimado
    numeric ganho_realizado
  }
  dmaic_etapas {
    uuid id PK
    uuid projeto_melhoria_id FK
    text fase
    text status
  }
  indicadores_processo {
    uuid id PK
    uuid processo_id FK
    text tipo "Y|X"
    numeric meta
  }
  indicador_medicoes {
    uuid id PK
    uuid indicador_id FK
    date data
    numeric valor
  }
  processos ||--|| processo_sipoc : ""
  processos ||--o{ projetos_melhoria : ""
  projetos_melhoria ||--o{ dmaic_etapas : ""
  processos ||--o{ indicadores_processo : ""
  indicadores_processo ||--o{ indicador_medicoes : ""
```
