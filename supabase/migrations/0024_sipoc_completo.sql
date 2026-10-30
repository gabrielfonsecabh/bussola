-- 0024: SIPOC conta como feito só com as quatro pontas preenchidas.

drop function if exists app.processos_inventario(uuid, uuid, text);

create or replace function app.processos_inventario(
  p_company uuid,
  p_area_id uuid default null,
  p_categoria text default null)
returns table (
  id uuid, nome text, tipo text, status text, nivel_maturidade integer,
  area_id uuid, area_nome text, dono_user_id uuid, dono_nome text,
  tem_sipoc boolean, indicadores_y integer, indicadores_x integer,
  melhorias_ativas integer, ganho_realizado numeric, pronto_para_dmaic boolean,
  categoria text, periodicidade text, periodicidade_origem text,
  prazo_referencia text, pendencia_de_mapeamento text, origem_do_registro text,

  sipoc_iniciado boolean)
language plpgsql security definer
set search_path to 'app', 'public' set statement_timeout to '120s'
as $function$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  set local statement_timeout to '120s';

  return query
  with sipoc as (
    select s.processo_id,
           coalesce(nullif(trim(s.suppliers), ''), '') <> ''
       and coalesce(nullif(trim(s.inputs), ''), '') <> ''
       and coalesce(nullif(trim(s.outputs), ''), '') <> ''
       and coalesce(nullif(trim(s.customers), ''), '') <> '' as completo
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

revoke all on function app.processos_inventario(uuid, uuid, text) from public, anon;
grant execute on function app.processos_inventario(uuid, uuid, text) to authenticated;
