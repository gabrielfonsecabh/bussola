-- 0030: Alçada por área, papéis e recortes de acesso.

create or replace function app.ancestrais_de_area(p_area uuid)
returns table (area_id uuid)
language sql stable set search_path = app, public as $$
  with recursive sobe as (
    select a.id, a.parent_area_id from app.areas a where a.id = p_area
    union all
    select m.id, m.parent_area_id
      from app.areas m
      join sobe s on m.id = s.parent_area_id
  ) cycle id set houve_ciclo using caminho
  select distinct id from sobe;
$$;

create or replace function app.alcada_sobre_area(_user uuid, _area uuid)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select _user is not null and _area is not null and (
    exists (
      select 1 from app.ancestrais_de_area(_area) x
        join app.areas a on a.id = x.area_id
       where a.responsavel_user_id = _user)
    or exists (
      select 1 from app.company_users cu
       where cu.user_id = _user and cu.area_id = _area and cu.is_active)
  );
$$;

revoke all on function app.ancestrais_de_area(uuid) from public, anon;
revoke all on function app.alcada_sobre_area(uuid, uuid) from public, anon;
grant execute on function app.ancestrais_de_area(uuid) to authenticated;
grant execute on function app.alcada_sobre_area(uuid, uuid) to authenticated;

drop policy if exists atividades_update on app.atividades;
create policy atividades_update on app.atividades for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or responsavel_user_id = (select auth.uid())
         or created_by = (select auth.uid())
         or (app.has_permission((select auth.uid()), company_id, 'atividade.edit')
             and app.alcada_sobre_area((select auth.uid()), area_id)))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or responsavel_user_id = (select auth.uid())
              or created_by = (select auth.uid())
              or (app.has_permission((select auth.uid()), company_id, 'atividade.edit')
                  and app.alcada_sobre_area((select auth.uid()), area_id)));

drop policy if exists atividades_delete on app.atividades;
create policy atividades_delete on app.atividades for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or created_by = (select auth.uid())
         or (app.has_permission((select auth.uid()), company_id, 'atividade.delete')
             and app.alcada_sobre_area((select auth.uid()), area_id)));

create or replace function app.kr_checkin(p_kr_id uuid, p_valor numeric, p_data date DEFAULT CURRENT_DATE, p_comentario text DEFAULT NULL::text)
 RETURNS app.key_results
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare
  v_company uuid;
  v_kr app.key_results;
  v_ano int;
  v_tri int;
  v_atg numeric;
  v_farol text;
begin
  select company_id into v_company from app.key_results where id = p_kr_id;
  if v_company is null then
    raise exception 'KR inexistente' using errcode = 'P0002';
  end if;

  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_company)
          or (app.has_permission(auth.uid(), v_company, 'okr.checkin')
              and exists (
                select 1
                  from app.key_results kr
                  join app.okrs o on o.id = kr.okr_id
                 where kr.id = p_kr_id
                   and (o.owner_user_id = auth.uid()
                        or kr.created_by = auth.uid()
                        or app.alcada_sobre_area(auth.uid(), o.area_id))))) then
    raise exception
      'Sem permissão: o check-in é de quem responde pelo resultado, ou seja o dono do OKR, o responsável pelo KR, ou quem tem alçada sobre a área dele'
      using errcode = '42501';
  end if;

  insert into app.kr_checkins (company_id, key_result_id, data, valor, comentario)
  values (v_company, p_kr_id, p_data, p_valor, p_comentario);

  update app.key_results set atual = p_valor where id = p_kr_id returning * into v_kr;

  select o.ano, o.trimestre into v_ano, v_tri
  from app.okrs o where o.id = v_kr.okr_id;

  if v_kr.tipo = 'marco' then
    v_farol := 'cinza';
  else
    v_atg := app.kr_atingimento(v_kr.baseline, v_kr.meta, v_kr.atual, v_kr.direcao);
    v_farol := app.farol_por_ritmo(v_atg, coalesce(v_ano, extract(year from current_date)::int), v_tri);
  end if;

  update app.key_results set farol = v_farol where id = p_kr_id returning * into v_kr;
  return v_kr;
end;
$function$;

create or replace function app.definir_papel(p_company uuid, p_user uuid, p_role text)
returns app.user_roles
language plpgsql security definer set search_path = app, public as $fn$
declare v_linha app.user_roles;
begin
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), p_company)
          or app.has_permission(auth.uid(), p_company, 'admin.permissoes')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if not app.belongs_to_company(p_user, p_company) then
    raise exception 'Esta pessoa não tem vínculo ativo com a empresa'
      using errcode = '22023';
  end if;

  if p_user = auth.uid()
     and app.is_company_admin(auth.uid(), p_company)
     and p_role <> 'company_admin' then
    raise exception 'Você não pode rebaixar o próprio acesso de administrador'
      using errcode = '22023';
  end if;

  delete from app.user_roles where company_id = p_company and user_id = p_user;

  insert into app.user_roles (company_id, user_id, role)
  values (p_company, p_user, p_role)
  returning * into v_linha;

  return v_linha;
end;
$fn$;

drop policy if exists user_roles_delete on app.user_roles;
create policy user_roles_delete on app.user_roles for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.is_super_admin((select auth.uid()))
         or app.has_permission((select auth.uid()), company_id, 'admin.permissoes'));

revoke all on function app.kr_checkin(uuid, numeric, date, text) from public, anon;
revoke all on function app.definir_papel(uuid, uuid, text) from public, anon;
grant execute on function app.kr_checkin(uuid, numeric, date, text) to authenticated;
grant execute on function app.definir_papel(uuid, uuid, text) to authenticated;
