import { describe, expect, it } from 'vitest'

import { alturaDoNo, calcularLayout, ESPACO_ANTES_DOS_SOLTOS, LARGURA_DO_NO } from '@/features/okr/grafo/layout'
import type { NoDeObjetivo, NoDeOkr, NoDoGrafo } from '@/features/okr/grafo/tipos'

function objetivo(id: string, ordem = 1): NoDeObjetivo {
  return {
    tipo: 'objetivo', id, titulo: id, pendencias: [], perspectiva_id: null, perspectiva_chave: null,
    perspectiva_nome: null, perspectiva_ordem: ordem, perspectiva_cor: null, is_estrela_do_norte: false, total_okrs: 0,
  }
}

function okr(id: string, nivel: NoDeOkr['nivel'], pai: string | null = null, objetivoId: string | null = null): NoDeOkr {
  return {
    tipo: 'okr', id, titulo: id, pendencias: [], parent_okr_id: pai, objetivo_estrategico_id: objetivoId,
    objetivo_titulo: null, perspectiva_id: null, perspectiva_chave: null, perspectiva_nome: null,
    nivel, status: 'ativo', ano: 2026, trimestre: null, area_id: null, area_nome: null,
    owner_user_id: null, owner_nome: null, total_krs: 0, atingimento: null, farol: 'cinza', ultimo_checkin: null, krs: [],
  }
}

function centroDireto(layout: ReturnType<typeof calcularLayout>, id: string) {
  const p = layout.posicoes.get(id)
  if (!p) throw new Error(`nó ausente: ${id}`)
  return p.y + p.altura / 2
}

const floresta: NoDoGrafo[] = [
  objetivo('obj'),
  okr('corp', 'corporativo', null, 'obj'),
  okr('dirA', 'diretoria', 'corp'),
  okr('dirB', 'diretoria', 'corp'),
  okr('ger1', 'gerencia', 'dirA'),
  okr('ger2', 'gerencia', 'dirA'),
  okr('gerSolta', 'gerencia'),
  okr('indSolta', 'individual'),
]

describe('calcularLayout', () => {
  const layout = calcularLayout(floresta, { krsExpandidos: new Set() })
  const pos = (id: string) => layout.posicoes.get(id)!

  it('coluna é o nível, não a distância da raiz', () => {
    expect(pos('obj').x).toBe(layout.xDaColuna.objetivo)
    expect(pos('corp').x).toBe(layout.xDaColuna.corporativo)
    expect(pos('gerSolta').x).toBe(layout.xDaColuna.gerencia)
    expect(pos('indSolta').x).toBe(layout.xDaColuna.individual)
    expect(layout.xDaColuna.diretoria - layout.xDaColuna.corporativo).toBeGreaterThan(LARGURA_DO_NO)
  })

  it('irmãos não se sobrepõem e ficam na ordem', () => {
    expect(pos('ger1').y + pos('ger1').altura).toBeLessThanOrEqual(pos('ger2').y)
    expect(pos('dirA').y + pos('dirA').altura).toBeLessThanOrEqual(pos('dirB').y)
  })

  it('pai fica centrado sobre os filhos', () => {
    const topo = pos('ger1').y
    const base = pos('ger2').y + pos('ger2').altura
    const centroDosFilhos = (topo + base) / 2
    const centroDoPai = pos('dirA').y + pos('dirA').altura / 2
    expect(Math.abs(centroDoPai - centroDosFilhos)).toBeLessThan(1)
  })

  it('soltos vão para a faixa de baixo, marcados', () => {
    const maisBaixoDaArvore = Math.max(
      ...['obj', 'corp', 'dirA', 'dirB', 'ger1', 'ger2'].map((id) => pos(id).y + pos(id).altura),
    )
    expect(layout.yDosSoltos).not.toBeNull()
    expect(layout.yDosSoltos!).toBeGreaterThanOrEqual(maisBaixoDaArvore + ESPACO_ANTES_DOS_SOLTOS)
    expect(pos('gerSolta').y).toBeGreaterThanOrEqual(layout.yDosSoltos!)
    expect(pos('gerSolta').solto).toBe(true)
    expect(pos('ger1').solto).toBe(false)
  })

  it('sem soltos, a faixa não existe', () => {
    const so = calcularLayout(floresta.slice(0, 6), { krsExpandidos: new Set() })
    expect(so.yDosSoltos).toBeNull()
  })

  it('um solto com filhos leva a subárvore junto', () => {
    const comFilho = [...floresta, okr('indDaSolta', 'individual', 'gerSolta')]
    const l = calcularLayout(comFilho, { krsExpandidos: new Set() })
    expect(l.posicoes.get('indDaSolta')!.y).toBeGreaterThanOrEqual(l.yDosSoltos!)
    expect(l.posicoes.get('indDaSolta')!.solto).toBe(false)
  })
})

describe('calcularLayout, pai sobre filhos diretos em árvore mais funda', () => {
  // Fix round 1: o pai precisa ficar centrado entre o centro do PRIMEIRO e o
  // centro do ÚLTIMO filho diretos, não sobre a banda recursiva inteira.
  // As duas coisas só coincidem quando os filhos diretos são folhas (o teste
  // raso acima, dirA sobre ger1/ger2). Com ramos de profundidades diferentes
  // (uma diretoria com dois filhos ao lado de uma com um só), elas divergem.

  it('contraexemplo mínimo: obj -> corp -> {dirA com 2 filhos, dirB com 1 filho}', () => {
    const arvore: NoDoGrafo[] = [
      objetivo('obj'),
      okr('corp', 'corporativo', null, 'obj'),
      okr('dirA', 'diretoria', 'corp'),
      okr('dirB', 'diretoria', 'corp'),
      okr('ger1', 'gerencia', 'dirA'),
      okr('ger2', 'gerencia', 'dirA'),
      okr('ger3', 'gerencia', 'dirB'),
    ]
    const layout = calcularLayout(arvore, { krsExpandidos: new Set() })

    const centroDosFilhosDeCorp = (centroDireto(layout, 'dirA') + centroDireto(layout, 'dirB')) / 2
    expect(Math.abs(centroDireto(layout, 'corp') - centroDosFilhosDeCorp)).toBeLessThan(1)

    const centroDosFilhosDeDirA = (centroDireto(layout, 'ger1') + centroDireto(layout, 'ger2')) / 2
    expect(Math.abs(centroDireto(layout, 'dirA') - centroDosFilhosDeDirA)).toBeLessThan(1)

    // dirB só tem um filho: o pai fica exatamente sobre ele.
    expect(Math.abs(centroDireto(layout, 'dirB') - centroDireto(layout, 'ger3'))).toBeLessThan(1)

    // não sobrepõe apesar da assimetria (dirA mais alta que dirB).
    const pos = (id: string) => layout.posicoes.get(id)!
    expect(pos('dirA').y + pos('dirA').altura).toBeLessThanOrEqual(pos('dirB').y)
  })

  it('quatro níveis, ramificação desigual em três diretorias (3, 1 e 2 gerências)', () => {
    const arvore: NoDoGrafo[] = [
      objetivo('obj'),
      okr('corp', 'corporativo', null, 'obj'),
      okr('dirA', 'diretoria', 'corp'),
      okr('dirB', 'diretoria', 'corp'),
      okr('dirC', 'diretoria', 'corp'),
      okr('a1', 'gerencia', 'dirA'),
      okr('a2', 'gerencia', 'dirA'),
      okr('a3', 'gerencia', 'dirA'),
      okr('b1', 'gerencia', 'dirB'),
      okr('c1', 'gerencia', 'dirC'),
      okr('c2', 'gerencia', 'dirC'),
    ]
    const layout = calcularLayout(arvore, { krsExpandidos: new Set() })
    const pos = (id: string) => layout.posicoes.get(id)!

    const centroDosFilhosDeCorp = (centroDireto(layout, 'dirA') + centroDireto(layout, 'dirC')) / 2
    expect(Math.abs(centroDireto(layout, 'corp') - centroDosFilhosDeCorp)).toBeLessThan(1)

    const centroDosFilhosDeDirA = (centroDireto(layout, 'a1') + centroDireto(layout, 'a3')) / 2
    expect(Math.abs(centroDireto(layout, 'dirA') - centroDosFilhosDeDirA)).toBeLessThan(1)

    const centroDosFilhosDeDirC = (centroDireto(layout, 'c1') + centroDireto(layout, 'c2')) / 2
    expect(Math.abs(centroDireto(layout, 'dirC') - centroDosFilhosDeDirC)).toBeLessThan(1)

    // nenhum irmão do mesmo nível se sobrepõe, apesar da assimetria.
    expect(pos('dirA').y + pos('dirA').altura).toBeLessThanOrEqual(pos('dirB').y)
    expect(pos('dirB').y + pos('dirB').altura).toBeLessThanOrEqual(pos('dirC').y)
    expect(pos('a1').y + pos('a1').altura).toBeLessThanOrEqual(pos('a2').y)
    expect(pos('a2').y + pos('a2').altura).toBeLessThanOrEqual(pos('a3').y)
  })
})

describe('alturaDoNo', () => {
  it('cresce com os KRs visíveis e para no teto', () => {
    const base = okr('x', 'gerencia')
    const comKrs = { ...base, krs: Array.from({ length: 12 }, (_, i) => ({
      id: `k${i}`, descricao: 'kr', tipo: 'numerico', direcao: 'subir', unidade: null, baseline: null,
      meta: null, atual: null, peso: 1, atingimento: null, farol: 'cinza', ultimo_checkin: null, pendencias: [],
    })) }
    expect(alturaDoNo(comKrs, true)).toBeGreaterThan(alturaDoNo(base, true))
    expect(alturaDoNo(comKrs, true)).toBe(alturaDoNo({ ...comKrs, krs: comKrs.krs.slice(0, 6) }, true))
    expect(alturaDoNo(comKrs, false)).toBe(alturaDoNo(base, false))
  })
})
