-- 0003: Papéis, permissões e presets por papel.

create table app.user_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in ('company_admin','diretor','gerente','coordenador',
                    'especialista','colaborador')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (company_id, user_id, role)
);
create index on app.user_roles (user_id);
create index on app.user_roles (company_id);
create trigger trg_user_roles_updated before update on app.user_roles
  for each row execute function app.set_updated_at();

create or replace function app.get_role_preset_permissions(_role text)
returns text[]
language sql immutable as $$
  select case _role
    when 'company_admin' then array[
      'okr.view','okr.edit','okr.delete','okr.checkin',
      'projeto.view','projeto.edit','projeto.delete','sprint.manage',
      'atividade.view','atividade.edit',
      'processo.view','processo.edit','processo.delete','melhoria.edit',
      'kit.view','opr.edit','opr.publish','bonus.view','bonus.config',
      'admin.areas','admin.pessoas','admin.permissoes'
    ]
    when 'diretor' then array[
      'okr.view','okr.edit','okr.checkin',
      'projeto.view','projeto.edit','sprint.manage','atividade.view','atividade.edit',
      'processo.view','processo.edit','melhoria.edit',
      'kit.view','opr.edit','opr.publish','bonus.view'
    ]
    when 'gerente' then array[
      'okr.view','okr.edit','okr.checkin',
      'projeto.view','projeto.edit','sprint.manage','atividade.view','atividade.edit',
      'processo.view','processo.edit','melhoria.edit',
      'kit.view','opr.edit','opr.publish'
    ]
    when 'coordenador' then array[
      'okr.view','okr.checkin','projeto.view','projeto.edit',
      'atividade.view','atividade.edit','processo.view','melhoria.edit','kit.view'
    ]
    when 'especialista' then array[
      'okr.view','okr.checkin','projeto.view','projeto.edit',
      'atividade.view','atividade.edit','processo.view','processo.edit','melhoria.edit'
    ]
    when 'colaborador' then array[
      'okr.view','projeto.view','atividade.view','atividade.edit','processo.view'
    ]
    else array[]::text[]
  end;
$$;

create or replace function app.has_role(_user_id uuid, _role text)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select exists (select 1 from app.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function app.has_permission(_user_id uuid, _company_id uuid, _key text)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select exists (
    select 1
    from app.user_roles ur
    join app.company_users cu
      on cu.company_id = ur.company_id and cu.user_id = ur.user_id
    where ur.user_id = _user_id
      and ur.company_id = _company_id
      and cu.is_active
      and _key = any(app.get_role_preset_permissions(ur.role))
  );
$$;

alter table app.user_roles enable row level security;
create policy user_roles_select on app.user_roles for select
  using (user_id = (select auth.uid())
         or app.belongs_to_company((select auth.uid()), company_id));
create policy user_roles_insert on app.user_roles for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'admin.permissoes'));
create policy user_roles_update on app.user_roles for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'admin.permissoes'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'admin.permissoes'));
create policy user_roles_delete on app.user_roles for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.is_super_admin((select auth.uid())));

grant select, insert, update, delete on all tables in schema app to authenticated;

revoke all on function app.get_role_preset_permissions(text) from public, anon;
revoke all on function app.has_role(uuid, text) from public, anon;
revoke all on function app.has_permission(uuid, uuid, text) from public, anon;
grant execute on function app.get_role_preset_permissions(text) to authenticated;
grant execute on function app.has_role(uuid, text) to authenticated;
grant execute on function app.has_permission(uuid, uuid, text) to authenticated;
