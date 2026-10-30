-- 0037: Canvas de OKR: grafo de vínculos e pendências.

alter table app.companies
  add column if not exists dias_para_checkin_atrasado int not null default 30
  check (dias_para_checkin_atrasado between 1 and 365);

create or replace function app.okr_nivel_aceita_pai(p_nivel_filho text, p_nivel_pai text)
 returns boolean
 language sql
 immutable
as $function$
  select case p_nivel_filho
    when 'diretoria'  then p_nivel_pai = 'corporativo'
    when 'gerencia'   then p_nivel_pai = 'diretoria'
    when 'individual' then p_nivel_pai in ('gerencia', 'diretoria')
    else false
  end;
$function$;

revoke all on function app.okr_nivel_aceita_pai(text, text) from public, anon;
grant execute on function app.okr_nivel_aceita_pai(text, text) to authenticated;

create or replace function app.okrs_valida_pai()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'app', 'public'
as $function$
declare
  v_pai app.okrs;
  v_cursor uuid;
  v_passos int := 0;
begin
  if new.parent_okr_id is null then
    return new;
  end if;
  if new.parent_okr_id = new.id then
    raise exception 'Um OKR não pode ser pai de si mesmo' using errcode = '22023';
  end if;

  select * into v_pai from app.okrs o where o.id = new.parent_okr_id;
  if v_pai.id is null then
    raise exception 'OKR pai inexistente' using errcode = 'P0002';
  end if;
  if v_pai.company_id <> new.company_id then
    raise exception 'O OKR pai é de outra empresa' using errcode = '42501';
  end if;
  if v_pai.ano <> new.ano then
    raise exception 'O OKR pai é de outro ano (%). Um desdobramento fica dentro do mesmo ciclo.', v_pai.ano
      using errcode = '22023';
  end if;

  v_cursor := v_pai.parent_okr_id;
  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'Isso criaria um ciclo: "%" já está abaixo deste OKR', v_pai.titulo
        using errcode = '22023';
    end if;
    select o.parent_okr_id into v_cursor from app.okrs o where o.id = v_cursor;
    v_passos := v_passos + 1;
    if v_passos > 100 then
      raise exception 'Cadeia de pais longa demais' using errcode = '22023';
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function app.okrs_valida_pai() from public, anon;
grant execute on function app.okrs_valida_pai() to authenticated;

drop trigger if exists trg_okrs_valida_pai on app.okrs;
create trigger trg_okrs_valida_pai
  before insert or update of parent_okr_id on app.okrs
  for each row execute function app.okrs_valida_pai();

create or replace function app.okr_vincular(p_okr_id uuid, p_parent_okr_id uuid default null, p_objetivo_id uuid default null)
 returns app.okrs
 language plpgsql
 security definer
 set search_path to 'app', 'public'
as $function$
declare
  v_okr app.okrs;
  v_pai app.okrs;
  v_obj app.objetivos_estrategicos;
  v_objetivo uuid;
  v_perspectiva uuid;
  v_novo app.okrs;
begin
  select * into v_okr from app.okrs o where o.id = p_okr_id;
  if v_okr.id is null then
    raise exception 'OKR inexistente' using errcode = 'P0002';
  end if;

  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_okr.company_id)
          or coalesce(v_okr.owner_user_id = auth.uid(), false)
          or app.has_permission(auth.uid(), v_okr.company_id, 'okr.edit')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if v_okr.nivel = 'corporativo' and p_parent_okr_id is not null then
    raise exception 'Um OKR corporativo não tem pai: ele liga direto a um objetivo estratégico'
      using errcode = '22023';
  end if;
  if v_okr.nivel <> 'corporativo' and p_objetivo_id is not null then
    raise exception 'Só um OKR corporativo liga direto a um objetivo estratégico; os demais herdam pelo pai'
      using errcode = '22023';
  end if;

  v_objetivo := v_okr.objetivo_estrategico_id;
  v_perspectiva := v_okr.perspectiva_id;

  if p_parent_okr_id is not null then
    select * into v_pai from app.okrs o where o.id = p_parent_okr_id;
    if v_pai.id is null then
      raise exception 'OKR pai inexistente' using errcode = 'P0002';
    end if;
    if v_pai.company_id <> v_okr.company_id then
      raise exception 'O OKR pai é de outra empresa' using errcode = '42501';
    end if;
    if not app.okr_nivel_aceita_pai(v_okr.nivel, v_pai.nivel) then
      raise exception 'Um OKR de % não liga a um OKR de %', v_okr.nivel, v_pai.nivel
        using errcode = '22023';
    end if;

    v_objetivo := coalesce(v_pai.objetivo_estrategico_id, v_objetivo);
    v_perspectiva := coalesce(v_pai.perspectiva_id, v_perspectiva);
  end if;

  if v_okr.nivel = 'corporativo' then
    v_objetivo := p_objetivo_id;
    if p_objetivo_id is not null then
      select * into v_obj from app.objetivos_estrategicos oe where oe.id = p_objetivo_id;
      if v_obj.id is null then
        raise exception 'Objetivo estratégico inexistente' using errcode = 'P0002';
      end if;
      if v_obj.company_id <> v_okr.company_id then
        raise exception 'O objetivo estratégico é de outra empresa' using errcode = '42501';
      end if;
      v_perspectiva := coalesce(v_obj.perspectiva_id, v_perspectiva);
    end if;
  end if;

  update app.okrs o
     set parent_okr_id = p_parent_okr_id,
         objetivo_estrategico_id = v_objetivo,
         perspectiva_id = v_perspectiva
   where o.id = p_okr_id
  returning * into v_novo;

  with recursive abaixo as (
    select o.id from app.okrs o where o.parent_okr_id = p_okr_id
    union all
    select f.id from app.okrs f join abaixo a on f.parent_okr_id = a.id
  )
  update app.okrs o
     set objetivo_estrategico_id = v_objetivo,
         perspectiva_id = v_perspectiva
   where o.id in (select a.id from abaixo a);

  return v_novo;
end;
$function$;

revoke all on function app.okr_vincular(uuid, uuid, uuid) from public, anon;
grant execute on function app.okr_vincular(uuid, uuid, uuid) to authenticated;

create or replace function app.kr_mover(p_kr_id uuid, p_okr_destino uuid)
 returns app.key_results
 language plpgsql
 security definer
 set search_path to 'app', 'public'
as $function$
declare
  v_kr app.key_results;
  v_origem app.okrs;
  v_destino app.okrs;
  v_atg numeric;
  v_farol text;
begin
  select * into v_kr from app.key_results k where k.id = p_kr_id;
  if v_kr.id is null then
    raise exception 'KR inexistente' using errcode = 'P0002';
  end if;
  select * into v_origem from app.okrs o where o.id = v_kr.okr_id;
  select * into v_destino from app.okrs o where o.id = p_okr_destino;
  if v_destino.id is null then
    raise exception 'OKR de destino inexistente' using errcode = 'P0002';
  end if;
  if v_destino.company_id <> v_kr.company_id then
    raise exception 'O OKR de destino é de outra empresa' using errcode = '42501';
  end if;

  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_kr.company_id)
          or ((coalesce(v_origem.owner_user_id = auth.uid(), false)
               or app.has_permission(auth.uid(), v_kr.company_id, 'okr.edit'))
              and (coalesce(v_destino.owner_user_id = auth.uid(), false)
               or app.has_permission(auth.uid(), v_kr.company_id, 'okr.edit')))) then
    raise exception 'Sem permissão para mover este KR' using errcode = '42501';
  end if;

  if v_destino.id = v_origem.id then
    return v_kr;
  end if;

  if v_kr.tipo = 'marco' then
    v_farol := 'cinza';
  else
    v_atg := app.kr_atingimento(v_kr.baseline, v_kr.meta, v_kr.atual, v_kr.direcao);
    v_farol := app.farol_por_ritmo(v_atg, v_destino.ano, v_destino.trimestre);
  end if;

  update app.key_results k
     set okr_id = p_okr_destino, farol = v_farol
   where k.id = p_kr_id
  returning * into v_kr;

  return v_kr;
end;
$function$;

revoke all on function app.kr_mover(uuid, uuid) from public, anon;
grant execute on function app.kr_mover(uuid, uuid) to authenticated;

create or replace function app.okr_grafo(p_company uuid, p_ano integer, p_area_id uuid default null)
 returns table(
   tipo text, id uuid, titulo text, pendencias text[],
   perspectiva_id uuid, perspectiva_chave text, perspectiva_nome text, perspectiva_ordem integer, perspectiva_cor text,
   is_estrela_do_norte boolean, total_okrs integer,
   parent_okr_id uuid, objetivo_estrategico_id uuid, objetivo_titulo text,
   nivel text, status text, ano integer, trimestre integer,
   area_id uuid, area_nome text, owner_user_id uuid, owner_nome text,
   total_krs integer, atingimento numeric, farol text, ultimo_checkin date, krs jsonb)
 language plpgsql
 security definer
 set search_path to 'app', 'public'
 set statement_timeout to '120s'
as $function$
declare
  v_dias int;
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  set local statement_timeout to '120s';

  select c.dias_para_checkin_atrasado into v_dias from app.companies c where c.id = p_company;
  v_dias := coalesce(v_dias, 30);

  return query
  with recursive recorte as (
    select o.id
      from app.okrs o
     where o.company_id = p_company
       and o.ano = p_ano
       and (p_area_id is null
            or o.area_id in (select s.area_id from app.subarvore_de_area(p_area_id) s))
    union
    select f.parent_okr_id
      from recorte r
      join app.okrs f on f.id = r.id
     where f.parent_okr_id is not null
  ),
  kr as (
    select k.okr_id, k.id, k.descricao, k.tipo, k.direcao, k.unidade,
           k.baseline, k.meta, k.atual, k.peso, k.farol,
           app.kr_atingimento(k.baseline, k.meta, k.atual, k.direcao) as atg,
           ult.data as ultimo,
           array_remove(array[
             case when k.baseline is null then 'kr_sem_baseline' end,
             case when k.meta is null then 'kr_sem_meta' end,
             case when k.atual is null then 'kr_sem_atual' end,
             case when k.atual is not null
                   and coalesce(ult.data, date '0001-01-01') < current_date - v_dias
                  then 'checkin_atrasado' end
           ]::text[], null) as pend
      from app.key_results k
      left join lateral (
        select max(c.data) as data from app.kr_checkins c where c.key_result_id = k.id
      ) ult on true
     where k.okr_id in (select r.id from recorte r)
  ),
  medido as (
    select kr.okr_id,
           count(*)::int as total_krs,
           sum(kr.atg * kr.peso) filter (where kr.atg is not null)
             / nullif(sum(kr.peso) filter (where kr.atg is not null), 0) as atingimento,
           max(kr.ultimo) as ultimo_checkin,
           bool_or(kr.baseline is null) as f_sem_baseline,
           bool_or(kr.meta is null) as f_sem_meta,
           bool_or(kr.atual is null) as f_sem_atual,
           bool_or('checkin_atrasado' = any(kr.pend)) as f_checkin,
           jsonb_agg(jsonb_build_object(
             'id', kr.id, 'descricao', kr.descricao, 'tipo', kr.tipo, 'direcao', kr.direcao,
             'unidade', kr.unidade, 'baseline', kr.baseline, 'meta', kr.meta, 'atual', kr.atual,
             'peso', kr.peso, 'atingimento', round(kr.atg, 4), 'farol', kr.farol,
             'ultimo_checkin', kr.ultimo, 'pendencias', to_jsonb(kr.pend)
           ) order by kr.descricao, kr.id) as krs
      from kr
     group by kr.okr_id
  ),
  okr_linhas as (
    select o.id, o.titulo, o.parent_okr_id, o.objetivo_estrategico_id, oe.titulo as objetivo_titulo,
           o.nivel, o.status, o.ano, o.trimestre,
           o.area_id, ar.nome as area_nome, o.owner_user_id, pf.nome as owner_nome,
           pe.id as perspectiva_id, pe.chave, pe.nome as perspectiva_nome, pe.ordem, pe.cor_token,
           coalesce(m.total_krs, 0) as total_krs,
           round(m.atingimento, 4) as atingimento,
           app.farol_por_ritmo(m.atingimento, o.ano, o.trimestre) as farol,
           m.ultimo_checkin,
           coalesce(m.krs, '[]'::jsonb) as krs,
           array_remove(array[
             case when o.nivel <> 'corporativo' and o.parent_okr_id is null then 'sem_pai' end,
             case when o.nivel = 'corporativo' and o.objetivo_estrategico_id is null then 'sem_objetivo' end,
             case when o.owner_user_id is null then 'sem_dono' end,
             case when coalesce(m.total_krs, 0) = 0 then 'sem_kr' end,
             case when m.f_sem_baseline then 'kr_sem_baseline' end,
             case when m.f_sem_meta then 'kr_sem_meta' end,
             case when m.f_sem_atual then 'kr_sem_atual' end,
             case when m.f_checkin then 'checkin_atrasado' end,
             case when app.farol_por_ritmo(m.atingimento, o.ano, o.trimestre) = 'vermelho' then 'farol_vermelho' end,
             case when app.farol_por_ritmo(m.atingimento, o.ano, o.trimestre) = 'amarelo' then 'farol_amarelo' end
           ]::text[], null) as pendencias
      from app.okrs o
      join recorte r on r.id = o.id
      left join app.areas ar on ar.id = o.area_id
      left join app.profiles pf on pf.user_id = o.owner_user_id
      left join app.perspectivas pe on pe.id = o.perspectiva_id
      left join app.objetivos_estrategicos oe on oe.id = o.objetivo_estrategico_id
      left join medido m on m.okr_id = o.id
  ),
  objetivos as (
    select oe.id, oe.titulo, oe.is_estrela_do_norte,
           pe.id as perspectiva_id, pe.chave, pe.nome as perspectiva_nome, pe.ordem, pe.cor_token,
           (select count(*)::int from app.okrs o
             where o.objetivo_estrategico_id = oe.id and o.ano = p_ano) as total_okrs
      from app.objetivos_estrategicos oe
      left join app.perspectivas pe on pe.id = oe.perspectiva_id
     where oe.company_id = p_company
       and (p_area_id is null
            or exists (select 1 from okr_linhas ol where ol.objetivo_estrategico_id = oe.id))
  )
  select g.*
    from (
      select 'objetivo'::text as tipo, ob.id, ob.titulo,
             case when ob.total_okrs = 0 then array['sem_okr']::text[] else array[]::text[] end as pendencias,
             ob.perspectiva_id, ob.chave as perspectiva_chave, ob.perspectiva_nome,
             ob.ordem as perspectiva_ordem, ob.cor_token as perspectiva_cor,
             ob.is_estrela_do_norte, ob.total_okrs,
             null::uuid as parent_okr_id, null::uuid as objetivo_estrategico_id, null::text as objetivo_titulo,
             null::text as nivel, null::text as status, null::int as ano, null::int as trimestre,
             null::uuid as area_id, null::text as area_nome, null::uuid as owner_user_id, null::text as owner_nome,
             null::int as total_krs, null::numeric as atingimento, null::text as farol,
             null::date as ultimo_checkin, null::jsonb as krs
        from objetivos ob
      union all
      select 'okr'::text, ol.id, ol.titulo, ol.pendencias,
             ol.perspectiva_id, ol.chave, ol.perspectiva_nome, ol.ordem, ol.cor_token,
             null::boolean, null::int,
             ol.parent_okr_id, ol.objetivo_estrategico_id, ol.objetivo_titulo,
             ol.nivel, ol.status, ol.ano, ol.trimestre,
             ol.area_id, ol.area_nome, ol.owner_user_id, ol.owner_nome,
             ol.total_krs, ol.atingimento, ol.farol, ol.ultimo_checkin, ol.krs
        from okr_linhas ol
    ) g
   order by g.tipo,
            g.perspectiva_ordem nulls last,
            case g.nivel when 'corporativo' then 1 when 'diretoria' then 2 when 'gerencia' then 3 when 'individual' then 4 else 0 end,
            g.titulo, g.id;
end;
$function$;

revoke all on function app.okr_grafo(uuid, integer, uuid) from public, anon;
grant execute on function app.okr_grafo(uuid, integer, uuid) to authenticated;
