-- 0025: Kit de gestão e SIPOC completo com uma fonte só.

create or replace function app.sipoc_completo(
  p_suppliers text, p_inputs text, p_outputs text, p_customers text)
returns boolean
language sql immutable set search_path = app, public as $$
  select coalesce(nullif(trim(p_suppliers), ''), '') <> ''
     and coalesce(nullif(trim(p_inputs),    ''), '') <> ''
     and coalesce(nullif(trim(p_outputs),   ''), '') <> ''
     and coalesce(nullif(trim(p_customers), ''), '') <> '';
$$;

comment on function app.sipoc_completo(text, text, text, text) is
  'SIPOC utilizável: as quatro pontas preenchidas. Fonte única da regra. '
  'Um SIPOC pela metade não delimita o processo, e contar a linha existente '
  'como "tem SIPOC" foi o que deixou o Kit verde com 40 de 41 vazios.';

revoke all on function app.sipoc_completo(text, text, text, text) from public, anon;
grant execute on function app.sipoc_completo(text, text, text, text) to authenticated;
create or replace function app.get_role_preset_permissions(_role text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'app', 'public'
AS $function$
  select case _role
    when 'company_admin' then array[
      'atividade.delete',
      'kit.congelar',
      'okr.view','okr.edit','okr.delete','okr.checkin',
      'projeto.view','projeto.edit','projeto.delete','sprint.manage',
      'atividade.view','atividade.edit',
      'processo.view','processo.edit','processo.delete','melhoria.edit','pop.aprovar',
      'kit.view','opr.edit','opr.publish','bonus.view','bonus.config',
      'admin.areas','admin.pessoas','admin.permissoes'
    ]
    when 'diretor' then array[
      'atividade.delete',
      'kit.congelar',
      'okr.view','okr.edit','okr.checkin',
      'projeto.view','projeto.edit','sprint.manage','atividade.view','atividade.edit',
      'processo.view','processo.edit','melhoria.edit','pop.aprovar',
      'kit.view','opr.edit','opr.publish','bonus.view'
    ]
    when 'gerente' then array[
      'atividade.delete',
      'kit.congelar',
      'okr.view','okr.edit','okr.checkin',
      'projeto.view','projeto.edit','sprint.manage','atividade.view','atividade.edit',
      'processo.view','processo.edit','melhoria.edit','pop.aprovar',
      'kit.view','opr.edit','opr.publish'
    ]
    when 'coordenador' then array[
      'atividade.delete',
      'okr.view','okr.checkin','projeto.view','projeto.edit',
      'atividade.view','atividade.edit','processo.view','melhoria.edit','kit.view'
    ]
    when 'especialista' then array[
      'kit.view',
      'okr.view','okr.checkin','projeto.view','projeto.edit',
      'atividade.view','atividade.edit','processo.view','processo.edit','melhoria.edit'
    ]
    when 'colaborador' then array[
      'kit.view',
      'okr.view','projeto.view','atividade.view','atividade.edit','processo.view'
    ]
    else array[]::text[]
  end;
$function$;

revoke all on function app.get_role_preset_permissions(text) from public, anon;
grant execute on function app.get_role_preset_permissions(text) to authenticated;

create or replace function app.kit_matriz(p_company uuid, p_periodo text)
returns table (
  area_id uuid, area_nome text, area_tipo text, parent_area_id uuid,
  responsavel_nome text, mapa_status text, mapa_detalhe text,
  processos_status text, processos_detalhe text, opr_status text,
  opr_detalhe text, percentual numeric)
language plpgsql security definer
set search_path to 'app', 'public' set statement_timeout to '120s'
as $function$
declare v_ano int;
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_periodo !~ '^\d{4}(-\d{2})?$' then
    raise exception 'Período deve ser YYYY ou YYYY-MM, recebido: %', p_periodo
      using errcode = '22023';
  end if;

  set local statement_timeout to '120s';
  v_ano := split_part(p_periodo, '-', 1)::int;

  return query
  with base as (
    select
      a.id, a.nome, a.tipo, a.parent_area_id, pf.nome as responsavel,

      (select count(*) from app.okrs o
        where o.area_id = a.id and o.ano = v_ano) as qtd_okrs,
      (select count(*) from app.processos pr where pr.area_id = a.id) as qtd_proc,
      (select count(*) from app.processos pr
        join app.processo_sipoc s on s.processo_id = pr.id
        where pr.area_id = a.id
          and app.sipoc_completo(s.suppliers, s.inputs, s.outputs, s.customers))
        as qtd_sipoc,
      (select count(*) from app.opr r
        where r.area_id = a.id and r.periodo = p_periodo and r.status = 'publicado')
        as qtd_opr_pub
    from app.areas a
    left join app.profiles pf on pf.user_id = a.responsavel_user_id
    where a.company_id = p_company

      and a.tipo <> 'comite'
  ),
  avaliado as (
    select b.*,
      case when b.qtd_okrs > 0 then 'em_dia' else 'pendente' end as st_mapa,
      case
        when b.qtd_proc = 0 then 'pendente'
        when b.qtd_sipoc = b.qtd_proc then 'em_dia'
        else 'atrasado'
      end as st_proc,
      case when b.qtd_opr_pub > 0 then 'em_dia' else 'pendente' end as st_opr
    from base b
  )
  select
    v.id, v.nome, v.tipo, v.parent_area_id, v.responsavel,
    v.st_mapa,
    v.qtd_okrs || ' OKR(s) da área em ' || v_ano,
    v.st_proc,
    v.qtd_sipoc || ' de ' || v.qtd_proc || ' processo(s) com SIPOC completo',
    v.st_opr,
    case when v.qtd_opr_pub > 0 then 'OPR de ' || p_periodo || ' publicado'
         else 'OPR de ' || p_periodo || ' não publicado' end,
    round(100.0 * (
      (case when v.st_mapa = 'em_dia' then 1 else 0 end) +
      (case when v.st_proc = 'em_dia' then 1 else 0 end) +
      (case when v.st_opr  = 'em_dia' then 1 else 0 end)
    ) / 3.0, 0)
  from avaliado v
  order by v.tipo, v.nome, v.id;
end;
$function$;

revoke all on function app.kit_matriz(uuid, text) from public, anon;
grant execute on function app.kit_matriz(uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION app.kit_congelar(p_company uuid, p_periodo text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare v_qtd integer;
begin
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), p_company)
          or app.has_permission(auth.uid(), p_company, 'kit.congelar')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  with m as (select * from app.kit_matriz(p_company, p_periodo)),
  linhas as (
    select area_id, 'mapa_estrategico'::text as item, mapa_status as status from m
    union all
    select area_id, 'processos_procedimentos', processos_status from m
    union all
    select area_id, 'opr', opr_status from m
  )
  insert into app.kit_gestao (company_id, area_id, periodo, item, status, percentual, avaliador_user_id)
  select p_company, l.area_id, p_periodo, l.item, l.status,
         case l.status when 'em_dia' then 100 when 'atrasado' then 50 else 0 end,
         auth.uid()
  from linhas l
  on conflict (company_id, area_id, periodo, item) do update
    set status = excluded.status,
        percentual = excluded.percentual,
        avaliador_user_id = excluded.avaliador_user_id;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$function$;

CREATE OR REPLACE FUNCTION app.processos_inventario(p_company uuid, p_area_id uuid DEFAULT NULL::uuid, p_categoria text DEFAULT NULL::text)
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
    and (p_area_id is null or pr.area_id = p_area_id)
    and (p_categoria is null or pr.categoria = p_categoria)
  order by ar.nome nulls last, pr.nome, pr.id;
end;
$function$;

CREATE OR REPLACE FUNCTION app.processos_jornada(p_company uuid, p_area uuid DEFAULT NULL::uuid)
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
       and (p_area is null or p.area_id = p_area)
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

CREATE OR REPLACE FUNCTION app.jornada_placar(p_company uuid)
 RETURNS TABLE(area_id uuid, area_nome text, processos integer, selos_ganhos integer, selos_possiveis integer, percentual numeric, completos integer, sem_dono integer, com_pendencia integer)
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

     and ar.tipo <> 'comite'
   group by ar.id, ar.nome
   order by 6 desc nulls last, ar.nome;
end;
$function$;

drop policy if exists kit_insert on app.kit_gestao;
create policy kit_insert on app.kit_gestao for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'kit.congelar'));

drop policy if exists kit_update on app.kit_gestao;
create policy kit_update on app.kit_gestao for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'kit.congelar'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'kit.congelar'));

revoke all on function app.kit_congelar(uuid, text) from public, anon;
revoke all on function app.processos_inventario(uuid, uuid, text) from public, anon;
revoke all on function app.processos_jornada(uuid, uuid) from public, anon;
revoke all on function app.jornada_placar(uuid) from public, anon;
grant execute on function app.kit_congelar(uuid, text) to authenticated;
grant execute on function app.processos_inventario(uuid, uuid, text) to authenticated;
grant execute on function app.processos_jornada(uuid, uuid) to authenticated;
grant execute on function app.jornada_placar(uuid) to authenticated;
