-- 0016: Troca de senha obrigatória no primeiro acesso.

alter table app.profiles
  add column if not exists deve_trocar_senha boolean not null default false;

comment on column app.profiles.deve_trocar_senha is
  'true enquanto o usuário ainda usa a senha provisória definida pela administração.';

create or replace function app.senha_trocada()
returns boolean
language plpgsql security definer set search_path = app, public as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;

  update app.profiles set deve_trocar_senha = false where user_id = v_uid;
  return true;
end;
$fn$;

create or replace function app.exigir_troca_de_senha(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = app, public as $fn$
begin
  if not (
    app.is_super_admin(auth.uid())
    or exists (
      select 1
      from app.company_users alvo
      join app.company_users meu
        on meu.company_id = alvo.company_id
      where alvo.user_id = p_user_id
        and meu.user_id = auth.uid()
        and meu.is_admin
        and meu.is_active
    )
  ) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  update app.profiles set deve_trocar_senha = true where user_id = p_user_id;
  return true;
end;
$fn$;

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
    'super_admin', app.is_super_admin(v_uid),
    'deve_trocar_senha', p.deve_trocar_senha
  ) into v_perfil
  from app.profiles p where p.user_id = v_uid;

  if v_perfil is null then
    v_perfil := jsonb_build_object(
      'user_id', v_uid, 'nome', null, 'email', null, 'avatar_url', null,
      'super_admin', app.is_super_admin(v_uid), 'deve_trocar_senha', false);
  end if;

  select coalesce(
           jsonb_agg(x order by (x->>'tipo') <> 'holding', x->>'nome_fantasia'),
           '[]'::jsonb)
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

revoke all on function app.senha_trocada() from public, anon;
revoke all on function app.exigir_troca_de_senha(uuid) from public, anon;
grant execute on function app.senha_trocada() to authenticated;
grant execute on function app.exigir_troca_de_senha(uuid) to authenticated;
