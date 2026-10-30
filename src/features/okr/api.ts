import { linhaParaNo, type NoDoGrafo } from '@/features/okr/grafo/tipos'
import { exigeLinhaAfetada } from '@/lib/query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Tabelas = Database['app']['Tables']
export type Perspectiva = Tabelas['perspectivas']['Row']
export type ObjetivoEstrategico = Tabelas['objetivos_estrategicos']['Row']
export type Okr = Tabelas['okrs']['Row']
export type KeyResult = Tabelas['key_results']['Row']
export type KrCheckin = Tabelas['kr_checkins']['Row']

/** Linha da árvore, já agregada pelo banco (RPC app.okr_arvore). */
export type NoDaArvore = {
  id: string
  parent_okr_id: string | null
  profundidade: number
  caminho: string[]
  nivel: string
  titulo: string
  status: string
  ano: number
  trimestre: number | null
  area_id: string | null
  area_nome: string | null
  owner_user_id: string | null
  owner_nome: string | null
  perspectiva_chave: string | null
  perspectiva_nome: string | null
  objetivo_estrategico_id: string | null
  objetivo_titulo: string | null
  total_krs: number
  total_filhos: number
  atingimento: number | null
  farol: string
}

export async function listarPerspectivas(companyId: string): Promise<Perspectiva[]> {
  const { data, error } = await supabase()
    .from('perspectivas')
    .select('*')
    .eq('company_id', companyId)
    .order('ordem')
    .order('id')
  if (error) throw error
  return data ?? []
}

export async function listarObjetivos(companyId: string): Promise<ObjetivoEstrategico[]> {
  const { data, error } = await supabase()
    .from('objetivos_estrategicos')
    .select('*')
    .eq('company_id', companyId)
    .order('titulo')
    .order('id')
  if (error) throw error
  return data ?? []
}

export async function carregarArvore(
  companyId: string,
  ano: number,
  areaId: string | null,
): Promise<NoDaArvore[]> {
  const { data, error } = await supabase().rpc('okr_arvore', {
    p_company: companyId,
    p_ano: ano,
    p_area_id: areaId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as NoDaArvore[]
}

/**
 * O grafo inteiro do canvas numa chamada (RPC app.okr_grafo): objetivos,
 * OKRs, KRs e pendências já calculadas. Sem filtro de área, tudo do ano.
 */
export async function carregarGrafo(
  companyId: string,
  ano: number,
  areaId: string | null,
): Promise<NoDoGrafo[]> {
  const { data, error } = await supabase().rpc('okr_grafo', {
    p_company: companyId,
    p_ano: ano,
    p_area_id: areaId ?? undefined,
  })
  if (error) throw error
  return (data ?? []).map(linhaParaNo)
}

/**
 * A única escrita de pai/objetivo que o canvas faz. `null` desvincula. O
 * banco valida empresa, ano, ordem de nível e ciclo, e propaga objetivo e
 * perspectiva para a subárvore.
 */
export async function vincularOkr(entrada: {
  okrId: string
  parentOkrId: string | null
  objetivoId: string | null
}): Promise<Okr> {
  const { data, error } = await supabase().rpc('okr_vincular', {
    p_okr_id: entrada.okrId,
    p_parent_okr_id: entrada.parentOkrId ?? undefined,
    p_objetivo_id: entrada.objetivoId ?? undefined,
  })
  if (error) throw error
  return data as unknown as Okr
}

/** Move um KR para outro OKR. Os check-ins seguem; o farol recalcula no banco. */
export async function moverKr(entrada: { krId: string; okrDestinoId: string }): Promise<KeyResult> {
  const { data, error } = await supabase().rpc('kr_mover', {
    p_kr_id: entrada.krId,
    p_okr_destino: entrada.okrDestinoId,
  })
  if (error) throw error
  return data as unknown as KeyResult
}

export async function listarKrsDoOkr(okrId: string): Promise<KeyResult[]> {
  const { data, error } = await supabase()
    .from('key_results')
    .select('*')
    .eq('okr_id', okrId)
    .order('descricao')
    .order('id')
  if (error) throw error
  return data ?? []
}

export async function listarCheckins(krId: string): Promise<KrCheckin[]> {
  const { data, error } = await supabase()
    .from('kr_checkins')
    .select('*')
    .eq('key_result_id', krId)
    .order('data', { ascending: false })
    .order('id', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

/**
 * Check-in: a RPC insere o histórico, atualiza `atual` e RECALCULA o farol
 * comparando com o tempo decorrido do ciclo. A conta é do banco; a tela só
 * mostra o resultado.
 */
export async function registrarCheckin(entrada: {
  krId: string
  valor: number
  data: string
  comentario: string | null
}): Promise<KeyResult> {
  const { data, error } = await supabase().rpc('kr_checkin', {
    p_kr_id: entrada.krId,
    p_valor: entrada.valor,
    p_data: entrada.data,
    p_comentario: entrada.comentario ?? undefined,
  })
  if (error) throw error
  return data as unknown as KeyResult
}

export async function desdobrarOkr(entrada: {
  okrId: string
  titulo: string
  areaId: string | null
  ownerUserId: string | null
  trimestre: number | null
}): Promise<Okr> {
  const { data, error } = await supabase().rpc('okr_desdobrar', {
    p_okr_id: entrada.okrId,
    p_titulo: entrada.titulo,
    p_area_id: entrada.areaId ?? undefined,
    p_owner_user_id: entrada.ownerUserId ?? undefined,
    p_trimestre: entrada.trimestre ?? undefined,
  })
  if (error) throw error
  return data as unknown as Okr
}

/** Os OKRs de que eu sou dono, com os KRs, para a tela "Meu OKR". */
export async function meusOkrs(companyId: string, ano: number, userId: string) {
  const { data, error } = await supabase()
    .from('okrs')
    .select('*, key_results(*), areas(nome)')
    .eq('company_id', companyId)
    .eq('ano', ano)
    .eq('owner_user_id', userId)
    .order('titulo')
    .order('id')
  if (error) throw error
  return (data ?? []) as (Okr & {
    key_results: KeyResult[]
    areas: { nome: string } | null
  })[]
}

export async function atualizarKeyResult(id: string, patch: Partial<KeyResult>) {
  const { data, error } = await supabase()
    .from('key_results')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'key result')
}

export async function recalcularFarois(companyId: string): Promise<number> {
  const { data, error } = await supabase().rpc('farol_recalcular', { p_company: companyId })
  if (error) throw error
  return (data as number) ?? 0
}

/** Mapeia o farol do banco para o estado do componente <Farol>. */
export function estadoDoFarol(farol: string | null | undefined) {
  switch (farol) {
    case 'verde':
      return 'verde' as const
    case 'amarelo':
      return 'amarelo' as const
    case 'vermelho':
      return 'vermelho' as const
    default:
      return 'sem_dado' as const
  }
}

// ===========================================================================
// Escrita: objetivos estratégicos, OKRs e key results
// ===========================================================================

export type DadosDoObjetivo = {
  perspectiva_id: string | null
  titulo: string
  descricao: string | null
  /** NOT NULL no banco, com default '2026-2029'. Nunca mande null. */
  ciclo: string
  is_estrela_do_norte: boolean
}

export async function criarObjetivo(
  companyId: string,
  dados: DadosDoObjetivo,
): Promise<ObjetivoEstrategico> {
  const { data, error } = await supabase()
    .from('objetivos_estrategicos')
    .insert({ ...dados, company_id: companyId })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'objetivo estratégico')
}

export async function atualizarObjetivo(id: string, patch: Partial<DadosDoObjetivo>) {
  const { data, error } = await supabase()
    .from('objetivos_estrategicos')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'objetivo estratégico')
}

export async function excluirObjetivo(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('objetivos_estrategicos')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'objetivo estratégico')
}

export type DadosDoOkr = {
  titulo: string
  descricao: string | null
  nivel: string
  area_id: string | null
  owner_user_id: string | null
  objetivo_estrategico_id: string | null
  perspectiva_id: string | null
  parent_okr_id: string | null
  ano: number
  trimestre: number | null
  status: string
}

export async function criarOkr(companyId: string, dados: DadosDoOkr): Promise<Okr> {
  const { data, error } = await supabase()
    .from('okrs')
    .insert({ ...dados, company_id: companyId })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'OKR')
}

export async function atualizarOkr(id: string, patch: Partial<DadosDoOkr>): Promise<Okr> {
  const { data, error } = await supabase()
    .from('okrs')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'OKR')
}

export async function excluirOkr(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('okrs')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'OKR')
}

export async function carregarOkr(id: string): Promise<Okr | null> {
  const { data, error } = await supabase().from('okrs').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export type DadosDoKeyResult = {
  okr_id: string
  descricao: string
  tipo: string
  direcao: string
  unidade: string | null
  baseline: number | null
  meta: number | null
  peso: number
}

export async function criarKeyResult(
  companyId: string,
  dados: DadosDoKeyResult,
): Promise<KeyResult> {
  const { data, error } = await supabase()
    .from('key_results')
    .insert({ ...dados, company_id: companyId })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'key result')
}

export async function excluirKeyResult(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('key_results')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'key result')
}

export const NIVEIS_DE_OKR = ['corporativo', 'diretoria', 'gerencia', 'individual'] as const
export const STATUS_DE_OKR = ['rascunho', 'ativo', 'concluido', 'cancelado'] as const
export const TIPOS_DE_KR = ['numerico', 'percentual', 'moeda', 'marco'] as const
export const DIRECOES_DE_KR = ['subir', 'descer'] as const
