-- 0036: Árvore de OKR com uma linha por OKR mesmo com filtro de área.

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

            and not exists (
              select 1
                from app.okrs pai
               where pai.id = o.parent_okr_id
                 and pai.company_id = p_company
                 and pai.ano = p_ano
                 and pai.area_id in (select s2.area_id from app.subarvore_de_area(p_area_id) s2)
            )
          else o.parent_okr_id is null
        end
      )
  ),
  arvore as (
    select o.id, o.parent_okr_id, 0 as profundidade, array[o.id] as caminho,
           array[o.titulo || ' ' || o.id::text] as ordem
    from app.okrs o
    join raizes r on r.id = o.id

    union all

    select f.id, f.parent_okr_id, a.profundidade + 1, a.caminho || f.id,
           a.ordem || (f.titulo || ' ' || f.id::text)
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
      and f.ano = p_ano
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
  order by a.ordem;
end;
$function$;

revoke all on function app.okr_arvore(uuid, integer, uuid) from public, anon;
grant execute on function app.okr_arvore(uuid, integer, uuid) to authenticated;
