-- 0013: Funções do kit de gestão, OPR e apuração de bônus.

create or replace function app.kit_matriz(p_company uuid, p_periodo text)
returns table (
  area_id uuid,
  area_nome text,
  area_tipo text,
  parent_area_id uuid,
  responsavel_nome text,
  mapa_status text,
  mapa_detalhe text,
  processos_status text,
  processos_detalhe text,
  opr_status text,
  opr_detalhe text,
  percentual numeric
)

language plpgsql security definer set search_path = app, public as $fn$
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

  return query
  with base as (
    select
      a.id, a.nome, a.tipo, a.parent_area_id, pf.nome as responsavel,
      (select count(*) from app.okrs o where o.area_id = a.id) as qtd_okrs,
      (select count(*) from app.processos pr where pr.area_id = a.id) as qtd_proc,
      (select count(*) from app.processos pr
        join app.processo_sipoc s on s.processo_id = pr.id
        where pr.area_id = a.id) as qtd_sipoc,
      (select count(*) from app.opr r
        where r.area_id = a.id and r.periodo = p_periodo and r.status = 'publicado')
        as qtd_opr_pub
    from app.areas a
    left join app.profiles pf on pf.user_id = a.responsavel_user_id
    where a.company_id = p_company
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
    v.qtd_okrs || ' OKR(s) na área',
    v.st_proc,
    v.qtd_sipoc || ' de ' || v.qtd_proc || ' processo(s) com SIPOC',
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
$fn$;

create or replace function app.kit_congelar(p_company uuid, p_periodo text)
returns integer
language plpgsql security definer set search_path = app, public as $fn$
declare v_qtd integer;
begin
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), p_company)
          or app.has_permission(auth.uid(), p_company, 'kit.view')) then
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
$fn$;

create or replace function app.opr_montar(p_area_id uuid, p_periodo text)
returns jsonb
language plpgsql stable security definer set search_path = app, public as $fn$
declare
  v_company uuid;
  v_area_nome text;
  v_ano int;
  v_okrs jsonb;
  v_indicadores jsonb;
  v_projetos jsonb;
  v_melhorias jsonb;
begin
  select a.company_id, a.nome into v_company, v_area_nome
  from app.areas a where a.id = p_area_id;
  if v_company is null then
    raise exception 'Área inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), v_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_periodo !~ '^\d{4}-\d{2}$' then
    raise exception 'Período do OPR deve ser YYYY-MM, recebido: %', p_periodo
      using errcode = '22023';
  end if;

  v_ano := split_part(p_periodo, '-', 1)::int;

  select coalesce(jsonb_agg(x order by x->>'titulo'), '[]'::jsonb) into v_okrs
  from (
    select jsonb_build_object(
      'okr_id', o.id,
      'titulo', o.titulo,
      'nivel', o.nivel,
      'total_krs', count(k.id),
      'atingimento', round(
        sum(app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) * k.peso)
          filter (where app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) is not null)
        / nullif(sum(k.peso) filter (
            where app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) is not null), 0), 4),
      'farol', app.farol_por_ritmo(
        sum(app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) * k.peso)
          filter (where app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) is not null)
        / nullif(sum(k.peso) filter (
            where app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) is not null), 0),
        o.ano, o.trimestre)
    ) as x
    from app.okrs o
    left join app.key_results k on k.okr_id = o.id
    where o.area_id = p_area_id and o.ano = v_ano
    group by o.id, o.titulo, o.nivel, o.ano, o.trimestre
  ) t;

  select coalesce(jsonb_agg(x order by x->>'nome'), '[]'::jsonb) into v_indicadores
  from (
    select jsonb_build_object(
      'indicador_id', i.id,
      'nome', i.nome,
      'tipo', i.tipo,
      'unidade', i.unidade,
      'meta', i.meta,
      'ultimo_valor', (
        select m.valor from app.indicador_medicoes m
        where m.indicador_id = i.id
          and to_char(m.data, 'YYYY-MM') <= p_periodo
        order by m.data desc, m.id desc limit 1),
      'ultima_medicao', (
        select m.data from app.indicador_medicoes m
        where m.indicador_id = i.id
          and to_char(m.data, 'YYYY-MM') <= p_periodo
        order by m.data desc, m.id desc limit 1)
    ) as x
    from app.indicadores_processo i
    join app.processos pr on pr.id = i.processo_id
    where pr.area_id = p_area_id
  ) t;

  select coalesce(jsonb_agg(x order by x->>'nome'), '[]'::jsonb) into v_projetos
  from (
    select jsonb_build_object(
      'projeto_id', p.id, 'nome', p.nome, 'status', p.status,
      'progresso_pct', p.progresso_pct, 'termino_previsto', p.termino_previsto,
      'atrasado', (p.termino_previsto is not null
                   and p.termino_previsto < current_date
                   and p.status not in ('concluido','cancelado'))
    ) as x
    from app.projetos p
    where p.area_id = p_area_id and p.status not in ('cancelado')
  ) t;

  select coalesce(jsonb_agg(x order by x->>'nome'), '[]'::jsonb) into v_melhorias
  from (
    select jsonb_build_object(
      'melhoria_id', m.id, 'nome', m.nome, 'fase_atual', m.fase_atual,
      'ganho_estimado', m.ganho_estimado, 'ganho_realizado', m.ganho_realizado
    ) as x
    from app.projetos_melhoria m
    left join app.processos pr on pr.id = m.processo_id
    where coalesce(m.area_id, pr.area_id) = p_area_id
      and m.status not in ('cancelado')
  ) t;

  return jsonb_build_object(
    'area_id', p_area_id,
    'area_nome', v_area_nome,
    'periodo', p_periodo,
    'gerado_em', now(),
    'okr_resumo', v_okrs,
    'indicadores', v_indicadores,
    'projetos', v_projetos,
    'melhorias', v_melhorias
  );
end;
$fn$;

create or replace function app.opr_publicar(p_opr_id uuid)
returns app.opr
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_company uuid;
  v_row app.opr;
begin
  select company_id into v_company from app.opr where id = p_opr_id;
  if v_company is null then
    raise exception 'OPR inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_company)
          or app.has_permission(auth.uid(), v_company, 'opr.publish')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  update app.opr
     set status = 'publicado', publicado_em = now()
   where id = p_opr_id
   returning * into v_row;
  return v_row;
end;
$fn$;

create or replace function app.bonus_aplicar_regua(p_regua jsonb, p_atingimento numeric)
returns numeric
language sql immutable as $$
  select case
    when p_atingimento is null then null
    when p_regua is null or jsonb_typeof(p_regua) <> 'array'
      or jsonb_array_length(p_regua) = 0 then null
    else coalesce(
      (select (f->>'paga')::numeric
       from jsonb_array_elements(p_regua) f
       where p_atingimento <= (f->>'ate')::numeric
       order by (f->>'ate')::numeric
       limit 1),
      (select (f->>'paga')::numeric
       from jsonb_array_elements(p_regua) f
       order by (f->>'ate')::numeric desc
       limit 1))
  end;
$$;

create or replace function app.bonus_apurar(
  p_company uuid,
  p_periodo text,
  p_ebitda_pct numeric default null,
  p_faturamento_pct numeric default null)
returns table (
  escopo text,
  referencia text,
  componente text,
  atingimento_pct numeric,
  peso numeric,
  resultado_pct numeric
)
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_ano int;
  v_cfg app.bonus_config;
  v_peso_global numeric;
  v_peso_setorial numeric;
  v_peso_individual numeric;
  v_peso_ebitda numeric;
  v_peso_fat numeric;
begin
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), p_company)
          or app.has_permission(auth.uid(), p_company, 'bonus.config')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_periodo !~ '^\d{4}(-\d{2})?$' then
    raise exception 'Período deve ser YYYY ou YYYY-MM, recebido: %', p_periodo
      using errcode = '22023';
  end if;

  set local statement_timeout to '120s';

  v_ano := split_part(p_periodo, '-', 1)::int;

  select * into v_cfg from app.bonus_config c
  where c.company_id = p_company and c.ano = v_ano;
  if v_cfg.id is null then
    raise exception 'Não existe configuração de bônus para % em %', p_company, v_ano
      using errcode = 'P0002';
  end if;

  v_peso_global     := coalesce((v_cfg.pesos->>'global')::numeric, 0.7);
  v_peso_setorial   := coalesce((v_cfg.pesos->>'setorial')::numeric, 0.2);
  v_peso_individual := coalesce((v_cfg.pesos->>'individual')::numeric, 0.1);
  v_peso_ebitda     := coalesce((v_cfg.pesos->>'ebitda')::numeric, 0.7);
  v_peso_fat        := coalesce((v_cfg.pesos->>'faturamento')::numeric, 0.3);

  delete from app.bonus_apuracao a
  where a.company_id = p_company and a.periodo = p_periodo;

  if p_ebitda_pct is not null then
    insert into app.bonus_apuracao (
      company_id, escopo, periodo, componente, atingimento_pct, peso, resultado_pct)
    values (
      p_company, 'global', p_periodo, 'ebitda', p_ebitda_pct,
      v_peso_global * v_peso_ebitda,
      round(coalesce(app.bonus_aplicar_regua(v_cfg.reguas->'ebitda', p_ebitda_pct), 0)
            * v_peso_global * v_peso_ebitda, 4));
  end if;

  if p_faturamento_pct is not null then
    insert into app.bonus_apuracao (
      company_id, escopo, periodo, componente, atingimento_pct, peso, resultado_pct)
    values (
      p_company, 'global', p_periodo, 'faturamento', p_faturamento_pct,
      v_peso_global * v_peso_fat,
      round(coalesce(app.bonus_aplicar_regua(v_cfg.reguas->'faturamento', p_faturamento_pct), 0)
            * v_peso_global * v_peso_fat, 4));
  end if;

  insert into app.bonus_apuracao (
    company_id, escopo, area_id, periodo, componente, atingimento_pct, peso, resultado_pct)
  select p_company, 'area', k.area_id, p_periodo, 'kit',
         k.percentual, v_peso_setorial,
         round(k.percentual * v_peso_setorial / 100.0, 4)
  from app.kit_matriz(p_company, p_periodo) k;

  insert into app.bonus_apuracao (
    company_id, escopo, periodo, componente, atingimento_pct, peso, resultado_pct)
  values (p_company, 'individual', p_periodo, 'assiduidade', null, v_peso_individual, null);

  return query
  select a.escopo,
         coalesce(ar.nome, a.user_id::text, 'empresa'),
         a.componente, a.atingimento_pct, a.peso, a.resultado_pct
  from app.bonus_apuracao a
  left join app.areas ar on ar.id = a.area_id
  where a.company_id = p_company and a.periodo = p_periodo
  order by a.escopo, 2, a.componente;
end;
$fn$;

revoke all on function app.kit_matriz(uuid, text) from public, anon;
revoke all on function app.kit_congelar(uuid, text) from public, anon;
revoke all on function app.opr_montar(uuid, text) from public, anon;
revoke all on function app.opr_publicar(uuid) from public, anon;
revoke all on function app.bonus_aplicar_regua(jsonb, numeric) from public, anon;
revoke all on function app.bonus_apurar(uuid, text, numeric, numeric) from public, anon;

grant execute on function app.kit_matriz(uuid, text) to authenticated;
grant execute on function app.kit_congelar(uuid, text) to authenticated;
grant execute on function app.opr_montar(uuid, text) to authenticated;
grant execute on function app.opr_publicar(uuid) to authenticated;
grant execute on function app.bonus_aplicar_regua(jsonb, numeric) to authenticated;
grant execute on function app.bonus_apurar(uuid, text, numeric, numeric) to authenticated;

alter function app.kit_matriz(uuid, text) set statement_timeout to '120s';
alter function app.bonus_apurar(uuid, text, numeric, numeric) set statement_timeout to '120s';
