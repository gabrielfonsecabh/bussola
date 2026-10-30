-- ============================================================================
-- MODELO - Desdobramento de uma diretoria (copie para virar 0010/0011/0012)
-- ============================================================================
-- Como usar:
-- 1. Copie este arquivo para supabase/migrations/ com o número e nome certos:
--      0010_seed_negocios.sql
--      0011_seed_operacoes_engenharia.sql
--      0012_seed_gente_gestao.sql
--    (IMPORTANTE: enquanto estiver aqui em docs/templates/ ele NÃO é aplicado.
--     Só passa a rodar quando estiver dentro de supabase/migrations/.)
-- 2. Ajuste as 3 coisas marcadas com "PREENCHA".
-- 3. Este arquivo JÁ RODA com os valores de exemplo. Vá trocando os textos e as
--    metas pelos reais, e duplicando/removendo os blocos de OKR e de KR conforme
--    a diretoria. O padrão é idêntico ao 0009 (que já foi validado).
--
-- Regras do modelo de dados (resumo):
--  - area.tipo: 'gerencia' para os pilares/gerências sob a diretoria.
--  - okr.nivel: 'gerencia' para cada bloco de OKR; parent_okr_id = OKR da diretoria.
--  - key_results.tipo: 'percentual' | 'numerico' | 'moeda' | 'marco'.
--       . percentual/numerico/moeda: preencha meta (número) e direcao ('subir'/'descer').
--       . marco (data ou texto, ex.: "até jul/27", "mínimo impacto"): meta = null,
--         escreva o alvo no texto do KR.
--  - perspectiva chave: 'financeiro' | 'clientes' | 'processos' | 'aprendizagem'.
-- ============================================================================

do $seed$
declare
  v_company uuid := '11111111-1111-1111-1111-111111111111';  -- holding do seed de exemplo
  v_dir_area uuid;
  p_fin uuid; p_cli uuid; p_proc uuid; p_apr uuid;
  o_dir uuid;
  o_a uuid; o_b uuid; o_c uuid;   -- um por gerência/bloco (duplique se precisar)
begin
  -- PREENCHA (1/3): nome EXATO da diretoria já criada no seed 0008.
  --   Opções no seed de exemplo: 'Diretoria Comercial'
  --           'Diretoria de Operações'
  --           'Diretoria de Pessoas'
  select id into v_dir_area from app.areas
   where company_id = v_company and nome = 'Diretoria Comercial' limit 1;

  -- PREENCHA (2/3): título do OKR da diretoria (tem que ser único). O guard
  -- abaixo usa esse mesmo título para não duplicar em reaplicações.
  if exists (select 1 from app.okrs
             where company_id = v_company and ano = 2026
               and titulo = 'OKR da diretoria - PREENCHA') then
    raise notice 'já aplicado; pulando.';
    return;
  end if;

  select id into p_fin  from app.perspectivas where company_id = v_company and chave = 'financeiro';
  select id into p_cli  from app.perspectivas where company_id = v_company and chave = 'clientes';
  select id into p_proc from app.perspectivas where company_id = v_company and chave = 'processos';
  select id into p_apr  from app.perspectivas where company_id = v_company and chave = 'aprendizagem';

  -- --- Gerências (pilares) sob a diretoria ---------------------------------
  -- PREENCHA (3/3): troque os nomes pelas gerências reais da diretoria.
  --   Exemplos: Comercial: 'Vendas', 'Marketing', 'Sucesso do Cliente'
  --   Operações: 'Logística', 'Qualidade', 'Manutenção'
  --   Pessoas: 'DP/RH', 'TI'
  -- Duplique/remova blocos de área conforme o número de gerências.
  insert into app.areas (company_id, parent_area_id, nome, tipo)
    values (v_company, v_dir_area, 'Gerência A - PREENCHA', 'gerencia');
  insert into app.areas (company_id, parent_area_id, nome, tipo)
    values (v_company, v_dir_area, 'Gerência B - PREENCHA', 'gerencia');
  insert into app.areas (company_id, parent_area_id, nome, tipo)
    values (v_company, v_dir_area, 'Gerência C - PREENCHA', 'gerencia');

  -- --- OKR da diretoria (nível diretoria) ----------------------------------
  insert into app.okrs (company_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, v_dir_area, p_fin, 'diretoria',
    'OKR da diretoria - PREENCHA',
    'Missão / objetivo / desafio da diretoria - PREENCHA.',
    2026, 'ativo')
  returning id into o_dir;

  -- =========================================================================
  -- BLOCO DE OKR - copie este bloco inteiro para cada gerência/objetivo.
  -- =========================================================================
  insert into app.okrs (company_id, parent_okr_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, o_dir,
    (select id from app.areas where company_id = v_company and nome = 'Gerência A - PREENCHA'),
    p_fin, 'gerencia',
    'Objetivo da Gerência A - PREENCHA',
    'Descrição do objetivo - PREENCHA.', 2026, 'ativo')
  returning id into o_a;

  insert into app.key_results (company_id, okr_id, descricao, tipo, unidade, meta, direcao) values
   (v_company, o_a, 'KR 1 - PREENCHA', 'percentual','%',100,'subir'),
   (v_company, o_a, 'KR 2 - PREENCHA (meta em data/texto)', 'marco',null,null,'subir');

  -- ---- copie a partir daqui para a Gerência B -----------------------------
  insert into app.okrs (company_id, parent_okr_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, o_dir,
    (select id from app.areas where company_id = v_company and nome = 'Gerência B - PREENCHA'),
    p_proc, 'gerencia',
    'Objetivo da Gerência B - PREENCHA',
    'Descrição do objetivo - PREENCHA.', 2026, 'ativo')
  returning id into o_b;

  insert into app.key_results (company_id, okr_id, descricao, tipo, unidade, meta, direcao) values
   (v_company, o_b, 'KR 1 - PREENCHA', 'numerico','ocorrências',0,'descer');

  -- ---- Gerência C ---------------------------------------------------------
  insert into app.okrs (company_id, parent_okr_id, area_id, perspectiva_id, nivel, titulo, descricao, ano, status)
  values (v_company, o_dir,
    (select id from app.areas where company_id = v_company and nome = 'Gerência C - PREENCHA'),
    p_cli, 'gerencia',
    'Objetivo da Gerência C - PREENCHA',
    'Descrição do objetivo - PREENCHA.', 2026, 'ativo')
  returning id into o_c;

  insert into app.key_results (company_id, okr_id, descricao, tipo, unidade, meta, direcao) values
   (v_company, o_c, 'KR 1 - PREENCHA', 'percentual','%',95,'subir');

  -- =========================================================================
  -- Projetos do plano de implementação da diretoria (opcional; duplique)
  -- categoria: 'estrutural' | 'melhoria' | 'ia' | 'gestao_projetos' | 'comite'
  -- =========================================================================
  insert into app.projetos (company_id, area_id, okr_id, nome, descricao, categoria, tipo, status, prioridade, termino_previsto)
  values (v_company, v_dir_area, o_a,
    'Projeto - PREENCHA', 'Descrição - PREENCHA.', 'estrutural','projeto','planejado','media', null);

  raise notice 'desdobramento da diretoria aplicado (modelo).';
end;
$seed$;
