-- 0001: Extensões, schema app e funções utilitárias.

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;

grant usage on schema app to authenticated;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'Trigger BEFORE UPDATE: mantém updated_at = now().';

revoke all on function app.set_updated_at() from public, anon;
