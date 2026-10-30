import type { Edge, Node } from '@xyflow/react'
import { createContext, use } from 'react'

import type { Coluna, NoDeObjetivo, NoDeOkr } from '@/features/okr/grafo/tipos'

/** Dados que o cartão de OKR recebe do canvas. */
export type DadosDoNoOkr = {
  no: NoDeOkr
  pendencias: number
  solto: boolean
  esmaecido: boolean
  expandido: boolean
  /** cartão em modo de criação (título vazio, input focado) */
  novo: boolean
  /**
   * Identidade da abertura do rascunho atual. O cartão em criação tem id
   * fixo (`ID_DO_NOVO`), então o React reconcilia com o MESMO componente
   * quando um rascunho substitui outro; sem isto, o título digitado no
   * primeiro sobreviveria e migraria para o segundo.
   */
  versaoDoRascunho: number
  /** id do OKR de origem do KR sendo arrastado, para não soltar no próprio cartão */
  arrastandoKrDe: string | null
}

export type DadosDoNoObjetivo = {
  no: NoDeObjetivo
  pendencias: number
  esmaecido: boolean
}

export type DadosDoNoColuna = {
  coluna: Coluna
  rotulo: string
  largura: number
}

export type NoOkrFlow = Node<DadosDoNoOkr, 'okr'>
export type NoObjetivoFlow = Node<DadosDoNoObjetivo, 'objetivo'>
export type NoColunaFlow = Node<DadosDoNoColuna, 'coluna'>
export type NoFaixaFlow = Node<{ largura: number }, 'faixa'>
export type NoFlow = NoOkrFlow | NoObjetivoFlow | NoColunaFlow | NoFaixaFlow

export type ArestaFlow = Edge<{ deObjetivo: boolean }, 'okr'>

/** id fixo do cartão em criação; nunca existe no banco. */
export const ID_DO_NOVO = 'novo'

/**
 * O que os nós podem pedir ao canvas. Fica em contexto, e não em `data`,
 * para os dados do nó continuarem sendo só dados.
 */
export type CanvasAcoes = {
  podeEditar: boolean
  alternarKrs: (okrId: string) => void
  editarTitulo: (okrId: string, titulo: string) => Promise<void>
  salvarNovo: (titulo: string) => Promise<void>
  cancelarNovo: () => void
  criarSolto: (coluna: Coluna) => void
  iniciarArrastoDeKr: (krId: string, okrOrigemId: string) => void
  terminarArrastoDeKr: () => void
  soltarKr: (krId: string, okrOrigemId: string, okrDestinoId: string) => void
  desvincular: (arestaId: string) => void
}

export const CanvasAcoesContext = createContext<CanvasAcoes | null>(null)

export function useCanvasAcoes(): CanvasAcoes {
  const ctx = use(CanvasAcoesContext)
  if (!ctx) throw new Error('useCanvasAcoes precisa estar dentro de <CanvasDeOkr>.')
  return ctx
}
