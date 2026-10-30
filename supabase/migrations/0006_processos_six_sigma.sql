-- 0006: Processos, SIPOC, DMAIC e indicadores de processo.

create table app.processos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  area_id uuid references app.areas(id) on delete set null,
  nome text not null,
  descricao text,
  dono_user_id uuid references auth.users(id) on delete set null,
  tipo text not null default 'primario' check (tipo in ('primario','apoio','gestao')),
  nivel_maturidade int not null default 1 check (nivel_maturidade between 1 and 5),
  status text not null default 'ativo' check (status in ('rascunho','ativo','revisao','descontinuado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.processos (company_id);
create index on app.processos (area_id);
create trigger trg_processos_updated before update on app.processos
  for each row execute function app.set_updated_at();

alter table app.processos enable row level security;
create policy processos_select on app.processos for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy processos_insert on app.processos for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));
create policy processos_update on app.processos for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or dono_user_id = (select auth.uid())
         or app.has_permission((select auth.uid()), company_id, 'processo.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or dono_user_id = (select auth.uid())
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));
create policy processos_delete on app.processos for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.delete'));

create table app.processo_sipoc (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  processo_id uuid not null unique references app.processos(id) on delete cascade,
  suppliers text,
  inputs text,
  steps jsonb not null default '[]'::jsonb,
  outputs text,
  customers text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.processo_sipoc (company_id);
create trigger trg_sipoc_updated before update on app.processo_sipoc
  for each row execute function app.set_updated_at();

alter table app.processo_sipoc enable row level security;
create policy sipoc_select on app.processo_sipoc for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy sipoc_insert on app.processo_sipoc for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));
create policy sipoc_update on app.processo_sipoc for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));
create policy sipoc_delete on app.processo_sipoc for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.delete'));

create table app.projetos_melhoria (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  processo_id uuid references app.processos(id) on delete set null,
  area_id uuid references app.areas(id) on delete set null,
  nome text not null,
  metodo text not null default 'dmaic' check (metodo in ('dmaic','kaizen','just_do_it')),
  belt_user_id uuid references auth.users(id) on delete set null,
  fase_atual text not null default 'define'
    check (fase_atual in ('define','measure','analyze','improve','control','concluido')),
  problema text,
  meta_smart text,
  ganho_estimado numeric,
  ganho_realizado numeric,
  status text not null default 'em_andamento'
    check (status in ('backlog','em_andamento','pausado','concluido','cancelado')),
  inicio_previsto date,
  termino_previsto date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.projetos_melhoria (company_id);
create index on app.projetos_melhoria (processo_id);
create trigger trg_melhoria_updated before update on app.projetos_melhoria
  for each row execute function app.set_updated_at();

alter table app.projetos_melhoria enable row level security;
create policy melhoria_select on app.projetos_melhoria for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy melhoria_insert on app.projetos_melhoria for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'melhoria.edit'));
create policy melhoria_update on app.projetos_melhoria for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or belt_user_id = (select auth.uid())
         or app.has_permission((select auth.uid()), company_id, 'melhoria.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or belt_user_id = (select auth.uid())
              or app.has_permission((select auth.uid()), company_id, 'melhoria.edit'));
create policy melhoria_delete on app.projetos_melhoria for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.delete'));

create table app.dmaic_etapas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  projeto_melhoria_id uuid not null references app.projetos_melhoria(id) on delete cascade,
  fase text not null check (fase in ('define','measure','analyze','improve','control')),
  entregaveis jsonb not null default '[]'::jsonb,
  status text not null default 'pendente' check (status in ('pendente','em_andamento','concluido')),
  data_conclusao date,
  aprovado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (projeto_melhoria_id, fase)
);
create index on app.dmaic_etapas (company_id);
create index on app.dmaic_etapas (projeto_melhoria_id);
create trigger trg_dmaic_updated before update on app.dmaic_etapas
  for each row execute function app.set_updated_at();

alter table app.dmaic_etapas enable row level security;
create policy dmaic_select on app.dmaic_etapas for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy dmaic_insert on app.dmaic_etapas for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'melhoria.edit'));
create policy dmaic_update on app.dmaic_etapas for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'melhoria.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'melhoria.edit'));
create policy dmaic_delete on app.dmaic_etapas for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.delete'));

create table app.indicadores_processo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  processo_id uuid not null references app.processos(id) on delete cascade,
  nome text not null,
  tipo text not null default 'Y' check (tipo in ('Y','X')),
  formula text,
  unidade text,
  meta numeric,
  baseline numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.indicadores_processo (company_id);
create index on app.indicadores_processo (processo_id);
create trigger trg_indproc_updated before update on app.indicadores_processo
  for each row execute function app.set_updated_at();

alter table app.indicadores_processo enable row level security;
create policy indproc_select on app.indicadores_processo for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy indproc_insert on app.indicadores_processo for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));
create policy indproc_update on app.indicadores_processo for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));
create policy indproc_delete on app.indicadores_processo for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.delete'));

create table app.indicador_medicoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  indicador_id uuid not null references app.indicadores_processo(id) on delete cascade,
  data date not null default current_date,
  valor numeric not null,
  origem text not null default 'manual' check (origem in ('manual','importacao','erp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.indicador_medicoes (company_id);
create index on app.indicador_medicoes (indicador_id, data);
create trigger trg_indmed_updated before update on app.indicador_medicoes
  for each row execute function app.set_updated_at();

alter table app.indicador_medicoes enable row level security;
create policy indmed_select on app.indicador_medicoes for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy indmed_insert on app.indicador_medicoes for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));
create policy indmed_update on app.indicador_medicoes for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));
create policy indmed_delete on app.indicador_medicoes for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.delete'));

create or replace function app.melhoria_avancar_fase(p_id uuid, p_fase text)
returns app.projetos_melhoria
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_company uuid;
  v_row app.projetos_melhoria;
  v_ordem text[] := array['define','measure','analyze','improve','control','concluido'];
  v_atual_idx int;
  v_nova_idx int;
begin
  select company_id, fase_atual into v_company, v_row.fase_atual
  from app.projetos_melhoria where id = p_id;
  if v_company is null then
    raise exception 'Melhoria inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_company)
          or app.has_permission(auth.uid(), v_company, 'melhoria.edit')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  v_atual_idx := array_position(v_ordem, v_row.fase_atual);
  v_nova_idx  := array_position(v_ordem, p_fase);
  if v_nova_idx is null then
    raise exception 'Fase inválida: %', p_fase using errcode = '22023';
  end if;
  if v_nova_idx > v_atual_idx + 1 then
    raise exception 'Não pule tollgates: conclua a fase anterior primeiro'
      using errcode = 'P0001';
  end if;

  update app.projetos_melhoria set fase_atual = p_fase where id = p_id returning * into v_row;
  return v_row;
end;
$fn$;

grant select, insert, update, delete on all tables in schema app to authenticated;
revoke all on function app.melhoria_avancar_fase(uuid, text) from public, anon;
grant execute on function app.melhoria_avancar_fase(uuid, text) to authenticated;
