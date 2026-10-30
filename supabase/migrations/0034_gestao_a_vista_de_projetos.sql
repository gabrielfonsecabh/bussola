-- 0034: Gestão à vista de projetos.

drop function if exists app.cronograma_trimestres(uuid, integer);

create or replace function app.cronograma_gestao(
  p_company uuid,
  p_area_id uuid default null,
  p_de date default null,
  p_ate date default null)
returns table (
  projeto_id uuid,
  nome text,
  categoria text,
  status text,
  prioridade text,
  area_nome text,
  responsavel_nome text,
  progresso_pct numeric,
  inicio date,
  termino date,

  sem_prazo boolean,
  atrasado boolean,
  dias int,
  atividades int,
  atividades_abertas int,

  sobrepoe int)
language plpgsql stable security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  with base as (
    select p.id, p.nome, p.categoria, p.status, p.prioridade,
           ar.nome as area_nome, pf.nome as responsavel_nome, p.progresso_pct,
           coalesce(p.inicio_real, p.inicio_previsto) as ini,
           coalesce(p.termino_real, p.termino_previsto) as fim,
           p.termino_previsto
      from app.projetos p
      left join app.areas ar on ar.id = p.area_id
      left join app.profiles pf on pf.user_id = p.responsavel_user_id
     where p.company_id = p_company
       and (p_area_id is null
            or p.area_id in (select s.area_id from app.subarvore_de_area(p_area_id) s))
       and p.status <> 'cancelado'

       and (
         (p_de is null and p_ate is null)
         or coalesce(p.inicio_real, p.inicio_previsto) is null
         or coalesce(p.termino_real, p.termino_previsto) is null
         or (coalesce(p.termino_real, p.termino_previsto) >= coalesce(p_de, '-infinity'::date)
             and coalesce(p.inicio_real, p.inicio_previsto) <= coalesce(p_ate, 'infinity'::date))
       )
  )
  select b.id, b.nome, b.categoria, b.status, b.prioridade,
         b.area_nome, b.responsavel_nome, b.progresso_pct,
         b.ini, b.fim,
         (b.ini is null or b.fim is null),
         (b.termino_previsto is not null
          and b.termino_previsto < current_date
          and b.status not in ('concluido','cancelado')),
         case when b.ini is null or b.fim is null then null
              else (b.fim - b.ini) + 1 end,
         (select count(*)::int from app.atividades a where a.projeto_id = b.id),
         (select count(*)::int from app.atividades a
           where a.projeto_id = b.id and a.status <> 'concluido'),
         (select count(*)::int from base o
           where o.id <> b.id
             and o.ini is not null and o.fim is not null
             and b.ini is not null and b.fim is not null

             and o.ini <= b.fim and b.ini <= o.fim)
    from base b
   order by b.ini nulls first, b.fim nulls first, b.nome;
end;
$fn$;

create or replace function app.cronograma_carga(
  p_company uuid,
  p_area_id uuid default null,
  p_de date default null,
  p_ate date default null)
returns table (mes date, projetos int, nomes text[])
language plpgsql stable security definer set search_path = app, public as $fn$
declare
  v_de date;
  v_ate date;
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  select coalesce(p_de, date_trunc('month', min(coalesce(p.inicio_real, p.inicio_previsto)))::date),
         coalesce(p_ate, date_trunc('month', max(coalesce(p.termino_real, p.termino_previsto)))::date)
    into v_de, v_ate
    from app.projetos p
   where p.company_id = p_company
     and p.status <> 'cancelado'
     and (p_area_id is null
          or p.area_id in (select s.area_id from app.subarvore_de_area(p_area_id) s));

  if v_de is null or v_ate is null then
    return;
  end if;

  return query
  with meses as (
    select generate_series(v_de, v_ate, interval '1 month')::date as m
  ),
  abertos as (
    select p.nome,
           coalesce(p.inicio_real, p.inicio_previsto) as ini,
           coalesce(p.termino_real, p.termino_previsto) as fim
      from app.projetos p
     where p.company_id = p_company
       and p.status <> 'cancelado'
       and coalesce(p.inicio_real, p.inicio_previsto) is not null
       and coalesce(p.termino_real, p.termino_previsto) is not null
       and (p_area_id is null
            or p.area_id in (select s.area_id from app.subarvore_de_area(p_area_id) s))
  )
  select m.m,
         count(a.nome)::int,
         coalesce(array_agg(a.nome order by a.nome) filter (where a.nome is not null),
                  array[]::text[])
    from meses m
    left join abertos a
      on a.ini <= (m.m + interval '1 month - 1 day')::date
     and a.fim >= m.m
   group by m.m
   order by m.m;
end;
$fn$;

revoke all on function app.cronograma_gestao(uuid, uuid, date, date) from public, anon;
revoke all on function app.cronograma_carga(uuid, uuid, date, date) from public, anon;
grant execute on function app.cronograma_gestao(uuid, uuid, date, date) to authenticated;
grant execute on function app.cronograma_carga(uuid, uuid, date, date) to authenticated;
