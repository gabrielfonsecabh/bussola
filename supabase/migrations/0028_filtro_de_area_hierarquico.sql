-- 0028: Filtro de área inclui as áreas subordinadas.

create or replace function app.processos_inventario(p_company uuid, p_area_id uuid DEFAULT NULL::uuid, p_categoria text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nome text, tipo text, status text, nivel_maturidade integer, area_id uuid, area_nome text, dono_user_id uuid, dono_nome text, tem_sipoc boolean, indicadores_y integer, indicadores_x integer, melhorias_ativas integer, ganho_realizado numeric, pronto_para_dmaic boolean, categoria text, periodicidade text, periodicidade_origem text, prazo_referencia text, pendencia_de_mapeamento text, origem_do_registro text, sipoc_iniciado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
 SET statement_timeout TO '120s'
AS $function$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  set local statement_timeout to '120s';

  return query
  with sipoc as (
    select s.processo_id,
           app.sipoc_completo(s.suppliers, s.inputs, s.outputs, s.customers) as completo
      from app.processo_sipoc s
  )
  select
    pr.id, pr.nome, pr.tipo, pr.status, pr.nivel_maturidade,
    pr.area_id, ar.nome,
    pr.dono_user_id, pf.nome,
    coalesce(sp.completo, false),
    coalesce(ind.qtd_y, 0)::int,
    coalesce(ind.qtd_x, 0)::int,
    coalesce(mel.ativas, 0)::int,
    mel.ganho,
    (coalesce(sp.completo, false) and coalesce(ind.qtd_y, 0) > 0),
    pr.categoria, pr.periodicidade, pr.periodicidade_origem,
    pr.prazo_referencia, pr.pendencia_de_mapeamento, pr.origem_do_registro,
    (sp.processo_id is not null)
  from app.processos pr
  left join app.areas ar on ar.id = pr.area_id
  left join app.profiles pf on pf.user_id = pr.dono_user_id
  left join sipoc sp on sp.processo_id = pr.id
  left join lateral (
    select count(*) filter (where i.tipo = 'Y') as qtd_y,
           count(*) filter (where i.tipo = 'X') as qtd_x
    from app.indicadores_processo i where i.processo_id = pr.id
  ) ind on true
  left join lateral (
    select count(*) filter (where m.status = 'em_andamento') as ativas,
           sum(m.ganho_realizado) as ganho
    from app.projetos_melhoria m where m.processo_id = pr.id
  ) mel on true
  where pr.company_id = p_company
    and (p_area_id is null
         or pr.area_id in (select s.area_id from app.subarvore_de_area(p_area_id) s))
    and (p_categoria is null or pr.categoria = p_categoria)
  order by ar.nome nulls last, pr.nome, pr.id;
end;
$function$;

create or replace function app.processos_jornada(p_company uuid, p_area uuid DEFAULT NULL::uuid)
 RETURNS TABLE(processo_id uuid, nome text, categoria text, area_id uuid, area_nome text, periodicidade text, prazo_referencia text, pendencia_de_mapeamento text, selo_dono boolean, selo_sipoc boolean, selo_fluxo boolean, selo_pop boolean, selo_indicador boolean, selo_melhoria boolean, selos integer, estagio text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
 SET statement_timeout TO '60s'
AS $function$
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
       and (p_area is null
            or p.area_id in (select s.area_id from app.subarvore_de_area(p_area) s))
  ),
  sipoc as (
    select s.processo_id,
           app.sipoc_completo(s.suppliers, s.inputs, s.outputs, s.customers) as completo
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
$function$;

create or replace function app.processos_categorias(p_company uuid, p_area_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(categoria text, processos integer)
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
  select pr.categoria, count(*)::int
    from app.processos pr
   where pr.company_id = p_company
     and pr.categoria is not null
     and (p_area_id is null
          or pr.area_id in (select s.area_id from app.subarvore_de_area(p_area_id) s))
   group by pr.categoria
   order by pr.categoria;
end;
$function$;

create or replace function app.portfolio_resumo(p_company uuid, p_area_id uuid DEFAULT NULL::uuid, p_categoria text[] DEFAULT NULL::text[], p_status text[] DEFAULT NULL::text[], p_responsavel uuid DEFAULT NULL::uuid, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS TABLE(total bigint, progresso_medio numeric, atrasados bigint, sem_responsavel bigint, sem_prazo bigint, concluidos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
 SET statement_timeout TO '120s'
AS $function$
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
    and (p_area_id is null
         or p.area_id in (select s.area_id from app.subarvore_de_area(p_area_id) s))
    and (p_categoria is null or p.categoria = any(p_categoria))
    and (p_status is null or p.status = any(p_status))
    and (p_responsavel is null or p.responsavel_user_id = p_responsavel)
    and (p_de is null or p.termino_previsto >= p_de)
    and (p_ate is null or p.termino_previsto <= p_ate);
end;
$function$;

create or replace function app.okr_arvore(p_company uuid, p_ano integer, p_area_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, parent_okr_id uuid, profundidade integer, caminho uuid[], nivel text, titulo text, status text, ano integer, trimestre integer, area_id uuid, area_nome text, owner_user_id uuid, owner_nome text, perspectiva_chave text, perspectiva_nome text, objetivo_estrategico_id uuid, objetivo_titulo text, total_krs integer, total_filhos integer, atingimento numeric, farol text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
 SET statement_timeout TO '120s'
AS $function$
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
          when p_area_id is not null then
            o.area_id in (select s.area_id from app.subarvore_de_area(p_area_id) s)
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
$function$;

revoke all on function app.processos_inventario(uuid, uuid, text) from public, anon;
revoke all on function app.processos_jornada(uuid, uuid) from public, anon;
revoke all on function app.processos_categorias(uuid, uuid) from public, anon;
revoke all on function app.portfolio_resumo(uuid, uuid, text[], text[], uuid, date, date) from public, anon;
revoke all on function app.okr_arvore(uuid, integer, uuid) from public, anon;
grant execute on function app.processos_inventario(uuid, uuid, text) to authenticated;
grant execute on function app.processos_jornada(uuid, uuid) to authenticated;
grant execute on function app.processos_categorias(uuid, uuid) to authenticated;
grant execute on function app.portfolio_resumo(uuid, uuid, text[], text[], uuid, date, date) to authenticated;
grant execute on function app.okr_arvore(uuid, integer, uuid) to authenticated;
