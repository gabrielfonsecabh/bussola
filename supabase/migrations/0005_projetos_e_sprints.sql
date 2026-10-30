-- 0005: Projetos, sprints e atividades.

create table app.projetos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  area_id uuid references app.areas(id) on delete set null,
  okr_id uuid references app.okrs(id) on delete set null,
  nome text not null,
  descricao text,
  categoria text not null default 'gestao_projetos'
    check (categoria in ('estrutural','melhoria','ia','gestao_projetos','comite')),
  tipo text not null default 'projeto' check (tipo in ('projeto','iniciativa_ia')),
  responsavel_user_id uuid references auth.users(id) on delete set null,
  patrocinador_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'backlog'
    check (status in ('backlog','planejado','em_andamento','pausado','concluido','cancelado')),
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','critica')),
  inicio_previsto date,
  termino_previsto date,
  inicio_real date,
  termino_real date,
  progresso_pct numeric not null default 0 check (progresso_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.projetos (company_id);
create index on app.projetos (area_id);
create index on app.projetos (okr_id);
create index on app.projetos (status);
create trigger trg_projetos_updated before update on app.projetos
  for each row execute function app.set_updated_at();

alter table app.projetos enable row level security;
create policy projetos_select on app.projetos for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy projetos_insert on app.projetos for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'projeto.edit'));
create policy projetos_update on app.projetos for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or responsavel_user_id = (select auth.uid())
         or app.has_permission((select auth.uid()), company_id, 'projeto.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or responsavel_user_id = (select auth.uid())
              or app.has_permission((select auth.uid()), company_id, 'projeto.edit'));
create policy projetos_delete on app.projetos for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'projeto.delete'));

create table app.sprints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  area_id uuid references app.areas(id) on delete set null,
  nome text not null,
  objetivo text,
  data_inicio date not null,
  data_fim date not null,
  status text not null default 'planejada'
    check (status in ('planejada','ativa','encerrada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.sprints (company_id);
create index on app.sprints (area_id);
create trigger trg_sprints_updated before update on app.sprints
  for each row execute function app.set_updated_at();

alter table app.sprints enable row level security;
create policy sprints_select on app.sprints for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy sprints_insert on app.sprints for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'sprint.manage'));
create policy sprints_update on app.sprints for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'sprint.manage'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'sprint.manage'));
create policy sprints_delete on app.sprints for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'sprint.manage'));

create table app.atividades (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  projeto_id uuid references app.projetos(id) on delete cascade,
  sprint_id uuid references app.sprints(id) on delete set null,
  key_result_id uuid references app.key_results(id) on delete set null,
  parent_atividade_id uuid references app.atividades(id) on delete cascade,
  area_id uuid references app.areas(id) on delete set null,
  titulo text not null,
  descricao text,
  responsavel_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'a_fazer'
    check (status in ('a_fazer','fazendo','revisao','concluido','bloqueado')),
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','critica')),
  horizonte text not null default 'semanal'
    check (horizonte in ('anual','trimestral','mensal','semanal','diario')),
  data_prazo date,
  estimativa_h numeric,
  esforco_h numeric,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.atividades (company_id);
create index on app.atividades (projeto_id);
create index on app.atividades (sprint_id);
create index on app.atividades (key_result_id);
create index on app.atividades (parent_atividade_id);
create index on app.atividades (responsavel_user_id);
create index on app.atividades (status);
create trigger trg_atividades_updated before update on app.atividades
  for each row execute function app.set_updated_at();

alter table app.atividades enable row level security;
create policy atividades_select on app.atividades for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy atividades_insert on app.atividades for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'atividade.edit'));
create policy atividades_update on app.atividades for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or responsavel_user_id = (select auth.uid())
         or app.has_permission((select auth.uid()), company_id, 'atividade.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or responsavel_user_id = (select auth.uid())
              or app.has_permission((select auth.uid()), company_id, 'atividade.edit'));
create policy atividades_delete on app.atividades for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'projeto.delete'));

create or replace function app.projeto_progresso(p_projeto_id uuid)
returns app.projetos
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_company uuid;
  v_total int;
  v_feitas int;
  v_row app.projetos;
begin
  select company_id into v_company from app.projetos where id = p_projeto_id;
  if v_company is null then
    raise exception 'Projeto inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_company)
          or app.has_permission(auth.uid(), v_company, 'projeto.edit')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  select count(*), count(*) filter (where status = 'concluido')
    into v_total, v_feitas
  from app.atividades where projeto_id = p_projeto_id;

  update app.projetos
     set progresso_pct = case when v_total = 0 then 0
                              else round(100.0 * v_feitas / v_total, 0) end
   where id = p_projeto_id
   returning * into v_row;
  return v_row;
end;
$fn$;

create or replace function app.sprint_resumo(p_sprint_id uuid)
returns table (status text, total bigint)
language plpgsql security definer set search_path = app, public as $fn$
declare v_company uuid;
begin
  select company_id into v_company from app.sprints where id = p_sprint_id;
  if v_company is null then
    raise exception 'Sprint inexistente' using errcode = 'P0002';
  end if;
  if not app.belongs_to_company(auth.uid(), v_company) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return query
    select a.status, count(*)::bigint
    from app.atividades a
    where a.sprint_id = p_sprint_id
    group by a.status;
end;
$fn$;

grant select, insert, update, delete on all tables in schema app to authenticated;
revoke all on function app.projeto_progresso(uuid) from public, anon;
revoke all on function app.sprint_resumo(uuid) from public, anon;
grant execute on function app.projeto_progresso(uuid) to authenticated;
grant execute on function app.sprint_resumo(uuid) to authenticated;
