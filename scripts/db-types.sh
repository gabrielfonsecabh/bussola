#!/usr/bin/env bash
# Regenera src/types/database.ts a partir do banco.
#
# Usa a Management API em vez do `supabase gen types`, para não depender de
# Docker.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
# shellcheck disable=SC1091
source "$raiz/.env.local"
set +a

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN não definida em .env.local}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF não definida em .env.local}"

destino="$raiz/src/types/database.ts"
resposta="$(mktemp)"
trap 'rm -f "$resposta"' EXIT

curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/types/typescript?included_schemas=app" \
  -o "$resposta"

python3 - "$resposta" "$destino" <<'PY'
import json, sys
origem, destino = sys.argv[1], sys.argv[2]
tipos = json.load(open(origem))['types']
cabecalho = '''/**
 * Tipos gerados do banco. NÃO EDITE À MÃO.
 *
 * Regerar depois de qualquer migration:
 *   npm run db:types
 *
 * Tipos escritos à mão divergem do banco em silêncio, que é exatamente a
 * classe de falha que este projeto combate.
 */

'''
open(destino, 'w').write(cabecalho + tipos)
print(f'{destino}: {tipos.count(chr(10))} linhas')
PY
