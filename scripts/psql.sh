#!/usr/bin/env bash
# Abre um psql no banco da Bússola usando o .env.local.
#
#   ./scripts/psql.sh                      # sessão interativa
#   ./scripts/psql.sh -c "select 1;"       # comando único
#   ./scripts/psql.sh -f arquivo.sql       # roda um arquivo
#
# Usa o pooler em modo SESSÃO (porta 5432). O host direto
# (db.<ref>.supabase.co) é só IPv6 e não resolve em rede IPv4.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -f "$raiz/.env.local" ]]; then
  echo "Falta .env.local. Copie de .env.example e preencha." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$raiz/.env.local"
set +a

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF não definida em .env.local}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD não definida em .env.local}"

: "${SUPABASE_DB_HOST:=aws-0-sa-east-1.pooler.supabase.com}"
: "${SUPABASE_DB_PORT:=5432}"

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
exec psql \
  -h "$SUPABASE_DB_HOST" \
  -p "$SUPABASE_DB_PORT" \
  -U "postgres.$SUPABASE_PROJECT_REF" \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  "$@"
