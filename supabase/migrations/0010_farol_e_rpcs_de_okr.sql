-- 0010: Farol de KR e funções de leitura de OKR.

create or replace function app.ciclo_decorrido(p_ano int, p_trimestre int default null)
returns numeric
language sql immutable as $$
  with limites as (
    select
      case when p_trimestre is null
           then make_date(p_ano, 1, 1)
           else make_date(p_ano, 1 + (p_trimestre - 1) * 3, 1)
      end as inicio,
      case when p_trimestre is null
           then make_date(p_ano, 12, 31)
           else (make_date(p_ano, 1 + (p_trimestre - 1) * 3, 1) + interval '3 months - 1 day')::date
      end as fim
  )
  select case
    when current_date <= inicio then 0::numeric
    when current_date >= fim then 1::numeric
    else round(
      (current_date - inicio)::numeric / nullif((fim - inicio)::numeric, 0), 4)
  end
  from limites;
$$;

comment on function app.ciclo_decorrido(int, int) is
  'Fração do ciclo (ano ou trimestre) já decorrida, de 0 a 1.';

create or replace function app.kr_atingimento(
  p_baseline numeric, p_meta numeric, p_atual numeric, p_direcao text)
returns numeric
language sql immutable as $$
  select case
    when p_meta is null or p_atual is null then null
    when p_baseline is not null and p_meta <> p_baseline
      then round((p_atual - p_baseline) / (p_meta - p_baseline), 4)
    when p_baseline is null and p_meta <> 0 and p_direcao = 'subir'
      then round(p_atual / p_meta, 4)

    when p_meta = 0 and p_direcao = 'descer'
      then case when p_atual <= 0 then 1::numeric else 0::numeric end
    else null
  end;
$$;

create or replace function app.farol_por_ritmo(
  p_atingimento numeric, p_ano int, p_trimestre int default null)
returns text
language sql stable as $$
  select case
    when p_atingimento is null then 'cinza'
    else (
      with r as (

        select p_atingimento / greatest(app.ciclo_decorrido(p_ano, p_trimestre), 0.02) as razao
      )
      select case
        when razao >= 0.95 then 'verde'
        when razao >= 0.75 then 'amarelo'
        else 'vermelho'
      end from r
    )
  end;
$$;

comment on function app.farol_por_ritmo(numeric, int, int) is
  'verde = no ritmo ou à frente; amarelo = atrás mas recuperável; vermelho = risco real.';

create or replace function app.kr_checkin(
  p_kr_id uuid, p_valor numeric, p_data date default current_date, p_comentario text default null)
returns app.key_results
language plpgsql security definer set search_path = app, public as $fn$
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
          or app.has_permission(auth.uid(), v_company, 'okr.checkin')) then
    raise exception 'Sem permissão' using errcode = '42501';
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
$fn$;

create or replace function app.farol_recalcular(p_company uuid)
returns integer
language plpgsql security definer set search_path = app, public as $fn$
declare v_qtd integer;
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  set local statement_timeout to '120s';

  with novo as (
    select k.id,
           case when k.tipo = 'marco' then 'cinza'
                else app.farol_por_ritmo(
                       app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao),
                       o.ano, o.trimestre)
           end as farol
    from app.key_results k
    join app.okrs o on o.id = k.okr_id
    where k.company_id = p_company
  )
  update app.key_results k
     set farol = novo.farol
    from novo
   where k.id = novo.id and k.farol is distinct from novo.farol;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$fn$;

create or replace function app.okr_arvore(
  p_company uuid, p_ano int, p_area_id uuid default null)
returns table (
  id uuid,
  parent_okr_id uuid,
  profundidade int,
  caminho uuid[],
  nivel text,
  titulo text,
  status text,
  ano int,
  trimestre int,
  area_id uuid,
  area_nome text,
  owner_user_id uuid,
  owner_nome text,
  perspectiva_chave text,
  perspectiva_nome text,
  objetivo_estrategico_id uuid,
  objetivo_titulo text,
  total_krs int,
  total_filhos int,
  atingimento numeric,
  farol text
)

language plpgsql security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  set local statement_timeout to '120s';

  return query
  with recursive raizes as (
    select o.id
    from app.okrs o
    where o.company_id = p_company
      and o.ano = p_ano
      and (
        case
          when p_area_id is not null then o.area_id = p_area_id
          else o.parent_okr_id is null
        end
      )
  ),
  arvore as (
    select o.id, o.parent_okr_id, 0 as profundidade, array[o.id] as caminho
    from app.okrs o
    join raizes r on r.id = o.id

    union all

    select f.id, f.parent_okr_id, a.profundidade + 1, a.caminho || f.id
    from app.okrs f
    join arvore a on f.parent_okr_id = a.id
    where f.company_id = p_company
      and f.ano = p_ano
      and not f.id = any(a.caminho)
  ),
  medido as (
    select k.okr_id,
           count(*)::int as total_krs,

           sum(app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) * k.peso)
             filter (where app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) is not null)
           / nullif(sum(k.peso) filter (
               where app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) is not null), 0)
             as atingimento
    from app.key_results k
    group by k.okr_id
  ),
  filhos as (
    select f.parent_okr_id as id, count(*)::int as total
    from app.okrs f
    where f.company_id = p_company and f.parent_okr_id is not null
    group by f.parent_okr_id
  )
  select
    a.id,
    a.parent_okr_id,
    a.profundidade,
    a.caminho,
    o.nivel,
    o.titulo,
    o.status,
    o.ano,
    o.trimestre,
    o.area_id,
    ar.nome,
    o.owner_user_id,
    pf.nome,
    pe.chave,
    pe.nome,
    o.objetivo_estrategico_id,
    oe.titulo,
    coalesce(m.total_krs, 0),
    coalesce(fi.total, 0),
    round(m.atingimento, 4),
    app.farol_por_ritmo(m.atingimento, o.ano, o.trimestre)
  from arvore a
  join app.okrs o on o.id = a.id
  left join app.areas ar on ar.id = o.area_id
  left join app.profiles pf on pf.user_id = o.owner_user_id
  left join app.perspectivas pe on pe.id = o.perspectiva_id
  left join app.objetivos_estrategicos oe on oe.id = o.objetivo_estrategico_id
  left join medido m on m.okr_id = a.id
  left join filhos fi on fi.id = a.id
  order by a.caminho, o.titulo;
end;
$fn$;

create or replace function app.okr_desdobrar(
  p_okr_id uuid,
  p_titulo text,
  p_area_id uuid default null,
  p_owner_user_id uuid default null,
  p_trimestre int default null)
returns app.okrs
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_pai app.okrs;
  v_nivel text;
  v_novo app.okrs;
begin
  select * into v_pai from app.okrs where id = p_okr_id;
  if v_pai.id is null then
    raise exception 'OKR pai inexistente' using errcode = 'P0002';
  end if;

  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_pai.company_id)
          or v_pai.owner_user_id = auth.uid()
          or app.has_permission(auth.uid(), v_pai.company_id, 'okr.edit')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'O OKR filho precisa de um título' using errcode = '22023';
  end if;

  if p_area_id is not null and not exists (
    select 1 from app.areas a where a.id = p_area_id and a.company_id = v_pai.company_id
  ) then
    raise exception 'Área não pertence à empresa do OKR pai' using errcode = '42501';
  end if;

  v_nivel := case v_pai.nivel
    when 'corporativo' then 'diretoria'
    when 'diretoria'   then 'gerencia'
    when 'gerencia'    then 'individual'
    else 'individual'
  end;

  insert into app.okrs (
    company_id, parent_okr_id, area_id, objetivo_estrategico_id, perspectiva_id,
    owner_user_id, nivel, titulo, ano, trimestre, status)
  values (
    v_pai.company_id, v_pai.id, coalesce(p_area_id, v_pai.area_id),
    v_pai.objetivo_estrategico_id, v_pai.perspectiva_id,
    p_owner_user_id, v_nivel, trim(p_titulo), v_pai.ano,
    coalesce(p_trimestre, v_pai.trimestre), 'rascunho')
  returning * into v_novo;

  return v_novo;
end;
$fn$;

revoke all on function app.ciclo_decorrido(int, int) from public, anon;
revoke all on function app.kr_atingimento(numeric, numeric, numeric, text) from public, anon;
revoke all on function app.farol_por_ritmo(numeric, int, int) from public, anon;
revoke all on function app.kr_checkin(uuid, numeric, date, text) from public, anon;
revoke all on function app.farol_recalcular(uuid) from public, anon;
revoke all on function app.okr_arvore(uuid, int, uuid) from public, anon;
revoke all on function app.okr_desdobrar(uuid, text, uuid, uuid, int) from public, anon;

grant execute on function app.ciclo_decorrido(int, int) to authenticated;
grant execute on function app.kr_atingimento(numeric, numeric, numeric, text) to authenticated;
grant execute on function app.farol_por_ritmo(numeric, int, int) to authenticated;
grant execute on function app.kr_checkin(uuid, numeric, date, text) to authenticated;
grant execute on function app.farol_recalcular(uuid) to authenticated;
grant execute on function app.okr_arvore(uuid, int, uuid) to authenticated;
grant execute on function app.okr_desdobrar(uuid, text, uuid, uuid, int) to authenticated;

alter function app.okr_arvore(uuid, int, uuid) set statement_timeout to '120s';
alter function app.farol_recalcular(uuid) set statement_timeout to '120s';
