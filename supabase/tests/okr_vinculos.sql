-- Vínculos de OKR: trigger de parent_okr_id, okr_vincular, kr_mover.
-- Fixtures são criadas como postgres dentro da transação e desfeitas no rollback.
begin;

-- ---------------------------------------------------------------------------
-- Fixtures: uma cadeia corporativo -> diretoria -> gerência e um OKR solto,
-- todos na holding, ano 2026, títulos prefixados com TESTE.
-- ---------------------------------------------------------------------------
insert into app.okrs (id, company_id, nivel, titulo, ano, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'corporativo', 'TESTE corporativo', 2026, 'rascunho'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'diretoria',   'TESTE diretoria',   2026, 'rascunho'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'gerencia',    'TESTE gerência',    2026, 'rascunho'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'gerencia',    'TESTE gerência solta', 2026, 'rascunho'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'diretoria',   'TESTE diretoria 2025', 2025, 'rascunho'),
  ('aaaaaaaa-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'diretoria',   'TESTE diretoria da Horizonte Distribuição', 2026, 'rascunho');

update app.okrs set parent_okr_id = 'aaaaaaaa-0000-0000-0000-000000000001' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
update app.okrs set parent_okr_id = 'aaaaaaaa-0000-0000-0000-000000000002' where id = 'aaaaaaaa-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- 1) Regra de nível
-- ---------------------------------------------------------------------------
do $$ begin
  if not app.okr_nivel_aceita_pai('diretoria', 'corporativo') then raise exception 'FALHOU: diretoria deveria aceitar corporativo'; end if;
  if not app.okr_nivel_aceita_pai('gerencia', 'diretoria')    then raise exception 'FALHOU: gerência deveria aceitar diretoria'; end if;
  if not app.okr_nivel_aceita_pai('individual', 'gerencia')   then raise exception 'FALHOU: individual deveria aceitar gerência'; end if;
  if not app.okr_nivel_aceita_pai('individual', 'diretoria')  then raise exception 'FALHOU: individual deveria aceitar diretoria'; end if;
  if app.okr_nivel_aceita_pai('corporativo', 'corporativo')   then raise exception 'FALHOU: corporativo não tem pai'; end if;
  if app.okr_nivel_aceita_pai('gerencia', 'corporativo')      then raise exception 'FALHOU: gerência não liga direto em corporativo'; end if;
  if app.okr_nivel_aceita_pai('diretoria', 'gerencia')        then raise exception 'FALHOU: diretoria não liga em gerência'; end if;
  if app.okr_nivel_aceita_pai('individual', 'corporativo')    then raise exception 'FALHOU: individual não liga em corporativo'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Trigger: vale para QUALQUER caminho de escrita (aqui, update direto)
-- ---------------------------------------------------------------------------
do $$ begin
  -- ciclo: o corporativo tentando virar filho da própria gerência
  begin
    update app.okrs set parent_okr_id = 'aaaaaaaa-0000-0000-0000-000000000003' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FALHOU: o trigger deixou criar um ciclo';
  exception when sqlstate '22023' then null;
  end;
  -- outra empresa
  begin
    update app.okrs set parent_okr_id = 'aaaaaaaa-0000-0000-0000-000000000006' where id = 'aaaaaaaa-0000-0000-0000-000000000004';
    raise exception 'FALHOU: o trigger deixou ligar a um pai de outra empresa';
  exception when sqlstate '42501' then null;
  end;
  -- outro ano
  begin
    update app.okrs set parent_okr_id = 'aaaaaaaa-0000-0000-0000-000000000005' where id = 'aaaaaaaa-0000-0000-0000-000000000004';
    raise exception 'FALHOU: o trigger deixou ligar a um pai de outro ano';
  exception when sqlstate '22023' then null;
  end;
  -- desvincular (null) passa sempre
  update app.okrs set parent_okr_id = null where id = 'aaaaaaaa-0000-0000-0000-000000000004';
end $$;

-- ---------------------------------------------------------------------------
-- 3) Coluna de configuração do check-in atrasado
-- ---------------------------------------------------------------------------
do $$ begin
  if (select c.dias_para_checkin_atrasado from app.companies c where c.id = '11111111-1111-1111-1111-111111111111') is distinct from 30 then
    raise exception 'FALHOU: dias_para_checkin_atrasado deveria valer 30 por padrão';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) okr_vincular
-- ---------------------------------------------------------------------------
insert into app.objetivos_estrategicos (id, company_id, titulo, ciclo)
values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'TESTE objetivo', '2026-2029');
update app.objetivos_estrategicos
   set perspectiva_id = (select p.id from app.perspectivas p where p.company_id = '11111111-1111-1111-1111-111111111111' and p.chave = 'financeiro')
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';

do $$
declare v_okr app.okrs;
begin
  -- gerência solta -> diretoria: aceita e herda objetivo/perspectiva do pai (nulos aqui)
  v_okr := app.okr_vincular('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', null);
  if v_okr.parent_okr_id <> 'aaaaaaaa-0000-0000-0000-000000000002' then
    raise exception 'FALHOU: okr_vincular não gravou o pai';
  end if;

  -- corporativo -> objetivo: aceita, herda perspectiva e propaga para a subárvore
  v_okr := app.okr_vincular('aaaaaaaa-0000-0000-0000-000000000001', null, 'bbbbbbbb-0000-0000-0000-000000000001');
  if v_okr.objetivo_estrategico_id <> 'bbbbbbbb-0000-0000-0000-000000000001' then
    raise exception 'FALHOU: okr_vincular não gravou o objetivo';
  end if;
  if v_okr.perspectiva_id is null then
    raise exception 'FALHOU: corporativo deveria herdar a perspectiva do objetivo';
  end if;
  if (select o.objetivo_estrategico_id from app.okrs o where o.id = 'aaaaaaaa-0000-0000-0000-000000000003') is distinct from 'bbbbbbbb-0000-0000-0000-000000000001' then
    raise exception 'FALHOU: a gerência abaixo deveria herdar o objetivo do corporativo';
  end if;

  -- gerência -> corporativo: recusa por nível
  begin
    perform app.okr_vincular('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', null);
    raise exception 'FALHOU: gerência -> corporativo deveria ser recusado';
  exception when sqlstate '22023' then null;
  end;

  -- objetivo em não-corporativo: recusa
  begin
    perform app.okr_vincular('aaaaaaaa-0000-0000-0000-000000000003', null, 'bbbbbbbb-0000-0000-0000-000000000001');
    raise exception 'FALHOU: objetivo em gerência deveria ser recusado';
  exception when sqlstate '22023' then null;
  end;

  -- corporativo não recebe pai (o ciclo puro é coberto pelo teste do trigger, na seção 2)
  begin
    perform app.okr_vincular('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', null);
    raise exception 'FALHOU: corporativo com pai deveria ser recusado';
  exception when sqlstate '22023' then null;
  end;

  -- outro ano
  begin
    perform app.okr_vincular('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005', null);
    raise exception 'FALHOU: pai de outro ano deveria ser recusado';
  exception when sqlstate '22023' then null;
  end;

  -- outra empresa
  begin
    perform app.okr_vincular('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000006', null);
    raise exception 'FALHOU: pai de outra empresa deveria ser recusado';
  exception when sqlstate '42501' then null;
  end;

  -- null desvincula
  v_okr := app.okr_vincular('aaaaaaaa-0000-0000-0000-000000000004', null, null);
  if v_okr.parent_okr_id is not null then
    raise exception 'FALHOU: null deveria desvincular';
  end if;
end $$;

-- caminho negado: usuário de outro tenant (QA, só Horizonte Serviços)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
do $$ begin
  begin
    perform app.okr_vincular('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', null);
    raise exception 'FALHOU: usuário de outro tenant não pode vincular';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5) kr_mover
-- ---------------------------------------------------------------------------
insert into app.key_results (id, company_id, okr_id, descricao, tipo, direcao, baseline, meta, atual, peso, farol)
values ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'TESTE KR', 'numerico', 'subir', 0, 100, 50, 1, 'cinza');
insert into app.kr_checkins (company_id, key_result_id, data, valor)
values ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', current_date, 50);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';

do $$
declare v_kr app.key_results;
begin
  v_kr := app.kr_mover('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004');
  if v_kr.okr_id <> 'aaaaaaaa-0000-0000-0000-000000000004' then
    raise exception 'FALHOU: kr_mover não trocou o OKR';
  end if;
  if v_kr.farol = 'cinza' then
    raise exception 'FALHOU: kr_mover deveria recalcular o farol (baseline 0, meta 100, atual 50)';
  end if;
  if (select count(*) from app.kr_checkins c where c.key_result_id = 'cccccccc-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FALHOU: os check-ins deveriam seguir o KR';
  end if;

  -- destino de outra empresa
  begin
    perform app.kr_mover('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000006');
    raise exception 'FALHOU: destino de outra empresa deveria ser recusado';
  exception when sqlstate '42501' then null;
  end;

  -- destino inexistente
  begin
    perform app.kr_mover('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000ff');
    raise exception 'FALHOU: destino inexistente deveria ser recusado';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
do $$ begin
  begin
    perform app.kr_mover('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003');
    raise exception 'FALHOU: usuário de outro tenant não pode mover KR';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- Regressão: o gate precisa exigir permissão nos DOIS lados (and), não só
-- num. Origem com dono = QA; destino sem dono. QA é dono da origem mas não
-- tem okr.edit nem é admin na holding: com o "and" atual, falta permissão no
-- destino e o gate barra. Se alguém trocar o "and" por "or", este caso passa
-- a ser aceito e o teste falha, que é o alarme que queremos.
insert into app.okrs (id, company_id, nivel, titulo, ano, status, owner_user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'gerencia', 'TESTE origem com dono QA', 2026, 'rascunho', '00000000-0000-0000-0000-00000000a002'),
  ('aaaaaaaa-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'gerencia', 'TESTE destino sem dono', 2026, 'rascunho', null);
insert into app.key_results (id, company_id, okr_id, descricao, tipo, direcao, baseline, meta, atual, peso, farol)
values ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000007', 'TESTE KR permissão só na origem', 'numerico', 'subir', 0, 100, 50, 1, 'cinza');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
do $$
declare
  v_message text;
begin
  begin
    perform app.kr_mover('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000008');
    raise exception 'FALHOU: dono só da origem não deveria bastar (o gate exige permissão nos dois lados)';
  exception when sqlstate '42501' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'Sem permissão para mover este KR' then
      raise exception 'FALHOU: o 42501 veio de outra validação, não do gate de permissão (mensagem: %)', v_message;
    end if;
  end;
end $$;
reset role;

rollback;
