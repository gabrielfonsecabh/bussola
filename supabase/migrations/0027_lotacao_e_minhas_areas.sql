-- 0027: Lotação de pessoas e "minhas áreas".

alter table app.company_users
  add column if not exists area_id uuid references app.areas(id) on delete set null;

create index if not exists idx_company_users_area on app.company_users (company_id, area_id);

comment on column app.company_users.area_id is
  'Área onde a pessoa é lotada. Nula é legítimo: diretoria da holding e '
  'pessoa recém-convidada ainda sem lotação. Nulo não vira "sem área" numa '
  'contagem, vira "ainda não definida".';

create or replace function app.subarvore_de_area(p_area uuid)
returns table (area_id uuid)
language sql stable set search_path = app, public as $$
  with recursive desce as (
    select a.id, a.parent_area_id from app.areas a where a.id = p_area
    union all
    select f.id, f.parent_area_id
      from app.areas f
      join desce d on f.parent_area_id = d.id
  ) cycle id set houve_ciclo using caminho
  select distinct id from desce;
$$;

comment on function app.subarvore_de_area(uuid) is
  'A área e todas as áreas abaixo dela. É o que faz "filtrar pela diretoria" '
  'significar "a diretoria e as gerências dela", que é o que quem filtra quer.';

create or replace function app.minhas_areas(p_company uuid)
returns table (area_id uuid, nome text, tipo text, motivo text)
language plpgsql stable security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  with raiz as (

    select a.id, 'respondo por ela'::text as motivo
      from app.areas a
     where a.company_id = p_company and a.responsavel_user_id = auth.uid()
    union
    select cu.area_id, 'sou lotado nela'
      from app.company_users cu
     where cu.company_id = p_company and cu.user_id = auth.uid()
       and cu.is_active and cu.area_id is not null
  ),
  toda as (
    select s.area_id as id,
           case when s.area_id = r.id then r.motivo else 'está abaixo de uma área minha' end as motivo
      from raiz r
      cross join lateral app.subarvore_de_area(r.id) s
  )
  select t.id, a.nome, a.tipo,

         min(t.motivo)
    from toda t
    join app.areas a on a.id = t.id
   group by t.id, a.nome, a.tipo
   order by a.nome;
end;
$fn$;

revoke all on function app.subarvore_de_area(uuid) from public, anon;
revoke all on function app.minhas_areas(uuid) from public, anon;
grant execute on function app.subarvore_de_area(uuid) to authenticated;
grant execute on function app.minhas_areas(uuid) to authenticated;
