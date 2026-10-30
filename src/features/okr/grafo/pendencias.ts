import {
  CHAVES_DE_KR,
  GRUPOS_DE_PENDENCIA,
  ROTULO_DA_PENDENCIA,
  ehOkr,
  type ChaveDePendencia,
  type GrupoDePendencia,
  type NoDoGrafo,
} from '@/features/okr/grafo/tipos'
import type { LinhaExportavel } from '@/lib/exportar'

/**
 * Uma pendência apontável: o painel lista, o cartão conta, o CSV exporta.
 * Tudo aqui só REORGANIZA o array `pendencias` que veio do banco. Nenhuma
 * pendência é deduzida de valor bruto no cliente, para que a tela, o CSV e
 * qualquer painel futuro digam o mesmo número.
 */
export type ItemDePendencia = {
  chave: ChaveDePendencia
  /** id do nó no canvas (objetivo ou OKR) */
  noId: string
  /** id do KR quando a pendência é do KR */
  krId: string | null
  /** o que aparece na linha: título do OKR/objetivo, ou descrição do KR */
  titulo: string
  okrTitulo: string
  area: string | null
  dono: string | null
}

export function listarPendencias(nos: NoDoGrafo[]): ItemDePendencia[] {
  const itens: ItemDePendencia[] = []
  for (const no of nos) {
    if (!ehOkr(no)) {
      for (const chave of no.pendencias) {
        itens.push({ chave, noId: no.id, krId: null, titulo: no.titulo, okrTitulo: no.titulo, area: null, dono: null })
      }
      continue
    }
    for (const chave of no.pendencias) {
      if (CHAVES_DE_KR.has(chave)) continue
      itens.push({ chave, noId: no.id, krId: null, titulo: no.titulo, okrTitulo: no.titulo, area: no.area_nome, dono: no.owner_nome })
    }
    for (const kr of no.krs) {
      for (const chave of kr.pendencias) {
        itens.push({ chave, noId: no.id, krId: kr.id, titulo: kr.descricao, okrTitulo: no.titulo, area: no.area_nome, dono: no.owner_nome })
      }
    }
  }
  return itens
}

/** O número da bolinha do cartão. É `listarPendencias([no]).length`, sem alocar a lista. */
export function contarPendenciasDoNo(no: NoDoGrafo): number {
  if (!ehOkr(no)) return no.pendencias.length
  const doOkr = no.pendencias.filter((c) => !CHAVES_DE_KR.has(c)).length
  const dosKrs = no.krs.reduce((s, kr) => s + kr.pendencias.length, 0)
  return doOkr + dosKrs
}

export type GrupoAgrupado = {
  grupo: GrupoDePendencia
  rotulo: string
  total: number
  itens: ItemDePendencia[]
}

export function agruparPendencias(itens: ItemDePendencia[]): GrupoAgrupado[] {
  const grupos: GrupoAgrupado[] = []
  for (const def of GRUPOS_DE_PENDENCIA) {
    const doGrupo = itens.filter((i) => def.chaves.includes(i.chave))
    if (doGrupo.length === 0) continue
    grupos.push({ grupo: def.grupo, rotulo: def.rotulo, total: doGrupo.length, itens: doGrupo })
  }
  return grupos
}

export function linhasDePendenciasParaCsv(itens: ItemDePendencia[]): LinhaExportavel[] {
  return itens.map((i) => ({
    tipo: ROTULO_DA_PENDENCIA[i.chave],
    okr: i.okrTitulo,
    kr: i.krId ? i.titulo : '',
    area: i.area ?? '',
    dono: i.dono ?? '',
  }))
}

/** Filtro vazio = tudo passa. Com filtro, o nó passa se ele OU um KR dele tem alguma das chaves. */
export function noTemPendencia(no: NoDoGrafo, filtro: ReadonlySet<ChaveDePendencia>): boolean {
  if (filtro.size === 0) return true
  if (no.pendencias.some((c) => filtro.has(c))) return true
  if (!ehOkr(no)) return false
  return no.krs.some((kr) => kr.pendencias.some((c) => filtro.has(c)))
}
