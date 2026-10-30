-- 0029: Projeto de melhoria (DMAIC) como extensão de projeto.

alter table app.projetos_melhoria
  add column if not exists projeto_id uuid references app.projetos(id) on delete set null;

create unique index if not exists uq_melhoria_projeto
  on app.projetos_melhoria (projeto_id) where projeto_id is not null;

alter table app.projetos
  add column if not exists processo_id uuid references app.processos(id) on delete set null;

create index if not exists idx_projetos_processo on app.projetos (processo_id);

comment on column app.projetos_melhoria.projeto_id is
  'O corpo executável do DMAIC. É por ele que o belt distribui atividade, entra em sprint e aparece no cronograma.';
comment on column app.projetos.processo_id is
  'O processo que este projeto melhora. Nulo para projeto que não nasce de processo, que é a maioria.';

create or replace function app.melhoria_dar_corpo(p_melhoria_id uuid)
returns app.projetos
language plpgsql security definer set search_path = app, public as $fn$
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
          or v_m.belt_user_id = auth.uid()
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
$fn$;

revoke all on function app.melhoria_dar_corpo(uuid) from public, anon;
grant execute on function app.melhoria_dar_corpo(uuid) to authenticated;

create or replace function app.meus_dmaics(p_company uuid)
returns table (
  id uuid, nome text, metodo text, fase_atual text, status text,
  processo_id uuid, processo_nome text, area_nome text,
  projeto_id uuid, ganho_estimado numeric, ganho_realizado numeric,
  atividades_abertas int, termino_previsto date)
language plpgsql stable security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  select m.id, m.nome, m.metodo, m.fase_atual, m.status,
         m.processo_id, pr.nome, ar.nome, m.projeto_id,
         m.ganho_estimado, m.ganho_realizado,
         (select count(*)::int from app.atividades a
           where a.projeto_id = m.projeto_id and a.status <> 'concluida'),
         m.termino_previsto
    from app.projetos_melhoria m
    left join app.processos pr on pr.id = m.processo_id
    left join app.areas ar on ar.id = m.area_id
   where m.company_id = p_company
     and m.belt_user_id = auth.uid()
     and m.status <> 'cancelado'
   order by

     case m.status when 'em_andamento' then 0 when 'backlog' then 1
                   when 'pausado' then 2 else 3 end,
     m.termino_previsto nulls last, m.nome;
end;
$fn$;

revoke all on function app.meus_dmaics(uuid) from public, anon;
grant execute on function app.meus_dmaics(uuid) to authenticated;

do $$
declare
  v_melhoria uuid;
  v_projeto uuid;
begin

  for v_melhoria in select id from app.projetos_melhoria where projeto_id is null
  loop
    insert into app.projetos (
      company_id, area_id, nome, descricao, categoria, tipo,
      responsavel_user_id, status, processo_id, inicio_previsto, termino_previsto)
    select m.company_id, m.area_id, m.nome, m.problema, 'melhoria', 'projeto',
           m.belt_user_id,
           case when m.status in ('backlog','em_andamento','pausado','concluido','cancelado')
                then m.status else 'backlog' end,
           m.processo_id, m.inicio_previsto, m.termino_previsto
      from app.projetos_melhoria m where m.id = v_melhoria
    returning id into v_projeto;

    update app.projetos_melhoria set projeto_id = v_projeto where id = v_melhoria;
  end loop;
end $$;
