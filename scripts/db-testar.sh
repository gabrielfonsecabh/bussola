#!/usr/bin/env bash
# Roda os testes SQL de supabase/tests/ contra o banco, um arquivo por vez.
#
#   ./scripts/db-testar.sh              # todos
#   ./scripts/db-testar.sh okr_grafo    # só os que começam com okr_grafo
#
# Cada arquivo abre `begin;` e termina em `rollback;`: nada que o teste
# grava sobrevive. Uma asserção falha com `raise exception 'FALHOU: ...'`,
# e o psql (ON_ERROR_STOP, herdado do psql.sh) sai com código diferente
# de zero. O runner para no primeiro arquivo que falhar.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
filtro="${1:-}"
falhas=0

for arquivo in "$raiz"/supabase/tests/${filtro}*.sql; do
  [[ -e "$arquivo" ]] || { echo "Nenhum teste casa com '${filtro}'." >&2; exit 1; }
  nome="$(basename "$arquivo")"
  printf '%-32s ' "$nome"
  if saida="$("$raiz/scripts/psql.sh" -q -f "$arquivo" 2>&1)"; then
    echo 'ok'
  else
    echo 'FALHOU'
    # O grep sem match sai com status 1 e, sob `set -e`, derrubaria o script
    # antes do `break`. E falha de infraestrutura (conexão recusada, timeout)
    # não casa nenhum destes padrões: sem o fallback, o erro sairia mudo.
    if ! echo "$saida" | grep -E 'FALHOU|ERROR|LINE' | head -20 >&2; then
      echo "$saida" | tail -20 >&2
    fi
    falhas=$((falhas + 1))
    break
  fi
done

[[ $falhas -eq 0 ]] && echo 'Todos os testes SQL passaram.'
exit $falhas
