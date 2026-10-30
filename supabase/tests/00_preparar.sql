-- Prepara os dois usuários de teste: super admin com vínculo na holding e um
-- usuário de QA que só pertence à Horizonte Serviços. Os dois precisam existir
-- no Auth antes. Idempotente.
insert into app.platform_admins(user_id) values ('00000000-0000-0000-0000-00000000a001') on conflict do nothing;
insert into app.company_users(company_id,user_id,is_admin,is_active) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000a001',true,true) on conflict do nothing;
insert into app.company_users(company_id,user_id,is_admin,is_active) values ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000a002',false,true) on conflict do nothing;
