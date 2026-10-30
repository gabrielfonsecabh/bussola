-- okr_grafo: uma linha por objetivo e por OKR, ancestrais no filtro, pendências.
begin;

-- Fixtures: corporativo ligado a objetivo, com dois KRs:
--   KR1: medido, check-in hoje (nenhuma pendência de KR)
--   KR2: medido, check-in há 60 dias (checkin_atrasado)
-- e uma diretoria abaixo, sem dono, sem KR.
insert into app.objetivos_estrategicos (id, company_id, titulo, ciclo)
values ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'TESTE objetivo com OKR', '2026-2029');
insert into app.okrs (id, company_id, nivel, titulo, ano, status, objetivo_estrategico_id, owner_user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'corporativo', 'TESTE corp medido', 2026, 'ativo', 'bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000a001'),
  ('aaaaaaaa-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'diretoria',   'TESTE dir vazia',   2026, 'ativo', null, null);
update app.okrs set parent_okr_id = 'aaaaaaaa-0000-0000-0000-000000000011' where id = 'aaaaaaaa-0000-0000-0000-000000000012';
insert into app.key_results (id, company_id, okr_id, descricao, tipo, direcao, baseline, meta, atual, peso, farol) values
  ('cccccccc-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000011', 'TESTE KR em dia',   'numerico', 'subir', 0, 100, 50, 1, 'verde'),
  ('cccccccc-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000011', 'TESTE KR atrasado', 'numerico', 'subir', 0, 100, 50, 1, 'verde');
insert into app.kr_checkins (company_id, key_result_id, data, valor) values
  ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000011', current_date, 50),
  ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000012', current_date - 60, 50);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';

do $$
declare
  v_okrs_no_banco int;
  v_objs_no_banco int;
  v_okrs int;
  v_objs int;
  v_linhas int;
  v_distintos int;
  v_pend text[];
  v_krs jsonb;
  v_area uuid;
begin
  -- 1) sem filtro: uma linha por OKR do ano e por objetivo da empresa
  select count(*) into v_okrs_no_banco from app.okrs o where o.company_id = '11111111-1111-1111-1111-111111111111' and o.ano = 2026;
  select count(*) into v_objs_no_banco from app.objetivos_estrategicos oe where oe.company_id = '11111111-1111-1111-1111-111111111111';
  select count(*), count(distinct g.id),
         count(*) filter (where g.tipo = 'okr'), count(*) filter (where g.tipo = 'objetivo')
    into v_linhas, v_distintos, v_okrs, v_objs
    from app.okr_grafo('11111111-1111-1111-1111-111111111111', 2026, null) g;
  if v_linhas <> v_distintos then raise exception 'FALHOU: okr_grafo duplicou linhas (% para %)', v_linhas, v_distintos; end if;
  if v_okrs <> v_okrs_no_banco then raise exception 'FALHOU: esperava % OKRs e veio %', v_okrs_no_banco, v_okrs; end if;
  if v_objs <> v_objs_no_banco then raise exception 'FALHOU: esperava % objetivos e veio %', v_objs_no_banco, v_objs; end if;

  -- 2) pendências do corporativo: checkin_atrasado e nada de cadastro (dono ok, objetivo ok, KRs medidos)
  select g.pendencias, g.krs into v_pend, v_krs
    from app.okr_grafo('11111111-1111-1111-1111-111111111111', 2026, null) g
   where g.id = 'aaaaaaaa-0000-0000-0000-000000000011';
  -- O farol depende da data de hoje (ritmo do ciclo), então não se assume
  -- a cor: assume-se que NENHUMA pendência de cadastro aparece.
  if not (v_pend @> array['checkin_atrasado']) then
    raise exception 'FALHOU: corporativo com KR de 60 dias deveria ter checkin_atrasado, veio %', v_pend;
  end if;
  if v_pend && array['sem_dono','sem_objetivo','sem_pai','sem_kr','kr_sem_baseline','kr_sem_meta','kr_sem_atual'] then
    raise exception 'FALHOU: corporativo medido e com dono não pode ter pendência de cadastro, veio %', v_pend;
  end if;
  if jsonb_array_length(v_krs) <> 2 then raise exception 'FALHOU: krs deveria trazer 2 KRs'; end if;
  if not (v_krs @> '[{"descricao":"TESTE KR atrasado","pendencias":["checkin_atrasado"]}]'::jsonb) then
    raise exception 'FALHOU: o KR com check-in de 60 dias deveria estar atrasado: %', v_krs;
  end if;
  if not (v_krs @> '[{"descricao":"TESTE KR em dia","pendencias":[]}]'::jsonb) then
    raise exception 'FALHOU: o KR com check-in de hoje não deveria ter pendência: %', v_krs;
  end if;

  -- 3) pendências da diretoria vazia: sem_dono e sem_kr (tem pai, então sem sem_pai)
  select g.pendencias into v_pend
    from app.okr_grafo('11111111-1111-1111-1111-111111111111', 2026, null) g
   where g.id = 'aaaaaaaa-0000-0000-0000-000000000012';
  if not (v_pend @> array['sem_dono','sem_kr']) or v_pend @> array['sem_pai'] then
    raise exception 'FALHOU: diretoria vazia deveria ter sem_dono e sem_kr, sem sem_pai; veio %', v_pend;
  end if;

  -- 4) objetivo com OKR não tem sem_okr; objetivo sem OKR tem
  select g.pendencias into v_pend
    from app.okr_grafo('11111111-1111-1111-1111-111111111111', 2026, null) g
   where g.id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if v_pend @> array['sem_okr'] then raise exception 'FALHOU: objetivo com OKR não pode ter sem_okr'; end if;
  if (select count(*) from app.okr_grafo('11111111-1111-1111-1111-111111111111', 2026, null) g
       where g.tipo = 'objetivo' and g.pendencias @> array['sem_okr'])
     <> (select count(*) from app.objetivos_estrategicos oe
          where oe.company_id = '11111111-1111-1111-1111-111111111111'
            and not exists (select 1 from app.okrs o where o.objetivo_estrategico_id = oe.id and o.ano = 2026)) then
    raise exception 'FALHOU: contagem de sem_okr não bate com o banco';
  end if;

  -- 5) filtro de área traz os ancestrais: Controladoria e Fiscal tem 3 gerências; o pai (diretoria) vem junto
  select a.id into v_area from app.areas a
   where a.company_id = '11111111-1111-1111-1111-111111111111'
     and a.nome = 'Controladoria e Fiscal';
  select count(*) filter (where g.tipo = 'okr' and g.nivel = 'gerencia'),
         count(*) filter (where g.tipo = 'okr' and g.nivel = 'diretoria')
    into v_okrs, v_objs
    from app.okr_grafo('11111111-1111-1111-1111-111111111111', 2026, v_area) g;
  if v_okrs <> 3 then raise exception 'FALHOU: Controladoria e Fiscal deveria ter 3 gerências, veio %', v_okrs; end if;
  if v_objs <> 1 then raise exception 'FALHOU: o pai (diretoria) deveria vir junto no filtro, veio %', v_objs; end if;
end $$;

-- caminho negado
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
do $$ begin
  begin
    perform * from app.okr_grafo('11111111-1111-1111-1111-111111111111', 2026, null);
    raise exception 'FALHOU: usuário de outro tenant não pode ler o grafo';
  exception when sqlstate '42501' then null;
  end;
end $$;

rollback;
