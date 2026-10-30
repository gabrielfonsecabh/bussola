import { describe, expect, it } from 'vitest'

import { nivelAceitaPai, nivelDoFilho, podeConectar } from '@/features/okr/grafo/regras'
import type { NoDeObjetivo, NoDeOkr } from '@/features/okr/grafo/tipos'

function okr(sobrescrita: Partial<NoDeOkr> & Pick<NoDeOkr, 'id' | 'nivel'>): NoDeOkr {
  return {
    tipo: 'okr',
    titulo: sobrescrita.id,
    pendencias: [],
    parent_okr_id: null,
    objetivo_estrategico_id: null,
    objetivo_titulo: null,
    perspectiva_id: null,
    perspectiva_chave: null,
    perspectiva_nome: null,
    status: 'ativo',
    ano: 2026,
    trimestre: null,
    area_id: null,
    area_nome: null,
    owner_user_id: null,
    owner_nome: null,
    total_krs: 0,
    atingimento: null,
    farol: 'cinza',
    ultimo_checkin: null,
    krs: [],
    ...sobrescrita,
  }
}

const objetivo: NoDeObjetivo = {
  tipo: 'objetivo',
  id: 'obj',
  titulo: 'Disciplina de custos',
  pendencias: [],
  perspectiva_id: 'p1',
  perspectiva_chave: 'financeiro',
  perspectiva_nome: 'Financeiro',
  perspectiva_ordem: 1,
  perspectiva_cor: 'info',
  is_estrela_do_norte: false,
  total_okrs: 0,
}

describe('nivelAceitaPai (espelho de app.okr_nivel_aceita_pai)', () => {
  it.each([
    ['diretoria', 'corporativo', true],
    ['gerencia', 'diretoria', true],
    ['individual', 'gerencia', true],
    ['individual', 'diretoria', true],
    ['corporativo', 'corporativo', false],
    ['gerencia', 'corporativo', false],
    ['diretoria', 'gerencia', false],
    ['individual', 'corporativo', false],
  ] as const)('%s abaixo de %s -> %s', (filho, pai, esperado) => {
    expect(nivelAceitaPai(filho, pai)).toBe(esperado)
  })
})

describe('nivelDoFilho (espelho do okr_desdobrar)', () => {
  it('desce um degrau e para no individual', () => {
    expect(nivelDoFilho('corporativo')).toBe('diretoria')
    expect(nivelDoFilho('diretoria')).toBe('gerencia')
    expect(nivelDoFilho('gerencia')).toBe('individual')
    expect(nivelDoFilho('individual')).toBe('individual')
  })
})

describe('podeConectar', () => {
  it('objetivo só liga a corporativo', () => {
    expect(podeConectar(objetivo, okr({ id: 'c', nivel: 'corporativo' })).ok).toBe(true)
    const recusa = podeConectar(objetivo, okr({ id: 'd', nivel: 'diretoria' }))
    expect(recusa.ok).toBe(false)
    if (!recusa.ok) expect(recusa.motivo).toMatch(/corporativo/)
  })

  it('OKR para OKR segue a ordem de nível', () => {
    const dir = okr({ id: 'd', nivel: 'diretoria' })
    const ger = okr({ id: 'g', nivel: 'gerencia' })
    expect(podeConectar(dir, ger).ok).toBe(true)
    expect(podeConectar(ger, dir).ok).toBe(false)
  })

  it('recusa o próprio nó e o destino objetivo', () => {
    const dir = okr({ id: 'd', nivel: 'diretoria' })
    expect(podeConectar(dir, dir).ok).toBe(false)
    expect(podeConectar(dir, objetivo).ok).toBe(false)
  })
})
