-- 0038: Gates de permissão tratam NULL como negado.

create or replace function app.okr_desdobrar(p_okr_id uuid, p_titulo text, p_area_id uuid DEFAULT NULL::uuid, p_owner_user_id uuid DEFAULT NULL::uuid, p_trimestre integer DEFAULT NULL::integer)
 returns app.okrs
 language plpgsql
 security definer
 set search_path to 'app', 'public'
as $function$
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
          or coalesce(v_pai.owner_user_id = auth.uid(), false)
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
$function$;

revoke all on function app.okr_desdobrar(uuid, text, uuid, uuid, integer) from public, anon;
grant execute on function app.okr_desdobrar(uuid, text, uuid, uuid, integer) to authenticated;

create or replace function app.atividade_mover(p_id uuid, p_status text, p_ordem integer DEFAULT NULL::integer, p_sprint_id uuid DEFAULT NULL::uuid, p_versao timestamp with time zone DEFAULT NULL::timestamp with time zone)
 returns app.atividades
 language plpgsql
 security definer
 set search_path to 'app', 'public'
as $function$
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
          or coalesce(v_atv.responsavel_user_id = auth.uid(), false)
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
$function$;

revoke all on function app.atividade_mover(uuid, text, integer, uuid, timestamptz) from public, anon;
grant execute on function app.atividade_mover(uuid, text, integer, uuid, timestamptz) to authenticated;

create or replace function app.melhoria_avancar_fase(p_id uuid, p_fase text, p_entregaveis jsonb DEFAULT NULL::jsonb)
 returns app.projetos_melhoria
 language plpgsql
 security definer
 set search_path to 'app', 'public'
as $function$
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
          or coalesce(v_m.belt_user_id = auth.uid(), false)
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
$function$;

revoke all on function app.melhoria_avancar_fase(uuid, text, jsonb) from public, anon;
grant execute on function app.melhoria_avancar_fase(uuid, text, jsonb) to authenticated;

create or replace function app.melhoria_dar_corpo(p_melhoria_id uuid)
 returns app.projetos
 language plpgsql
 security definer
 set search_path to 'app', 'public'
as $function$
declare
  v_m app.projetos_melhoria;
  v_p app.projetos;
begin
  select * into v_m from app.projetos_melhoria where id = p_melhoria_id;
  if v_m.id is null then
    raise exception 'Melhoria inexistente' using errcode = 'P0002';
  end if;

  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_m.company_id)
          or coalesce(v_m.belt_user_id = auth.uid(), false)
          or app.has_permission(auth.uid(), v_m.company_id, 'melhoria.edit')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if v_m.projeto_id is not null then
    select * into v_p from app.projetos where id = v_m.projeto_id;
    if v_p.id is not null then
      return v_p;
    end if;
  end if;

  insert into app.projetos (
    company_id, area_id, nome, descricao, categoria, tipo,
    responsavel_user_id, status, processo_id,
    inicio_previsto, termino_previsto)
  values (
    v_m.company_id, v_m.area_id, v_m.nome, v_m.problema, 'melhoria', 'projeto',
    v_m.belt_user_id,

    case when v_m.status in ('backlog','em_andamento','pausado','concluido','cancelado')
         then v_m.status else 'backlog' end,
    v_m.processo_id, v_m.inicio_previsto, v_m.termino_previsto)
  returning * into v_p;

  update app.projetos_melhoria set projeto_id = v_p.id where id = p_melhoria_id;
  return v_p;
end;
$function$;

revoke all on function app.melhoria_dar_corpo(uuid) from public, anon;
grant execute on function app.melhoria_dar_corpo(uuid) to authenticated;

create or replace function app.dmaic_concluir_tollgate(p_melhoria_id uuid, p_fase text, p_entregaveis jsonb DEFAULT NULL::jsonb)
 returns app.dmaic_etapas
 language plpgsql
 security definer
 set search_path to 'app', 'public'
as $function$
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
          or coalesce(v_belt = auth.uid(), false)
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
$function$;

revoke all on function app.dmaic_concluir_tollgate(uuid, text, jsonb) from public, anon;
grant execute on function app.dmaic_concluir_tollgate(uuid, text, jsonb) to authenticated;
