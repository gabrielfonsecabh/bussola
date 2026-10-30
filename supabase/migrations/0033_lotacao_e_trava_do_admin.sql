-- 0033: Lotação na lista de pessoas e trava contra auto-rebaixamento do admin.

drop function if exists app.pessoas_da_empresa(uuid);

create or replace function app.pessoas_da_empresa(p_company uuid)
 RETURNS TABLE(user_id uuid, nome text, email text, cargo text, nivel text, is_admin boolean, is_active boolean, papeis text[], areas_responsavel text[], area_id uuid, area_nome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
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
             array[]::text[]),
    cu.area_id, ar.nome
  from app.company_users cu
  left join app.profiles p on p.user_id = cu.user_id
  left join app.areas ar on ar.id = cu.area_id
  where cu.company_id = p_company
  order by cu.is_active desc, p.nome nulls last, cu.user_id;
end;
$function$;

create or replace function app.impedir_auto_rebaixamento()
returns trigger language plpgsql security definer set search_path = app, public as $fn$
begin
  if new.user_id = auth.uid() and old.is_admin and not new.is_admin then
    raise exception 'Você não pode remover o próprio acesso de administrador desta empresa'
      using errcode = '22023';
  end if;
  if new.user_id = auth.uid() and old.is_active and not new.is_active then
    raise exception 'Você não pode desativar o próprio vínculo com esta empresa'
      using errcode = '22023';
  end if;

  if (old.is_admin and not new.is_admin) or (old.is_active and not new.is_active) then
    if not exists (
      select 1 from app.company_users c
       where c.company_id = new.company_id
         and c.user_id <> new.user_id
         and c.is_admin and c.is_active) then
      raise exception
        'Esta é a última pessoa com acesso de administrador ativo nesta empresa. Promova outra antes.'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_company_users_trava_admin on app.company_users;
create trigger trg_company_users_trava_admin
  before update on app.company_users
  for each row execute function app.impedir_auto_rebaixamento();

revoke all on function app.pessoas_da_empresa(uuid) from public, anon;
grant execute on function app.pessoas_da_empresa(uuid) to authenticated;

revoke all on function app.impedir_auto_rebaixamento() from public, anon;
