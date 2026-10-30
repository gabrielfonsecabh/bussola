-- 0020: POP e rotina (periodicidade, responsáveis) do processo.

alter table app.processos
  add column if not exists categoria text,
  add column if not exists periodicidade text,
  add column if not exists periodicidade_origem text,
  add column if not exists prazo_referencia text,
  add column if not exists pendencia_de_mapeamento text,
  add column if not exists origem_do_registro text not null default 'manual';

do $$ begin
  alter table app.processos add constraint processos_periodicidade_check
    check (periodicidade is null or periodicidade in (
      'diario','semanal','quinzenal','mensal','bimestral',
      'trimestral','semestral','anual','sob_demanda','continuo'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table app.processos add constraint processos_origem_check
    check (origem_do_registro in ('manual','importacao'));
exception when duplicate_object then null; end $$;

create index if not exists idx_processos_categoria on app.processos (company_id, categoria);
create index if not exists idx_processos_periodicidade on app.processos (company_id, periodicidade);

comment on column app.processos.periodicidade is
  'Cadência classificada. NULA quando a origem não permite classificar: sem cadência conhecida não é "sob demanda".';
comment on column app.processos.periodicidade_origem is
  'O que a fonte escreveu, palavra por palavra. Nunca é sobrescrito pela classificação.';
comment on column app.processos.prazo_referencia is
  'Prazo como a área o enuncia ("dia 5", "do 1º ao 3º dia útil", "15 dias antes do vencimento"). Texto de propósito: não é data, é regra de calendário.';
comment on column app.processos.pendencia_de_mapeamento is
  'Pergunta ou tarefa que veio junto do nome na fonte. Não nulo significa que o mapeamento deste processo está incompleto por decisão pendente, não por preguiça.';

create table if not exists app.processo_pop (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  processo_id uuid not null unique references app.processos(id) on delete cascade,

  codigo text,
  versao int not null default 1 check (versao >= 1),

  objetivo text,
  abrangencia text,

  definicoes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(definicoes) = 'array'),

  responsabilidades jsonb not null default '[]'::jsonb
    check (jsonb_typeof(responsabilidades) = 'array'),

  controles_internos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(controles_internos) = 'array'),
  registros jsonb not null default '[]'::jsonb
    check (jsonb_typeof(registros) = 'array'),

  riscos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(riscos) = 'array'),

  elaborado_por uuid references auth.users(id) on delete set null,
  revisado_por uuid references auth.users(id) on delete set null,
  aprovado_por uuid references auth.users(id) on delete set null,
  data_emissao date,

  status text not null default 'rascunho'
    check (status in ('rascunho','em_revisao','vigente','obsoleto')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create index if not exists idx_pop_company on app.processo_pop (company_id);
create index if not exists idx_pop_status on app.processo_pop (company_id, status);

drop trigger if exists trg_processo_pop_updated on app.processo_pop;
create trigger trg_processo_pop_updated before update on app.processo_pop
  for each row execute function app.set_updated_at();

create table if not exists app.processo_pop_revisoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  pop_id uuid not null references app.processo_pop(id) on delete cascade,
  versao int not null,
  data date not null default current_date,
  alteracao text not null,
  responsavel_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create index if not exists idx_pop_revisoes_company on app.processo_pop_revisoes (company_id);
create index if not exists idx_pop_revisoes_pop on app.processo_pop_revisoes (pop_id, versao desc);

alter table app.processo_pop enable row level security;

drop policy if exists processo_pop_select on app.processo_pop;
create policy processo_pop_select on app.processo_pop for select
  using (app.belongs_to_company((select auth.uid()), company_id));

drop policy if exists processo_pop_insert on app.processo_pop;
create policy processo_pop_insert on app.processo_pop for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));

drop policy if exists processo_pop_update on app.processo_pop;
create policy processo_pop_update on app.processo_pop for update
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.edit'))
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));

drop policy if exists processo_pop_delete on app.processo_pop;
create policy processo_pop_delete on app.processo_pop for delete
  using (app.is_company_admin((select auth.uid()), company_id)
         or app.has_permission((select auth.uid()), company_id, 'processo.delete'));

grant select, insert, update, delete on app.processo_pop to authenticated;

alter table app.processo_pop_revisoes enable row level security;

drop policy if exists pop_revisoes_select on app.processo_pop_revisoes;
create policy pop_revisoes_select on app.processo_pop_revisoes for select
  using (app.belongs_to_company((select auth.uid()), company_id));

drop policy if exists pop_revisoes_insert on app.processo_pop_revisoes;
create policy pop_revisoes_insert on app.processo_pop_revisoes for insert
  with check (app.is_company_admin((select auth.uid()), company_id)
              or app.has_permission((select auth.uid()), company_id, 'processo.edit'));

drop policy if exists pop_revisoes_update on app.processo_pop_revisoes;
create policy pop_revisoes_update on app.processo_pop_revisoes for update
  using (app.is_company_admin((select auth.uid()), company_id))
  with check (app.is_company_admin((select auth.uid()), company_id));

drop policy if exists pop_revisoes_delete on app.processo_pop_revisoes;
create policy pop_revisoes_delete on app.processo_pop_revisoes for delete
  using (app.is_company_admin((select auth.uid()), company_id));

grant select, insert, update, delete on app.processo_pop_revisoes to authenticated;

create or replace function app.get_role_preset_permissions(_role text)
returns text[] language sql immutable set search_path to 'app', 'public' as $function$
  select case _role
    when 'company_admin' then array[
      'okr.view','okr.edit','okr.delete','okr.checkin',
      'projeto.view','projeto.edit','projeto.delete','sprint.manage',
      'atividade.view','atividade.edit',
      'processo.view','processo.edit','processo.delete','melhoria.edit','pop.aprovar',
      'kit.view','opr.edit','opr.publish','bonus.view','bonus.config',
      'admin.areas','admin.pessoas','admin.permissoes'
    ]
    when 'diretor' then array[
      'okr.view','okr.edit','okr.checkin',
      'projeto.view','projeto.edit','sprint.manage','atividade.view','atividade.edit',
      'processo.view','processo.edit','melhoria.edit','pop.aprovar',
      'kit.view','opr.edit','opr.publish','bonus.view'
    ]
    when 'gerente' then array[
      'okr.view','okr.edit','okr.checkin',
      'projeto.view','projeto.edit','sprint.manage','atividade.view','atividade.edit',
      'processo.view','processo.edit','melhoria.edit','pop.aprovar',
      'kit.view','opr.edit','opr.publish'
    ]
    when 'coordenador' then array[
      'okr.view','okr.checkin','projeto.view','projeto.edit',
      'atividade.view','atividade.edit','processo.view','melhoria.edit','kit.view'
    ]
    when 'especialista' then array[
      'okr.view','okr.checkin','projeto.view','projeto.edit',
      'atividade.view','atividade.edit','processo.view','processo.edit','melhoria.edit'
    ]
    when 'colaborador' then array[
      'okr.view','projeto.view','atividade.view','atividade.edit','processo.view'
    ]
    else array[]::text[]
  end;
$function$;

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
    'lacunas', to_jsonb(v_lacunas));
end;
$fn$;

create or replace function app.processo_pop_aprovar(p_pop_id uuid, p_alteracao text default null)
returns app.processo_pop
language plpgsql security definer set search_path = app, public as $fn$
declare
  v_pop app.processo_pop;
begin
  select * into v_pop from app.processo_pop where id = p_pop_id;
  if v_pop.id is null then
    raise exception 'POP inexistente' using errcode = 'P0002';
  end if;

  if not (app.is_super_admin(auth.uid())
          or app.is_company_admin(auth.uid(), v_pop.company_id)
          or app.has_permission(auth.uid(), v_pop.company_id, 'pop.aprovar')) then
    raise exception 'Sem permissão para aprovar POP' using errcode = '42501';
  end if;

  if v_pop.status = 'vigente' then
    raise exception 'Este POP já está vigente na versão %', v_pop.versao
      using errcode = '22023';
  end if;

  update app.processo_pop
     set status = 'vigente', aprovado_por = auth.uid(),
         data_emissao = coalesce(data_emissao, current_date)
   where id = p_pop_id
   returning * into v_pop;

  insert into app.processo_pop_revisoes (company_id, pop_id, versao, alteracao, responsavel_user_id)
  values (v_pop.company_id, v_pop.id, v_pop.versao,
          coalesce(nullif(trim(p_alteracao), ''), 'Aprovação da versão ' || v_pop.versao),
          auth.uid());

  return v_pop;
end;
$fn$;

revoke all on function app.processo_pop_completo(uuid) from public, anon;
revoke all on function app.processo_pop_aprovar(uuid, text) from public, anon;
revoke all on function app.get_role_preset_permissions(text) from public, anon;
grant execute on function app.processo_pop_completo(uuid) to authenticated;
grant execute on function app.processo_pop_aprovar(uuid, text) to authenticated;
grant execute on function app.get_role_preset_permissions(text) to authenticated;
