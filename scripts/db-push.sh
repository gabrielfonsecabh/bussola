#!/usr/bin/env bash
# Aplica as migrations de supabase/migrations/ em ordem numérica.
#
#   ./scripts/db-push.sh              # todas
#   ./scripts/db-push.sh 0010         # só as que começam com 0010
#
# Cada arquivo roda em UMA transação (--single-transaction): ou entra inteiro
# ou não entra. Para na primeira falha, em vez de deixar o banco meio aplicado.
#
# Funciona sem o CLI do Supabase e sem Docker: só precisa de psql.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
filtro="${1:-}"

for arquivo in "$raiz"/supabase/migrations/${filtro}*.sql; do
  nome="$(basename "$arquivo")"
  # 0099 é só verificação, não altera nada: rode com `npm run db:verificar`.
  [[ "$nome" == 0099_* ]] && continue
  printf '%-40s ' "$nome"
  if "$raiz/scripts/psql.sh" -q --single-transaction -f "$arquivo" > /tmp/bussola-migration.log 2>&1; then
    echo 'ok'
  else
    echo 'FALHOU'
    tail -20 /tmp/bussola-migration.log >&2
    exit 1
  fi
done
echo 'Todas as migrations aplicadas.'
