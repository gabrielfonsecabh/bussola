-- 0014: Funções dos painéis executivo, de área e de comitê.

create or replace function app.painel_executivo(p_company uuid, p_ano int)
returns jsonb

language plpgsql security definer set search_path = app, public as $fn$
declare
  v_okr jsonb;
  v_perspectivas jsonb;
  v_projetos jsonb;
  v_processos jsonb;
  v_kit jsonb;
  v_estrela jsonb;
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  set local statement_timeout to '120s';

  with okr_farol as (
    select o.id, o.perspectiva_id,
           app.farol_por_ritmo(
             sum(app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) * k.peso)
               filter (where app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) is not null)
             / nullif(sum(k.peso) filter (
                 where app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) is not null), 0),
             o.ano, o.trimestre) as farol
    from app.okrs o
    left join app.key_results k on k.okr_id = o.id
    where o.company_id = p_company and o.ano = p_ano and o.status <> 'cancelado'
    group by o.id, o.perspectiva_id, o.ano, o.trimestre
  )
  select jsonb_build_object(
    'total', count(*),
    'verde', count(*) filter (where farol = 'verde'),
    'amarelo', count(*) filter (where farol = 'amarelo'),
    'vermelho', count(*) filter (where farol = 'vermelho'),
    'sem_dado', count(*) filter (where farol = 'cinza')
  ) into v_okr
  from okr_farol;

  select coalesce(jsonb_agg(x order by x->>'ordem'), '[]'::jsonb) into v_perspectivas
  from (
    select jsonb_build_object(
      'perspectiva_id', pe.id,
      'chave', pe.chave,
      'nome', pe.nome,
      'ordem', pe.ordem,
      'objetivos', (select count(*) from app.objetivos_estrategicos oe
                     where oe.perspectiva_id = pe.id),
      'okrs', (select count(*) from app.okrs o
                where o.perspectiva_id = pe.id and o.ano = p_ano),
      'atingimento', (
        select round(
          sum(app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) * k.peso)
            filter (where app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) is not null)
          / nullif(sum(k.peso) filter (
              where app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) is not null), 0), 4)
        from app.okrs o
        join app.key_results k on k.okr_id = o.id
        where o.perspectiva_id = pe.id and o.ano = p_ano)
    ) as x
    from app.perspectivas pe
    where pe.company_id = p_company
  ) t;

  select jsonb_build_object(
    'total', count(*),
    'em_andamento', count(*) filter (where status = 'em_andamento'),
    'concluidos', count(*) filter (where status = 'concluido'),
    'atrasados', count(*) filter (
      where termino_previsto is not null and termino_previsto < current_date
        and status not in ('concluido','cancelado')),
    'orfaos', count(*) filter (
      where responsavel_user_id is null or termino_previsto is null),
    'progresso_medio', round(avg(progresso_pct), 1),
    'iniciativas_ia', count(*) filter (where categoria = 'ia')
  ) into v_projetos
  from app.projetos where company_id = p_company;

  select jsonb_build_object(
    'processos', (select count(*) from app.processos where company_id = p_company),
    'com_sipoc', (select count(*) from app.processos pr
                   join app.processo_sipoc s on s.processo_id = pr.id
                   where pr.company_id = p_company),
    'melhorias_ativas', (select count(*) from app.projetos_melhoria
                          where company_id = p_company and status = 'em_andamento'),
    'ganho_estimado', (select sum(ganho_estimado) from app.projetos_melhoria
                        where company_id = p_company),
    'ganho_realizado', (select sum(ganho_realizado) from app.projetos_melhoria
                         where company_id = p_company)
  ) into v_processos;

  select jsonb_build_object(
    'areas', count(*),
    'em_dia', count(*) filter (where percentual = 100),
    'parcial', count(*) filter (where percentual > 0 and percentual < 100),
    'pendente', count(*) filter (where percentual = 0),
    'percentual_medio', round(avg(percentual), 0)
  ) into v_kit
  from app.kit_matriz(p_company, to_char(current_date, 'YYYY-MM'));

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_estrela
  from (
    select jsonb_build_object(
      'objetivo_id', oe.id,
      'titulo', oe.titulo,
      'okr_id', o.id,
      'kr_id', k.id,
      'kr_descricao', k.descricao,
      'unidade', k.unidade,
      'baseline', k.baseline,
      'meta', k.meta,
      'atual', k.atual,
      'atingimento', app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao),
      'farol', app.farol_por_ritmo(
        app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao), o.ano, o.trimestre)
    ) as x
    from app.objetivos_estrategicos oe
    left join app.okrs o
      on o.objetivo_estrategico_id = oe.id and o.ano = p_ano
    left join app.key_results k on k.okr_id = o.id
    where oe.company_id = p_company and oe.is_estrela_do_norte
  ) t;

  return jsonb_build_object(
    'ano', p_ano,
    'gerado_em', now(),
    'okr', v_okr,
    'perspectivas', v_perspectivas,
    'projetos', v_projetos,
    'processos', v_processos,
    'kit', v_kit,
    'estrela_do_norte', v_estrela
  );
end;
$fn$;

create or replace function app.painel_areas(p_company uuid, p_ano int)
returns table (
  area_id uuid,
  area_nome text,
  area_tipo text,
  parent_area_id uuid,
  responsavel_nome text,
  okrs int,
  krs int,
  atingimento numeric,
  farol text,
  projetos int,
  projetos_atrasados int,
  atividades_abertas int,
  processos int,
  melhorias_ativas int,
  kit_percentual numeric
)

language plpgsql security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  set local statement_timeout to '120s';

  return query

  with kit as materialized (
    select km.area_id, km.percentual
    from app.kit_matriz(p_company, to_char(current_date, 'YYYY-MM')) km
  )
  select
    a.id, a.nome, a.tipo, a.parent_area_id, pf.nome,
    coalesce(o.qtd_okrs, 0)::int,
    coalesce(o.qtd_krs, 0)::int,
    round(o.atingimento, 4),
    app.farol_por_ritmo(o.atingimento, p_ano, null),
    coalesce(pj.qtd, 0)::int,
    coalesce(pj.atrasados, 0)::int,
    coalesce(at.abertas, 0)::int,
    coalesce(pr.qtd, 0)::int,
    coalesce(me.ativas, 0)::int,
    k.percentual
  from app.areas a
  left join app.profiles pf on pf.user_id = a.responsavel_user_id
  left join lateral (
    select count(distinct ok.id) as qtd_okrs,
           count(kr.id) as qtd_krs,
           sum(app.kr_atingimento(kr.baseline, kr.meta, kr.atual, kr.direcao) * kr.peso)
             filter (where app.kr_atingimento(kr.baseline, kr.meta, kr.atual, kr.direcao) is not null)
           / nullif(sum(kr.peso) filter (
               where app.kr_atingimento(kr.baseline, kr.meta, kr.atual, kr.direcao) is not null), 0)
             as atingimento
    from app.okrs ok
    left join app.key_results kr on kr.okr_id = ok.id
    where ok.area_id = a.id and ok.ano = p_ano and ok.status <> 'cancelado'
  ) o on true
  left join lateral (
    select count(*) as qtd,
           count(*) filter (
             where p.termino_previsto is not null and p.termino_previsto < current_date
               and p.status not in ('concluido','cancelado')) as atrasados
    from app.projetos p where p.area_id = a.id
  ) pj on true
  left join lateral (
    select count(*) as abertas from app.atividades ativ
    where ativ.area_id = a.id and ativ.status <> 'concluido'
  ) at on true
  left join lateral (
    select count(*) as qtd from app.processos p2 where p2.area_id = a.id
  ) pr on true
  left join lateral (
    select count(*) as ativas from app.projetos_melhoria m
    left join app.processos p3 on p3.id = m.processo_id
    where coalesce(m.area_id, p3.area_id) = a.id and m.status = 'em_andamento'
  ) me on true
  left join kit k on k.area_id = a.id
  where a.company_id = p_company
  order by a.tipo, a.nome, a.id;
end;
$fn$;

create or replace function app.painel_comite(p_area_id uuid, p_ano int)
returns jsonb
language plpgsql stable security definer set search_path = app, public as $fn$
declare
  v_company uuid;
  v_nome text;
  v_tipo text;
begin
  select a.company_id, a.nome, a.tipo into v_company, v_nome, v_tipo
  from app.areas a where a.id = p_area_id;
  if v_company is null then
    raise exception 'Comitê inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), v_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'area_id', p_area_id,
    'nome', v_nome,
    'tipo', v_tipo,
    'ano', p_ano,
    'okrs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'titulo', o.titulo, 'nivel', o.nivel, 'status', o.status)
        order by o.titulo)
      from app.okrs o where o.area_id = p_area_id and o.ano = p_ano), '[]'::jsonb),
    'projetos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'status', p.status,
        'progresso_pct', p.progresso_pct, 'termino_previsto', p.termino_previsto)
        order by p.nome)
      from app.projetos p
      where p.area_id = p_area_id or p.categoria = 'comite'), '[]'::jsonb),
    'processos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'nome', pr.nome, 'nivel_maturidade', pr.nivel_maturidade)
        order by pr.nome)
      from app.processos pr where pr.area_id = p_area_id), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function app.painel_executivo(uuid, int) from public, anon;
revoke all on function app.painel_areas(uuid, int) from public, anon;
revoke all on function app.painel_comite(uuid, int) from public, anon;

grant execute on function app.painel_executivo(uuid, int) to authenticated;
grant execute on function app.painel_areas(uuid, int) to authenticated;
grant execute on function app.painel_comite(uuid, int) to authenticated;

alter function app.painel_executivo(uuid, int) set statement_timeout to '120s';
alter function app.painel_areas(uuid, int) set statement_timeout to '120s';
