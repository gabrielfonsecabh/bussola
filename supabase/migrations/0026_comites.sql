-- 0026: Comitês como entidade própria.

create table if not exists app.comites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  nome text not null,
  descricao text,

  coordenador_user_id uuid references auth.users(id) on delete set null,
  cadencia text check (cadencia is null or cadencia in (
    'semanal','quinzenal','mensal','bimestral','trimestral','sob_demanda')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (company_id, nome)
);

create index if not exists idx_comites_company on app.comites (company_id, ativo);

drop trigger if exists trg_comites_updated on app.comites;
create trigger trg_comites_updated before update on app.comites
  for each row execute function app.set_updated_at();

create table if not exists app.comite_membros (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  comite_id uuid not null references app.comites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'membro'
    check (papel in ('coordenador','membro','convidado')),
  created_at timestamptz not null default now(),
  unique (comite_id, user_id)
);

create index if not exists idx_comite_membros_company on app.comite_membros (company_id);
create index if not exists idx_comite_membros_user on app.comite_membros (user_id);

create table if not exists app.comite_okrs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  comite_id uuid not null references app.comites(id) on delete cascade,
  okr_id uuid not null references app.okrs(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (comite_id, okr_id)
);

create table if not exists app.comite_projetos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  comite_id uuid not null references app.comites(id) on delete cascade,
  projeto_id uuid not null references app.projetos(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (comite_id, projeto_id)
);

create table if not exists app.comite_processos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  comite_id uuid not null references app.comites(id) on delete cascade,
  processo_id uuid not null references app.processos(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (comite_id, processo_id)
);

create index if not exists idx_comite_okrs_company on app.comite_okrs (company_id);
create index if not exists idx_comite_okrs_okr on app.comite_okrs (okr_id);
create index if not exists idx_comite_projetos_company on app.comite_projetos (company_id);
create index if not exists idx_comite_projetos_projeto on app.comite_projetos (projeto_id);
create index if not exists idx_comite_processos_company on app.comite_processos (company_id);
create index if not exists idx_comite_processos_processo on app.comite_processos (processo_id);

alter table app.comites enable row level security;
alter table app.comite_membros enable row level security;
alter table app.comite_okrs enable row level security;
alter table app.comite_projetos enable row level security;
alter table app.comite_processos enable row level security;

do $$
declare
  t text;
  chave text;
begin
  foreach t in array array['comites','comite_membros','comite_okrs','comite_projetos','comite_processos']
  loop
    chave := case t
      when 'comites' then 'comite.manage'
      when 'comite_membros' then 'comite.manage'
      when 'comite_okrs' then 'okr.edit'
      when 'comite_projetos' then 'projeto.edit'
      when 'comite_processos' then 'processo.edit'
    end;

    execute format('drop policy if exists %1$s_select on app.%1$s', t);
    execute format(
      'create policy %1$s_select on app.%1$s for select
         using (app.belongs_to_company((select auth.uid()), company_id))', t);

    execute format('drop policy if exists %1$s_insert on app.%1$s', t);
    execute format(
      'create policy %1$s_insert on app.%1$s for insert
         with check (app.is_company_admin((select auth.uid()), company_id)
                     or app.has_permission((select auth.uid()), company_id, %2$L))', t, chave);

    execute format('drop policy if exists %1$s_update on app.%1$s', t);
    execute format(
      'create policy %1$s_update on app.%1$s for update
         using (app.is_company_admin((select auth.uid()), company_id)
                or app.has_permission((select auth.uid()), company_id, %2$L))
         with check (app.is_company_admin((select auth.uid()), company_id)
                     or app.has_permission((select auth.uid()), company_id, %2$L))', t, chave);

    execute format('drop policy if exists %1$s_delete on app.%1$s', t);
    execute format(
      'create policy %1$s_delete on app.%1$s for delete
         using (app.is_company_admin((select auth.uid()), company_id)
                or app.has_permission((select auth.uid()), company_id, %2$L))', t, chave);

    execute format('grant select, insert, update, delete on app.%1$s to authenticated', t);
  end loop;
end $$;

insert into app.comites (company_id, nome, coordenador_user_id)
select a.company_id, a.nome, a.responsavel_user_id
  from app.areas a
 where a.tipo = 'comite'
on conflict (company_id, nome) do nothing;

do $$
declare v_presos int;
begin
  select count(*) into v_presos from (
    select 1 from app.okrs o join app.areas a on a.id = o.area_id where a.tipo='comite'
    union all select 1 from app.projetos p join app.areas a on a.id = p.area_id where a.tipo='comite'
    union all select 1 from app.processos pr join app.areas a on a.id = pr.area_id where a.tipo='comite'
    union all select 1 from app.atividades at join app.areas a on a.id = at.area_id where a.tipo='comite'
    union all select 1 from app.projetos_melhoria m join app.areas a on a.id = m.area_id where a.tipo='comite'
  ) x;

  if v_presos > 0 then
    raise exception
      'Existem % itens com area_id de comitê. Realoque-os à área real antes de migrar: apagar a área os deixaria sem área nenhuma, em silêncio.', v_presos
      using errcode = '22023';
  end if;

  delete from app.areas where tipo = 'comite';
end $$;

alter table app.areas drop constraint if exists areas_tipo_check;
alter table app.areas add constraint areas_tipo_check
  check (tipo in ('diretoria','gerencia','especialista'));

alter table app.projetos drop constraint if exists projetos_categoria_check;
alter table app.projetos add constraint projetos_categoria_check
  check (categoria in ('estrutural','melhoria','ia','gestao_projetos'));

drop function if exists app.painel_comite(uuid, integer);

create or replace function app.painel_comite(p_comite_id uuid, p_ano integer)
returns jsonb
language plpgsql stable security definer set search_path = app, public as $fn$
declare
  v_comite app.comites;
begin
  select * into v_comite from app.comites c where c.id = p_comite_id;
  if v_comite.id is null then
    raise exception 'Comitê inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), v_comite.company_id)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'comite_id', v_comite.id,
    'nome', v_comite.nome,
    'descricao', v_comite.descricao,
    'cadencia', v_comite.cadencia,
    'coordenador', (select nome from app.profiles where user_id = v_comite.coordenador_user_id),
    'ano', p_ano,
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'nome', pf.nome, 'papel', m.papel)
             order by m.papel, pf.nome)
      from app.comite_membros m
      left join app.profiles pf on pf.user_id = m.user_id
      where m.comite_id = p_comite_id), '[]'::jsonb),
    'okrs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'titulo', o.titulo, 'nivel', o.nivel, 'status', o.status,
        'area_nome', ar.nome) order by ar.nome nulls last, o.titulo)
      from app.comite_okrs co
      join app.okrs o on o.id = co.okr_id
      left join app.areas ar on ar.id = o.area_id
      where co.comite_id = p_comite_id and o.ano = p_ano), '[]'::jsonb),
    'projetos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'status', p.status,
        'progresso_pct', p.progresso_pct, 'termino_previsto', p.termino_previsto,
        'area_nome', ar.nome) order by ar.nome nulls last, p.nome)
      from app.comite_projetos cp
      join app.projetos p on p.id = cp.projeto_id
      left join app.areas ar on ar.id = p.area_id
      where cp.comite_id = p_comite_id), '[]'::jsonb),
    'processos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'nome', pr.nome, 'nivel_maturidade', pr.nivel_maturidade,
        'area_nome', ar.nome) order by ar.nome nulls last, pr.nome)
      from app.comite_processos cpr
      join app.processos pr on pr.id = cpr.processo_id
      left join app.areas ar on ar.id = pr.area_id
      where cpr.comite_id = p_comite_id), '[]'::jsonb),

    'areas_atravessadas', (
      select count(distinct x.area_id) from (
        select o.area_id from app.comite_okrs co join app.okrs o on o.id = co.okr_id
         where co.comite_id = p_comite_id and o.area_id is not null
        union
        select p.area_id from app.comite_projetos cp join app.projetos p on p.id = cp.projeto_id
         where cp.comite_id = p_comite_id and p.area_id is not null
        union
        select pr.area_id from app.comite_processos cpr join app.processos pr on pr.id = cpr.processo_id
         where cpr.comite_id = p_comite_id and pr.area_id is not null
      ) x));
end;
$fn$;

create or replace function app.comites_da_empresa(p_company uuid)
returns table (id uuid, nome text, cadencia text, coordenador_nome text,
               okrs int, projetos int, processos int, membros int)
language plpgsql stable security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  select c.id, c.nome, c.cadencia, pf.nome,
         (select count(*)::int from app.comite_okrs x where x.comite_id = c.id),
         (select count(*)::int from app.comite_projetos x where x.comite_id = c.id),
         (select count(*)::int from app.comite_processos x where x.comite_id = c.id),
         (select count(*)::int from app.comite_membros x where x.comite_id = c.id)
    from app.comites c
    left join app.profiles pf on pf.user_id = c.coordenador_user_id
   where c.company_id = p_company and c.ativo
   order by c.nome;
end;
$fn$;

revoke all on function app.painel_comite(uuid, integer) from public, anon;
revoke all on function app.comites_da_empresa(uuid) from public, anon;
grant execute on function app.painel_comite(uuid, integer) to authenticated;
grant execute on function app.comites_da_empresa(uuid) to authenticated;

create or replace function app.get_role_preset_permissions(_role text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'app', 'public'
AS $function$
  select case _role
    when 'company_admin' then array[
      'comite.manage',
      'atividade.delete',
      'kit.congelar',
      'okr.view','okr.edit','okr.delete','okr.checkin',
      'projeto.view','projeto.edit','projeto.delete','sprint.manage',
      'atividade.view','atividade.edit',
      'processo.view','processo.edit','processo.delete','melhoria.edit','pop.aprovar',
      'kit.view','opr.edit','opr.publish','bonus.view','bonus.config',
      'admin.areas','admin.pessoas','admin.permissoes'
    ]
    when 'diretor' then array[
      'comite.manage',
      'atividade.delete',
      'kit.congelar',
      'okr.view','okr.edit','okr.checkin',
      'projeto.view','projeto.edit','sprint.manage','atividade.view','atividade.edit',
      'processo.view','processo.edit','melhoria.edit','pop.aprovar',
      'kit.view','opr.edit','opr.publish','bonus.view'
    ]
    when 'gerente' then array[
      'atividade.delete',
      'kit.congelar',
      'okr.view','okr.edit','okr.checkin',
      'projeto.view','projeto.edit','sprint.manage','atividade.view','atividade.edit',
      'processo.view','processo.edit','melhoria.edit','pop.aprovar',
      'kit.view','opr.edit','opr.publish'
    ]
    when 'coordenador' then array[
      'atividade.delete',
      'okr.view','okr.checkin','projeto.view','projeto.edit',
      'atividade.view','atividade.edit','processo.view','melhoria.edit','kit.view'
    ]
    when 'especialista' then array[
      'kit.view',
      'okr.view','okr.checkin','projeto.view','projeto.edit',
      'atividade.view','atividade.edit','processo.view','processo.edit','melhoria.edit'
    ]
    when 'colaborador' then array[
      'kit.view',
      'okr.view','projeto.view','atividade.view','atividade.edit','processo.view'
    ]
    else array[]::text[]
  end;
$function$;

revoke all on function app.get_role_preset_permissions(text) from public, anon;
grant execute on function app.get_role_preset_permissions(text) to authenticated;
