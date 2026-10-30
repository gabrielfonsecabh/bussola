-- 0002: Empresas, vínculo de usuários e funções de pertencimento.

create table app.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function app.is_super_admin(_user_id uuid)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select exists (select 1 from app.platform_admins where user_id = _user_id);
$$;

create table app.companies (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  tipo text not null default 'controlada' check (tipo in ('holding','controlada')),
  parent_company_id uuid references app.companies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create index on app.companies (parent_company_id);
create trigger trg_companies_updated before update on app.companies
  for each row execute function app.set_updated_at();

create table app.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email citext,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on app.profiles
  for each row execute function app.set_updated_at();

create or replace function app.handle_new_user()
returns trigger
language plpgsql security definer set search_path = app, public as $$
begin
  insert into app.profiles (user_id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

revoke all on function app.handle_new_user() from public, anon;

create table app.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  cargo text,
  nivel text not null default 'colaborador'
    check (nivel in ('diretor','gerente','gerente_regional',
                     'coordenador','coordenador_regional','especialista','colaborador')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (company_id, user_id)
);
create index on app.company_users (user_id);
create index on app.company_users (company_id);
create trigger trg_company_users_updated before update on app.company_users
  for each row execute function app.set_updated_at();

create or replace function app.belongs_to_company(_user_id uuid, _company_id uuid)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select exists (
    select 1 from app.company_users
     where user_id = _user_id and company_id = _company_id and is_active
  );
$$;

create or replace function app.is_company_admin(_user_id uuid, _company_id uuid)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select exists (
    select 1 from app.company_users
     where user_id = _user_id and company_id = _company_id
       and is_active and is_admin
  );
$$;

alter table app.platform_admins enable row level security;

create policy platform_admins_select on app.platform_admins for select
  using (app.is_super_admin((select auth.uid())));
create policy platform_admins_insert on app.platform_admins for insert
  with check (app.is_super_admin((select auth.uid())));
create policy platform_admins_update on app.platform_admins for update
  using (app.is_super_admin((select auth.uid())))
  with check (app.is_super_admin((select auth.uid())));
create policy platform_admins_delete on app.platform_admins for delete
  using (app.is_super_admin((select auth.uid())));

alter table app.companies enable row level security;
create policy companies_select on app.companies for select
  using (app.belongs_to_company((select auth.uid()), id)
         or app.is_super_admin((select auth.uid())));
create policy companies_insert on app.companies for insert
  with check (app.is_super_admin((select auth.uid())));
create policy companies_update on app.companies for update
  using (app.is_company_admin((select auth.uid()), id)
         or app.is_super_admin((select auth.uid())))
  with check (app.is_company_admin((select auth.uid()), id)
              or app.is_super_admin((select auth.uid())));
create policy companies_delete on app.companies for delete
  using (app.is_super_admin((select auth.uid())));

alter table app.company_users enable row level security;
create policy company_users_select on app.company_users for select
  using (user_id = (select auth.uid())
         or app.belongs_to_company((select auth.uid()), company_id));
create policy company_users_insert on app.company_users for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.is_super_admin((select auth.uid())));
create policy company_users_update on app.company_users for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.is_super_admin((select auth.uid())))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.is_super_admin((select auth.uid())));
create policy company_users_delete on app.company_users for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.is_super_admin((select auth.uid())));

alter table app.profiles enable row level security;
create policy profiles_select on app.profiles for select
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from app.company_users cu1
      join app.company_users cu2 on cu1.company_id = cu2.company_id
      where cu1.user_id = (select auth.uid()) and cu1.is_active
        and cu2.user_id = app.profiles.user_id and cu2.is_active
    )
  );
create policy profiles_insert on app.profiles for insert
  with check (user_id = (select auth.uid()));
create policy profiles_update on app.profiles for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy profiles_delete on app.profiles for delete
  using (app.is_super_admin((select auth.uid())));

grant select, insert, update, delete on all tables in schema app to authenticated;

revoke all on function app.is_super_admin(uuid) from public, anon;
revoke all on function app.belongs_to_company(uuid, uuid) from public, anon;
revoke all on function app.is_company_admin(uuid, uuid) from public, anon;
grant execute on function app.is_super_admin(uuid) to authenticated;
grant execute on function app.belongs_to_company(uuid, uuid) to authenticated;
grant execute on function app.is_company_admin(uuid, uuid) to authenticated;
