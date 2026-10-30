import { ehObjetivo, ehOkr, type NivelDeOkr, type NoDoGrafo } from '@/features/okr/grafo/tipos'

/**
 * Espelho de `app.okr_nivel_aceita_pai` (migration 0037). Serve para o
 * canvas destacar alvos válidos ENQUANTO a pessoa arrasta. Quem decide é o
 * banco: se as duas tabelas divergirem, a RPC recusa e a aresta volta.
 */
export function nivelAceitaPai(filho: NivelDeOkr, pai: NivelDeOkr): boolean {
  switch (filho) {
    case 'diretoria':
      return pai === 'corporativo'
    case 'gerencia':
      return pai === 'diretoria'
    case 'individual':
      return pai === 'gerencia' || pai === 'diretoria'
    default:
      return false
  }
}

/** Espelho do `okr_desdobrar`: o filho nasce um degrau abaixo, e individual não desce mais. */
export function nivelDoFilho(pai: NivelDeOkr): NivelDeOkr {
  switch (pai) {
    case 'corporativo':
      return 'diretoria'
    case 'diretoria':
      return 'gerencia'
    default:
      return 'individual'
  }
}

export type ResultadoDeConexao = { ok: true } | { ok: false; motivo: string }

/**
 * `origem` é o lado do pai (alça direita); `destino` é o lado do filho
 * (alça esquerda). A regra é a mesma para conectar e para religar.
 */
export function podeConectar(origem: NoDoGrafo, destino: NoDoGrafo): ResultadoDeConexao {
  if (origem.id === destino.id) return { ok: false, motivo: 'Um OKR não liga a si mesmo' }
  if (ehObjetivo(destino)) return { ok: false, motivo: 'Um objetivo estratégico não tem pai' }
  if (ehObjetivo(origem)) {
    return destino.nivel === 'corporativo'
      ? { ok: true }
      : { ok: false, motivo: 'Só um OKR corporativo liga direto a um objetivo estratégico' }
  }
  if (ehOkr(origem) && nivelAceitaPai(destino.nivel, origem.nivel)) return { ok: true }
  return { ok: false, motivo: `Um OKR de ${destino.nivel} não liga a um OKR de ${origem.nivel}` }
}
