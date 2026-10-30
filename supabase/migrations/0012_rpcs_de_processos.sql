-- 0012: Funções de processos e DMAIC.

create or replace function app.processo_indicadores(
  p_processo_id uuid,
  p_de date default null,
  p_ate date default null,
  p_grao text default 'mes')
returns table (
  indicador_id uuid,
  indicador_nome text,
  tipo text,
  unidade text,
  meta numeric,
  baseline numeric,
  periodo date,
  valor numeric,
  medicoes bigint
)

language plpgsql security definer set search_path = app, public as $fn$
declare
  v_company uuid;
  v_de date := coalesce(p_de, (current_date - interval '12 months')::date);
  v_ate date := coalesce(p_ate, current_date);
begin
  select company_id into v_company from app.processos where id = p_processo_id;
  if v_company is null then
    raise exception 'Processo inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), v_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_grao not in ('dia','semana','mes','trimestre') then
    raise exception 'Grão inválido: %', p_grao using errcode = '22023';
  end if;

  set local statement_timeout to '120s';

  return query
  select
    i.id,
    i.nome,
    i.tipo,
    i.unidade,
    i.meta,
    i.baseline,
    date_trunc(
      case p_grao when 'dia' then 'day' when 'semana' then 'week'
                  when 'trimestre' then 'quarter' else 'month' end,
      m.data)::date,
    round(avg(m.valor), 4),
    count(*)::bigint
  from app.indicadores_processo i
  left join app.indicador_medicoes m
    on m.indicador_id = i.id and m.data between v_de and v_ate
  where i.processo_id = p_processo_id
  group by i.id, i.nome, i.tipo, i.unidade, i.meta, i.baseline,
           date_trunc(
             case p_grao when 'dia' then 'day' when 'semana' then 'week'
                         when 'trimestre' then 'quarter' else 'month' end,
             m.data)
  order by i.tipo, i.nome, 7 nulls first;
end;
$fn$;

drop function if exists app.melhoria_avancar_fase(uuid, text);

create or replace function app.melhoria_avancar_fase(
  p_id uuid,
  p_fase text,
  p_entregaveis jsonb default null)
returns app.projetos_melhoria
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_m app.projetos_melhoria;
  v_row app.projetos_melhoria;
  v_ordem text[] := array['define','measure','analyze','improve','control','concluido'];
  v_pos_atual int;
  v_pos_nova int;
  v_anterior text;
  v_anterior_ok boolean;
begin
  select * into v_m from app.projetos_melhoria where id = p_id;
  if v_m.id is null then
    raise exception 'Projeto de melhoria inexistente' using errcode = 'P0002';
  end if;

  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_m.company_id)
          or v_m.belt_user_id = auth.uid()
          or app.has_permission(auth.uid(), v_m.company_id, 'melhoria.edit')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  v_pos_atual := array_position(v_ordem, v_m.fase_atual);
  v_pos_nova  := array_position(v_ordem, p_fase);
  if v_pos_nova is null then
    raise exception 'Fase inválida: %', p_fase using errcode = '22023';
  end if;

  if v_pos_nova > v_pos_atual then
    if v_pos_nova > v_pos_atual + 1 then
      raise exception 'Não dá para pular fase: de % para %', v_m.fase_atual, p_fase
        using errcode = '22023';
    end if;

    if v_m.metodo = 'dmaic' then
      v_anterior := v_ordem[v_pos_nova - 1];
      select coalesce(bool_or(e.status = 'concluido'), false) into v_anterior_ok
      from app.dmaic_etapas e
      where e.projeto_melhoria_id = p_id and e.fase = v_anterior;

      if not v_anterior_ok then
        raise exception
          'O tollgate da fase % ainda não foi concluído. Conclua antes de avançar para %.',
          v_anterior, p_fase
          using errcode = '22023';
      end if;
    end if;
  end if;

  if p_fase <> 'concluido' then
    insert into app.dmaic_etapas (company_id, projeto_melhoria_id, fase, entregaveis, status)
    values (v_m.company_id, p_id, p_fase, coalesce(p_entregaveis, '[]'::jsonb), 'em_andamento')
    on conflict (projeto_melhoria_id, fase) do update
      set status = case when app.dmaic_etapas.status = 'concluido'
                        then 'concluido' else 'em_andamento' end,
          entregaveis = coalesce(p_entregaveis, app.dmaic_etapas.entregaveis);
  end if;

  update app.projetos_melhoria
     set fase_atual = p_fase,
         status = case when p_fase = 'concluido' then 'concluido' else status end,

         ganho_realizado = case
           when v_pos_nova < array_position(v_ordem, 'control') then null
           else ganho_realizado
         end
   where id = p_id
   returning * into v_row;

  return v_row;
end;
$fn$;

create or replace function app.dmaic_concluir_tollgate(
  p_melhoria_id uuid, p_fase text, p_entregaveis jsonb default null)
returns app.dmaic_etapas
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_company uuid;
  v_belt uuid;
  v_row app.dmaic_etapas;
begin
  select m.company_id, m.belt_user_id into v_company, v_belt
  from app.projetos_melhoria m where m.id = p_melhoria_id;
  if v_company is null then
    raise exception 'Projeto de melhoria inexistente' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_company)
          or v_belt = auth.uid()
          or app.has_permission(auth.uid(), v_company, 'melhoria.edit')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_fase not in ('define','measure','analyze','improve','control') then
    raise exception 'Fase inválida: %', p_fase using errcode = '22023';
  end if;

  insert into app.dmaic_etapas (
    company_id, projeto_melhoria_id, fase, entregaveis, status, data_conclusao, aprovado_por)
  values (
    v_company, p_melhoria_id, p_fase, coalesce(p_entregaveis, '[]'::jsonb),
    'concluido', current_date, auth.uid())
  on conflict (projeto_melhoria_id, fase) do update
    set status = 'concluido',
        data_conclusao = current_date,
        aprovado_por = auth.uid(),
        entregaveis = coalesce(p_entregaveis, app.dmaic_etapas.entregaveis)
  returning * into v_row;

  return v_row;
end;
$fn$;

create or replace function app.processos_inventario(
  p_company uuid, p_area_id uuid default null)
returns table (
  id uuid,
  nome text,
  tipo text,
  status text,
  nivel_maturidade int,
  area_id uuid,
  area_nome text,
  dono_user_id uuid,
  dono_nome text,
  tem_sipoc boolean,
  indicadores_y int,
  indicadores_x int,
  melhorias_ativas int,
  ganho_realizado numeric,
  pronto_para_dmaic boolean
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
    pr.id, pr.nome, pr.tipo, pr.status, pr.nivel_maturidade,
    pr.area_id, ar.nome,
    pr.dono_user_id, pf.nome,
    (s.processo_id is not null),
    coalesce(ind.qtd_y, 0)::int,
    coalesce(ind.qtd_x, 0)::int,
    coalesce(mel.ativas, 0)::int,
    mel.ganho,

    (s.processo_id is not null and coalesce(ind.qtd_y, 0) > 0)
  from app.processos pr
  left join app.areas ar on ar.id = pr.area_id
  left join app.profiles pf on pf.user_id = pr.dono_user_id
  left join app.processo_sipoc s on s.processo_id = pr.id
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
  order by ar.nome nulls last, pr.nome, pr.id;
end;
$fn$;

create or replace function app.melhorias_quadro(
  p_company uuid, p_processo_id uuid default null)
returns table (
  id uuid,
  nome text,
  metodo text,
  fase_atual text,
  status text,
  processo_id uuid,
  processo_nome text,
  area_nome text,
  belt_user_id uuid,
  belt_nome text,
  problema text,
  meta_smart text,
  ganho_estimado numeric,
  ganho_realizado numeric,
  termino_previsto date,
  tollgates_concluidos int,
  fases_concluidas text[]
)
language plpgsql stable security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  select
    m.id, m.nome, m.metodo, m.fase_atual, m.status,
    m.processo_id, pr.nome, ar.nome,
    m.belt_user_id, pf.nome,
    m.problema, m.meta_smart, m.ganho_estimado, m.ganho_realizado,
    m.termino_previsto,
    coalesce(tg.qtd, 0)::int,
    coalesce(tg.fases, array[]::text[])
  from app.projetos_melhoria m
  left join app.processos pr on pr.id = m.processo_id
  left join app.areas ar on ar.id = coalesce(m.area_id, pr.area_id)
  left join app.profiles pf on pf.user_id = m.belt_user_id
  left join lateral (
    select count(*) as qtd, array_agg(e.fase order by e.fase) as fases
    from app.dmaic_etapas e
    where e.projeto_melhoria_id = m.id and e.status = 'concluido'
  ) tg on true
  where m.company_id = p_company
    and (p_processo_id is null or m.processo_id = p_processo_id)
  order by m.fase_atual, m.nome, m.id;
end;
$fn$;

revoke all on function app.processo_indicadores(uuid, date, date, text) from public, anon;
revoke all on function app.melhoria_avancar_fase(uuid, text, jsonb) from public, anon;
revoke all on function app.dmaic_concluir_tollgate(uuid, text, jsonb) from public, anon;
revoke all on function app.processos_inventario(uuid, uuid) from public, anon;
revoke all on function app.melhorias_quadro(uuid, uuid) from public, anon;

grant execute on function app.processo_indicadores(uuid, date, date, text) to authenticated;
grant execute on function app.melhoria_avancar_fase(uuid, text, jsonb) to authenticated;
grant execute on function app.dmaic_concluir_tollgate(uuid, text, jsonb) to authenticated;
grant execute on function app.processos_inventario(uuid, uuid) to authenticated;
grant execute on function app.melhorias_quadro(uuid, uuid) to authenticated;

alter function app.processo_indicadores(uuid, date, date, text) set statement_timeout to '120s';
alter function app.processos_inventario(uuid, uuid) set statement_timeout to '120s';
