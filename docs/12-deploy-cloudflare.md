# Deploy na Cloudflare

O Bússola é um SPA: um monte de arquivo estático mais um banco Supabase. Não há
servidor de aplicação para manter. O deploy é a Cloudflare servindo o `dist/` e
o navegador falando direto com o Supabase.

## O que já está no repositório

| Arquivo | O que faz |
|---|---|
| `wrangler.toml` | Build, diretório de assets e rota de SPA, para o deploy não depender do que está digitado no painel |
| `.node-version` | Fixa o Node em 24, para o build da nuvem não divergir do local |
| `scripts/cloudflare.ts` | Plugin do Vite que gera `_redirects` e `_headers` no fim do build |
| `scripts/auth-dominio.sh` | Aponta o Supabase Auth para o domínio de produção, depois do primeiro deploy |

## Passo a passo, uma vez só

### 1. Conectar o repositório

No painel da Cloudflare: **Workers & Pages > Create > Workers > Import a
repository**, escolha o seu fork deste repositório, branch `main`.

Não precisa preencher comando de build nem diretório de saída: os dois estão em
`wrangler.toml`, e o `wrangler deploy` roda o build sozinho por causa da seção
`[build]`.

**Se o projeto tiver sido criado como Pages** em vez de Workers, o
`wrangler.toml` precisa de `pages_build_output_dir = "dist"` no lugar das seções
`[build]` e `[assets]`, e o painel precisa do comando de build. Os dois fluxos
existem, fazem a mesma coisa, e a configuração deles NÃO é intercambiável: foi
o que quebrou o primeiro deploy, com a mensagem "Missing entry-point to Worker
script or to assets directory".

### 2. Definir as duas variáveis de BUILD

Este é o passo que mais dá errado, porque o Workers tem **dois conjuntos de
variáveis com nomes quase iguais**, e o que aparece primeiro é o errado para
este caso:

| Onde | Quando vale | Serve aqui? |
|---|---|---|
| Settings > **Variables and Secrets** | em execução, dentro do Worker | **Não** |
| Settings > **Build** > Variables and secrets | durante o build | **Sim** |

O Vite grava as variáveis DENTRO do bundle no momento do build. Uma variável de
runtime nunca chega lá, e o build falha com a mensagem explicando isto.

Em **Settings > Build > Variables and secrets**:

```
VITE_SUPABASE_URL       https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY  <a chave pública do projeto>
```

**Só essas duas.** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` e
`SUPABASE_DB_PASSWORD` NÃO vão para a Cloudflare, nem no build nem no runtime. Elas não são usadas pelo
frontend, e um build é visível para qualquer pessoa com acesso ao projeto.

A chave anônima ir para o bundle é normal e esperado: ela é pública por
desenho, e quem protege os dados é a RLS do Postgres, não o segredo da chave.

### 3. Apontar o Supabase para o domínio

Depois do primeiro deploy, com a URL em mãos:

```bash
./scripts/auth-dominio.sh https://bussola.pages.dev
```

Isso ajusta `site_url` e a lista de URLs permitidas. Sem isso, qualquer link
que o Supabase mande por e-mail aponta para `localhost` e não abre nada.

### 4. Conferir

Abra o site e confira quatro coisas:

1. **A tela de entrada carrega** com a fonte certa (se a fonte caiu para o
   padrão do sistema, o CSP está bloqueando o Google Fonts).
2. **O login funciona** (se não, o CSP não conhece a URL do Supabase).
3. **Abrir `/processos/jornada` direto na barra de endereço** não dá 404.
4. **O console do navegador está limpo**, sem nenhuma linha de
   "Content Security Policy".

## Testar o deploy sem publicar

Duas coisas dão para conferir da sua máquina, e vale fazer antes de subir
qualquer mudança que toque em build ou em cabeçalho:

```bash
npx wrangler deploy --dry-run    # roda o build e valida a configuração
npx wrangler dev --local         # serve o dist com os cabeçalhos de verdade
```

Com o `dev` de pé, confira os cabeçalhos e a rota profunda:

```bash
curl -s -D - -o /dev/null http://127.0.0.1:8787/ | grep -i "content-security"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8787/processos/jornada
```

Verificado desta forma: os sete cabeçalhos de segurança são aplicados, a rota
profunda devolve 200, o asset vem com cache de um ano, e `_headers` e
`_redirects` NÃO são servidos publicamente (a plataforma os consome e o caminho
cai no fallback do SPA).

## O que o build gera sozinho

### Rota profunda, sem `_redirects`

Quem resolve é `not_found_handling = "single-page-application"` no
`wrangler.toml`: qualquer caminho que não casa com um arquivo devolve o
`index.html` com 200.

**Não crie um `_redirects` com `/*  /index.html  200`.** É o jeito clássico em
outras plataformas e o Workers o REJEITA no upload, depois de já ter enviado
todos os assets:

```
Invalid _redirects configuration: Line 1: Infinite loop detected in this rule.
This would cause a redirect to strip `.html` or `/index` and end up triggering
this rule again.
```

E não dá para pegar antes: `wrangler deploy --dry-run` e `wrangler dev` aceitam
o arquivo sem reclamar. A validação só roda no servidor.

### `_headers`

Um CSP com a URL EXATA do seu Supabase e o hash do script inline do
`index.html` (aquele que aplica o tema antes da primeira pintura, para a tela
não piscar branco no modo escuro).

Gerado no build, e não guardado em `public/`, por dois motivos: um arquivo
estático só conseguiria um curinga `*.supabase.co`, que aceitaria qualquer
projeto Supabase do mundo como destino; e o hash do script muda se o script
mudar, então escrevê-lo à mão seria garantir que ele fica errado um dia.

### Variable ou Secret?

**Variable**, para as duas. A chave anônima é pública por desenho: o Vite a
grava dentro do bundle que todo visitante baixa, então marcá-la como Secret
esconderia apenas do painel, sem mudar nada no que é publicado. E Secret na
Cloudflare é write-only, o que só atrapalha na hora de conferir o que está
configurado. Quem protege os dados é a RLS.

O build **falha** se `VITE_SUPABASE_URL` não estiver definida. É de propósito:
sem ela, o site subiria bonito e incapaz de falar com o banco, e o erro
apareceria só no console de quem abrisse.

Os assets ganham cache de um ano (os nomes têm hash de conteúdo, então o
conteúdo nunca muda sob o mesmo nome) e o `index.html` ganha `no-cache`, porque
é ele quem aponta para os assets novos a cada deploy.

## Segurança do lado do Supabase

**O cadastro público está desligado** (`disable_signup`). O Bússola é por
convite: não existe tela de cadastro, e a única entrada é a Edge Function
`cadastrar-pessoa`. Com o cadastro aberto, qualquer pessoa com a chave anônima,
que está no bundle, poderia criar conta. Ela não veria dado nenhum, porque sem
vínculo a RLS bloqueia tudo, mas encheria a tabela de usuários.

Para reverter, se um dia fizer sentido:

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" -d '{"disable_signup": false}'
```

Mudança de config do Auth leva cerca de meio minuto para valer.

## Migrations e Edge Functions não entram no deploy

A Cloudflare publica só o frontend. O banco continua sendo aplicado daqui:

```bash
npm run db:push      # migrations
npm run db:types     # regenera os tipos depois
```

E a Edge Function do convite, quando mudar:

```bash
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/functions/deploy?slug=cadastrar-pessoa" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -F 'metadata={"entrypoint_path":"index.ts","name":"cadastrar-pessoa","verify_jwt":true};type=application/json' \
  -F "file=@supabase/functions/cadastrar-pessoa/index.ts;filename=index.ts;type=application/typescript"
```

Atenção: a API aceita um `POST /functions` com o corpo em JSON e devolve 201
sem subir código nenhum. A função nasce vazia e responde `BOOT_ERROR`. O upload
que funciona é o multipart acima.

## Ordem quando houver mudança de banco

Migration primeiro, deploy depois. O frontend novo pode depender de uma coluna
que ainda não existe; o frontend antigo raramente quebra por uma coluna nova.

## O guia de uso

`docs/guia-do-bussola.html` é um arquivo ÚNICO, com as telas embutidas, feito
para anexar num e-mail ou mandar por WhatsApp. Não depende de pasta de imagens
ao lado.

Para regerar depois de mudar telas ou texto:

```bash
python3 scripts/gerar-guia.py
```

O texto vive em `docs/guia/guia.src.html` e as capturas em `docs/guia/telas/`.
Quando uma tela mudar de verdade, recapture a imagem com o mesmo nome e rode o
script de novo.
