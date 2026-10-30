-- okr_arvore: uma linha por OKR, mesmo com filtro de área (regressão da 0036).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';

do $$
declare
  v_area uuid;
  v_linhas int;
  v_distintos int;
  v_raizes int;
begin
  select a.id into v_area from app.areas a
   where a.company_id = '11111111-1111-1111-1111-111111111111'
     and a.nome = 'Diretoria Administrativo-Financeiro';
  if v_area is null then
    raise exception 'FALHOU: fixture ausente, a área Diretoria Administrativo-Financeiro não existe';
  end if;

  select count(*), count(distinct t.id), count(*) filter (where t.profundidade = 0)
    into v_linhas, v_distintos, v_raizes
    from app.okr_arvore('11111111-1111-1111-1111-111111111111', 2026, v_area) t;

  if v_linhas <> v_distintos then
    raise exception 'FALHOU: okr_arvore devolveu % linhas para % OKRs (duplicou)', v_linhas, v_distintos;
  end if;
  if v_raizes <> 1 then
    raise exception 'FALHOU: com filtro na diretoria, esperava 1 raiz e veio %', v_raizes;
  end if;
end $$;

rollback;
