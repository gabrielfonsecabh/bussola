import {
  COLUNAS,
  colunaDoNo,
  ehOkr,
  type Coluna,
  type NoDoGrafo,
} from '@/features/okr/grafo/tipos'

/**
 * Layout do canvas: colunas fixas por nível (x) e um "tidy tree" por
 * profundidade (y). A estrutura é uma floresta (cada OKR tem um pai, cada
 * corporativo tem um objetivo), então não existe cruzamento se os irmãos
 * saem em ordem e cada pai fica centrado sobre os PRÓPRIOS FILHOS DIRETOS
 * (Reingold-Tilford: centro do pai = meio entre o centro do primeiro e o
 * centro do último filho). Não é o mesmo que centrar sobre a banda recursiva
 * inteira: com ramos de profundidades diferentes (uma diretoria com duas
 * gerências ao lado de uma com uma só), o meio da banda e o meio dos filhos
 * diretos divergem, e é o segundo que o contrato pede.
 *
 * Por que não dagre: ele calcula a coluna pelo caminho mais longo, e não
 * aceita fixar um nó numa coluna. Uma gerência sem pai cairia na coluna dos
 * objetivos. Aqui a coluna é o nível, sempre.
 *
 * Posição nunca é estado: quem chama recalcula num `useMemo` sobre os dados.
 */

export const LARGURA_DO_NO = 260
export const ALTURA_DO_OBJETIVO = 84
export const ALTURA_BASE_DO_OKR = 112
export const ALTURA_POR_KR = 28
export const MAX_KRS_VISIVEIS = 6
export const ESPACO_ENTRE_COLUNAS = 120
export const ESPACO_ENTRE_NOS = 16
export const ESPACO_ANTES_DOS_SOLTOS = 64

export type NoPosicionado = {
  id: string
  x: number
  y: number
  largura: number
  altura: number
  /** raiz sem vínculo, desenhada na faixa "Soltos" com borda tracejada */
  solto: boolean
}

export type Layout = {
  posicoes: Map<string, NoPosicionado>
  xDaColuna: Record<Coluna, number>
  /** y onde começa a faixa "Soltos"; null quando não há solto */
  yDosSoltos: number | null
  altura: number
}

export type OpcoesDeLayout = {
  /** ids de OKR com a lista de KRs aberta */
  krsExpandidos: ReadonlySet<string>
}

export function alturaDoNo(no: NoDoGrafo, krsExpandidos: boolean): number {
  if (!ehOkr(no)) return ALTURA_DO_OBJETIVO
  if (!krsExpandidos) return ALTURA_BASE_DO_OKR
  return ALTURA_BASE_DO_OKR + Math.min(no.krs.length, MAX_KRS_VISIVEIS) * ALTURA_POR_KR
}

function xDasColunas(): Record<Coluna, number> {
  const x = {} as Record<Coluna, number>
  COLUNAS.forEach((c, i) => {
    x[c] = i * (LARGURA_DO_NO + ESPACO_ENTRE_COLUNAS)
  })
  return x
}

/**
 * Pai de cada nó dentro do conjunto: OKR -> parent_okr_id, corporativo -> objetivo.
 *
 * Um ciclo puro (A tem B como pai e B tem A como pai) nunca resolve a raiz: os
 * dois nós somem de `posicoes` em silêncio, sem lançar erro. O banco tem
 * trigger que impede ciclo na escrita, então isso é defesa em profundidade,
 * não caminho esperado; não vale a pena complicar o contrato de retorno de
 * `calcularLayout` (usado só por este módulo até aqui) por um caso que o
 * banco já bloqueia.
 */
function paiDe(no: NoDoGrafo, ids: ReadonlySet<string>): string | null {
  if (!ehOkr(no)) return null
  if (no.parent_okr_id && ids.has(no.parent_okr_id)) return no.parent_okr_id
  if (no.nivel === 'corporativo' && no.objetivo_estrategico_id && ids.has(no.objetivo_estrategico_id)) {
    return no.objetivo_estrategico_id
  }
  return null
}

function ordemDeIrmaos(a: NoDoGrafo, b: NoDoGrafo): number {
  if (!ehOkr(a) && !ehOkr(b)) {
    const oa = a.perspectiva_ordem ?? 99
    const ob = b.perspectiva_ordem ?? 99
    if (oa !== ob) return oa - ob
  }
  const ca = COLUNAS.indexOf(colunaDoNo(a))
  const cb = COLUNAS.indexOf(colunaDoNo(b))
  if (ca !== cb) return ca - cb
  return a.titulo.localeCompare(b.titulo, 'pt-BR') || a.id.localeCompare(b.id)
}

export function calcularLayout(nos: NoDoGrafo[], opcoes: OpcoesDeLayout): Layout {
  const xDaColuna = xDasColunas()
  const porId = new Map(nos.map((n) => [n.id, n]))
  const ids = new Set(porId.keys())
  const filhos = new Map<string, NoDoGrafo[]>()
  const raizes: NoDoGrafo[] = []

  for (const no of nos) {
    const pai = paiDe(no, ids)
    if (pai === null) {
      raizes.push(no)
    } else {
      const lista = filhos.get(pai) ?? []
      lista.push(no)
      filhos.set(pai, lista)
    }
  }
  for (const lista of filhos.values()) lista.sort(ordemDeIrmaos)
  raizes.sort(ordemDeIrmaos)

  const posicoes = new Map<string, NoPosicionado>()

  /** Posiciona a subárvore a partir de `yInicial`; devolve a extensão ocupada. */
  function posicionar(no: NoDoGrafo, yInicial: number, solto: boolean): number {
    const altura = alturaDoNo(no, opcoes.krsExpandidos.has(no.id))
    const meusFilhos = filhos.get(no.id) ?? []
    if (meusFilhos.length === 0) {
      posicoes.set(no.id, { id: no.id, x: xDaColuna[colunaDoNo(no)], y: yInicial, largura: LARGURA_DO_NO, altura, solto })
      return altura
    }

    // Primeiro os filhos, em sequência.
    let cursor = yInicial
    for (const filho of meusFilhos) {
      cursor += posicionar(filho, cursor, false) + ESPACO_ENTRE_NOS
    }
    const baseDosFilhos = cursor - ESPACO_ENTRE_NOS

    // O pai fica centrado entre o centro do PRIMEIRO e o centro do ÚLTIMO
    // filho diretos, não sobre a banda inteira (ver docstring do módulo).
    const primeiroId = meusFilhos[0]?.id
    const ultimoId = meusFilhos.at(-1)?.id
    const primeiro = primeiroId === undefined ? undefined : posicoes.get(primeiroId)
    const ultimo = ultimoId === undefined ? undefined : posicoes.get(ultimoId)

    let y = yInicial
    if (primeiro && ultimo) {
      const centro = (primeiro.y + primeiro.altura / 2 + ultimo.y + ultimo.altura / 2) / 2
      y = centro - altura / 2
    }

    // Se o pai centrado invade o espaço acima do que foi reservado (pai bem
    // mais alto que o bloco de filhos, ou filhos concentrados perto do topo),
    // empurra a subárvore inteira para baixo até o topo real encostar em
    // `yInicial`. Invadir por BAIXO não precisa de deslocamento: a extensão
    // devolvida já cresce para cobrir o pai (`baseFinal`), e é essa extensão
    // que o chamador usa para posicionar o próximo irmão sem sobrepor.
    let deslocamento = 0
    if (y < yInicial) {
      deslocamento = yInicial - y
      for (const filho of meusFilhos) deslocarSubarvore(filho, deslocamento)
      y += deslocamento
    }

    posicoes.set(no.id, { id: no.id, x: xDaColuna[colunaDoNo(no)], y, largura: LARGURA_DO_NO, altura, solto })

    const baseFinal = Math.max(y + altura, baseDosFilhos + deslocamento)
    return baseFinal - yInicial
  }

  function deslocarSubarvore(no: NoDoGrafo, dy: number) {
    const p = posicoes.get(no.id)
    if (p) p.y += dy
    for (const filho of filhos.get(no.id) ?? []) deslocarSubarvore(filho, dy)
  }

  // Passo 1: as árvores que nascem num objetivo.
  let cursor = 0
  const arvores = raizes.filter((r) => !ehOkr(r))
  for (const raiz of arvores) {
    cursor += posicionar(raiz, cursor, false) + ESPACO_ENTRE_NOS
  }
  const fimDasArvores = arvores.length > 0 ? cursor - ESPACO_ENTRE_NOS : 0

  // Passo 2: os soltos, numa faixa abaixo, cada um na coluna do próprio nível.
  const soltos = raizes.filter((r) => ehOkr(r))
  let yDosSoltos: number | null = null
  if (soltos.length > 0) {
    yDosSoltos = arvores.length > 0 ? fimDasArvores + ESPACO_ANTES_DOS_SOLTOS : 0
    cursor = yDosSoltos
    for (const raiz of soltos) {
      cursor += posicionar(raiz, cursor, true) + ESPACO_ENTRE_NOS
    }
  }

  const altura = Math.max(fimDasArvores, cursor - ESPACO_ENTRE_NOS, 0)
  return { posicoes, xDaColuna, yDosSoltos, altura }
}
