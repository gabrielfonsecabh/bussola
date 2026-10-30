import { exigeLinhaAfetada } from '@/lib/query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Tabelas = Database['app']['Tables']
export type Processo = Tabelas['processos']['Row']
export type Sipoc = Tabelas['processo_sipoc']['Row']
export type Melhoria = Tabelas['projetos_melhoria']['Row']
export type EtapaDmaic = Tabelas['dmaic_etapas']['Row']
export type Indicador = Tabelas['indicadores_processo']['Row']

export type LinhaDoInventario = {
  id: string
  nome: string
  tipo: string
  status: string
  nivel_maturidade: number
  area_id: string | null
  area_nome: string | null
  dono_user_id: string | null
  dono_nome: string | null
  tem_sipoc: boolean
  indicadores_y: number
  indicadores_x: number
  melhorias_ativas: number
  ganho_realizado: number | null
  pronto_para_dmaic: boolean
  categoria: string | null
  periodicidade: string | null
  periodicidade_origem: string | null
  prazo_referencia: string | null
  pendencia_de_mapeamento: string | null
  origem_do_registro: string
  /**
   * `tem_sipoc` é o SIPOC UTILIZÁVEL: as quatro pontas preenchidas, a mesma
   * régua do selo da jornada. `sipoc_iniciado` é só "existe linha". Os dois
   * separam "ninguém começou" de "começou e parou", que são problemas
   * diferentes e pedem ações diferentes.
   */
  sipoc_iniciado: boolean
}

export type LinhaDoQuadro = {
  id: string
  nome: string
  metodo: string
  fase_atual: string
  status: string
  processo_id: string | null
  processo_nome: string | null
  area_nome: string | null
  belt_user_id: string | null
  belt_nome: string | null
  problema: string | null
  meta_smart: string | null
  ganho_estimado: number | null
  ganho_realizado: number | null
  termino_previsto: string | null
  tollgates_concluidos: number
  fases_concluidas: string[]
}

export type PontoDaSerie = {
  indicador_id: string
  indicador_nome: string
  tipo: string
  unidade: string | null
  meta: number | null
  baseline: number | null
  periodo: string | null
  valor: number | null
  medicoes: number
}

export const FASES_DMAIC = ['define', 'measure', 'analyze', 'improve', 'control'] as const

export async function carregarInventario(
  companyId: string,
  areaId: string | null,
  categoria: string | null = null,
): Promise<LinhaDoInventario[]> {
  const { data, error } = await supabase().rpc('processos_inventario', {
    p_company: companyId,
    p_area_id: areaId ?? undefined,
    p_categoria: categoria ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as LinhaDoInventario[]
}

export async function carregarQuadroDeMelhorias(
  companyId: string,
  processoId: string | null,
): Promise<LinhaDoQuadro[]> {
  const { data, error } = await supabase().rpc('melhorias_quadro', {
    p_company: companyId,
    p_processo_id: processoId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as LinhaDoQuadro[]
}

export async function carregarSipoc(processoId: string): Promise<Sipoc | null> {
  const { data, error } = await supabase()
    .from('processo_sipoc')
    .select('*')
    .eq('processo_id', processoId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listarIndicadores(processoId: string): Promise<Indicador[]> {
  const { data, error } = await supabase()
    .from('indicadores_processo')
    .select('*')
    .eq('processo_id', processoId)
    .order('tipo')
    .order('nome')
    .order('id')
  if (error) throw error
  return data ?? []
}

/**
 * Série agregada NO BANCO, no grão pedido. Puxar todas as medições para o
 * cliente e agrupar aqui é o caminho direto para o timeout silencioso.
 */
export async function carregarSerie(
  processoId: string,
  de: string | null,
  ate: string | null,
  grao: 'dia' | 'semana' | 'mes' | 'trimestre',
): Promise<PontoDaSerie[]> {
  const { data, error } = await supabase().rpc('processo_indicadores', {
    p_processo_id: processoId,
    p_de: de ?? undefined,
    p_ate: ate ?? undefined,
    p_grao: grao,
  })
  if (error) throw error
  return (data ?? []) as PontoDaSerie[]
}

export async function listarEtapas(melhoriaId: string): Promise<EtapaDmaic[]> {
  const { data, error } = await supabase()
    .from('dmaic_etapas')
    .select('*')
    .eq('projeto_melhoria_id', melhoriaId)
    .order('fase')
    .order('id')
  if (error) throw error
  return data ?? []
}

/**
 * Avançar de fase tem regra no BANCO: exige o tollgate anterior concluído e
 * não deixa pular etapa. A tela não replica essa regra, ela mostra o erro.
 */
export async function avancarFase(melhoriaId: string, fase: string): Promise<Melhoria> {
  const { data, error } = await supabase().rpc('melhoria_avancar_fase', {
    p_id: melhoriaId,
    p_fase: fase,
    p_entregaveis: undefined,
  })
  if (error) throw error
  return data as unknown as Melhoria
}

export async function concluirTollgate(melhoriaId: string, fase: string): Promise<EtapaDmaic> {
  const { data, error } = await supabase().rpc('dmaic_concluir_tollgate', {
    p_melhoria_id: melhoriaId,
    p_fase: fase,
    p_entregaveis: undefined,
  })
  if (error) throw error
  return data as unknown as EtapaDmaic
}

export async function registrarMedicao(entrada: {
  companyId: string
  indicadorId: string
  data: string
  valor: number
}) {
  const { data, error } = await supabase()
    .from('indicador_medicoes')
    .insert({
      company_id: entrada.companyId,
      indicador_id: entrada.indicadorId,
      data: entrada.data,
      valor: entrada.valor,
      origem: 'manual',
    })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'medição')
}

export async function salvarSipoc(entrada: {
  companyId: string
  processoId: string
  suppliers: string | null
  inputs: string | null
  outputs: string | null
  customers: string | null
}) {
  const { data, error } = await supabase()
    .from('processo_sipoc')
    .upsert(
      {
        company_id: entrada.companyId,
        processo_id: entrada.processoId,
        suppliers: entrada.suppliers,
        inputs: entrada.inputs,
        outputs: entrada.outputs,
        customers: entrada.customers,
      },
      { onConflict: 'processo_id' },
    )
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'SIPOC')
}

export async function atualizarMelhoria(id: string, patch: Partial<Melhoria>) {
  const { data, error } = await supabase()
    .from('projetos_melhoria')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'melhoria')
}

// ===========================================================================
// Escrita: criar, editar e excluir
//
// Todo caminho passa por `exigeLinhaAfetada`: em Postgres com RLS, um insert
// ou update barrado pela policy volta `error = null` e zero linhas. Sem essa
// checagem a tela comemora uma gravação que não aconteceu.
// ===========================================================================

export type DadosDoProcesso = {
  nome: string
  descricao: string | null
  area_id: string | null
  dono_user_id: string | null
  tipo: string
  nivel_maturidade: number
  status: string
  /** Agrupamento da área (Contábil, Fiscal, Legalização). Texto livre: cada
   *  área tem a sua taxonomia e engessá-la aqui só geraria "Outros". */
  categoria?: string | null
  /** Cadência classificada, ou NULA quando não dá para classificar. */
  periodicidade?: string | null
  /** O que a fonte escreveu, palavra por palavra. Nunca sobrescrito. */
  periodicidade_origem?: string | null
  /** Prazo como a área o enuncia: "dia 5", "15 dias antes do vencimento". */
  prazo_referencia?: string | null
  /** Pergunta ou tarefa que veio junto do nome. Não nulo = mapeamento parado
   *  por decisão pendente, não por falta de vontade. */
  pendencia_de_mapeamento?: string | null
}

export async function criarProcesso(
  companyId: string,
  dados: DadosDoProcesso,
): Promise<Processo> {
  const { data, error } = await supabase()
    .from('processos')
    .insert({ ...dados, company_id: companyId })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'processo')
}

export async function atualizarProcesso(id: string, patch: Partial<DadosDoProcesso>) {
  const { data, error } = await supabase()
    .from('processos')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'processo')
}

export async function excluirProcesso(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('processos')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'processo')
}

export async function carregarProcesso(id: string): Promise<Processo | null> {
  const { data, error } = await supabase()
    .from('processos')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export type DadosDoIndicador = {
  processo_id: string
  nome: string
  tipo: string
  formula: string | null
  unidade: string | null
  meta: number | null
  baseline: number | null
}

export async function criarIndicador(
  companyId: string,
  dados: DadosDoIndicador,
): Promise<Indicador> {
  const { data, error } = await supabase()
    .from('indicadores_processo')
    .insert({ ...dados, company_id: companyId })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'indicador')
}

export async function atualizarIndicador(id: string, patch: Partial<DadosDoIndicador>) {
  const { data, error } = await supabase()
    .from('indicadores_processo')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'indicador')
}

export async function excluirIndicador(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('indicadores_processo')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'indicador')
}

export type DadosDaMelhoria = {
  nome: string
  processo_id: string | null
  area_id: string | null
  metodo: string
  belt_user_id: string | null
  problema: string | null
  meta_smart: string | null
  ganho_estimado: number | null
  ganho_realizado: number | null
  status: string
  inicio_previsto: string | null
  termino_previsto: string | null
}

export async function criarMelhoria(
  companyId: string,
  dados: DadosDaMelhoria,
): Promise<Melhoria> {
  const { data, error } = await supabase()
    .from('projetos_melhoria')
    .insert({ ...dados, company_id: companyId, fase_atual: 'define' })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'projeto de melhoria')
}

export async function excluirMelhoria(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('projetos_melhoria')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'projeto de melhoria')
}

export async function carregarMelhoria(id: string): Promise<Melhoria | null> {
  const { data, error } = await supabase()
    .from('projetos_melhoria')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Processos da empresa, no formato do SearchableSelect. */
export async function processosParaSelect(companyId: string) {
  const { data, error } = await supabase()
    .from('processos')
    .select('id, nome, areas(nome)')
    .eq('company_id', companyId)
    .order('nome')
    .order('id')
  if (error) throw error
  return (data ?? []).map((p) => ({
    value: p.id,
    label: p.nome,
    description: (p as unknown as { areas: { nome: string } | null }).areas?.nome ?? undefined,
  }))
}

export const TIPOS_DE_PROCESSO = ['primario', 'apoio', 'gestao'] as const
export const STATUS_DE_PROCESSO = ['rascunho', 'ativo', 'revisao', 'descontinuado'] as const
export const METODOS_DE_MELHORIA = ['dmaic', 'kaizen', 'just_do_it'] as const
export const STATUS_DE_MELHORIA = [
  'backlog',
  'em_andamento',
  'pausado',
  'concluido',
  'cancelado',
] as const
export const TIPOS_DE_INDICADOR = ['Y', 'X'] as const

// ===========================================================================
// Fluxo do processo: o "P" do SIPOC
// ===========================================================================

/** Uma etapa já pronta para desenhar, com o responsável e a área resolvidos. */
export type EtapaDoFluxo = {
  id: string
  ordem: number
  tipo: string
  titulo: string
  descricao: string | null
  responsavel_user_id: string | null
  responsavel_nome: string | null
  area_id: string | null
  area_nome: string | null
  sistema: string | null
  tempo_estimado_min: number | null
  eh_gargalo: boolean
  rotulo_sim: string | null
  rotulo_nao: string | null
  desvio_para_etapa_id: string | null
}

/**
 * O que o desenho sozinho não conta. Um fluxograma bonito esconde exatamente
 * as perguntas de quem vai melhorar o processo: onde falta dono, quanto tempo
 * o fluxo leva, e por quantos sistemas ele passeia.
 */
export type ResumoDoFluxo = {
  total_etapas: number
  sem_responsavel: number
  gargalos: number
  decisoes: number
  /** null quando nenhuma etapa tem tempo: sem medição não é zero minuto. */
  tempo_total_min: number | null
  etapas_sem_tempo: number
  sistemas: number
  tem_inicio: boolean
  tem_fim: boolean
}

export type DadosDaEtapa = {
  processo_id: string
  ordem: number
  tipo: string
  titulo: string
  descricao: string | null
  responsavel_user_id: string | null
  area_id: string | null
  sistema: string | null
  tempo_estimado_min: number | null
  eh_gargalo: boolean
  rotulo_sim: string | null
  rotulo_nao: string | null
  desvio_para_etapa_id: string | null
}

export async function carregarFluxo(processoId: string): Promise<EtapaDoFluxo[]> {
  const { data, error } = await supabase().rpc('processo_fluxo', {
    p_processo_id: processoId,
  })
  if (error) throw error
  return (data ?? []) as EtapaDoFluxo[]
}

export async function carregarResumoDoFluxo(processoId: string): Promise<ResumoDoFluxo | null> {
  const { data, error } = await supabase().rpc('processo_fluxo_resumo', {
    p_processo_id: processoId,
  })
  if (error) throw error
  return ((data ?? [])[0] as ResumoDoFluxo | undefined) ?? null
}

export async function criarEtapa(companyId: string, dados: DadosDaEtapa) {
  const { data, error } = await supabase()
    .from('processo_etapas')
    .insert({ ...dados, company_id: companyId })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'etapa')
}

export async function atualizarEtapa(id: string, patch: Partial<DadosDaEtapa>) {
  const { data, error } = await supabase()
    .from('processo_etapas')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'etapa')
}

export async function excluirEtapa(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('processo_etapas')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'etapa')
}

/**
 * Reordena em bloco, numa transação só no banco. Um update por etapa deixaria
 * a ordem inconsistente se qualquer chamada do meio falhasse.
 */
export async function reordenarEtapas(processoId: string, ids: string[]): Promise<number> {
  const { data, error } = await supabase().rpc('processo_etapas_reordenar', {
    p_processo_id: processoId,
    p_ids: ids,
  })
  if (error) throw error
  return (data as number) ?? 0
}

export const TIPOS_DE_ETAPA = [
  'inicio',
  'atividade',
  'decisao',
  'documento',
  'espera',
  'fim',
] as const

/** Minutos viram uma leitura humana: 90 vira "1h30". */
export function formatarDuracao(minutos: number | null | undefined): string | null {
  if (minutos === null || minutos === undefined || Number.isNaN(minutos)) return null
  if (minutos < 60) return `${Math.round(minutos)}min`
  const horas = Math.floor(minutos / 60)
  const resto = Math.round(minutos % 60)
  if (horas < 24) return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`
  const dias = Math.floor(horas / 24)
  const horasRestantes = horas % 24
  return horasRestantes === 0 ? `${dias}d` : `${dias}d${horasRestantes}h`
}

// ===========================================================================
// A jornada de mapeamento, o POP e as missões
//
// Os seis selos NÃO vêm de nenhum campo marcável: `processos_jornada` os
// deriva do que existe no banco. Se a tela oferecesse um checkbox "tem fluxo",
// ele estaria mentindo na primeira semana corrida.
// ===========================================================================

export type Pop = Tabelas['processo_pop']['Row']
export type RevisaoDoPop = Tabelas['processo_pop_revisoes']['Row']

export const PERIODICIDADES = [
  'diario',
  'semanal',
  'quinzenal',
  'mensal',
  'bimestral',
  'trimestral',
  'semestral',
  'anual',
  'sob_demanda',
  'continuo',
] as const

export const STATUS_DE_POP = ['rascunho', 'em_revisao', 'vigente', 'obsoleto'] as const

/** Os seis selos, na ordem em que a jornada os apresenta. */
export const SELOS = ['dono', 'sipoc', 'fluxo', 'pop', 'indicador', 'melhoria'] as const
export type Selo = (typeof SELOS)[number]

export type LinhaDaJornada = {
  processo_id: string
  nome: string
  categoria: string | null
  area_id: string | null
  area_nome: string | null
  periodicidade: string | null
  prazo_referencia: string | null
  pendencia_de_mapeamento: string | null
  selo_dono: boolean
  selo_sipoc: boolean
  selo_fluxo: boolean
  selo_pop: boolean
  selo_indicador: boolean
  selo_melhoria: boolean
  selos: number
  estagio: string
}

export type LinhaDoPlacar = {
  area_id: string
  area_nome: string
  processos: number
  selos_ganhos: number
  selos_possiveis: number
  /** NULO quando a área não tem processo: "não entrou ainda" não é 0%. */
  percentual: number | null
  completos: number
  sem_dono: number
  com_pendencia: number
}

export type Missao = {
  codigo: string
  titulo: string
  alvo: number
  base: number
  restante: number
  feito: number
  concluida: boolean
}

/** O POP inteiro remontado pelo banco, com as lacunas nomeadas por seção. */
export type PopCompleto = {
  identificacao: {
    titulo: string
    codigo: string | null
    area: string | null
    dono: string | null
    categoria: string | null
    periodicidade: string | null
    periodicidade_origem: string | null
    prazo_referencia: string | null
    versao: number | null
    status: string
    data_emissao: string | null
    elaborado_por: string | null
    revisado_por: string | null
    aprovado_por: string | null
  }
  objetivo: string | null
  abrangencia: string | null
  definicoes: { sigla: string; significado: string }[]
  responsabilidades: { papel: string; responsabilidade: string }[]
  sistemas: string[]
  etapas: {
    ordem: number
    tipo: string
    titulo: string
    descricao: string | null
    responsavel: string | null
    sistema: string | null
    tempo_estimado_min: number | null
    eh_gargalo: boolean
  }[]
  controles_internos: string[]
  indicadores: {
    nome: string
    tipo: string
    formula: string | null
    unidade: string | null
    meta: number | null
    baseline: number | null
  }[]
  riscos: { risco: string; mitigacao: string }[]
  registros: string[]
  historico: { versao: number; data: string; alteracao: string; responsavel: string | null }[]
  pendencia_de_mapeamento: string | null
  /** As seções ainda vazias, por nome. Vazio significa POP completo. */
  lacunas: string[]
  /** De qual modelo este POP nasceu, ou null se foi escrito do zero. */
  modelo_nome: string | null
  /**
   * Seções cujo texto continua IDÊNTICO ao do modelo.
   *
   * Não são lacunas (têm texto) e também não são resposta: foram herdadas, não
   * pensadas. Ficam numa lista própria porque este é o risco de um modelo bom,
   * o vazio se vê e o texto genérico se disfarça de preenchido.
   */
  vindas_do_modelo: string[]
}

export async function carregarJornada(
  companyId: string,
  areaId: string | null,
): Promise<LinhaDaJornada[]> {
  const { data, error } = await supabase().rpc('processos_jornada', {
    p_company: companyId,
    p_area: areaId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as LinhaDaJornada[]
}

export async function carregarPlacar(companyId: string): Promise<LinhaDoPlacar[]> {
  const { data, error } = await supabase().rpc('jornada_placar', { p_company: companyId })
  if (error) throw error
  return (data ?? []) as LinhaDoPlacar[]
}

/**
 * Gera (uma vez por semana) e devolve as missões da área.
 *
 * A geração acontece dentro da mesma chamada de propósito: sem rotina agendada
 * para alguém esquecer de rodar, e sem a tela ter que orquestrar duas chamadas
 * na ordem certa.
 */
export async function carregarMissoes(companyId: string, areaId: string): Promise<Missao[]> {
  const { data, error } = await supabase().rpc('missoes_da_semana', {
    p_company: companyId,
    p_area: areaId,
  })
  if (error) throw error
  return (data ?? []) as Missao[]
}

export async function carregarPopCompleto(processoId: string): Promise<PopCompleto> {
  const { data, error } = await supabase().rpc('processo_pop_completo', {
    p_processo_id: processoId,
  })
  if (error) throw error
  return data as unknown as PopCompleto
}

export async function carregarPop(processoId: string): Promise<Pop | null> {
  const { data, error } = await supabase()
    .from('processo_pop')
    .select('*')
    .eq('processo_id', processoId)
    .maybeSingle()
  if (error) throw error
  return data
}

export type DadosDoPop = {
  codigo: string | null
  objetivo: string | null
  abrangencia: string | null
  definicoes: { sigla: string; significado: string }[]
  responsabilidades: { papel: string; responsabilidade: string }[]
  controles_internos: string[]
  registros: string[]
  riscos: { risco: string; mitigacao: string }[]
  elaborado_por: string | null
  revisado_por: string | null
}

export async function salvarPop(entrada: {
  companyId: string
  processoId: string
  dados: DadosDoPop
}): Promise<Pop> {
  const { data, error } = await supabase()
    .from('processo_pop')
    .upsert(
      {
        company_id: entrada.companyId,
        processo_id: entrada.processoId,
        ...entrada.dados,
      },
      { onConflict: 'processo_id' },
    )
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'POP')
}

/**
 * Aprovar carimba quem aprovou e registra a revisão na MESMA transação, no
 * banco. Duas escritas separadas podem divergir se a segunda falhar, e um POP
 * vigente sem registro de quem aprovou não tem controle nenhum.
 */
export async function aprovarPop(popId: string, alteracao: string | null): Promise<Pop> {
  const { data, error } = await supabase().rpc('processo_pop_aprovar', {
    p_pop_id: popId,
    p_alteracao: alteracao ?? undefined,
  })
  if (error) throw error
  return data as unknown as Pop
}

export async function listarRevisoesDoPop(popId: string): Promise<RevisaoDoPop[]> {
  const { data, error } = await supabase()
    .from('processo_pop_revisoes')
    .select('*')
    .eq('pop_id', popId)
    .order('versao', { ascending: false })
    .order('id')
  if (error) throw error
  return data ?? []
}

// ===========================================================================
// O modelo de POP
//
// O modelo traz o conteúdo padrão de um POP (objetivo, siglas, controles
// internos, riscos). Ele é registro, e não anexo, para o sistema conseguir
// pré-preencher o formulário a partir dele.
// ===========================================================================

export type ModeloDePop = Tabelas['pop_modelos']['Row']

export async function listarModelosDePop(companyId: string): Promise<ModeloDePop[]> {
  const { data, error } = await supabase()
    .from('pop_modelos')
    .select('*')
    .eq('company_id', companyId)
    .eq('ativo', true)
    .order('id')
  if (error) throw error
  return data ?? []
}

/**
 * Preenche as seções VAZIAS do POP com o modelo. Nunca sobrescreve texto que
 * alguém escreveu: um botão que apaga meia hora de trabalho de quem clicou por
 * curiosidade é perda que não volta.
 */
export async function aplicarModeloDePop(
  processoId: string,
  modeloId?: string | null,
): Promise<Pop> {
  const { data, error } = await supabase().rpc('pop_aplicar_modelo', {
    p_processo_id: processoId,
    p_modelo_id: modeloId ?? undefined,
  })
  if (error) throw error
  return data as unknown as Pop
}

export async function listarCategoriasDeProcesso(
  companyId: string,
  areaId: string | null,
): Promise<{ categoria: string; processos: number }[]> {
  const { data, error } = await supabase().rpc('processos_categorias', {
    p_company: companyId,
    p_area_id: areaId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as { categoria: string; processos: number }[]
}

// ===========================================================================
// O belt e o corpo do DMAIC
//
// Até a 0029 o DMAIC vivia numa tabela paralela a `projetos`: não aparecia no
// portfólio nem no cronograma, e não tinha como receber atividade. O belt era
// o único papel que não conseguia distribuir trabalho, porque registrava
// entregáveis num jsonb sem responsável, sem prazo e sem sprint.
// ===========================================================================

export type MeuDmaic = {
  id: string
  nome: string
  metodo: string
  fase_atual: string
  status: string
  processo_id: string | null
  processo_nome: string | null
  area_nome: string | null
  projeto_id: string | null
  ganho_estimado: number | null
  ganho_realizado: number | null
  atividades_abertas: number
  termino_previsto: string | null
}

export async function carregarMeusDmaics(companyId: string): Promise<MeuDmaic[]> {
  const { data, error } = await supabase().rpc('meus_dmaics', { p_company: companyId })
  if (error) throw error
  return (data ?? []) as MeuDmaic[]
}

/**
 * Cria o projeto que dá corpo ao DMAIC, ou devolve o que já existe.
 *
 * Idempotente de propósito: é o que permite a tela oferecer "Planejar
 * entregas" sem medo de a pessoa clicar de novo.
 */
export async function darCorpoAMelhoria(melhoriaId: string) {
  const { data, error } = await supabase().rpc('melhoria_dar_corpo', {
    p_melhoria_id: melhoriaId,
  })
  if (error) throw error
  return data
}
