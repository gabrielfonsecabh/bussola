-- 0035: Régua de sprints.

drop function if exists app.sprints_do_quadro(uuid, uuid, date);
create or replace function app.sprints_do_quadro(
  p_company uuid,
  p_area_id uuid default null,
  p_referencia date default current_date)
returns table (
  id uuid,
  nome text,
  objetivo text,
  area_id uuid,
  area_nome text,
  data_inicio date,
  data_fim date,
  status text,
  atividades int,
  concluidas int,
  bloqueadas int,
  projetos int,
  projeto_nomes text[],

  e_atual boolean,

  dias_ate_o_fim int,

  dias_ate_o_inicio int)
language plpgsql stable security definer set search_path = app, public as $fn$
begin
  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), p_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  select s.id, s.nome, s.objetivo, s.area_id, ar.nome,
         s.data_inicio, s.data_fim, s.status,
         coalesce(c.total, 0),
         coalesce(c.feitas, 0),
         coalesce(c.travadas, 0),
         coalesce(c.projetos, 0),
         coalesce(c.nomes, array[]::text[]),
         (p_referencia between s.data_inicio and s.data_fim),
         (s.data_fim - p_referencia)::int,
         (s.data_inicio - p_referencia)::int
    from app.sprints s
    left join app.areas ar on ar.id = s.area_id
    left join lateral (
      select count(*)::int as total,
             count(*) filter (where a.status = 'concluido')::int as feitas,
             count(*) filter (where a.status = 'bloqueado')::int as travadas,
             count(distinct a.projeto_id)::int as projetos,
             array_agg(distinct p.nome) filter (where p.nome is not null) as nomes
        from app.atividades a
        left join app.projetos p on p.id = a.projeto_id
       where a.sprint_id = s.id
    ) c on true
   where s.company_id = p_company
     and (p_area_id is null
          or s.area_id in (select x.area_id from app.subarvore_de_area(p_area_id) x))
   order by s.data_inicio, s.nome;
end;
$fn$;

revoke all on function app.sprints_do_quadro(uuid, uuid, date) from public, anon;
grant execute on function app.sprints_do_quadro(uuid, uuid, date) to authenticated;
