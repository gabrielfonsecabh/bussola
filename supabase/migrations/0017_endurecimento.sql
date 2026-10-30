-- 0017: Endurecimento de grants, índices e funções auxiliares.

alter function app.set_updated_at() set search_path = app, public;
alter function app.get_role_preset_permissions(text) set search_path = app, public;
alter function app.ciclo_decorrido(int, int) set search_path = app, public;
alter function app.kr_atingimento(numeric, numeric, numeric, text) set search_path = app, public;
alter function app.farol_por_ritmo(numeric, int, int) set search_path = app, public;
alter function app.bonus_aplicar_regua(jsonb, numeric) set search_path = app, public;

create or replace function app.is_super_admin(_user_id uuid)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select case
    when _user_id is distinct from auth.uid()
         and not exists (select 1 from app.platform_admins where user_id = auth.uid())
      then null
    else exists (select 1 from app.platform_admins where user_id = _user_id)
  end;
$$;

create or replace function app.belongs_to_company(_user_id uuid, _company_id uuid)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select case
    when _user_id is distinct from auth.uid()
         and not exists (select 1 from app.platform_admins where user_id = auth.uid())
      then null
    else exists (
      select 1 from app.company_users
       where user_id = _user_id and company_id = _company_id and is_active)
  end;
$$;

create or replace function app.is_company_admin(_user_id uuid, _company_id uuid)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select case
    when _user_id is distinct from auth.uid()
         and not exists (select 1 from app.platform_admins where user_id = auth.uid())
      then null
    else exists (
      select 1 from app.company_users
       where user_id = _user_id and company_id = _company_id and is_active and is_admin)
  end;
$$;

create or replace function app.has_role(_user_id uuid, _role text)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select case
    when _user_id is distinct from auth.uid()
         and not exists (select 1 from app.platform_admins where user_id = auth.uid())
      then null
    else exists (select 1 from app.user_roles where user_id = _user_id and role = _role)
  end;
$$;

create or replace function app.has_permission(_user_id uuid, _company_id uuid, _key text)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select case
    when _user_id is distinct from auth.uid()
         and not exists (select 1 from app.platform_admins where user_id = auth.uid())
      then null
    else exists (
      select 1
      from app.user_roles ur
      join app.company_users cu
        on cu.company_id = ur.company_id and cu.user_id = ur.user_id
      where ur.user_id = _user_id
        and ur.company_id = _company_id
        and cu.is_active
        and _key = any(app.get_role_preset_permissions(ur.role))
    )
  end;
$$;

create index if not exists idx_areas_responsavel on app.areas (responsavel_user_id);

create index if not exists idx_okrs_owner on app.okrs (owner_user_id);
create index if not exists idx_okrs_perspectiva on app.okrs (perspectiva_id);
create index if not exists idx_okrs_objetivo on app.okrs (objetivo_estrategico_id);
create index if not exists idx_kr_checkins_autor on app.kr_checkins (autor_user_id);

create index if not exists idx_projetos_responsavel on app.projetos (responsavel_user_id);
create index if not exists idx_projetos_patrocinador on app.projetos (patrocinador_user_id);
create index if not exists idx_atividades_area on app.atividades (area_id);

create index if not exists idx_processos_dono on app.processos (dono_user_id);
create index if not exists idx_melhoria_area on app.projetos_melhoria (area_id);
create index if not exists idx_melhoria_belt on app.projetos_melhoria (belt_user_id);
create index if not exists idx_dmaic_aprovado_por on app.dmaic_etapas (aprovado_por);

create index if not exists idx_kit_avaliador on app.kit_gestao (avaliador_user_id);
create index if not exists idx_opr_autor on app.opr (autor_user_id);
create index if not exists idx_bonus_apuracao_area on app.bonus_apuracao (area_id);
create index if not exists idx_bonus_apuracao_user on app.bonus_apuracao (user_id);

create index if not exists idx_okrs_empresa_ano on app.okrs (company_id, ano);
create index if not exists idx_atividades_responsavel_status
  on app.atividades (company_id, responsavel_user_id, status);
create index if not exists idx_projetos_empresa_termino
  on app.projetos (company_id, termino_previsto);
