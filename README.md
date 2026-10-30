# Bússola

**Gestão estratégica open source, em português: OKR desdobrado até a atividade do dia, projetos e sprints, processos com Six Sigma (DMAIC, SIPOC, POP) e o kit mínimo de gestão de cada área. Num lugar só.**

A maioria das empresas tem estratégia. O que falta é o fio que liga o objetivo da diretoria à tarefa de terça-feira de quem está na ponta. A estratégia vive em apresentação, planilha por área e reunião. A Bússola é esse fio, em software.

É aberta para qualquer organização que queira gerir com método sem pagar caro por isso.

## O que ela faz

**Estratégia e OKR**
- Mapa estratégico em 4 perspectivas do BSC (Financeiro, Clientes, Processos, Aprendizagem) com a **Estrela do Norte** destacada.
- Desdobramento de OKR em árvore: corporativo, diretoria, gerência, especialista. Cada gestor vê o mapa da própria área.
- **Canvas de OKR**: os vínculos entre objetivos num grafo que você arrasta e conecta.
- Key Results com tipo (percentual, número, moeda, marco), direção (subir ou descer) e check-ins com farol.

**Projetos e execução**
- Projetos e iniciativas de IA com dono, prazo, prioridade e categoria.
- Sprints e régua de sprints, atividades do horizonte anual ao diário.
- Gestão à vista dos projetos.

**Processos com Six Sigma**
- Ciclo **DMAIC** (Definir, Medir, Analisar, Melhorar, Controlar) por projeto de melhoria.
- **SIPOC completo** (fornecedores, entradas, processo, saídas, clientes).
- Fluxo do processo, rotina, inventário e jornada de mapeamento.
- **POP** (Procedimento Operacional Padrão) gerado a partir do processo mapeado, com modelo configurável.

**Gestão**
- Kit mínimo de gestão por área e **OPR** (One Page Report).
- Comitês como entidade própria, enxergando itens de várias áreas.
- Régua de bônus por faixas de atingimento ligada aos indicadores (opcional, os valores são seus).
- Painéis executivos, por área e por comitê.

**Plataforma**
- Multi-empresa: holding e controladas, um usuário em mais de uma empresa.
- Papéis e permissões granulares, alçada, recortes por área que descem a hierarquia.
- Troca de senha obrigatória no primeiro acesso.
- Exportação para Excel e tema claro e escuro.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Vite, TypeScript strict, Tailwind v4, shadcn/ui |
| Dados | Supabase (Postgres, Auth, RLS, Edge Functions) |
| Estado de servidor | TanStack Query |
| Formulários | React Hook Form + Zod |
| Grafo do canvas | React Flow (`@xyflow/react`) |
| Deploy sugerido | Cloudflare Workers ou Vercel + Supabase Cloud |

## Segurança levada a sério

Cada tabela de negócio tem `company_id` e RLS forçada com políticas por verbo. Funções `SECURITY DEFINER` têm gate próprio e derivam o tenant da linha, nunca do parâmetro. A migration `0099_verificacao.sql` e os testes em `supabase/tests/` provam a blindagem contra o banco, incluindo o caminho negado (usuário de outra empresa tentando escrever).

## Como rodar

Pré-requisitos: Node 22+, um projeto no [Supabase](https://supabase.com) (o plano gratuito serve) e `psql`.

```bash
git clone <este-repositorio> bussola && cd bussola
npm install
cp .env.example .env.local     # preencha URL, chave anon e acesso ao banco
npm run db:push                # aplica as migrations em ordem
npm run db:verificar           # confere a blindagem
npm run dev                    # http://localhost:5173
```

O app sobe mesmo com o `.env.local` em branco: um banner no topo diz qual variável falta.

Depois de criar seu usuário no Supabase Auth, transforme-o em super admin (instruções no fim de `supabase/migrations/0008_seed.sql`).

### Dados de demonstração

A migration `0008_seed.sql` cria o **Grupo Horizonte**, uma empresa fictícia com holding, duas controladas, mapa estratégico, diretorias, comitês e uma régua de bônus de exemplo. A `0009_seed_demo_financeiro.sql` desdobra a Diretoria Administrativo-Financeiro em gerências, OKRs, KRs e projetos. Use para explorar e depois troque pelos dados da sua empresa. `docs/templates/desdobramento-diretoria.sql` é o molde para desdobrar as outras diretorias.

### Testes do banco

`supabase/tests/` usa dois usuários fixos: `00000000-0000-0000-0000-00000000a001` (super admin, com vínculo de admin na holding) e `00000000-0000-0000-0000-00000000a002` (usuário de QA que só pertence à Horizonte Serviços, sem papel de admin). Crie os dois no Auth com esses UUIDs, ou troque pelos seus nos arquivos de teste. O `00_preparar.sql` cria os vínculos, e `npm run db:testar` roda tudo.

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | typecheck + build de produção |
| `npm run typecheck` | só o TypeScript |
| `npm run lint` | oxlint |
| `npm run test` | testes unitários (Vitest) |
| `npm run db:psql` | sessão psql no banco |
| `npm run db:push` | aplica as migrations em ordem |
| `npm run db:verificar` | roda as queries de blindagem da `0099` |
| `npm run db:testar` | roda os testes SQL de permissão |
| `npm run db:types` | regenera `src/types/database.ts` |

A rota `/design-system` (fora da navegação) mostra tokens, faróis e componentes nos dois temas.

## Documentação

1. `docs/01-PRD.md`: visão de produto e escopo.
2. `docs/02-arquitetura.md` e `docs/03-modelo-de-dados.md`.
3. `docs/04-seguranca.md`: multi-empresa, RLS, papéis, permissões e LGPD.
4. `docs/05` a `docs/08`: os quatro módulos.
5. `docs/09-design-system.md`.
6. `docs/10-desdobramento.md`: como desdobrar as diretorias da sua empresa.
7. `docs/11-operacao.md` e `docs/12-deploy-cloudflare.md`: operação do dia a dia e publicação.
8. `docs/guia/`: guia de uso para quem vai usar o sistema.

## Contribuindo

Issues e pull requests são bem-vindos. Toda mudança de schema entra como migration nova, re-executável, e precisa passar em `npm run db:verificar` e `npm run db:testar`.

## Licença

[MIT](LICENSE). Use, adapte e distribua, inclusive comercialmente.

Criado por Gabriel Fonseca.
