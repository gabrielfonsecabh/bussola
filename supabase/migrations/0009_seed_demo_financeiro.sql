-- 0009: Dados de demonstração: desdobramento da Diretoria Administrativo-Financeira.

do $seed$
declare
  v_company uuid := '11111111-1111-1111-1111-111111111111';
  v_dir_area uuid;
  p_fin uuid; p_proc uuid; p_apr uuid;
  a_ctrl uuid; a_teso uuid; a_adm uuid; a_supply uuid;
  o_dir uuid;
  o_fpa uuid; o_fiscal uuid; o_contab uuid;
  o_teso uuid; o_adm uuid;
  o_compras uuid; o_estoque uuid;
begin
  if exists (select 1 from app.okrs
             where company_id = v_company and ano = 2026
               and titulo = 'Finanças previsíveis, risco controlado e apoio ágil ao negócio') then
    raise notice '0009 já aplicado; pulando.';
    return;
  end if;

  select id into v_dir_area from app.areas
   where company_id = v_company and nome = 'Diretoria Administrativo-Financeiro' limit 1;

  select id into p_fin  from app.perspectivas where company_id = v_company and chave = 'financeiro';
  select id into p_proc from app.perspectivas where company_id = v_company and chave = 'processos';
  select id into p_apr  from app.perspectivas where company_id = v_company and chave = 'aprendizagem';

  insert into app.areas (company_id, parent_area_id, nome, tipo) values
    (v_company, v_dir_area, 'Controladoria e Fiscal', 'gerencia') returning id into a_ctrl;
  insert into app.areas (company_id, parent_area_id, nome, tipo) values
    (v_company, v_dir_area, 'Tesouraria', 'gerencia') returning id into a_teso;
  insert into app.areas (company_id, parent_area_id, nome, tipo) values
    (v_company, v_dir_area, 'Administrativo e Jurídico', 'gerencia') returning id into a_adm;
  insert into app.areas (company_id, parent_area_id, nome, tipo) values
    (v_company, v_dir_area, 'Suprimentos', 'gerencia') returning id into a_supply;

  insert into app.okrs (company_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, v_dir_area, p_fin, 'diretoria',
    'Finanças previsíveis, risco controlado e apoio ágil ao negócio',
    'Missão: dar à empresa números confiáveis e no prazo. '
    'Objetivo: previsibilidade de caixa e resultado, risco fiscal sob controle, áreas atendidas sem atrito. '
    'Desafio: sair do retrovisor e antecipar desvios.',
    2026, 'ativo')
  returning id into o_dir;

  insert into app.okrs (company_id, parent_okr_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, o_dir, a_ctrl, p_fin, 'gerencia', 'Planejamento e análise financeira (FP&A)',
    'Antecipar desvios e apoiar decisão com números confiáveis.', 2026, 'ativo')
  returning id into o_fpa;

  insert into app.key_results (company_id, okr_id, descricao, tipo, unidade, meta, direcao) values
   (v_company, o_fpa, 'Acurácia do forecast trimestral de despesas', 'percentual','%',90,'subir'),
   (v_company, o_fpa, 'Áreas fora do orçamento com plano de ação em até 10 dias úteis', 'percentual','%',100,'subir'),
   (v_company, o_fpa, 'Redução de despesas recorrentes sem perda de serviço', 'moeda','R$',250000,'subir'),
   (v_company, o_fpa, 'Diferença entre resultado contábil e gerencial', 'percentual','%',3,'descer');

  insert into app.okrs (company_id, parent_okr_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, o_dir, a_ctrl, p_fin, 'gerencia', 'Fiscal',
    'Conformidade tributária sem surpresas.', 2026, 'ativo')
  returning id into o_fiscal;

  insert into app.key_results (company_id, okr_id, descricao, tipo, unidade, meta, direcao) values
   (v_company, o_fiscal, 'Autuações ou multas fiscais', 'numerico','ocorrências',0,'descer'),
   (v_company, o_fiscal, 'Certidões negativas de débito sempre válidas', 'percentual','%',100,'subir'),
   (v_company, o_fiscal, 'Plano de adaptação à reforma tributária aprovado', 'marco',null,null,'subir');

  insert into app.okrs (company_id, parent_okr_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, o_dir, a_ctrl, p_fin, 'gerencia', 'Contabilidade',
    'Fechamento rápido e demonstrações confiáveis.', 2026, 'ativo')
  returning id into o_contab;

  insert into app.key_results (company_id, okr_id, descricao, tipo, unidade, meta, direcao) values
   (v_company, o_contab, 'Fechamento mensal entregue até o dia útil', 'numerico','dia útil',6,'descer'),
   (v_company, o_contab, 'Conciliações de contas de balanço em dia', 'percentual','%',100,'subir'),
   (v_company, o_contab, 'Auditoria anual sem ressalvas', 'marco',null,null,'subir');

  insert into app.okrs (company_id, parent_okr_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, o_dir, a_teso, p_fin, 'gerencia', 'Tesouraria',
    'Caixa previsível e pagamentos sem erro.', 2026, 'ativo')
  returning id into o_teso;

  insert into app.key_results (company_id, okr_id, descricao, tipo, unidade, meta, direcao) values
   (v_company, o_teso, 'Juros e multas por atraso de pagamento', 'moeda','R$',0,'descer'),
   (v_company, o_teso, 'Pagamentos com dupla conferência (contrato, pedido e aprovador)', 'percentual','%',100,'subir'),
   (v_company, o_teso, 'Inadimplência acima de 30 dias', 'percentual','%',3,'descer'),
   (v_company, o_teso, 'Acurácia da projeção de caixa de 60 dias', 'percentual','%',95,'subir');

  insert into app.okrs (company_id, parent_okr_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, o_dir, a_adm, p_proc, 'gerencia', 'Administrativo e Jurídico',
    'Contratos em ordem e estrutura física funcionando.', 2026, 'ativo')
  returning id into o_adm;

  insert into app.key_results (company_id, okr_id, descricao, tipo, unidade, meta, direcao) values
   (v_company, o_adm, 'Chamados de manutenção atendidos no prazo', 'percentual','%',95,'subir'),
   (v_company, o_adm, 'Contratos vigentes revisados e cadastrados', 'percentual','%',100,'subir'),
   (v_company, o_adm, 'Contas de consumo pagas em atraso', 'numerico','ocorrências',0,'descer');

  insert into app.okrs (company_id, parent_okr_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, o_dir, a_supply, p_proc, 'gerencia', 'Compras',
    'Comprar melhor, dentro do orçamento e das alçadas.', 2026, 'ativo')
  returning id into o_compras;

  insert into app.key_results (company_id, okr_id, descricao, tipo, unidade, meta, direcao) values
   (v_company, o_compras, 'Saving médio em negociações', 'percentual','%',8,'subir'),
   (v_company, o_compras, 'Compras fora do orçamento aprovadas antes do pedido', 'percentual','%',100,'subir'),
   (v_company, o_compras, 'Aderência às alçadas de aprovação', 'percentual','%',100,'subir');

  insert into app.okrs (company_id, parent_okr_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, o_dir, a_supply, p_proc, 'gerencia', 'Estoque',
    'Estoque certo, no lugar certo.', 2026, 'ativo')
  returning id into o_estoque;

  insert into app.key_results (company_id, okr_id, descricao, tipo, unidade, meta, direcao) values
   (v_company, o_estoque, 'Acuracidade do inventário da curva A', 'percentual','%',99,'subir'),
   (v_company, o_estoque, 'Rupturas que atrasaram entrega a cliente', 'numerico','ocorrências',0,'descer'),
   (v_company, o_estoque, 'Giro de estoque', 'numerico','vezes/ano',8,'subir');

  insert into app.projetos (company_id, area_id, okr_id, nome, descricao, categoria, tipo, status, prioridade, termino_previsto) values
   (v_company, a_ctrl, o_contab, 'Fechamento contábil em 6 dias úteis',
    'Redesenhar o calendário de fechamento e automatizar conciliações.', 'estrutural','projeto','em_andamento','alta','2026-12-31'),
   (v_company, v_dir_area, null, 'Orçamento do próximo ano aprovado',
    'Conduzir o ciclo orçamentário com as diretorias e aprovar no conselho.', 'estrutural','projeto','em_andamento','alta','2026-12-15'),
   (v_company, a_ctrl, o_fiscal, 'Plano de adaptação à reforma tributária',
    'Mapear impactos nos preços, contratos e sistemas.', 'estrutural','projeto','planejado','media','2027-03-31'),
   (v_company, a_supply, o_estoque, 'Inventário rotativo da curva A',
    'Implantar contagem cíclica semanal com divergência tratada em 48 horas.', 'melhoria','projeto','em_andamento','media','2026-11-30'),
   (v_company, a_teso, o_teso, 'IA na régua de cobrança',
    'Testar um agente que prioriza e personaliza a cobrança por perfil de cliente.', 'ia','iniciativa_ia','planejado','media','2027-02-28');

  raise notice '0009 aplicado: desdobramento de demonstração da Diretoria Adm-Financeiro.';
end;
$seed$;
