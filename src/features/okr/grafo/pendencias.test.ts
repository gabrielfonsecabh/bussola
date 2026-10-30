import { describe, expect, it } from 'vitest'

import {
  agruparPendencias,
  contarPendenciasDoNo,
  linhasDePendenciasParaCsv,
  listarPendencias,
  noTemPendencia,
} from '@/features/okr/grafo/pendencias'
import type { KrDoGrafo, NoDeObjetivo, NoDeOkr } from '@/features/okr/grafo/tipos'

function kr(id: string, pendencias: KrDoGrafo['pendencias']): KrDoGrafo {
  return {
    id, descricao: `KR ${id}`, tipo: 'numerico', direcao: 'subir', unidade: null,
    baseline: null, meta: null, atual: null, peso: 1, atingimento: null, farol: 'cinza',
    ultimo_checkin: null, pendencias,
  }
}

const objetivoSolto: NoDeObjetivo = {
  tipo: 'objetivo', id: 'obj', titulo: 'Formar líderes', pendencias: ['sem_okr'],
  perspectiva_id: null, perspectiva_chave: 'aprendizagem', perspectiva_nome: 'Aprendizagem',
  perspectiva_ordem: 4, perspectiva_cor: 'primary', is_estrela_do_norte: false, total_okrs: 0,
}

const gerencia: NoDeOkr = {
  tipo: 'okr', id: 'g1', titulo: 'Área Fiscal',
  pendencias: ['sem_dono', 'kr_sem_atual', 'checkin_atrasado', 'farol_amarelo'],
  parent_okr_id: 'd1', objetivo_estrategico_id: null, objetivo_titulo: null,
  perspectiva_id: null, perspectiva_chave: null, perspectiva_nome: null,
  nivel: 'gerencia', status: 'ativo', ano: 2026, trimestre: null,
  area_id: 'a1', area_nome: 'Controladoria', owner_user_id: null, owner_nome: null,
  total_krs: 2, atingimento: 0.4, farol: 'amarelo', ultimo_checkin: null,
  krs: [kr('k1', ['kr_sem_atual']), kr('k2', ['kr_sem_atual', 'checkin_atrasado'])],
}

describe('listarPendencias', () => {
  it('gera um item por pendência de OKR e um por pendência de KR', () => {
    const itens = listarPendencias([objetivoSolto, gerencia])
    const chaves = itens.map((i) => `${i.chave}:${i.krId ?? i.noId}`).sort()
    expect(chaves).toEqual(
      [
        'sem_okr:obj',
        'sem_dono:g1',
        'farol_amarelo:g1',
        'kr_sem_atual:k1',
        'kr_sem_atual:k2',
        'checkin_atrasado:k2',
      ].sort(),
    )
  })

  it('leva área, dono e o título do OKR para o item do KR', () => {
    const item = listarPendencias([gerencia]).find((i) => i.krId === 'k2' && i.chave === 'checkin_atrasado')
    expect(item).toMatchObject({ noId: 'g1', okrTitulo: 'Área Fiscal', titulo: 'KR k2', area: 'Controladoria', dono: null })
  })
})

describe('contarPendenciasDoNo', () => {
  it('é o mesmo número que o painel mostra para aquele nó', () => {
    expect(contarPendenciasDoNo(gerencia)).toBe(5)
    expect(contarPendenciasDoNo(objetivoSolto)).toBe(1)
  })
})

describe('agruparPendencias', () => {
  it('segue a ordem dos grupos e omite grupo vazio', () => {
    const grupos = agruparPendencias(listarPendencias([objetivoSolto, gerencia]))
    expect(grupos.map((g) => [g.grupo, g.total])).toEqual([
      ['estrutura', 2],
      ['medicao', 2],
      ['checkin', 1],
      ['farol_amarelo', 1],
    ])
  })
})

describe('linhasDePendenciasParaCsv', () => {
  it('uma linha por pendência, com rótulo em português', () => {
    const linhas = linhasDePendenciasParaCsv(listarPendencias([gerencia]))
    expect(linhas).toHaveLength(5)
    expect(linhas[0]).toEqual({ tipo: 'Sem dono', okr: 'Área Fiscal', kr: '', area: 'Controladoria', dono: '' })
  })
})

describe('noTemPendencia', () => {
  it('olha o OKR e os KRs dele', () => {
    expect(noTemPendencia(gerencia, new Set(['checkin_atrasado']))).toBe(true)
    expect(noTemPendencia(gerencia, new Set(['sem_pai']))).toBe(false)
    expect(noTemPendencia(gerencia, new Set())).toBe(true)
  })
})
