#!/usr/bin/env bash
# Aponta o Supabase Auth para o domínio de produção.
#
# Rode DEPOIS do primeiro deploy, quando a Cloudflare já tiver dado a URL:
#
#   ./scripts/auth-dominio.sh https://bussola.pages.dev
#   ./scripts/auth-dominio.sh https://bussola.suaempresa.com.br
#
# Por que isto importa: `site_url` é o destino que o Supabase usa em qualquer
# link que ele envia por e-mail (recuperação de senha, confirmação). Se ficar
# apontando para localhost, o link chega no e-mail da pessoa e leva a lugar
# nenhum, e quem clicou acha que o sistema está fora do ar.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
# shellcheck disable=SC1091
source "$raiz/.env.local"
set +a

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN não definida em .env.local}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF não definida em .env.local}"

dominio="${1:-}"
if [[ -z "$dominio" ]]; then
  echo "Uso: $0 https://seu-dominio" >&2
  exit 1
fi
dominio="${dominio%/}"

# A lista de permitidos guarda:
#   - o domínio de produção
#   - os previews da Cloudflare, que têm hash no subdomínio a cada deploy
#   - o desenvolvimento local, para o time não perder o ambiente de trabalho
permitidos="${dominio}/**,https://*.pages.dev/**,http://localhost:5173/**,http://localhost:4173/**"

curl -sf -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(printf '{"site_url":"%s","uri_allow_list":"%s","disable_signup":true}' "$dominio" "$permitidos")" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('site_url        ', d.get('site_url'))
print('uri_allow_list  ', d.get('uri_allow_list'))
print('cadastro aberto ', d.get('disable_signup') and 'não (correto: o acesso é por convite)' or 'SIM, ATENÇÃO')
"
echo
echo "Pronto. O CSP do site também precisa conhecer este domínio? Não: o CSP"
echo "restringe para ONDE o site fala (o Supabase), não de onde ele é servido."
