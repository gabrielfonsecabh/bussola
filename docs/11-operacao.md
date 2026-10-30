# 11 - Operação (runbook)

O que fazer no dia a dia, com o comando exato. Tudo abaixo assume o
`.env.local` preenchido.

## Acesso

| Ambiente | Endereço |
|---|---|
| Local | `npm run dev` em http://localhost:5173 |
| Banco | o seu projeto Supabase |

O primeiro login pede a troca da senha. Isso não é uma tela opcional: a flag
`app.profiles.deve_trocar_senha` prende o acesso até o usuário escolher a
própria senha, e só `app.senha_trocada()` (que age sobre `auth.uid()`, nunca
sobre terceiros) libera.

Política de senha, configurada no Auth: mínimo de 10 caracteres, com
minúscula, maiúscula e número.

## Cadastrar uma pessoa

1. Crie o usuário no Auth (Dashboard > Authentication > Add user, com
   "Auto Confirm User" ligado, ou pela Admin API).
2. Vincule à empresa e marque a troca de senha obrigatória:

```sql
-- vínculo
insert into app.company_users (company_id, user_id, is_admin, is_active, cargo, nivel)
values ('<company_id>', '<user_id>', false, true, 'Gerente de Tesouraria', 'gerente');

-- papel (define as permissões, via preset SQL)
insert into app.user_roles (company_id, user_id, role)
values ('<company_id>', '<user_id>', 'gerente');

-- primeira senha é provisória
update app.profiles set deve_trocar_senha = true where user_id = '<user_id>';
```

Depois disso, cargo, nível, papel e situação são editáveis pela tela
**Administração > Pessoas**.

## Tirar o acesso de alguém

Desmarque "Vínculo ativo" em Administração > Pessoas. O efeito é imediato:
`app.has_permission` exige vínculo ativo, então a pessoa perde as permissões
do papel na mesma hora, sem precisar mexer no Auth.

## Banco

```bash
npm run db:psql                 # sessão interativa
npm run db:push                 # aplica todas as migrations, em ordem
npm run db:push 0010            # aplica só as que começam com 0010
npm run db:verificar            # roda as queries de blindagem do 0099
npm run db:types                # regenera src/types/database.ts
```

Depois de QUALQUER migration, rode `npm run db:types`. Tipo escrito à mão
diverge do banco em silêncio.

### Verificação de segurança (Definition of Done)

`npm run db:verificar` precisa mostrar, para toda tabela do schema `app`:
4 políticas, RLS ligada, e zero grants de EXECUTE para `PUBLIC`/`anon`.

E o teste do caminho NEGADO, que é o que realmente prova o isolamento:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"<uuid de alguém de OUTRA empresa>","role":"authenticated"}', true);

select count(*) from app.okrs;                       -- espera 0
select count(*) from app.okr_arvore('<company>', 2026); -- espera erro 42501
rollback;
```

Um teste que só prova o caminho permitido passa contra uma policy que libera
todo mundo.

## Faróis

O farol compara o atingimento com o ESPERADO pelo tempo decorrido do ciclo.
Isso quer dizer que ele envelhece sozinho: um KR parado em 40% era verde em
maio e é vermelho em novembro, sem ninguém tocar nele.

O botão "Recalcular faróis" na Árvore de OKR reprocessa a empresa inteira.
Para automatizar, agende `select app.farol_recalcular('<company_id>');` via
pg_cron (diário, de madrugada).

## Kit de gestão

O status de cada item é derivado dos módulos, não digitado. "Congelar o mês"
grava o resultado em `app.kit_gestao` para virar histórico, que é o que a
apuração de bônus consome depois.

## Deploy

O app é uma SPA estática. `npm run build` gera `dist/`.

Na Vercel (ou equivalente), configure:

- Build: `npm run build`. Output: `dist`.
- Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Nada de
  `service_role`.
- Rewrite de SPA: todas as rotas para `/index.html`, senão recarregar em
  `/gestao/kit` devolve 404.

E no Supabase, Authentication > URL Configuration:

- `Site URL`: o domínio de produção.
- `Redirect URLs`: incluir `https://<dominio>/**`, senão o link de recuperação
  de senha volta para o lugar errado.

Hoje esses campos apontam para `http://localhost:5173`, que é o certo enquanto
o app só roda local.

## Pendências conhecidas

- **Proteção contra senha vazada (HaveIBeenPwned)** exige plano Pro no
  Supabase. Vale ligar quando o projeto subir de plano:
  Authentication > Policies > Leaked password protection.
- **Backups e MFA**: revisar em Settings, também dependentes de plano.
- **Assiduidade do bônus** entra por lançamento manual no v1. A apuração já
  grava o componente sem valor, para a tela distinguir "sem dado" de "zero".
- **Integração com ERP** populando `app.indicador_medicoes` continua prevista
  no schema (`origem = 'erp'`) e não
  implementada. Contribuições são bem-vindas.
