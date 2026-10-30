-- 0007: Kit de gestão, OPR e configuração de bônus.

create table app.kit_gestao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  area_id uuid not null references app.areas(id) on delete cascade,
  periodo text not null,
  item text not null check (item in ('mapa_estrategico','processos_procedimentos','opr')),
  status text not null default 'pendente' check (status in ('pendente','em_dia','atrasado')),
  percentual numeric not null default 0 check (percentual between 0 and 100),
  avaliador_user_id uuid references auth.users(id) on delete set null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (company_id, area_id, periodo, item)
);
create index on app.kit_gestao (company_id);
create index on app.kit_gestao (area_id, periodo);
create trigger trg_kit_updated before update on app.kit_gestao
  for each row execute function app.set_updated_at();

alter table app.kit_gestao enable row level security;
create policy kit_select on app.kit_gestao for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy kit_insert on app.kit_gestao for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'kit.view'));
create policy kit_update on app.kit_gestao for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'kit.view'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'kit.view'));
create policy kit_delete on app.kit_gestao for delete
  using (app.is_company_admin((select auth.uid()), company_id));

create table app.opr (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  area_id uuid not null references app.areas(id) on delete cascade,
  periodo text not null,
  destaques text,
  okr_resumo jsonb not null default '[]'::jsonb,
  indicadores jsonb not null default '[]'::jsonb,
  riscos text,
  proximos_passos text,
  status text not null default 'rascunho' check (status in ('rascunho','publicado')),
  autor_user_id uuid references auth.users(id) default auth.uid(),
  publicado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (company_id, area_id, periodo)
);
create index on app.opr (company_id);
create index on app.opr (area_id, periodo);
create trigger trg_opr_updated before update on app.opr
  for each row execute function app.set_updated_at();

alter table app.opr enable row level security;
create policy opr_select on app.opr for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy opr_insert on app.opr for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'opr.edit'));
create policy opr_update on app.opr for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'opr.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'opr.edit'));
create policy opr_delete on app.opr for delete
  using (app.is_company_admin((select auth.uid()), company_id));

create table app.bonus_config (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  ano int not null,
  pesos jsonb not null default '{}'::jsonb,
  reguas jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (company_id, ano)
);
create index on app.bonus_config (company_id);
create trigger trg_bonuscfg_updated before update on app.bonus_config
  for each row execute function app.set_updated_at();

alter table app.bonus_config enable row level security;
create policy bonuscfg_select on app.bonus_config for select
  using (app.belongs_to_company((select auth.uid()), company_id)
         and (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'bonus.view')));
create policy bonuscfg_insert on app.bonus_config for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'bonus.config'));
create policy bonuscfg_update on app.bonus_config for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'bonus.config'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'bonus.config'));
create policy bonuscfg_delete on app.bonus_config for delete
  using (app.is_company_admin((select auth.uid()), company_id));

create table app.bonus_apuracao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  escopo text not null check (escopo in ('global','area','individual')),
  area_id uuid references app.areas(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  periodo text not null,
  componente text not null,
  atingimento_pct numeric,
  peso numeric,
  resultado_pct numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.bonus_apuracao (company_id);
create index on app.bonus_apuracao (periodo, escopo);
create trigger trg_bonusap_updated before update on app.bonus_apuracao
  for each row execute function app.set_updated_at();

alter table app.bonus_apuracao enable row level security;
create policy bonusap_select on app.bonus_apuracao for select
  using (app.belongs_to_company((select auth.uid()), company_id)
         and (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'bonus.view')
              or (escopo = 'individual' and user_id = (select auth.uid()))));
create policy bonusap_insert on app.bonus_apuracao for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'bonus.config'));
create policy bonusap_update on app.bonus_apuracao for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'bonus.config'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'bonus.config'));
create policy bonusap_delete on app.bonus_apuracao for delete
  using (app.is_company_admin((select auth.uid()), company_id));

create or replace function app.kit_status(p_area_id uuid, p_periodo text)
returns table (item text, status text, percentual numeric)
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_company uuid;
  v_tem_mapa boolean;
  v_tem_proc boolean;
  v_tem_opr  boolean;
begin
  select company_id into v_company from app.areas where id = p_area_id;
  if v_company is null then
    raise exception 'Área inexistente' using errcode = 'P0002';
  end if;
  if not app.belongs_to_company(auth.uid(), v_company) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  select exists (select 1 from app.okrs o where o.area_id = p_area_id) into v_tem_mapa;
  select exists (
    select 1 from app.processos pr
    join app.processo_sipoc s on s.processo_id = pr.id
    where pr.area_id = p_area_id
  ) into v_tem_proc;
  select exists (
    select 1 from app.opr r
    where r.area_id = p_area_id and r.periodo = p_periodo and r.status = 'publicado'
  ) into v_tem_opr;

  return query
    select 'mapa_estrategico', case when v_tem_mapa then 'em_dia' else 'pendente' end,
           case when v_tem_mapa then 100 else 0 end::numeric
    union all
    select 'processos_procedimentos', case when v_tem_proc then 'em_dia' else 'pendente' end,
           case when v_tem_proc then 100 else 0 end::numeric
    union all
    select 'opr', case when v_tem_opr then 'em_dia' else 'pendente' end,
           case when v_tem_opr then 100 else 0 end::numeric;
end;
$fn$;

grant select, insert, update, delete on all tables in schema app to authenticated;
revoke all on function app.kit_status(uuid, text) from public, anon;
grant execute on function app.kit_status(uuid, text) to authenticated;
