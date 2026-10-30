import { supabase } from '@/lib/supabase'

export type PainelExecutivo = {
  ano: number
  gerado_em: string
  okr: {
    total: number
    verde: number
    amarelo: number
    vermelho: number
    sem_dado: number
  }
  perspectivas: {
    perspectiva_id: string
    chave: string
    nome: string
    ordem: number
    objetivos: number
    okrs: number
    atingimento: number | null
  }[]
  projetos: {
    total: number
    em_andamento: number
    concluidos: number
    atrasados: number
    orfaos: number
    progresso_medio: number | null
    iniciativas_ia: number
  }
  processos: {
    processos: number
    com_sipoc: number
    melhorias_ativas: number
    ganho_estimado: number | null
    ganho_realizado: number | null
  }
  kit: {
    areas: number
    em_dia: number
    parcial: number
    pendente: number
    percentual_medio: number | null
  }
  estrela_do_norte: {
    objetivo_id: string
    titulo: string
    okr_id: string | null
    kr_id: string | null
    kr_descricao: string | null
    unidade: string | null
    baseline: number | null
    meta: number | null
    atual: number | null
    atingimento: number | null
    farol: string | null
  }[]
}

export type LinhaDoPainelDeAreas = {
  area_id: string
  area_nome: string
  area_tipo: string
  parent_area_id: string | null
  responsavel_nome: string | null
  okrs: number
  krs: number
  atingimento: number | null
  farol: string
  projetos: number
  projetos_atrasados: number
  atividades_abertas: number
  processos: number
  melhorias_ativas: number
  kit_percentual: number | null
}

export type PainelDeComite = {
  area_id: string
  nome: string
  tipo: string
  ano: number
  okrs: { id: string; titulo: string; nivel: string; status: string }[]
  projetos: {
    id: string
    nome: string
    status: string
    progresso_pct: number
    termino_previsto: string | null
  }[]
  processos: { id: string; nome: string; nivel_maturidade: number }[]
}

export async function carregarPainelExecutivo(
  companyId: string,
  ano: number,
): Promise<PainelExecutivo> {
  const { data, error } = await supabase().rpc('painel_executivo', {
    p_company: companyId,
    p_ano: ano,
  })
  if (error) throw error
  return data as unknown as PainelExecutivo
}

export async function carregarPainelDeAreas(
  companyId: string,
  ano: number,
): Promise<LinhaDoPainelDeAreas[]> {
  const { data, error } = await supabase().rpc('painel_areas', {
    p_company: companyId,
    p_ano: ano,
  })
  if (error) throw error
  return (data ?? []) as LinhaDoPainelDeAreas[]
}

export async function carregarPainelDeComite(
  comiteId: string,
  ano: number,
): Promise<PainelDeComite> {
  const { data, error } = await supabase().rpc('painel_comite', {
    p_comite_id: comiteId,
    p_ano: ano,
  })
  if (error) throw error
  return data as unknown as PainelDeComite
}
