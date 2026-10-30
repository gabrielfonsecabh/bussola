import { describe, expect, it } from 'vitest'

import { aplicarSelecao } from '@/features/okr/grafo/selecao'

describe('aplicarSelecao', () => {
  it('seleciona um id', () => {
    const resultado = aplicarSelecao(new Set(), [{ id: 'a', type: 'select', selected: true }])
    expect(resultado).toEqual(new Set(['a']))
  })

  it('seleciona vários de uma vez, como o lote que Shift+arrastar emite', () => {
    const resultado = aplicarSelecao(new Set(), [
      { id: 'a', type: 'select', selected: true },
      { id: 'b', type: 'select', selected: true },
      { id: 'c', type: 'select', selected: true },
    ])
    expect(resultado).toEqual(new Set(['a', 'b', 'c']))
  })

  it('desseleciona um id sem afetar os demais já selecionados', () => {
    const resultado = aplicarSelecao(new Set(['a', 'b']), [{ id: 'a', type: 'select', selected: false }])
    expect(resultado).toEqual(new Set(['b']))
  })

  it('ignora mudança de posição: nem o conteúdo nem a referência mudam', () => {
    const atual = new Set(['a'])
    const resultado = aplicarSelecao(atual, [{ id: 'a', type: 'position', position: { x: 10, y: 20 } }])
    expect(resultado).toBe(atual)
    expect(resultado).toEqual(new Set(['a']))
  })

  it('num lote misto, aplica só a mudança de seleção e ignora a de dimensão', () => {
    const resultado = aplicarSelecao(new Set(), [
      { id: 'a', type: 'dimensions', dimensions: { width: 240, height: 96 } },
      { id: 'b', type: 'select', selected: true },
    ])
    expect(resultado).toEqual(new Set(['b']))
  })

  it('lote vazio devolve a mesma referência (sem re-render à toa)', () => {
    const atual = new Set(['a'])
    expect(aplicarSelecao(atual, [])).toBe(atual)
  })

  it('reselecionar um id já selecionado não troca a referência (sem conteúdo novo, sem re-render)', () => {
    const atual = new Set(['a'])
    const resultado = aplicarSelecao(atual, [{ id: 'a', type: 'select', selected: true }])
    expect(resultado).toBe(atual)
  })

  it('desselecionar um id que já não estava selecionado não troca a referência', () => {
    const atual = new Set(['a'])
    const resultado = aplicarSelecao(atual, [{ id: 'z', type: 'select', selected: false }])
    expect(resultado).toBe(atual)
  })
})
