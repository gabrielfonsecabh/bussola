-- 0015: Contexto do usuário logado: empresas, papéis e permissões.

create or replace function app.minhas_permissoes(p_company uuid)
returns text[]
language sql stable security definer set search_path = app, public as $$
  select coalesce(
    (select array_agg(distinct chave order by chave)
     from (

       select unnest(app.get_role_preset_permissions('company_admin')) as chave
       where app.is_company_admin(auth.uid(), p_company)
          or app.is_super_admin(auth.uid())

       union

       select unnest(app.get_role_preset_permissions(ur.role))
       from app.user_roles ur
       join app.company_users cu
         on cu.company_id = ur.company_id and cu.user_id = ur.user_id
       where ur.user_id = auth.uid()
         and ur.company_id = p_company
         and cu.is_active
     ) t),
    array[]::text[]);
$$;

create or replace function app.meu_contexto()
returns jsonb
language plpgsql stable security definer set search_path = app, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_perfil jsonb;
  v_empresas jsonb;
begin
  if v_uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'user_id', p.user_id,
    'nome', p.nome,
    'email', p.email,
    'avatar_url', p.avatar_url,
    'super_admin', app.is_super_admin(v_uid)
  ) into v_perfil
  from app.profiles p where p.user_id = v_uid;

  if v_perfil is null then
    v_perfil := jsonb_build_object(
      'user_id', v_uid, 'nome', null, 'email', null,
      'avatar_url', null, 'super_admin', app.is_super_admin(v_uid));
  end if;

  select coalesce(jsonb_agg(x order by x->>'tipo' desc, x->>'nome_fantasia'), '[]'::jsonb)
    into v_empresas
  from (
    select jsonb_build_object(
      'id', c.id,
      'razao_social', c.razao_social,
      'nome_fantasia', coalesce(c.nome_fantasia, c.razao_social),
      'tipo', c.tipo,
      'parent_company_id', c.parent_company_id,
      'is_admin', cu.is_admin,
      'nivel', cu.nivel,
      'cargo', cu.cargo,
      'papeis', coalesce((
        select array_agg(ur.role order by ur.role)
        from app.user_roles ur
        where ur.user_id = v_uid and ur.company_id = c.id), array[]::text[]),
      'permissoes', app.minhas_permissoes(c.id)
    ) as x
    from app.company_users cu
    join app.companies c on c.id = cu.company_id
    where cu.user_id = v_uid and cu.is_active
  ) t;

  return jsonb_build_object(
    'perfil', v_perfil,
    'empresas', v_empresas,
    'gerado_em', now()
  );
end;
$fn$;

create or replace function app.pessoas_da_empresa(p_company uuid)
returns table (
  user_id uuid,
  nome text,
  email text,
  cargo text,
  nivel text,
  is_admin boolean,
  is_active boolean,
  papeis text[],
  areas_responsavel text[]
)
language plpgsql stable security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  select
    cu.user_id, p.nome, p.email::text, cu.cargo, cu.nivel, cu.is_admin, cu.is_active,
    coalesce((select array_agg(ur.role order by ur.role) from app.user_roles ur
              where ur.user_id = cu.user_id and ur.company_id = p_company),
             array[]::text[]),
    coalesce((select array_agg(a.nome order by a.nome) from app.areas a
              where a.responsavel_user_id = cu.user_id and a.company_id = p_company),
             array[]::text[])
  from app.company_users cu
  left join app.profiles p on p.user_id = cu.user_id
  where cu.company_id = p_company
  order by cu.is_active desc, p.nome nulls last, cu.user_id;
end;
$fn$;

create or replace function app.presets_de_permissao()
returns table (papel text, permissoes text[])
language sql stable security definer set search_path = app, public as $$
  select r.papel, app.get_role_preset_permissions(r.papel)
  from unnest(array[
    'company_admin','diretor','gerente','coordenador','especialista','colaborador'
  ]) as r(papel);
$$;

revoke all on function app.minhas_permissoes(uuid) from public, anon;
revoke all on function app.meu_contexto() from public, anon;
revoke all on function app.pessoas_da_empresa(uuid) from public, anon;
revoke all on function app.presets_de_permissao() from public, anon;

grant execute on function app.minhas_permissoes(uuid) to authenticated;
grant execute on function app.meu_contexto() to authenticated;
grant execute on function app.pessoas_da_empresa(uuid) to authenticated;
grant execute on function app.presets_de_permissao() to authenticated;
