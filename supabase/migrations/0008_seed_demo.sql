-- 0008: Dados de demonstração: Grupo Horizonte (empresa fictícia).

insert into app.companies (id, razao_social, nome_fantasia, tipo, parent_company_id) values
  ('11111111-1111-1111-1111-111111111111', 'Horizonte Participações S.A.', 'Grupo Horizonte', 'holding', null),
  ('22222222-2222-2222-2222-222222222222', 'Horizonte Distribuição Ltda.', 'Horizonte Distribuição', 'controlada', '11111111-1111-1111-1111-111111111111'),
  ('33333333-3333-3333-3333-333333333333', 'Horizonte Serviços Ltda.', 'Horizonte Serviços', 'controlada', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into app.perspectivas (company_id, chave, nome, ordem, cor_token) values
  ('11111111-1111-1111-1111-111111111111','financeiro','Financeiro',1,'info'),
  ('11111111-1111-1111-1111-111111111111','clientes','Clientes',2,'success'),
  ('11111111-1111-1111-1111-111111111111','processos','Processos',3,'warning'),
  ('11111111-1111-1111-1111-111111111111','aprendizagem','Aprendizagem Organizacional',4,'primary')
on conflict (company_id, chave) do nothing;

insert into app.objetivos_estrategicos (company_id, perspectiva_id, titulo, ciclo, is_estrela_do_norte)
select c.id, p.id, v.titulo, '2026-2029', v.estrela
from (values
  ('financeiro','Margem operacional sustentável (Estrela do Norte)', true),
  ('financeiro','Crescer receita recorrente', false),
  ('financeiro','Disciplina de custos e capital de giro', false),
  ('clientes','Encantar o cliente na entrega', false),
  ('clientes','Lançar novas linhas de serviço', false),
  ('clientes','Reduzir a perda de clientes', false),
  ('processos','Integrar os sistemas de gestão', false),
  ('processos','Gestão por indicadores em todas as áreas', false),
  ('processos','Automatizar processos repetitivos com IA', false),
  ('aprendizagem','Time com senso de dono', false),
  ('aprendizagem','Formar líderes', false),
  ('aprendizagem','Governança e compliance maduros', false)
) as v(chave, titulo, estrela)
join app.companies c on c.id = '11111111-1111-1111-1111-111111111111'
join app.perspectivas p on p.company_id = c.id and p.chave = v.chave
on conflict do nothing;

insert into app.areas (company_id, nome, tipo) values
  ('11111111-1111-1111-1111-111111111111','Diretoria Comercial','diretoria'),
  ('11111111-1111-1111-1111-111111111111','Diretoria de Operações','diretoria'),
  ('11111111-1111-1111-1111-111111111111','Diretoria Administrativo-Financeiro','diretoria'),
  ('11111111-1111-1111-1111-111111111111','Diretoria de Pessoas','diretoria'),
  ('11111111-1111-1111-1111-111111111111','Comitê S&OP','comite'),
  ('11111111-1111-1111-1111-111111111111','Comitê de Orçamento','comite'),
  ('11111111-1111-1111-1111-111111111111','Comitê de IA','comite'),
  ('11111111-1111-1111-1111-111111111111','Comitê de LGPD','comite')
on conflict do nothing;

insert into app.bonus_config (company_id, ano, pesos, reguas) values
(
  '11111111-1111-1111-1111-111111111111', 2026,
  '{"global": 0.60, "setorial": 0.25, "individual": 0.15, "ebitda": 0.60, "faturamento": 0.40}'::jsonb,
  '{
     "ebitda": [
       {"min": 0,     "max": 85.0,  "paga": 0},
       {"min": 85.01, "max": 92.0,  "paga": 50},
       {"min": 92.01, "max": 99.99, "paga": 75},
       {"min": 100.0, "max": null,  "paga": 100}
     ],
     "faturamento": [
       {"min": 0,     "max": 90.0,  "paga": 0},
       {"min": 90.01, "max": 99.99, "paga": 70},
       {"min": 100.0, "max": null,  "paga": 100}
     ],
     "multiplicador_nivel": {
       "diretor": 2.5, "gerente": 1.8, "coordenador": 1.3,
       "especialista": 1.2, "colaborador": 1
     }
   }'::jsonb
)
on conflict (company_id, ano) do nothing;
