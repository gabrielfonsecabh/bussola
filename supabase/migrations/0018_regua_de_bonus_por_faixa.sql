-- 0018: Régua de bônus por faixas {min, max, paga}.

create or replace function app.bonus_aplicar_regua(p_regua jsonb, p_atingimento numeric)
returns numeric
language sql immutable set search_path = app, public as $$
  select case
    when p_atingimento is null then null
    when p_regua is null
      or jsonb_typeof(p_regua) <> 'array'
      or jsonb_array_length(p_regua) = 0 then null
    else (

      select (f->>'paga')::numeric
      from jsonb_array_elements(p_regua) f
      where p_atingimento >= coalesce((f->>'min')::numeric, '-infinity'::numeric)
        and (f->>'max' is null or p_atingimento <= (f->>'max')::numeric)
      order by coalesce((f->>'min')::numeric, '-infinity'::numeric) desc
      limit 1
    )
  end;
$$;

comment on function app.bonus_aplicar_regua(jsonb, numeric) is
  'Faixas no formato {min, max, paga}; max nulo é a faixa aberta para cima. '
  'Devolve NULL quando nenhuma faixa classifica o atingimento: sem dado não é zero.';

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
  v_paga_ebitda numeric;
  v_paga_fat numeric;
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
    v_paga_ebitda := app.bonus_aplicar_regua(v_cfg.reguas->'ebitda', p_ebitda_pct);
    insert into app.bonus_apuracao (
      company_id, escopo, periodo, componente, atingimento_pct, peso, resultado_pct)
    values (
      p_company, 'global', p_periodo, 'ebitda', p_ebitda_pct,
      v_peso_global * v_peso_ebitda,

      case when v_paga_ebitda is null then null
           else round(v_paga_ebitda * v_peso_global * v_peso_ebitda / 100.0, 6) end);
  end if;

  if p_faturamento_pct is not null then
    v_paga_fat := app.bonus_aplicar_regua(v_cfg.reguas->'faturamento', p_faturamento_pct);
    insert into app.bonus_apuracao (
      company_id, escopo, periodo, componente, atingimento_pct, peso, resultado_pct)
    values (
      p_company, 'global', p_periodo, 'faturamento', p_faturamento_pct,
      v_peso_global * v_peso_fat,
      case when v_paga_fat is null then null
           else round(v_paga_fat * v_peso_global * v_peso_fat / 100.0, 6) end);
  end if;

  insert into app.bonus_apuracao (
    company_id, escopo, area_id, periodo, componente, atingimento_pct, peso, resultado_pct)
  select p_company, 'area', k.area_id, p_periodo, 'kit',
         k.percentual, v_peso_setorial,
         round(k.percentual * v_peso_setorial / 100.0, 6)
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

revoke all on function app.bonus_aplicar_regua(jsonb, numeric) from public, anon;
revoke all on function app.bonus_apurar(uuid, text, numeric, numeric) from public, anon;
grant execute on function app.bonus_aplicar_regua(jsonb, numeric) to authenticated;
grant execute on function app.bonus_apurar(uuid, text, numeric, numeric) to authenticated;
alter function app.bonus_apurar(uuid, text, numeric, numeric) set statement_timeout to '120s';
