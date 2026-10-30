import type { Database } from '@/types/database'

/**
 * Tipos do canvas de OKR. A fonte é a RPC `app.okr_grafo` (migration 0037):
 * uma linha por objetivo estratégico e por OKR, com as pendências já
 * calculadas no banco. O cliente NÃO deriva pendência de valor bruto.
 */

export const CHAVES_DE_PENDENCIA = [
  'sem_okr',
  'sem_pai',
  'sem_objetivo',
  'sem_dono',
  'sem_kr',
  'kr_sem_baseline',
  'kr_sem_meta',
  'kr_sem_atual',
  'checkin_atrasado',
  'farol_vermelho',
  'farol_amarelo',
] as const
export type ChaveDePendencia = (typeof CHAVES_DE_PENDENCIA)[number]

export const ROTULO_DA_PENDENCIA: Record<ChaveDePendencia, string> = {
  sem_okr: 'Objetivo sem OKR',
  sem_pai: 'OKR sem pai',
  sem_objetivo: 'Corporativo sem objetivo estratégico',
  sem_dono: 'Sem dono',
  sem_kr: 'Sem key result',
  kr_sem_baseline: 'KR sem baseline',
  kr_sem_meta: 'KR sem meta',
  kr_sem_atual: 'KR sem valor atual',
  checkin_atrasado: 'Check-in atrasado',
  farol_vermelho: 'Farol vermelho',
  farol_amarelo: 'Farol amarelo',
}

export type GrupoDePendencia = 'estrutura' | 'medicao' | 'checkin' | 'farol_vermelho' | 'farol_amarelo'

/** Ordem do painel: o que trava mais vem primeiro. */
export const GRUPOS_DE_PENDENCIA: {
  grupo: GrupoDePendencia
  rotulo: string
  chaves: ChaveDePendencia[]
}[] = [
  { grupo: 'estrutura', rotulo: 'Estrutura incompleta', chaves: ['sem_pai', 'sem_objetivo', 'sem_okr', 'sem_dono', 'sem_kr'] },
  { grupo: 'medicao', rotulo: 'Medição incompleta', chaves: ['kr_sem_baseline', 'kr_sem_meta', 'kr_sem_atual'] },
  { grupo: 'checkin', rotulo: 'Check-in atrasado', chaves: ['checkin_atrasado'] },
  { grupo: 'farol_vermelho', rotulo: 'Farol vermelho', chaves: ['farol_vermelho'] },
  { grupo: 'farol_amarelo', rotulo: 'Farol amarelo', chaves: ['farol_amarelo'] },
]

/** Chaves que pertencem ao KR, não ao OKR. No painel viram um item por KR. */
export const CHAVES_DE_KR: ReadonlySet<ChaveDePendencia> = new Set([
  'kr_sem_baseline',
  'kr_sem_meta',
  'kr_sem_atual',
  'checkin_atrasado',
])

export const NIVEIS = ['corporativo', 'diretoria', 'gerencia', 'individual'] as const
export type NivelDeOkr = (typeof NIVEIS)[number]

export const COLUNAS = ['objetivo', ...NIVEIS] as const
export type Coluna = (typeof COLUNAS)[number]

export const ROTULO_DA_COLUNA: Record<Coluna, string> = {
  objetivo: 'Objetivos estratégicos',
  corporativo: 'Corporativo',
  diretoria: 'Diretoria',
  gerencia: 'Gerência',
  individual: 'Individual',
}

export type KrDoGrafo = {
  id: string
  descricao: string
  tipo: string
  direcao: string
  unidade: string | null
  baseline: number | null
  meta: number | null
  atual: number | null
  peso: number
  atingimento: number | null
  farol: string
  ultimo_checkin: string | null
  pendencias: ChaveDePendencia[]
}

export type NoDeObjetivo = {
  tipo: 'objetivo'
  id: string
  titulo: string
  pendencias: ChaveDePendencia[]
  perspectiva_id: string | null
  perspectiva_chave: string | null
  perspectiva_nome: string | null
  perspectiva_ordem: number | null
  /** Token de cor da perspectiva: 'info' | 'success' | 'warning' | 'primary'. */
  perspectiva_cor: string | null
  is_estrela_do_norte: boolean
  total_okrs: number
}

export type NoDeOkr = {
  tipo: 'okr'
  id: string
  titulo: string
  pendencias: ChaveDePendencia[]
  parent_okr_id: string | null
  objetivo_estrategico_id: string | null
  objetivo_titulo: string | null
  perspectiva_id: string | null
  perspectiva_chave: string | null
  perspectiva_nome: string | null
  nivel: NivelDeOkr
  status: string
  ano: number
  trimestre: number | null
  area_id: string | null
  area_nome: string | null
  owner_user_id: string | null
  owner_nome: string | null
  total_krs: number
  atingimento: number | null
  farol: string
  ultimo_checkin: string | null
  krs: KrDoGrafo[]
}

export type NoDoGrafo = NoDeObjetivo | NoDeOkr

export function ehOkr(no: NoDoGrafo): no is NoDeOkr {
  return no.tipo === 'okr'
}

export function ehObjetivo(no: NoDoGrafo): no is NoDeObjetivo {
  return no.tipo === 'objetivo'
}

export function colunaDoNo(no: NoDoGrafo): Coluna {
  return ehOkr(no) ? no.nivel : 'objetivo'
}

/** Linha crua da RPC, como o tipo gerado a descreve. */
export type LinhaDoGrafo = Database['app']['Functions']['okr_grafo']['Returns'][number]

function comoChaves(valor: unknown): ChaveDePendencia[] {
  if (!Array.isArray(valor)) return []
  return valor.filter((v): v is ChaveDePendencia =>
    (CHAVES_DE_PENDENCIA as readonly string[]).includes(String(v)),
  )
}

function comoKrs(valor: unknown): KrDoGrafo[] {
  if (!Array.isArray(valor)) return []
  return valor.map((k) => {
    const kr = k as Record<string, unknown>
    return {
      id: String(kr.id),
      descricao: String(kr.descricao ?? ''),
      tipo: String(kr.tipo ?? 'numerico'),
      direcao: String(kr.direcao ?? 'subir'),
      unidade: (kr.unidade as string | null) ?? null,
      baseline: (kr.baseline as number | null) ?? null,
      meta: (kr.meta as number | null) ?? null,
      atual: (kr.atual as number | null) ?? null,
      peso: Number(kr.peso ?? 1),
      atingimento: (kr.atingimento as number | null) ?? null,
      farol: String(kr.farol ?? 'cinza'),
      ultimo_checkin: (kr.ultimo_checkin as string | null) ?? null,
      pendencias: comoChaves(kr.pendencias),
    }
  })
}

/**
 * Converte a linha da RPC (todas as colunas opcionais, porque as duas
 * famílias dividem o mesmo RETURNS TABLE) num nó tipado.
 */
export function linhaParaNo(l: LinhaDoGrafo): NoDoGrafo {
  if (l.tipo === 'objetivo') {
    return {
      tipo: 'objetivo',
      id: l.id,
      titulo: l.titulo,
      pendencias: comoChaves(l.pendencias),
      perspectiva_id: l.perspectiva_id ?? null,
      perspectiva_chave: l.perspectiva_chave ?? null,
      perspectiva_nome: l.perspectiva_nome ?? null,
      perspectiva_ordem: l.perspectiva_ordem ?? null,
      perspectiva_cor: l.perspectiva_cor ?? null,
      is_estrela_do_norte: l.is_estrela_do_norte ?? false,
      total_okrs: l.total_okrs ?? 0,
    }
  }
  return {
    tipo: 'okr',
    id: l.id,
    titulo: l.titulo,
    pendencias: comoChaves(l.pendencias),
    parent_okr_id: l.parent_okr_id ?? null,
    objetivo_estrategico_id: l.objetivo_estrategico_id ?? null,
    objetivo_titulo: l.objetivo_titulo ?? null,
    perspectiva_id: l.perspectiva_id ?? null,
    perspectiva_chave: l.perspectiva_chave ?? null,
    perspectiva_nome: l.perspectiva_nome ?? null,
    nivel: (NIVEIS as readonly string[]).includes(l.nivel ?? '') ? (l.nivel as NivelDeOkr) : 'gerencia',
    status: l.status ?? 'ativo',
    ano: l.ano ?? 0,
    trimestre: l.trimestre ?? null,
    area_id: l.area_id ?? null,
    area_nome: l.area_nome ?? null,
    owner_user_id: l.owner_user_id ?? null,
    owner_nome: l.owner_nome ?? null,
    total_krs: l.total_krs ?? 0,
    atingimento: l.atingimento ?? null,
    farol: l.farol ?? 'cinza',
    ultimo_checkin: l.ultimo_checkin ?? null,
    krs: comoKrs(l.krs),
  }
}
