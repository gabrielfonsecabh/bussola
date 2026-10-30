# 04 - Segurança

A regra-mãe deste projeto: **em Postgres + Supabase as falhas perigosas não
levantam exceção.** Prove cada decisão de segurança contra o banco, nunca infira
pelo código. Este documento descreve como isso é aplicado na Bússola.

## Modelo de acesso

### Tenant

Todo dado pertence a uma empresa (`company_id`). O acesso base é: você vê e
mexe no que é da empresa a que você pertence e está ativo. Isso é resolvido por
funções helper chamadas dentro de cada policy.

### Papéis (o "quem")

- `super_admin` - administração da plataforma (poucas pessoas: TI/dev).
- `company_admin` - administra uma empresa (diretoria ou gestão de pessoas).
- Níveis funcionais (diretor, gerente, coordenador, especialista, colaborador)
  ficam em `company_users.nivel` e afetam permissões e a régua de bônus.

Atenção a uma armadilha comum: "admin" costuma ser duas coisas ao mesmo tempo, o
papel de aplicação (`has_role(user,'company_admin')`) e a flag na linha de
vínculo (`company_users.is_admin`). Os gates honram as duas.

### Permissões (o "o quê")

Permissões por chave (ex.: `okr.edit`, `projeto.delete`, `bonus.config`,
`processo.edit`, `opr.publish`). A fonte de verdade é uma função SQL de preset
(`get_role_preset_permissions`). Um preset em TypeScript, se existir, é só preview
de UI e nunca decide acesso. `has_permission` exige vínculo ativo, senão um
usuário desativado mantém tudo que tinha.

## Funções helper (criadas na migration 0002/0003)

```sql
app.belongs_to_company(_user uuid, _company uuid) -> boolean
app.is_company_admin(_user uuid, _company uuid)   -> boolean
app.has_role(_user uuid, _role text)              -> boolean
app.has_permission(_user uuid, _company uuid, _key text) -> boolean
app.is_super_admin(_user uuid)                    -> boolean
```

Todas `stable security definer set search_path = app, public`. `has_permission`
resolve pela combinação de papel do usuário na empresa + o preset SQL, e só com
vínculo ativo.

## Template de RLS (as 4 políticas, toda tabela)

```sql
alter table app.<t> enable row level security;

create policy <t>_select on app.<t> for select
  using (app.belongs_to_company((select auth.uid()), company_id));

create policy <t>_insert on app.<t> for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, '<key>.edit'));

create policy <t>_update on app.<t> for update
  using      (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, '<key>.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, '<key>.edit'));

create policy <t>_delete on app.<t> for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, '<key>.delete'));
```

Note o `(select auth.uid())`: avaliado uma vez (InitPlan), não por linha. Em
tabelas grandes é a diferença entre milissegundos e segundos. Ao editar uma
policy, preserve essa forma.

## Funções privilegiadas (RPC)

Toda função `SECURITY DEFINER` ignora a RLS, então precisa do seu próprio gate no
topo:

```sql
if not (app.is_super_admin(auth.uid())
        or app.is_company_admin(auth.uid(), p_company)
        or app.has_permission(auth.uid(), p_company, '<key>')) then
  raise exception 'Sem permissão' using errcode = '42501';
end if;
```

E o par revoke/grant, nesta ordem, em toda função:

```sql
revoke all on function app.fn_x(uuid) from public, anon;
grant execute on function app.fn_x(uuid) to authenticated;
```

Onde a função puder derivar o tenant de uma linha existente, derive, em vez de
confiar no parâmetro.

## Escala (falhas silenciosas de performance)

- RPC que varre tabela grande: `set local statement_timeout to '120s';` e
  `alter function ... set statement_timeout to '120s'` para sobreviver a replace.
- Leitura paginada: `.order('id').range(from, to)` sempre com chave única.
- Coleções grandes: laço de páginas sequencial, nunca paralelo. O certo mesmo é
  uma RPC que agrega e devolve o resumo, não as linhas.

## Cliente defensivo

Update/delete devolvendo 0 linhas é tratado como erro, com mensagem que nomeia as
duas causas:

```ts
const { data, error } = await supabase
  .from('atividades').update(patch).eq('id', id).select().maybeSingle();
if (error) throw error;
if (!data) throw new Error(
  'Nada foi atualizado. O registro pode ter mudado, ou você pode não ter permissão para editá-lo.'
);
```

Nenhuma tela renderiza resultado vazio como zero: distinga "sem correspondência"
de "consulta falhou" e diga qual foi.

## LGPD e privacidade

- Dados pessoais mínimos: `profiles` guarda nome, e-mail corporativo e avatar. Sem
  dado sensível.
- O comitê de LGPD é um comitê no sistema; documentos e políticas ligados a ele
  vivem como processos/procedimentos, não como PII de colaboradores.
- Trilhas de auditoria: `created_by` e `updated_at` em tudo. Para tabelas
  sensíveis (bônus), considere uma tabela de auditoria append-only na fase 2.
- Segredos: `service_role` só no servidor. Frontend usa apenas a `anon key`.
  Backups e MFA ativados no projeto Supabase.

## Definition of Done de segurança (rodar em toda tabela/função nova)

Ver `supabase/migrations/0099_verificacao.sql`. Em resumo:

1. `pg_policy` retorna 4 linhas para a tabela.
2. `information_schema.routine_privileges` não mostra `PUBLIC` nem `anon` para a
   função.
3. Teste o caminho negado (outro tenant recebe 0 linhas ou 42501) numa transação
   com `rollback`.
4. Toda função `SECURITY DEFINER` tem `raise exception ... 42501` no gate.
