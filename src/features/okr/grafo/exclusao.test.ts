import { describe, expect, it } from 'vitest'

import { arestasAutorizadas, contarVinculosIgnorados } from '@/features/okr/grafo/exclusao'

/** Grafo de exemplo: `pai -> alvo` e uma terceira aresta sem relação, `x -> y`. */
const arestas = [
  { id: 'pai->alvo', source: 'pai', target: 'alvo' },
  { id: 'x->y', source: 'x', target: 'y' },
]

describe('contarVinculosIgnorados', () => {
  it('excluir um nó com pai e sem nenhuma aresta selecionada dá zero', () => {
    const total = contarVinculosIgnorados(new Set(), arestas, new Set(['alvo']))
    expect(total).toBe(0)
  })

  it('excluir um nó com uma aresta NÃO relacionada selecionada dá um', () => {
    const total = contarVinculosIgnorados(new Set(['x->y']), arestas, new Set(['alvo']))
    expect(total).toBe(1)
  })

  it('excluir um nó com uma aresta selecionada que encosta nele dá zero: ela some como consequência, não é "ignorada"', () => {
    const total = contarVinculosIgnorados(new Set(['pai->alvo']), arestas, new Set(['alvo']))
    expect(total).toBe(0)
  })

  it('conta as duas juntas quando ambas estão selecionadas: só a não relacionada entra', () => {
    const total = contarVinculosIgnorados(new Set(['pai->alvo', 'x->y']), arestas, new Set(['alvo']))
    expect(total).toBe(1)
  })

  it('aresta selecionada que toca o lado "source" do nó excluído também conta como consequência (zero)', () => {
    const total = contarVinculosIgnorados(new Set(['x->y']), arestas, new Set(['x']))
    expect(total).toBe(0)
  })
})

describe('arestasAutorizadas', () => {
  /**
   * Caso real que motivou esta função: selecionar SÓ um objetivo estratégico
   * (não é OKR, `okrs.length` fica zero no handler) e apertar `Delete`. O
   * React Flow agrega ao `edges` do `onBeforeDelete` toda aresta ligada ao
   * objetivo (via `getConnectedEdges`), mesmo sem ninguém ter selecionado
   * essas arestas. Devolver esse array inteiro como aprovado desligava todos
   * os corporativos do objetivo, em silêncio, com efeito real no banco.
   */
  it('deixa passar só a aresta que a pessoa selecionou de propósito', () => {
    const resultado = arestasAutorizadas([{ id: 'a' }, { id: 'b' }], new Set(['a']))
    expect(resultado).toEqual([{ id: 'a' }])
  })

  it('barra aresta que o React Flow só agregou por estar ligada ao nó, mas ninguém selecionou', () => {
    // Ninguém marcou 'objetivo->corporativo': ela só está aqui porque o
    // objetivo (o nó que seria excluído, num nível acima desta função) está
    // conectado a ela. Nenhuma seleção, nenhuma autorização.
    const resultado = arestasAutorizadas([{ id: 'objetivo->corporativo' }], new Set())
    expect(resultado).toEqual([])
  })

  it('array vazio continua vazio', () => {
    expect(arestasAutorizadas([], new Set(['a']))).toEqual([])
  })
})
