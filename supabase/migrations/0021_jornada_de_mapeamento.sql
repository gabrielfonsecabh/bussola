-- 0021: Jornada de mapeamento de processos por área.

create or replace function app.processos_jornada(
  p_company uuid, p_area uuid default null)
returns table (
  processo_id uuid,
  nome text,
  categoria text,
  area_id uuid,
  area_nome text,
  periodicidade text,
  prazo_referencia text,
  pendencia_de_mapeamento text,
  selo_dono boolean,
  selo_sipoc boolean,
  selo_fluxo boolean,
  selo_pop boolean,
  selo_indicador boolean,
  selo_melhoria boolean,
  selos int,
  estagio text
)
language plpgsql stable security definer set search_path = app, public as $fn$
#variable_conflict use_column
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  with base as (
    select p.* from app.processos p
     where p.company_id = p_company
       and p.status <> 'descontinuado'
       and (p_area is null or p.area_id = p_area)
  ),
  sipoc as (
    select s.processo_id,
           coalesce(nullif(trim(s.suppliers), ''), '') <> ''
       and coalesce(nullif(trim(s.inputs), ''), '') <> ''
       and coalesce(nullif(trim(s.outputs), ''), '') <> ''
       and coalesce(nullif(trim(s.customers), ''), '') <> '' as completo
      from app.processo_sipoc s
      join base b on b.id = s.processo_id
  ),
  fluxo as (

    select e.processo_id,
           count(*) >= 2
       and bool_or(e.tipo = 'inicio')
       and bool_or(e.tipo = 'fim') as completo
      from app.processo_etapas e
      join base b on b.id = e.processo_id
     group by e.processo_id
  ),
  pop as (
    select pp.processo_id, pp.status = 'vigente' as vigente
      from app.processo_pop pp
      join base b on b.id = pp.processo_id
  ),
  indic as (

    select i.processo_id, bool_or(i.meta is not null) as com_meta
      from app.indicadores_processo i
      join base b on b.id = i.processo_id
     group by i.processo_id
  ),
  melhoria as (
    select m.processo_id, true as existe
      from app.projetos_melhoria m
      join base b on b.id = m.processo_id
     group by m.processo_id
  ),
  selado as (
    select b.id, b.nome, b.categoria, b.area_id, ar.nome as area_nome,
           b.periodicidade, b.prazo_referencia, b.pendencia_de_mapeamento,
           b.dono_user_id is not null            as s_dono,
           coalesce(sipoc.completo, false)       as s_sipoc,
           coalesce(fluxo.completo, false)       as s_fluxo,
           coalesce(pop.vigente, false)          as s_pop,
           coalesce(indic.com_meta, false)       as s_indicador,
           coalesce(melhoria.existe, false)      as s_melhoria
      from base b
      left join app.areas ar on ar.id = b.area_id
      left join sipoc    on sipoc.processo_id = b.id
      left join fluxo    on fluxo.processo_id = b.id
      left join pop      on pop.processo_id = b.id
      left join indic    on indic.processo_id = b.id
      left join melhoria on melhoria.processo_id = b.id
  )
  select s.id, s.nome, s.categoria, s.area_id, s.area_nome,
         s.periodicidade, s.prazo_referencia, s.pendencia_de_mapeamento,
         s.s_dono, s.s_sipoc, s.s_fluxo, s.s_pop, s.s_indicador, s.s_melhoria,
         (s.s_dono::int + s.s_sipoc::int + s.s_fluxo::int
          + s.s_pop::int + s.s_indicador::int + s.s_melhoria::int) as selos,
         case (s.s_dono::int + s.s_sipoc::int + s.s_fluxo::int
               + s.s_pop::int + s.s_indicador::int + s.s_melhoria::int)
           when 0 then 'nao_comecou'
           when 6 then 'melhoria_continua'
           else case when s.s_dono and s.s_fluxo then 'mapeado' else 'em_mapeamento' end
         end as estagio
    from selado s
   order by selos desc, s.categoria nulls last, s.nome;
end;
$fn$;

alter function app.processos_jornada(uuid, uuid) set statement_timeout to '60s';

create or replace function app.jornada_placar(p_company uuid)
returns table (
  area_id uuid,
  area_nome text,
  processos int,
  selos_ganhos int,
  selos_possiveis int,
  percentual numeric,
  completos int,
  sem_dono int,
  com_pendencia int
)
language plpgsql stable security definer set search_path = app, public as $fn$
#variable_conflict use_column
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  with j as (select * from app.processos_jornada(p_company, null))
  select ar.id, ar.nome,
         count(j.processo_id)::int,
         coalesce(sum(j.selos), 0)::int,
         (count(j.processo_id) * 6)::int,
         case when count(j.processo_id) = 0 then null
              else round(sum(j.selos)::numeric * 100 / (count(j.processo_id) * 6), 1) end,
         count(*) filter (where j.selos = 6)::int,
         count(*) filter (where not j.selo_dono)::int,
         count(*) filter (where j.pendencia_de_mapeamento is not null)::int
    from app.areas ar
    left join j on j.area_id = ar.id
   where ar.company_id = p_company
   group by ar.id, ar.nome
   order by 6 desc nulls last, ar.nome;
end;
$fn$;

alter function app.jornada_placar(uuid) set statement_timeout to '60s';

create table if not exists app.missoes_semanais (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  area_id uuid not null references app.areas(id) on delete cascade,
  semana date not null,
  codigo text not null check (codigo in (
    'dar_dono','mapear_fluxo','completar_sipoc',
    'registrar_indicador','publicar_pop','fechar_pendencia')),
  alvo int not null check (alvo > 0),
  base int not null check (base >= 0),
  created_at timestamptz not null default now(),
  unique (company_id, area_id, semana, codigo)
);

create index if not exists idx_missoes_company on app.missoes_semanais (company_id, semana desc);

alter table app.missoes_semanais enable row level security;

drop policy if exists missoes_select on app.missoes_semanais;
create policy missoes_select on app.missoes_semanais for select
  using (app.belongs_to_company((select auth.uid()), company_id));

drop policy if exists missoes_insert on app.missoes_semanais;
create policy missoes_insert on app.missoes_semanais for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));

drop policy if exists missoes_update on app.missoes_semanais;
create policy missoes_update on app.missoes_semanais for update
  using (app.is_company_admin((select auth.uid()), company_id))
  with check (app.is_company_admin((select auth.uid()), company_id));

drop policy if exists missoes_delete on app.missoes_semanais;
create policy missoes_delete on app.missoes_semanais for delete
  using (app.is_company_admin((select auth.uid()), company_id));

grant select, insert, update, delete on app.missoes_semanais to authenticated;

create or replace function app.jornada_lacunas(p_company uuid, p_area uuid)
returns table (codigo text, teto int, lacuna int)
language sql stable security definer set search_path = app, public as $fn$
  with j as (select * from app.processos_jornada(p_company, p_area))
  select v.codigo, v.teto, v.lacuna::int
    from (
      select 'dar_dono'::text,            5, count(*) filter (where not selo_dono)      from j
      union all
      select 'completar_sipoc',           3, count(*) filter (where not selo_sipoc)     from j
      union all
      select 'mapear_fluxo',              3, count(*) filter (where not selo_fluxo)     from j
      union all
      select 'publicar_pop',              2, count(*) filter (where not selo_pop)       from j
      union all
      select 'registrar_indicador',       2, count(*) filter (where not selo_indicador) from j
      union all
      select 'fechar_pendencia',          3, count(*) filter (where pendencia_de_mapeamento is not null) from j
    ) v(codigo, teto, lacuna);
$fn$;

revoke all on function app.jornada_lacunas(uuid, uuid) from public, anon;
grant execute on function app.jornada_lacunas(uuid, uuid) to authenticated;

create or replace function app.missoes_da_semana(
  p_company uuid, p_area uuid, p_referencia date default current_date)
returns table (
  codigo text,
  titulo text,
  alvo int,
  base int,
  restante int,
  feito int,
  concluida boolean
)
language plpgsql security definer set search_path = app, public as $fn$
#variable_conflict use_column
declare
  v_semana date;
begin
  if p_area is null then
    raise exception 'Missão é da área: informe qual' using errcode = '22023';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  v_semana := date_trunc('week', p_referencia)::date;

  insert into app.missoes_semanais (company_id, area_id, semana, codigo, alvo, base)
  select p_company, p_area, v_semana, g.codigo, least(g.teto, g.lacuna), g.lacuna
    from app.jornada_lacunas(p_company, p_area) g
   where g.lacuna > 0
  on conflict (company_id, area_id, semana, codigo) do nothing;

  return query
  select m.codigo,
         case m.codigo
           when 'dar_dono'            then 'Dar dono a processos órfãos'
           when 'mapear_fluxo'        then 'Desenhar o fluxo de ponta a ponta'
           when 'completar_sipoc'     then 'Fechar o SIPOC das quatro pontas'
           when 'registrar_indicador' then 'Registrar indicador com meta'
           when 'publicar_pop'        then 'Publicar POP aprovado'
           when 'fechar_pendencia'    then 'Resolver pendência trazida da planilha'
         end,
         m.alvo, m.base, g.lacuna::int,
         greatest(0, least(m.alvo, m.base - g.lacuna))::int,
         greatest(0, least(m.alvo, m.base - g.lacuna)) >= m.alvo
    from app.missoes_semanais m
    join app.jornada_lacunas(p_company, p_area) g on g.codigo = m.codigo
   where m.company_id = p_company and m.area_id = p_area and m.semana = v_semana
   order by m.codigo;
end;
$fn$;

revoke all on function app.processos_jornada(uuid, uuid) from public, anon;
revoke all on function app.jornada_placar(uuid) from public, anon;
revoke all on function app.missoes_da_semana(uuid, uuid, date) from public, anon;
grant execute on function app.processos_jornada(uuid, uuid) to authenticated;
grant execute on function app.jornada_placar(uuid) to authenticated;
grant execute on function app.missoes_da_semana(uuid, uuid, date) to authenticated;
