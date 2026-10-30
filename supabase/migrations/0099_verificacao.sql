-- 0099: Verificação da blindagem: políticas, RLS e grants. Rodar com npm run db:verificar.

select c.relname as tabela,
       count(*) as qtd,
       string_agg(p.polcmd::text, '' order by p.polcmd) as cmds
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'app'
group by c.relname
order by c.relname;

select c.relname as tabela, c.relrowsecurity as rls_on
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'app' and c.relkind = 'r'
order by c.relname;

select r.routine_name, g.grantee
from information_schema.routine_privileges g
join information_schema.routines r
  on r.specific_name = g.specific_name and r.specific_schema = g.specific_schema
where r.specific_schema = 'app'
  and g.privilege_type = 'EXECUTE'
  and g.grantee in ('PUBLIC','anon');

select p.proname,
       p.prosecdef as security_definer,
       p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app'
order by p.proname;

/*
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<USER_UUID_DA_EMPRESA_A>","role":"authenticated"}';

select count(*) from app.projetos;

update app.atividades set titulo = titulo where id = '<UMA_ATIVIDADE_DA_EMPRESA_A>';

select app.kit_status('<AREA_DE_OUTRA_EMPRESA>', '2026-01');

rollback;
*/
