-- 0031: Vínculo de pessoa a áreas e processos.

drop function if exists app.vincular_pessoa(uuid, uuid, text, text, text, text, text, uuid);

create or replace function app.vincular_pessoa(
  p_company uuid,
  p_user uuid,
  p_nome text,
  p_email text,
  p_nivel text default 'colaborador',
  p_papel text default 'colaborador',
  p_cargo text default null,
  p_area_id uuid default null,

  p_forcar_troca boolean default true)
returns app.company_users
language plpgsql security definer set search_path = app, public as $fn$
declare v_vinculo app.company_users;
begin
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), p_company)
          or app.has_permission(auth.uid(), p_company, 'admin.pessoas')) then
    raise exception 'Sem permissão para vincular pessoas nesta empresa'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome da pessoa' using errcode = '22023';
  end if;

  if p_area_id is not null and not exists (
      select 1 from app.areas a where a.id = p_area_id and a.company_id = p_company) then
    raise exception 'A área de lotação não pertence a esta empresa'
      using errcode = '22023';
  end if;

  insert into app.profiles (user_id, nome, email, deve_trocar_senha)
  values (p_user, trim(p_nome), lower(trim(p_email)), p_forcar_troca)
  on conflict (user_id) do update
    set nome = excluded.nome,
        email = coalesce(excluded.email, app.profiles.email),

        deve_trocar_senha = app.profiles.deve_trocar_senha or p_forcar_troca;

  insert into app.company_users (company_id, user_id, nivel, cargo, area_id, is_active)
  values (p_company, p_user, p_nivel, nullif(trim(p_cargo), ''), p_area_id, true)
  on conflict (company_id, user_id) do update
    set nivel = excluded.nivel,
        cargo = excluded.cargo,
        area_id = excluded.area_id,
        is_active = true
  returning * into v_vinculo;

  perform app.definir_papel(p_company, p_user, p_papel);

  return v_vinculo;
end;
$fn$;

revoke all on function app.vincular_pessoa(uuid, uuid, text, text, text, text, text, uuid, boolean) from public, anon;
grant execute on function app.vincular_pessoa(uuid, uuid, text, text, text, text, text, uuid, boolean) to authenticated;
