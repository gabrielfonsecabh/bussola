-- 0019: Etapas do fluxo do processo.

create table if not exists app.processo_etapas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  processo_id uuid not null references app.processos(id) on delete cascade,

  ordem int not null default 0,

  tipo text not null default 'atividade'
    check (tipo in ('inicio', 'atividade', 'decisao', 'documento', 'espera', 'fim')),

  titulo text not null,
  descricao text,

  responsavel_user_id uuid references auth.users(id) on delete set null,
  area_id uuid references app.areas(id) on delete set null,

  sistema text,

  tempo_estimado_min numeric check (tempo_estimado_min is null or tempo_estimado_min >= 0),

  eh_gargalo boolean not null default false,

  rotulo_sim text,
  rotulo_nao text,
  desvio_para_etapa_id uuid references app.processo_etapas(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create index if not exists idx_etapas_company on app.processo_etapas (company_id);
create index if not exists idx_etapas_processo_ordem on app.processo_etapas (processo_id, ordem);
create index if not exists idx_etapas_responsavel on app.processo_etapas (responsavel_user_id);
create index if not exists idx_etapas_area on app.processo_etapas (area_id);
create index if not exists idx_etapas_desvio on app.processo_etapas (desvio_para_etapa_id);

drop trigger if exists trg_processo_etapas_updated on app.processo_etapas;
create trigger trg_processo_etapas_updated before update on app.processo_etapas
  for each row execute function app.set_updated_at();

comment on table app.processo_etapas is
  'Sequência de etapas do processo. Substitui processo_sipoc.steps, que fica obsoleta.';
comment on column app.processo_sipoc.steps is
  'OBSOLETA desde a 0019: a sequência do processo vive em app.processo_etapas.';

alter table app.processo_etapas enable row level security;

drop policy if exists processo_etapas_select on app.processo_etapas;
create policy processo_etapas_select on app.processo_etapas for select
  using (app.belongs_to_company((select auth.uid()), company_id));

drop policy if exists processo_etapas_insert on app.processo_etapas;
create policy processo_etapas_insert on app.processo_etapas for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));

drop policy if exists processo_etapas_update on app.processo_etapas;
create policy processo_etapas_update on app.processo_etapas for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));

drop policy if exists processo_etapas_delete on app.processo_etapas;
create policy processo_etapas_delete on app.processo_etapas for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.delete'));

grant select, insert, update, delete on app.processo_etapas to authenticated;

create or replace function app.processo_fluxo(p_processo_id uuid)
returns table (
  id uuid,
  ordem int,
  tipo text,
  titulo text,
  descricao text,
  responsavel_user_id uuid,
  responsavel_nome text,
  area_id uuid,
  area_nome text,
  sistema text,
  tempo_estimado_min numeric,
  eh_gargalo boolean,
  rotulo_sim text,
  rotulo_nao text,
  desvio_para_etapa_id uuid
)
language plpgsql stable security definer set search_path = app, public as $fn$

#variable_conflict use_column
declare v_company uuid;
begin
  select p.company_id into v_company from app.processos p where p.id = p_processo_id;
  if v_company is null then
    raise exception 'Processo inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), v_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  select e.id, e.ordem, e.tipo, e.titulo, e.descricao,
         e.responsavel_user_id, pf.nome,
         e.area_id, ar.nome,
         e.sistema, e.tempo_estimado_min, e.eh_gargalo,
         e.rotulo_sim, e.rotulo_nao, e.desvio_para_etapa_id
  from app.processo_etapas e
  left join app.profiles pf on pf.user_id = e.responsavel_user_id
  left join app.areas ar on ar.id = e.area_id
  where e.processo_id = p_processo_id
  order by e.ordem, e.id;
end;
$fn$;

create or replace function app.processo_fluxo_resumo(p_processo_id uuid)
returns table (
  total_etapas int,
  sem_responsavel int,
  gargalos int,
  decisoes int,
  tempo_total_min numeric,
  etapas_sem_tempo int,
  sistemas int,
  tem_inicio boolean,
  tem_fim boolean
)
language plpgsql stable security definer set search_path = app, public as $fn$
#variable_conflict use_column
declare v_company uuid;
begin
  select p.company_id into v_company from app.processos p where p.id = p_processo_id;
  if v_company is null then
    raise exception 'Processo inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), v_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  select
    count(*)::int,
    count(*) filter (where e.responsavel_user_id is null and e.tipo not in ('inicio','fim'))::int,
    count(*) filter (where e.eh_gargalo)::int,
    count(*) filter (where e.tipo = 'decisao')::int,

    sum(e.tempo_estimado_min),
    count(*) filter (
      where e.tempo_estimado_min is null and e.tipo not in ('inicio','fim'))::int,
    count(distinct e.sistema) filter (where e.sistema is not null)::int,
    bool_or(e.tipo = 'inicio'),
    bool_or(e.tipo = 'fim')
  from app.processo_etapas e
  where e.processo_id = p_processo_id;
end;
$fn$;

create or replace function app.processo_etapas_reordenar(
  p_processo_id uuid, p_ids uuid[])
returns integer
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_company uuid;
  v_qtd integer;
begin
  select p.company_id into v_company from app.processos p where p.id = p_processo_id;
  if v_company is null then
    raise exception 'Processo inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_company)
          or app.has_permission(auth.uid(), v_company, 'processo.edit')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  update app.processo_etapas e
     set ordem = pos.i
    from unnest(p_ids) with ordinality as pos(id, i)
   where e.id = pos.id and e.processo_id = p_processo_id;

  get diagnostics v_qtd = row_count;

  if v_qtd <> array_length(p_ids, 1) then
    raise exception
      'Reordenação recebeu % ids mas só % são deste processo', array_length(p_ids, 1), v_qtd
      using errcode = '22023';
  end if;

  return v_qtd;
end;
$fn$;

revoke all on function app.processo_fluxo(uuid) from public, anon;
revoke all on function app.processo_fluxo_resumo(uuid) from public, anon;
revoke all on function app.processo_etapas_reordenar(uuid, uuid[]) from public, anon;

grant execute on function app.processo_fluxo(uuid) to authenticated;
grant execute on function app.processo_fluxo_resumo(uuid) to authenticated;
grant execute on function app.processo_etapas_reordenar(uuid, uuid[]) to authenticated;
