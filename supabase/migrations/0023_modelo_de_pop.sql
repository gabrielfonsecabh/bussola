-- 0023: Modelos de POP configuráveis.

create table if not exists app.pop_modelos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,

  area_id uuid references app.areas(id) on delete set null,
  nome text not null,
  descricao text,

  prefixo_codigo text,

  objetivo_padrao text,
  abrangencia_padrao text,

  definicoes jsonb not null default '[]'::jsonb check (jsonb_typeof(definicoes) = 'array'),
  responsabilidades jsonb not null default '[]'::jsonb check (jsonb_typeof(responsabilidades) = 'array'),
  controles_internos jsonb not null default '[]'::jsonb check (jsonb_typeof(controles_internos) = 'array'),
  registros jsonb not null default '[]'::jsonb check (jsonb_typeof(registros) = 'array'),
  riscos jsonb not null default '[]'::jsonb check (jsonb_typeof(riscos) = 'array'),

  indicadores_sugeridos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(indicadores_sugeridos) = 'array'),

  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create index if not exists idx_pop_modelos_company on app.pop_modelos (company_id, ativo);
create index if not exists idx_pop_modelos_area on app.pop_modelos (area_id);

drop trigger if exists trg_pop_modelos_updated on app.pop_modelos;
create trigger trg_pop_modelos_updated before update on app.pop_modelos
  for each row execute function app.set_updated_at();

alter table app.pop_modelos enable row level security;

drop policy if exists pop_modelos_select on app.pop_modelos;
create policy pop_modelos_select on app.pop_modelos for select
  using (app.belongs_to_company((select auth.uid()), company_id));

drop policy if exists pop_modelos_insert on app.pop_modelos;
create policy pop_modelos_insert on app.pop_modelos for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'pop.aprovar'));

drop policy if exists pop_modelos_update on app.pop_modelos;
create policy pop_modelos_update on app.pop_modelos for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'pop.aprovar'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'pop.aprovar'));

drop policy if exists pop_modelos_delete on app.pop_modelos;
create policy pop_modelos_delete on app.pop_modelos for delete
  using (app.is_company_admin((select auth.uid()), company_id));

grant select, insert, update, delete on app.pop_modelos to authenticated;

alter table app.processo_pop
  add column if not exists modelo_id uuid references app.pop_modelos(id) on delete set null;

comment on column app.processo_pop.modelo_id is
  'Modelo que preencheu este POP. Serve para a tela avisar quais seções ainda são o texto padrão, que é o risco de um modelo bom: parecer preenchido sem ter sido pensado.';

create or replace function app.pop_aplicar_modelo(
  p_processo_id uuid, p_modelo_id uuid default null)
returns app.processo_pop
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_proc app.processos;
  v_modelo app.pop_modelos;
  v_pop app.processo_pop;
begin
  select * into v_proc from app.processos where id = p_processo_id;
  if v_proc.id is null then
    raise exception 'Processo inexistente' using errcode = 'P0002';
  end if;

  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_proc.company_id)
          or app.has_permission(auth.uid(), v_proc.company_id, 'processo.edit')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if p_modelo_id is not null then
    select * into v_modelo from app.pop_modelos m
     where m.id = p_modelo_id and m.company_id = v_proc.company_id;
  else

    select * into v_modelo from app.pop_modelos m
     where m.company_id = v_proc.company_id and m.ativo
       and (m.area_id = v_proc.area_id or m.area_id is null)
     order by (m.area_id is not null) desc, m.created_at
     limit 1;
  end if;

  if v_modelo.id is null then
    raise exception 'Não há modelo de POP para esta empresa'
      using errcode = 'P0002';
  end if;

  insert into app.processo_pop (company_id, processo_id, modelo_id)
  values (v_proc.company_id, p_processo_id, v_modelo.id)
  on conflict (processo_id) do nothing;

  update app.processo_pop pp
     set modelo_id          = coalesce(pp.modelo_id, v_modelo.id),
         objetivo           = coalesce(nullif(trim(pp.objetivo), ''), v_modelo.objetivo_padrao),
         abrangencia        = coalesce(nullif(trim(pp.abrangencia), ''), v_modelo.abrangencia_padrao),
         definicoes         = case when jsonb_array_length(pp.definicoes) = 0
                                   then v_modelo.definicoes else pp.definicoes end,
         responsabilidades  = case when jsonb_array_length(pp.responsabilidades) = 0
                                   then v_modelo.responsabilidades else pp.responsabilidades end,
         controles_internos = case when jsonb_array_length(pp.controles_internos) = 0
                                   then v_modelo.controles_internos else pp.controles_internos end,
         registros          = case when jsonb_array_length(pp.registros) = 0
                                   then v_modelo.registros else pp.registros end,
         riscos             = case when jsonb_array_length(pp.riscos) = 0
                                   then v_modelo.riscos else pp.riscos end,
         codigo             = coalesce(pp.codigo, v_modelo.prefixo_codigo)
   where pp.processo_id = p_processo_id
   returning * into v_pop;

  return v_pop;
end;
$fn$;

create or replace function app.processo_pop_completo(p_processo_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = app, public as $fn$
#variable_conflict use_column
declare
  v_company uuid;
  v_proc record;
  v_pop app.processo_pop;
  v_etapas jsonb;
  v_sistemas jsonb;
  v_indicadores jsonb;
  v_historico jsonb;
  v_lacunas text[] := '{}';
  v_modelo app.pop_modelos;
  v_do_modelo text[] := '{}';
begin
  select p.*, ar.nome as area_nome, pf.nome as dono_nome
    into v_proc
    from app.processos p
    left join app.areas ar on ar.id = p.area_id
    left join app.profiles pf on pf.user_id = p.dono_user_id
   where p.id = p_processo_id;

  if v_proc.id is null then
    raise exception 'Processo inexistente' using errcode = 'P0002';
  end if;
  v_company := v_proc.company_id;

  if not (app.is_super_admin(auth.uid())
          or app.belongs_to_company(auth.uid(), v_company)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  select * into v_pop from app.processo_pop pp where pp.processo_id = p_processo_id;
  if v_pop.modelo_id is not null then
    select * into v_modelo from app.pop_modelos m where m.id = v_pop.modelo_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ordem', e.ordem, 'tipo', e.tipo, 'titulo', e.titulo,
           'descricao', e.descricao, 'responsavel', pf.nome,
           'sistema', e.sistema, 'tempo_estimado_min', e.tempo_estimado_min,
           'eh_gargalo', e.eh_gargalo) order by e.ordem, e.id), '[]'::jsonb)
    into v_etapas
    from app.processo_etapas e
    left join app.profiles pf on pf.user_id = e.responsavel_user_id
   where e.processo_id = p_processo_id;

  select coalesce(jsonb_agg(distinct e.sistema), '[]'::jsonb)
    into v_sistemas
    from app.processo_etapas e
   where e.processo_id = p_processo_id and e.sistema is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nome', i.nome, 'tipo', i.tipo, 'formula', i.formula,
           'unidade', i.unidade, 'meta', i.meta,
           'baseline', i.baseline) order by i.nome), '[]'::jsonb)
    into v_indicadores
    from app.indicadores_processo i
   where i.processo_id = p_processo_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'versao', r.versao, 'data', r.data, 'alteracao', r.alteracao,
           'responsavel', pf.nome) order by r.versao desc, r.data desc), '[]'::jsonb)
    into v_historico
    from app.processo_pop_revisoes r
    left join app.profiles pf on pf.user_id = r.responsavel_user_id
   where r.pop_id = v_pop.id;

  if v_pop.id is null then v_lacunas := array['2. Objetivo','3. Abrangência','4. Definições e siglas',
    '5. Responsabilidades','8. Controles internos','10. Riscos e mitigações','11. Registros'];
  else
    if coalesce(v_pop.objetivo, '') = '' then v_lacunas := array_append(v_lacunas, '2. Objetivo'); end if;
    if coalesce(v_pop.abrangencia, '') = '' then v_lacunas := array_append(v_lacunas, '3. Abrangência'); end if;
    if jsonb_array_length(v_pop.definicoes) = 0 then v_lacunas := array_append(v_lacunas, '4. Definições e siglas'); end if;
    if jsonb_array_length(v_pop.responsabilidades) = 0 then v_lacunas := array_append(v_lacunas, '5. Responsabilidades'); end if;
    if jsonb_array_length(v_pop.controles_internos) = 0 then v_lacunas := array_append(v_lacunas, '8. Controles internos'); end if;
    if jsonb_array_length(v_pop.riscos) = 0 then v_lacunas := array_append(v_lacunas, '10. Riscos e mitigações'); end if;
    if jsonb_array_length(v_pop.registros) = 0 then v_lacunas := array_append(v_lacunas, '11. Registros'); end if;
  end if;
  if jsonb_array_length(v_etapas) = 0 then v_lacunas := array_append(v_lacunas, '7. Descrição do processo (o fluxo)'); end if;
  if jsonb_array_length(v_sistemas) = 0 then v_lacunas := array_append(v_lacunas, '6. Sistemas utilizados'); end if;
  if jsonb_array_length(v_indicadores) = 0 then v_lacunas := array_append(v_lacunas, '9. Indicadores de desempenho'); end if;
  if v_proc.dono_user_id is null then v_lacunas := array_append(v_lacunas, '1. Identificação: o processo não tem dono'); end if;

  if v_modelo.id is not null then
    if v_pop.objetivo is not distinct from v_modelo.objetivo_padrao and v_pop.objetivo is not null
      then v_do_modelo := array_append(v_do_modelo, '2. Objetivo'); end if;
    if v_pop.abrangencia is not distinct from v_modelo.abrangencia_padrao and v_pop.abrangencia is not null
      then v_do_modelo := array_append(v_do_modelo, '3. Abrangência'); end if;
    if v_pop.definicoes = v_modelo.definicoes and jsonb_array_length(v_pop.definicoes) > 0
      then v_do_modelo := array_append(v_do_modelo, '4. Definições e siglas'); end if;
    if v_pop.responsabilidades = v_modelo.responsabilidades and jsonb_array_length(v_pop.responsabilidades) > 0
      then v_do_modelo := array_append(v_do_modelo, '5. Responsabilidades'); end if;
    if v_pop.controles_internos = v_modelo.controles_internos and jsonb_array_length(v_pop.controles_internos) > 0
      then v_do_modelo := array_append(v_do_modelo, '8. Controles internos'); end if;
    if v_pop.riscos = v_modelo.riscos and jsonb_array_length(v_pop.riscos) > 0
      then v_do_modelo := array_append(v_do_modelo, '10. Riscos e mitigações'); end if;
    if v_pop.registros = v_modelo.registros and jsonb_array_length(v_pop.registros) > 0
      then v_do_modelo := array_append(v_do_modelo, '11. Registros'); end if;
  end if;

  return jsonb_build_object(
    'identificacao', jsonb_build_object(
      'titulo', v_proc.nome, 'codigo', v_pop.codigo, 'area', v_proc.area_nome,
      'dono', v_proc.dono_nome, 'categoria', v_proc.categoria,
      'periodicidade', v_proc.periodicidade,
      'periodicidade_origem', v_proc.periodicidade_origem,
      'prazo_referencia', v_proc.prazo_referencia,
      'versao', v_pop.versao, 'status', coalesce(v_pop.status, 'inexistente'),
      'data_emissao', v_pop.data_emissao,
      'elaborado_por', (select nome from app.profiles where user_id = v_pop.elaborado_por),
      'revisado_por', (select nome from app.profiles where user_id = v_pop.revisado_por),
      'aprovado_por', (select nome from app.profiles where user_id = v_pop.aprovado_por)),
    'objetivo', v_pop.objetivo,
    'abrangencia', v_pop.abrangencia,
    'definicoes', coalesce(v_pop.definicoes, '[]'::jsonb),
    'responsabilidades', coalesce(v_pop.responsabilidades, '[]'::jsonb),
    'sistemas', v_sistemas,
    'etapas', v_etapas,
    'controles_internos', coalesce(v_pop.controles_internos, '[]'::jsonb),
    'indicadores', v_indicadores,
    'riscos', coalesce(v_pop.riscos, '[]'::jsonb),
    'registros', coalesce(v_pop.registros, '[]'::jsonb),
    'historico', v_historico,
    'pendencia_de_mapeamento', v_proc.pendencia_de_mapeamento,
    'lacunas', to_jsonb(v_lacunas),
    'modelo_nome', v_modelo.nome,
    'vindas_do_modelo', to_jsonb(v_do_modelo));
end;
$fn$;

revoke all on function app.pop_aplicar_modelo(uuid, uuid) from public, anon;
revoke all on function app.processo_pop_completo(uuid) from public, anon;
grant execute on function app.pop_aplicar_modelo(uuid, uuid) to authenticated;
grant execute on function app.processo_pop_completo(uuid) to authenticated;

insert into app.pop_modelos (
  company_id, area_id, nome, descricao, prefixo_codigo,
  objetivo_padrao, abrangencia_padrao,
  definicoes, responsabilidades, controles_internos, registros, riscos,
  indicadores_sugeridos)
select
  '11111111-1111-1111-1111-111111111111',
  null,
  'Modelo de POP - Administrativo e Financeiro',
  'Modelo de exemplo com as seções de texto padrão. Identificação, sistemas, fluxo, indicadores e histórico vêm do próprio processo e não se repetem aqui.',
  'POP-ADM-',
  'Padronizar a execução do processo, para que qualquer pessoa treinada chegue ao mesmo resultado, no prazo, com registro do que foi feito.',
  'Vale para quem executa, revisa ou aprova o processo, e para as áreas que pedem ou recebem o que ele entrega.',
  '[{"sigla":"POP","significado":"Procedimento Operacional Padrão"},
    {"sigla":"ERP","significado":"Sistema de gestão da empresa"},
    {"sigla":"SLA","significado":"Prazo combinado para concluir a atividade"}]'::jsonb,
  '[{"papel":"Solicitante","responsabilidade":"Abrir o pedido com as informações e documentos necessários."},
    {"papel":"Executor","responsabilidade":"Executar as etapas, registrar o que foi feito e guardar as evidências."},
    {"papel":"Aprovador","responsabilidade":"Aprovar exceções e acompanhar os indicadores do processo."}]'::jsonb,
  '["Quem executa não aprova","Limites de aprovação por valor","Evidência guardada para cada execução","Registro de quem fez e quando"]'::jsonb,
  '["Pedidos recebidos","Aprovações","Evidências e relatórios"]'::jsonb,
  '[{"risco":"Pedido chega incompleto","mitigacao":"Lista de conferência na entrada"},
    {"risco":"Prazo perdido","mitigacao":"Calendário com alerta"},
    {"risco":"Dado lançado errado","mitigacao":"Conferência antes de concluir"}]'::jsonb,
  '[{"nome":"Execuções no prazo","tipo":"Y","unidade":"%","meta":95,"sentido":"maior_melhor"},
    {"nome":"Retrabalho","tipo":"Y","unidade":"%","meta":5,"sentido":"menor_melhor"},
    {"nome":"Pedidos devolvidos por falta de informação","tipo":"X","unidade":"%","meta":10,"sentido":"menor_melhor"}]'::jsonb
where not exists (
  select 1 from app.pop_modelos
   where company_id = '11111111-1111-1111-1111-111111111111'
     and nome = 'Modelo de POP - Administrativo e Financeiro');
