-- 0004: Perspectivas, objetivos estratégicos, áreas, OKRs e key results.

create table app.areas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  parent_area_id uuid references app.areas(id) on delete set null,
  nome text not null,
  tipo text not null default 'gerencia'
    check (tipo in ('diretoria','gerencia','especialista','comite')),
  responsavel_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.areas (company_id);
create index on app.areas (parent_area_id);
create trigger trg_areas_updated before update on app.areas
  for each row execute function app.set_updated_at();

alter table app.areas enable row level security;
create policy areas_select on app.areas for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy areas_insert on app.areas for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'admin.areas'));
create policy areas_update on app.areas for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'admin.areas'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'admin.areas'));
create policy areas_delete on app.areas for delete
  using (app.is_company_admin((select auth.uid()), company_id));

create table app.perspectivas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  chave text not null check (chave in ('financeiro','clientes','processos','aprendizagem')),
  nome text not null,
  ordem int not null default 0,
  cor_token text not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (company_id, chave)
);
create index on app.perspectivas (company_id);
create trigger trg_perspectivas_updated before update on app.perspectivas
  for each row execute function app.set_updated_at();

alter table app.perspectivas enable row level security;
create policy perspectivas_select on app.perspectivas for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy perspectivas_insert on app.perspectivas for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'okr.edit'));
create policy perspectivas_update on app.perspectivas for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'okr.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'okr.edit'));
create policy perspectivas_delete on app.perspectivas for delete
  using (app.is_company_admin((select auth.uid()), company_id));

create table app.objetivos_estrategicos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  perspectiva_id uuid references app.perspectivas(id) on delete set null,
  titulo text not null,
  descricao text,
  ciclo text not null default '2026-2029',
  is_estrela_do_norte boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.objetivos_estrategicos (company_id);
create index on app.objetivos_estrategicos (perspectiva_id);
create trigger trg_objest_updated before update on app.objetivos_estrategicos
  for each row execute function app.set_updated_at();

alter table app.objetivos_estrategicos enable row level security;
create policy objest_select on app.objetivos_estrategicos for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy objest_insert on app.objetivos_estrategicos for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'okr.edit'));
create policy objest_update on app.objetivos_estrategicos for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'okr.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'okr.edit'));
create policy objest_delete on app.objetivos_estrategicos for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'okr.delete'));

create table app.okrs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  parent_okr_id uuid references app.okrs(id) on delete set null,
  area_id uuid references app.areas(id) on delete set null,
  objetivo_estrategico_id uuid references app.objetivos_estrategicos(id) on delete set null,
  perspectiva_id uuid references app.perspectivas(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  nivel text not null default 'gerencia'
    check (nivel in ('corporativo','diretoria','gerencia','individual')),
  titulo text not null,
  descricao text,
  ano int not null,
  trimestre int check (trimestre between 1 and 4),
  status text not null default 'ativo'
    check (status in ('rascunho','ativo','concluido','cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.okrs (company_id);
create index on app.okrs (parent_okr_id);
create index on app.okrs (area_id);
create index on app.okrs (ano, trimestre);
create trigger trg_okrs_updated before update on app.okrs
  for each row execute function app.set_updated_at();

alter table app.okrs enable row level security;
create policy okrs_select on app.okrs for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy okrs_insert on app.okrs for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'okr.edit'));
create policy okrs_update on app.okrs for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or owner_user_id = (select auth.uid())
         or app.has_permission((select auth.uid()), company_id, 'okr.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or owner_user_id = (select auth.uid())
              or app.has_permission((select auth.uid()), company_id, 'okr.edit'));
create policy okrs_delete on app.okrs for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'okr.delete'));

create table app.key_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  okr_id uuid not null references app.okrs(id) on delete cascade,
  descricao text not null,
  tipo text not null default 'numerico'
    check (tipo in ('numerico','percentual','moeda','marco')),
  direcao text not null default 'subir' check (direcao in ('subir','descer')),
  unidade text,
  baseline numeric,
  meta numeric,
  atual numeric,
  peso numeric not null default 1,
  farol text not null default 'cinza'
    check (farol in ('verde','amarelo','vermelho','cinza')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.key_results (company_id);
create index on app.key_results (okr_id);
create trigger trg_kr_updated before update on app.key_results
  for each row execute function app.set_updated_at();

alter table app.key_results enable row level security;
create policy kr_select on app.key_results for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy kr_insert on app.key_results for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'okr.edit'));
create policy kr_update on app.key_results for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'okr.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'okr.edit'));
create policy kr_delete on app.key_results for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'okr.delete'));

create table app.kr_checkins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  key_result_id uuid not null references app.key_results(id) on delete cascade,
  data date not null default current_date,
  valor numeric not null,
  comentario text,
  autor_user_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on app.kr_checkins (company_id);
create index on app.kr_checkins (key_result_id);
create trigger trg_krcheckins_updated before update on app.kr_checkins
  for each row execute function app.set_updated_at();

alter table app.kr_checkins enable row level security;
create policy krcheckins_select on app.kr_checkins for select
  using (app.belongs_to_company((select auth.uid()), company_id));
create policy krcheckins_insert on app.kr_checkins for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'okr.checkin'));
create policy krcheckins_update on app.kr_checkins for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or autor_user_id = (select auth.uid()))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or autor_user_id = (select auth.uid()));
create policy krcheckins_delete on app.kr_checkins for delete
  using (app.is_company_admin((select auth.uid()), company_id));

create or replace function app.kr_checkin(
  p_kr_id uuid, p_valor numeric, p_data date default current_date, p_comentario text default null)
returns app.key_results
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_company uuid;
  v_kr app.key_results;
  v_atg numeric;
  v_farol text;
begin
  select company_id into v_company from app.key_results where id = p_kr_id;
  if v_company is null then
    raise exception 'KR inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_company)
          or app.has_permission(auth.uid(), v_company, 'okr.checkin')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  insert into app.kr_checkins (company_id, key_result_id, data, valor, comentario)
  values (v_company, p_kr_id, p_data, p_valor, p_comentario);

  update app.key_results set atual = p_valor where id = p_kr_id returning * into v_kr;

  if v_kr.meta is not null and v_kr.baseline is not null and v_kr.meta <> v_kr.baseline then
    v_atg := (coalesce(v_kr.atual,0) - v_kr.baseline) / (v_kr.meta - v_kr.baseline);
  else
    v_atg := null;
  end if;

  v_farol := case
    when v_atg is null then 'cinza'
    when v_atg >= 0.9 then 'verde'
    when v_atg >= 0.6 then 'amarelo'
    else 'vermelho'
  end;

  update app.key_results set farol = v_farol where id = p_kr_id returning * into v_kr;
  return v_kr;
end;
$fn$;

grant select, insert, update, delete on all tables in schema app to authenticated;
revoke all on function app.kr_checkin(uuid, numeric, date, text) from public, anon;
grant execute on function app.kr_checkin(uuid, numeric, date, text) to authenticated;
