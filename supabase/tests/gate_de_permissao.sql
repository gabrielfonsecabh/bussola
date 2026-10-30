-- Gate de permissão que engolia NULL: quando a coluna de dono/responsável/belt
-- da linha é NULL, "dono = auth.uid()" avalia para NULL, o OR inteiro vira
-- NULL, "not NULL" é NULL, e o `if` não entra no ramo do raise. A função
-- segue em frente para um usuário sem nenhuma permissão.
--
-- Este teste prova, para as seis funções que têm esse gate, que um usuário
-- de outro tenant recebe 42501 ao operar sobre uma linha sem dono. Fixtures
-- são criadas como postgres dentro da transação e desfeitas no rollback,
-- mesmo padrão de okr_vinculos.sql.
begin;

-- ---------------------------------------------------------------------------
-- Fixtures: uma linha de cada tabela, na holding, SEM dono/responsável/belt.
-- ---------------------------------------------------------------------------
insert into app.okrs (id, company_id, nivel, titulo, ano, status) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'diretoria', 'TESTE gate okr', 2026, 'rascunho');

insert into app.atividades (id, company_id, titulo, status) values
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'TESTE gate atividade', 'a_fazer');

insert into app.projetos_melhoria (id, company_id, nome) values
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'TESTE gate melhoria');

-- Usuário de outro tenant: só pertence à Horizonte Serviços, não é admin nem super admin,
-- sem nenhuma permissão explícita na holding.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Helper de asserção: confere que o 42501 capturado é o do gate de permissão
-- ("Sem permissão"), e não outro 42501 da função (ex.: área de outra
-- empresa). Sem isso, um 42501 errado faria o teste passar pelo motivo
-- errado.
-- ---------------------------------------------------------------------------
do $$
declare
  v_msg text;
begin
  -- 1) okr_vincular
  begin
    perform app.okr_vincular('cccccccc-0000-0000-0000-000000000001', null, null);
    raise exception 'FALHOU: okr_vincular deixou usuário de outro tenant mexer em OKR sem dono';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Sem permissão' then
      raise exception 'FALHOU: okr_vincular levantou 42501 errado: %', v_msg;
    end if;
  end;

  -- 2) okr_desdobrar
  begin
    perform app.okr_desdobrar('cccccccc-0000-0000-0000-000000000001', 'TESTE filho gate');
    raise exception 'FALHOU: okr_desdobrar deixou usuário de outro tenant desdobrar OKR sem dono';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Sem permissão' then
      raise exception 'FALHOU: okr_desdobrar levantou 42501 errado: %', v_msg;
    end if;
  end;

  -- 3) atividade_mover
  begin
    perform app.atividade_mover('cccccccc-0000-0000-0000-000000000002', 'fazendo');
    raise exception 'FALHOU: atividade_mover deixou usuário de outro tenant mover atividade sem responsável';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Sem permissão' then
      raise exception 'FALHOU: atividade_mover levantou 42501 errado: %', v_msg;
    end if;
  end;

  -- 4) melhoria_avancar_fase
  begin
    perform app.melhoria_avancar_fase('cccccccc-0000-0000-0000-000000000003', 'measure');
    raise exception 'FALHOU: melhoria_avancar_fase deixou usuário de outro tenant avançar melhoria sem belt';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Sem permissão' then
      raise exception 'FALHOU: melhoria_avancar_fase levantou 42501 errado: %', v_msg;
    end if;
  end;

  -- 5) melhoria_dar_corpo
  begin
    perform app.melhoria_dar_corpo('cccccccc-0000-0000-0000-000000000003');
    raise exception 'FALHOU: melhoria_dar_corpo deixou usuário de outro tenant dar corpo a melhoria sem belt';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Sem permissão' then
      raise exception 'FALHOU: melhoria_dar_corpo levantou 42501 errado: %', v_msg;
    end if;
  end;

  -- 6) dmaic_concluir_tollgate (mesma melhoria sem belt; o gate dispara antes
  -- de qualquer insert em dmaic_etapas, então reusar a linha é seguro)
  begin
    perform app.dmaic_concluir_tollgate('cccccccc-0000-0000-0000-000000000003', 'define');
    raise exception 'FALHOU: dmaic_concluir_tollgate deixou usuário de outro tenant concluir tollgate de melhoria sem belt';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Sem permissão' then
      raise exception 'FALHOU: dmaic_concluir_tollgate levantou 42501 errado: %', v_msg;
    end if;
  end;
end $$;

reset role;

rollback;
