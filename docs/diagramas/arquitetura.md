# Arquitetura (topologia)

```mermaid
flowchart TB
  subgraph Cliente
    B["Browser\nSPA React + Vite\nTailwind + shadcn/ui\nTanStack Query"]
  end
  subgraph Vercel
    B
  end
  subgraph Supabase["Supabase Cloud (projeto dedicado Bússola)"]
    AUTH["Auth\n(JWT, MFA)"]
    PG[("Postgres\nschema app\nRLS em tudo")]
    RPC["Funções SECURITY DEFINER\n(desdobramento, agregação, apuração)"]
    EF["Edge Functions\n(jobs, integrações)"]
    AUTH --> PG
    RPC --- PG
    EF --- PG
  end
  B -->|anon key + JWT do usuário| AUTH
  B -->|select/insert/update/delete\nfiltrado por RLS| PG
  B -->|rpc| RPC
  EF -.->|futuro: importar indicadores| SANK["ERP"]
```

Pontos de segurança marcados na topologia: o browser só carrega a `anon key`; a
`service_role` vive apenas em Edge Functions e scripts. Toda leitura e escrita
passa pela RLS. As RPCs privilegiadas têm gate próprio.
