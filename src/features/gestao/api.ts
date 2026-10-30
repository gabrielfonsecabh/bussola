import { exigeLinhaAfetada } from '@/lib/query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Tabelas = Database['app']['Tables']
export type Opr = Tabelas['opr']['Row']
export type BonusConfig = Tabelas['bonus_config']['Row']

export type LinhaDoKit = {
  area_id: string
  area_nome: string
  area_tipo: string
  parent_area_id: string | null
  responsavel_nome: string | null
  mapa_status: string
  mapa_detalhe: string
  processos_status: string
  processos_detalhe: string
  opr_status: string
  opr_detalhe: string
  percentual: number
}

export type SnapshotDoOpr = {
  area_id: string
  area_nome: string
  periodo: string
  gerado_em: string
  okr_resumo: {
    okr_id: string
    titulo: string
    nivel: string
    total_krs: number
    atingimento: number | null
    farol: string
  }[]
  indicadores: {
    indicador_id: string
    nome: string
    tipo: string
    unidade: string | null
    meta: number | null
    ultimo_valor: number | null
    ultima_medicao: string | null
  }[]
  projetos: {
    projeto_id: string
    nome: string
    status: string
    progresso_pct: number
    termino_previsto: string | null
    atrasado: boolean
  }[]
  melhorias: {
    melhoria_id: string
    nome: string
    fase_atual: string
    ganho_estimado: number | null
    ganho_realizado: number | null
  }[]
}

export type LinhaDaApuracao = {
  escopo: string
  referencia: string
  componente: string
  atingimento_pct: number | null
  peso: number | null
  resultado_pct: number | null
}

/**
 * O status do Kit NÃO é digitado à mão: a RPC deriva de fato dos módulos de
 * OKR e de Processos. Digitar aqui produziria um painel que discorda do
 * sistema, e é o painel que perderia a confiança.
 */
export async function carregarKit(companyId: string, periodo: string): Promise<LinhaDoKit[]> {
  const { data, error } = await supabase().rpc('kit_matriz', {
    p_company: companyId,
    p_periodo: periodo,
  })
  if (error) throw error
  return (data ?? []) as LinhaDoKit[]
}

export async function congelarKit(companyId: string, periodo: string): Promise<number> {
  const { data, error } = await supabase().rpc('kit_congelar', {
    p_company: companyId,
    p_periodo: periodo,
  })
  if (error) throw error
  return (data as number) ?? 0
}

export async function montarOpr(areaId: string, periodo: string): Promise<SnapshotDoOpr> {
  const { data, error } = await supabase().rpc('opr_montar', {
    p_area_id: areaId,
    p_periodo: periodo,
  })
  if (error) throw error
  return data as unknown as SnapshotDoOpr
}

export async function carregarOpr(
  companyId: string,
  areaId: string,
  periodo: string,
): Promise<Opr | null> {
  const { data, error } = await supabase()
    .from('opr')
    .select('*')
    .eq('company_id', companyId)
    .eq('area_id', areaId)
    .eq('periodo', periodo)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function salvarOpr(entrada: {
  companyId: string
  areaId: string
  periodo: string
  destaques: string | null
  riscos: string | null
  proximos_passos: string | null
  snapshot: SnapshotDoOpr | null
}): Promise<Opr> {
  const { data, error } = await supabase()
    .from('opr')
    .upsert(
      {
        company_id: entrada.companyId,
        area_id: entrada.areaId,
        periodo: entrada.periodo,
        destaques: entrada.destaques,
        riscos: entrada.riscos,
        proximos_passos: entrada.proximos_passos,
        okr_resumo: (entrada.snapshot?.okr_resumo ?? []) as never,
        indicadores: (entrada.snapshot?.indicadores ?? []) as never,
      },
      { onConflict: 'company_id,area_id,periodo' },
    )
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'OPR')
}

/** Publicar o OPR do mês é o que marca o item OPR do Kit como em dia. */
export async function publicarOpr(oprId: string): Promise<Opr> {
  const { data, error } = await supabase().rpc('opr_publicar', { p_opr_id: oprId })
  if (error) throw error
  return data as unknown as Opr
}

export async function carregarConfigDeBonus(
  companyId: string,
  ano: number,
): Promise<BonusConfig | null> {
  const { data, error } = await supabase()
    .from('bonus_config')
    .select('*')
    .eq('company_id', companyId)
    .eq('ano', ano)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function salvarConfigDeBonus(entrada: {
  companyId: string
  ano: number
  pesos: unknown
  reguas: unknown
}): Promise<BonusConfig> {
  const { data, error } = await supabase()
    .from('bonus_config')
    .upsert(
      {
        company_id: entrada.companyId,
        ano: entrada.ano,
        pesos: entrada.pesos as never,
        reguas: entrada.reguas as never,
      },
      { onConflict: 'company_id,ano' },
    )
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'configuração de bônus')
}

/**
 * Apuração é função SENSÍVEL: gate por `bonus.config`, cada linha carrega
 * `created_by`, e refazer o mesmo período substitui em vez de acumular.
 */
export async function apurarBonus(entrada: {
  companyId: string
  periodo: string
  ebitdaPct: number | null
  faturamentoPct: number | null
}): Promise<LinhaDaApuracao[]> {
  const { data, error } = await supabase().rpc('bonus_apurar', {
    p_company: entrada.companyId,
    p_periodo: entrada.periodo,
    p_ebitda_pct: entrada.ebitdaPct ?? undefined,
    p_faturamento_pct: entrada.faturamentoPct ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as LinhaDaApuracao[]
}

export async function carregarApuracao(
  companyId: string,
  periodo: string,
): Promise<LinhaDaApuracao[]> {
  const { data, error } = await supabase()
    .from('bonus_apuracao')
    .select('escopo, componente, atingimento_pct, peso, resultado_pct, areas(nome)')
    .eq('company_id', companyId)
    .eq('periodo', periodo)
    .order('escopo')
    .order('id')
  if (error) throw error
  return (data ?? []).map((l) => ({
    escopo: l.escopo,
    referencia:
      (l as unknown as { areas: { nome: string } | null }).areas?.nome ?? 'empresa',
    componente: l.componente,
    atingimento_pct: l.atingimento_pct,
    peso: l.peso,
    resultado_pct: l.resultado_pct,
  }))
}

export function estadoDoItemDoKit(status: string) {
  if (status === 'em_dia') return 'verde' as const
  if (status === 'atrasado') return 'amarelo' as const
  return 'sem_dado' as const
}

// ===========================================================================
// Modelo de bônus: forma dos pesos e das réguas
//
// `bonus_config.pesos` e `bonus_config.reguas` são jsonb, então o formato não
// é garantido pelo banco. Estes tipos são o contrato que a tela assume, e a
// função `bonus_apurar` lê exatamente estas chaves.
// ===========================================================================

/**
 * Faixa da régua, no formato que o NEGÓCIO usa e que o banco guarda:
 * "de 90,01 a 95 paga 40%". `max` nulo é a faixa de topo, aberta para cima.
 *
 * A 0013 tinha escrito a leitura como {ate, paga} e o seed grava
 * {min, max, paga}: nenhuma faixa casava, a função devolvia NULL e o coalesce
 * virava ZERO. 100% de atingimento pagava 0% sem erro nenhum. Ver 0018.
 */
export type Faixa = { min: number; max: number | null; paga: number }

export type PesosDoBonus = {
  /** Fatia do bônus que vem dos indicadores globais (EBITDA e faturamento). */
  global: number
  /** Fatia setorial: o Kit mínimo de gestão da área. */
  setorial: number
  /** Fatia individual: assiduidade. */
  individual: number
  /** Dentro da fatia global, quanto é EBITDA. */
  ebitda: number
  /** Dentro da fatia global, quanto é faturamento. */
  faturamento: number
}

export type ReguasDoBonus = {
  ebitda: Faixa[]
  faturamento: Faixa[]
  /** A chave é `multiplicador_nivel` no banco. Não renomeie sem migration. */
  multiplicador_nivel: Record<string, number>
}

export const PESOS_PADRAO: PesosDoBonus = {
  global: 0.6,
  setorial: 0.25,
  individual: 0.15,
  ebitda: 0.6,
  faturamento: 0.4,
}

/** Faixas de exemplo, como ponto de partida editável. Defina as da sua política. */
export const REGUAS_PADRAO: ReguasDoBonus = {
  ebitda: [
    { min: 0, max: 85, paga: 0 },
    { min: 85.01, max: 92, paga: 50 },
    { min: 92.01, max: 99.99, paga: 75 },
    { min: 100, max: null, paga: 100 },
  ],
  faturamento: [
    { min: 0, max: 90, paga: 0 },
    { min: 90.01, max: 99.99, paga: 70 },
    { min: 100, max: null, paga: 100 },
  ],
  multiplicador_nivel: {
    diretor: 2.5,
    gerente: 1.8,
    gerente_regional: 1.5,
    coordenador: 1.3,
    especialista: 1.2,
    coordenador_regional: 1.2,
    colaborador: 1,
  },
}

export function lerPesos(config: BonusConfig | null | undefined): PesosDoBonus {
  const bruto = (config?.pesos ?? {}) as Partial<PesosDoBonus>
  return { ...PESOS_PADRAO, ...bruto }
}

export function lerReguas(config: BonusConfig | null | undefined): ReguasDoBonus {
  const bruto = (config?.reguas ?? {}) as Partial<ReguasDoBonus>
  return {
    ebitda: Array.isArray(bruto.ebitda) ? bruto.ebitda : REGUAS_PADRAO.ebitda,
    faturamento: Array.isArray(bruto.faturamento)
      ? bruto.faturamento
      : REGUAS_PADRAO.faturamento,
    multiplicador_nivel:
      bruto.multiplicador_nivel && typeof bruto.multiplicador_nivel === 'object'
        ? bruto.multiplicador_nivel
        : REGUAS_PADRAO.multiplicador_nivel,
  }
}

/**
 * As três fatias precisam somar 1. Se não somarem, a apuração distribui um
 * bolo diferente de 100% e ninguém percebe olhando a tela.
 */
export function pesosSomamUm(pesos: PesosDoBonus): boolean {
  return Math.abs(pesos.global + pesos.setorial + pesos.individual - 1) < 0.0001
}

/** Dentro da fatia global, EBITDA e faturamento também precisam somar 1. */
export function globalSomaUm(pesos: PesosDoBonus): boolean {
  return Math.abs(pesos.ebitda + pesos.faturamento - 1) < 0.0001
}

/**
 * Problemas que tornam a régua incapaz de classificar um atingimento.
 *
 * Isso não é preciosismo de validação: uma faixa faltando é um intervalo em
 * que `bonus_aplicar_regua` não acha nada e devolve NULL, e a apuração daquele
 * componente sai como "sem dado". Melhor barrar aqui, com o motivo escrito,
 * do que descobrir na reunião de fechamento.
 */
export function problemasDaRegua(faixas: Faixa[]): string[] {
  const problemas: string[] = []
  if (faixas.length === 0) return ['A régua está vazia: nenhum atingimento seria classificado.']

  const ordenadas = faixas.toSorted((a, b) => a.min - b.min)
  const foraDeOrdem = faixas.some((f, i) => f.min !== ordenadas[i]?.min)
  if (foraDeOrdem) problemas.push('As faixas precisam estar em ordem crescente de "de".')

  ordenadas.forEach((f, i) => {
    if (f.max !== null && f.max < f.min) {
      problemas.push(`Faixa ${i + 1}: o "até" (${f.max}) é menor que o "de" (${f.min}).`)
    }
    if (f.max === null && i !== ordenadas.length - 1) {
      problemas.push(
        `Faixa ${i + 1} está aberta para cima mas não é a última: ela engoliria as seguintes.`,
      )
    }
    const anterior = ordenadas[i - 1]
    if (anterior && anterior.max !== null && f.min <= anterior.max) {
      problemas.push(`Faixas ${i} e ${i + 1} se sobrepõem em ${f.min}.`)
    }
  })

  if (ordenadas.at(-1)?.max !== null) {
    problemas.push(
      'A última faixa precisa ficar sem "até", senão um atingimento acima dela não é classificado.',
    )
  }

  return problemas
}
