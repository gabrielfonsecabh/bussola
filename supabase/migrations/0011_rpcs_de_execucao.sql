-- 0011: Funções de projetos, sprints, atividades e cronograma.

create or replace function app.atividade_mover(
  p_id uuid,
  p_status text,
  p_ordem int default null,
  p_sprint_id uuid default null,
  p_versao timestamptz default null)
returns app.atividades
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_atv app.atividades;
  v_row app.atividades;
begin
  select * into v_atv from app.atividades where id = p_id;
  if v_atv.id is null then
    raise exception 'Atividade inexistente' using errcode = 'P0002';
  end if;

  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_atv.company_id)
          or v_atv.responsavel_user_id = auth.uid()
          or app.has_permission(auth.uid(), v_atv.company_id, 'atividade.edit')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if p_status not in ('a_fazer','fazendo','revisao','concluido','bloqueado') then
    raise exception 'Status inválido: %', p_status using errcode = '22023';
  end if;

  if p_versao is not null and v_atv.updated_at <> p_versao then
    raise exception
      'A atividade mudou desde que a tela carregou. Recarregue antes de mover.'
      using errcode = '40001';
  end if;

  if p_sprint_id is not null and not exists (
    select 1 from app.sprints s
    where s.id = p_sprint_id and s.company_id = v_atv.company_id
  ) then
    raise exception 'Sprint não pertence à empresa da atividade' using errcode = '42501';
  end if;

  update app.atividades
     set status   = p_status,
         ordem    = coalesce(p_ordem, ordem),
         sprint_id = coalesce(p_sprint_id, sprint_id)
   where id = p_id
   returning * into v_row;

  if v_row.projeto_id is not null then
    update app.projetos p
       set progresso_pct = coalesce((
             select round(100.0 * count(*) filter (where a.status = 'concluido')
                          / nullif(count(*), 0), 0)
             from app.atividades a where a.projeto_id = v_row.projeto_id), 0)
     where p.id = v_row.projeto_id;
  end if;

  return v_row;
end;
$fn$;

create or replace function app.portfolio_resumo(
  p_company uuid,
  p_area_id uuid default null,
  p_categoria text[] default null,
  p_status text[] default null,
  p_responsavel uuid default null,
  p_de date default null,
  p_ate date default null)
returns table (
  total bigint,
  progresso_medio numeric,
  atrasados bigint,
  sem_responsavel bigint,
  sem_prazo bigint,
  concluidos bigint
)

language plpgsql security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  set local statement_timeout to '120s';

  return query
  select
    count(*)::bigint,
    round(avg(p.progresso_pct), 1),
    count(*) filter (
      where p.termino_previsto is not null
        and p.termino_previsto < current_date
        and p.status not in ('concluido','cancelado'))::bigint,
    count(*) filter (where p.responsavel_user_id is null)::bigint,
    count(*) filter (where p.termino_previsto is null)::bigint,
    count(*) filter (where p.status = 'concluido')::bigint
  from app.projetos p
  where p.company_id = p_company
    and (p_area_id is null or p.area_id = p_area_id)
    and (p_categoria is null or p.categoria = any(p_categoria))
    and (p_status is null or p.status = any(p_status))
    and (p_responsavel is null or p.responsavel_user_id = p_responsavel)
    and (p_de is null or p.termino_previsto >= p_de)
    and (p_ate is null or p.termino_previsto <= p_ate);
end;
$fn$;

create or replace function app.cronograma_trimestres(p_company uuid, p_ano int)
returns table (
  projeto_id uuid,
  nome text,
  categoria text,
  status text,
  area_nome text,
  responsavel_nome text,
  progresso_pct numeric,
  inicio date,
  termino date,
  tri_inicio int,
  tri_fim int,
  atrasado boolean
)
language plpgsql stable security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.nome,
    p.categoria,
    p.status,
    ar.nome,
    pf.nome,
    p.progresso_pct,
    coalesce(p.inicio_real, p.inicio_previsto),
    coalesce(p.termino_real, p.termino_previsto),
    greatest(1, least(4, extract(quarter from
      coalesce(p.inicio_real, p.inicio_previsto, make_date(p_ano,1,1)))::int)),
    greatest(1, least(4, extract(quarter from
      coalesce(p.termino_real, p.termino_previsto, make_date(p_ano,12,31)))::int)),
    (p.termino_previsto is not null
      and p.termino_previsto < current_date
      and p.status not in ('concluido','cancelado'))
  from app.projetos p
  left join app.areas ar on ar.id = p.area_id
  left join app.profiles pf on pf.user_id = p.responsavel_user_id
  where p.company_id = p_company
    and (
      extract(year from coalesce(p.inicio_real, p.inicio_previsto)) = p_ano
      or extract(year from coalesce(p.termino_real, p.termino_previsto)) = p_ano
      or (coalesce(p.inicio_real, p.inicio_previsto) <= make_date(p_ano,1,1)
          and coalesce(p.termino_real, p.termino_previsto) >= make_date(p_ano,12,31))
    )
  order by coalesce(p.inicio_real, p.inicio_previsto) nulls last, p.nome, p.id;
end;
$fn$;

create or replace function app.minhas_atividades_resumo(p_company uuid)
returns table (horizonte text, total bigint, atrasadas bigint, concluidas bigint)
language plpgsql stable security definer set search_path = app, public as $fn$
begin
  if not app.belongs_to_company(auth.uid(), p_company) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  select a.horizonte,
         count(*)::bigint,
         count(*) filter (
           where a.data_prazo is not null and a.data_prazo < current_date
             and a.status <> 'concluido')::bigint,
         count(*) filter (where a.status = 'concluido')::bigint
  from app.atividades a
  where a.company_id = p_company
    and a.responsavel_user_id = auth.uid()
  group by a.horizonte;
end;
$fn$;

revoke all on function app.atividade_mover(uuid, text, int, uuid, timestamptz) from public, anon;
revoke all on function app.portfolio_resumo(uuid, uuid, text[], text[], uuid, date, date) from public, anon;
revoke all on function app.cronograma_trimestres(uuid, int) from public, anon;
revoke all on function app.minhas_atividades_resumo(uuid) from public, anon;

grant execute on function app.atividade_mover(uuid, text, int, uuid, timestamptz) to authenticated;
grant execute on function app.portfolio_resumo(uuid, uuid, text[], text[], uuid, date, date) to authenticated;
grant execute on function app.cronograma_trimestres(uuid, int) to authenticated;
grant execute on function app.minhas_atividades_resumo(uuid) to authenticated;

alter function app.portfolio_resumo(uuid, uuid, text[], text[], uuid, date, date)
  set statement_timeout to '120s';
