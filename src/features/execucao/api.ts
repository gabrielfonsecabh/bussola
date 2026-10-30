import { exigeLinhaAfetada } from '@/lib/query'
import { intervaloDaPagina, type Paginacao } from '@/lib/filtros'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Tabelas = Database['app']['Tables']
export type Projeto = Tabelas['projetos']['Row']
export type Sprint = Tabelas['sprints']['Row']
export type Atividade = Tabelas['atividades']['Row']

export type FiltrosDePortfolio = {
  areaId: string | null
  categorias: string[]
  status: string[]
  responsavelId: string | null
  de: string | null
  ate: string | null
  busca: string
}

export const FILTROS_VAZIOS: FiltrosDePortfolio = {
  areaId: null,
  categorias: [],
  status: [],
  responsavelId: null,
  de: null,
  ate: null,
  busca: '',
}

export type ResumoDoPortfolio = {
  total: number
  progresso_medio: number | null
  atrasados: number
  sem_responsavel: number
  sem_prazo: number
  concluidos: number
}

export type ProjetoComContexto = Projeto & {
  areas: { nome: string } | null
  okrs: { titulo: string } | null
}

/**
 * O FILTRO VIAJA PARA O BANCO.
 *
 * A tentação é baixar tudo e filtrar no browser, e funciona até o dia em que a
 * tabela cresce: a consulta estoura o statement_timeout, volta vazia, e a tela
 * mostra zero sem erro nenhum. Por isso todo filtro daqui vira cláusula na
 * query, e a paginação ordena por chave ÚNICA.
 */
export async function listarProjetos(
  companyId: string,
  filtros: FiltrosDePortfolio,
  pagina: Paginacao,
): Promise<{ linhas: ProjetoComContexto[]; total: number }> {
  const [de, ate] = intervaloDaPagina(pagina)

  let query = supabase()
    .from('projetos')
    .select('*, areas(nome), okrs(titulo)', { count: 'exact' })
    .eq('company_id', companyId)

  if (filtros.areaId) query = query.eq('area_id', filtros.areaId)
  if (filtros.categorias.length > 0) query = query.in('categoria', filtros.categorias)
  if (filtros.status.length > 0) query = query.in('status', filtros.status)
  if (filtros.responsavelId) query = query.eq('responsavel_user_id', filtros.responsavelId)
  if (filtros.de) query = query.gte('termino_previsto', filtros.de)
  if (filtros.ate) query = query.lte('termino_previsto', filtros.ate)
  if (filtros.busca.trim()) query = query.ilike('nome', `%${filtros.busca.trim()}%`)

  // `.order('id')` é obrigatório: sem chave única o range pula e duplica linha.
  const { data, error, count } = await query
    .order('termino_previsto', { ascending: true, nullsFirst: false })
    .order('id')
    .range(de, ate)

  if (error) throw error
  return { linhas: (data ?? []) as ProjetoComContexto[], total: count ?? 0 }
}

/** O rodapé pede o TOTAL, não as linhas para somar. */
export async function resumoDoPortfolio(
  companyId: string,
  filtros: FiltrosDePortfolio,
): Promise<ResumoDoPortfolio | null> {
  const { data, error } = await supabase().rpc('portfolio_resumo', {
    p_company: companyId,
    p_area_id: filtros.areaId ?? undefined,
    p_categoria: filtros.categorias.length > 0 ? filtros.categorias : undefined,
    p_status: filtros.status.length > 0 ? filtros.status : undefined,
    p_responsavel: filtros.responsavelId ?? undefined,
    p_de: filtros.de ?? undefined,
    p_ate: filtros.ate ?? undefined,
  })
  if (error) throw error
  const linha = (data ?? [])[0] as ResumoDoPortfolio | undefined
  return linha ?? null
}

export async function carregarProjeto(id: string) {
  const { data, error } = await supabase()
    .from('projetos')
    .select('*, areas(nome), okrs(id, titulo)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function atividadesDoProjeto(projetoId: string): Promise<Atividade[]> {
  const { data, error } = await supabase()
    .from('atividades')
    .select('*')
    .eq('projeto_id', projetoId)
    .order('ordem')
    .order('id')
  if (error) throw error
  return data ?? []
}

export async function listarSprints(companyId: string): Promise<Sprint[]> {
  const { data, error } = await supabase()
    .from('sprints')
    .select('*')
    .eq('company_id', companyId)
    .order('data_inicio', { ascending: false })
    .order('id')
  if (error) throw error
  return data ?? []
}

/**
 * A sprint com o estado dentro dela. É o que a régua do quadro mostra.
 *
 * A lista crua de `listarSprints` não respondia as perguntas que fazem alguém
 * escolher uma sprint: quantas atividades tem, quanto já está pronto, de quais
 * projetos ela é, e qual é a de hoje. Sem isso, escolher virava tentativa e
 * erro num dropdown com os nomes cortados.
 */
export type SprintDoQuadro = {
  id: string
  nome: string
  objetivo: string | null
  area_id: string | null
  area_nome: string | null
  data_inicio: string
  data_fim: string
  status: string
  atividades: number
  concluidas: number
  bloqueadas: number
  projetos: number
  projeto_nomes: string[]
  e_atual: boolean
  dias_ate_o_fim: number
  dias_ate_o_inicio: number
}

export async function carregarSprintsDoQuadro(
  companyId: string,
  areaId: string | null,
): Promise<SprintDoQuadro[]> {
  const { data, error } = await supabase().rpc('sprints_do_quadro', {
    p_company: companyId,
    p_area_id: areaId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as SprintDoQuadro[]
}

/**
 * Qual sprint abrir quando ninguém escolheu ainda.
 *
 * A regra antiga era `status = 'ativa'`, e status é campo que alguém precisa
 * lembrar de virar à mão. Ninguém lembra, então o quadro abria sempre na
 * primeira da lista (a S1, em setembro) mesmo em novembro.
 *
 * A ordem aqui é a da pergunta real de quem abre o quadro: a sprint em que
 * estou hoje; se hoje cai num vão entre sprints, a próxima que começa; e se
 * todas já terminaram, a última, que é onde o trabalho parou.
 */
export function sprintDeHoje(lista: SprintDoQuadro[], hoje: string): string | null {
  if (lista.length === 0) return null

  // Mais de uma sprint pode conter hoje (áreas diferentes, ou uma sprint de um
  // dia sobreposta a uma semana). Desempata pela que tem trabalho dentro: uma
  // sprint vazia não é onde alguém quer cair.
  const atuais = lista
    .filter((s) => s.e_atual)
    .toSorted((a, b) => b.atividades - a.atividades)
  if (atuais[0]) return atuais[0].id

  const proxima = lista.find((s) => s.data_inicio > hoje)
  if (proxima) return proxima.id

  return lista[lista.length - 1]?.id ?? null
}

export type CartaoDoKanban = Atividade & {
  projetos: { nome: string } | null
  profiles: { nome: string | null } | null
}

export async function atividadesDaSprint(sprintId: string): Promise<CartaoDoKanban[]> {
  /**
   * O nome do responsável NÃO vem por embed, e isto não é preferência.
   *
   * `atividades.responsavel_user_id` aponta para `auth.users`, e o PostgREST só
   * embute por chave estrangeira DENTRO do schema exposto. O embed
   * `profiles:responsavel_user_id(nome)` devolvia
   * `PGRST200: Could not find a relationship between 'atividades' and
   * 'responsavel_user_id'`, e o quadro inteiro não abria.
   *
   * O defeito só aparecia com dado: enquanto não existia nenhuma sprint, a
   * consulta nunca rodava. São 52 colunas do schema apontando para auth.users,
   * então vale a regra: nenhuma delas pode ser embutida.
   */
  const { data, error } = await supabase()
    .from('atividades')
    .select('*, projetos(nome)')
    .eq('sprint_id', sprintId)
    .order('ordem')
    .order('id')
  if (error) throw error

  const linhas = (data ?? []) as unknown as (Atividade & { projetos: { nome: string } | null })[]

  const responsaveis = [
    ...new Set(linhas.map((l) => l.responsavel_user_id).filter((id): id is string => !!id)),
  ]
  if (responsaveis.length === 0) {
    return linhas.map((l) => ({ ...l, profiles: null }))
  }

  const { data: perfis, error: erroDePerfis } = await supabase()
    .from('profiles')
    .select('user_id, nome')
    .in('user_id', responsaveis)
  // Falhar aqui em vez de mostrar o quadro com todos os cartões "sem
  // responsável": um cartão que perde o dono na tela é lido como tarefa órfã, e
  // alguém a reatribui.
  if (erroDePerfis) throw erroDePerfis

  const nomePorUsuario = new Map((perfis ?? []).map((p) => [p.user_id, p.nome]))

  return linhas.map((l) => ({
    ...l,
    profiles: l.responsavel_user_id
      ? { nome: nomePorUsuario.get(l.responsavel_user_id) ?? null }
      : null,
  }))
}

/**
 * Move o cartão via RPC. A RPC deriva o tenant da linha, recalcula o progresso
 * do projeto e recusa a escrita se a atividade mudou desde que a tela carregou
 * (40001), em vez de sobrescrever o trabalho de outra pessoa em silêncio.
 */
export async function moverAtividade(entrada: {
  id: string
  status: string
  ordem?: number | null
  sprintId?: string | null
  versao?: string | null
}): Promise<Atividade> {
  const { data, error } = await supabase().rpc('atividade_mover', {
    p_id: entrada.id,
    p_status: entrada.status,
    p_ordem: entrada.ordem ?? undefined,
    p_sprint_id: entrada.sprintId ?? undefined,
    p_versao: entrada.versao ?? undefined,
  })
  if (error) throw error
  return data as unknown as Atividade
}

export type MinhaAtividade = Atividade & {
  projetos: { nome: string } | null
  key_results: { descricao: string } | null
}

export async function minhasAtividades(
  companyId: string,
  userId: string,
): Promise<MinhaAtividade[]> {
  const { data, error } = await supabase()
    .from('atividades')
    .select('*, projetos(nome), key_results(descricao)')
    .eq('company_id', companyId)
    .eq('responsavel_user_id', userId)
    .order('data_prazo', { ascending: true, nullsFirst: false })
    .order('id')
  if (error) throw error
  return (data ?? []) as unknown as MinhaAtividade[]
}

export type LinhaDoCronograma = {
  projeto_id: string
  nome: string
  categoria: string
  status: string
  prioridade: string
  area_nome: string | null
  responsavel_nome: string | null
  progresso_pct: number
  inicio: string | null
  termino: string | null
  /** Sem prazo NÃO é o mesmo que fora do período: o projeto existe e precisa de data. */
  sem_prazo: boolean
  atrasado: boolean
  dias: number | null
  atividades: number
  atividades_abertas: number
  /** Quantos OUTROS projetos dividem pelo menos um dia com este. */
  sobrepoe: number
}

export type CargaDoMes = {
  mes: string
  projetos: number
  nomes: string[]
}

/**
 * A linha do tempo por projeto, do primeiro ao último, sem recorte de ano.
 *
 * A versão anterior era por trimestre de UM ano: trabalho que atravessa o
 * réveillon não cabia na tela, e dois projetos no mesmo trimestre ocupavam a
 * mesma caixa, o que escondia exatamente a sobreposição que se quer ver.
 */
export async function carregarCronograma(
  companyId: string,
  areaId: string | null,
): Promise<LinhaDoCronograma[]> {
  const { data, error } = await supabase().rpc('cronograma_gestao', {
    p_company: companyId,
    p_area_id: areaId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as LinhaDoCronograma[]
}

/** Quantos projetos estão abertos em cada mês. É o número que diz se cabe mais um. */
export async function carregarCargaDoCronograma(
  companyId: string,
  areaId: string | null,
): Promise<CargaDoMes[]> {
  const { data, error } = await supabase().rpc('cronograma_carga', {
    p_company: companyId,
    p_area_id: areaId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as CargaDoMes[]
}

export async function atualizarAtividade(id: string, patch: Partial<Atividade>) {
  const { data, error } = await supabase()
    .from('atividades')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'atividade')
}

export async function atualizarProjeto(id: string, patch: Partial<Projeto>) {
  const { data, error } = await supabase()
    .from('projetos')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'projeto')
}

export const STATUS_DO_KANBAN = [
  'a_fazer',
  'fazendo',
  'revisao',
  'concluido',
  'bloqueado',
] as const

// ===========================================================================
// Escrita: criar, editar e excluir
//
// Todo caminho passa por `exigeLinhaAfetada`, que trata "0 linhas" como ERRO.
// Sem isso, um insert ou update barrado pela RLS volta `error = null` e a tela
// mostra um toast de sucesso para uma gravação que não aconteceu.
// ===========================================================================

export type DadosDoProjeto = {
  nome: string
  descricao: string | null
  area_id: string | null
  okr_id: string | null
  categoria: string
  tipo: string
  responsavel_user_id: string | null
  patrocinador_user_id: string | null
  status: string
  prioridade: string
  inicio_previsto: string | null
  termino_previsto: string | null
  inicio_real: string | null
  termino_real: string | null
}

export async function criarProjeto(
  companyId: string,
  dados: DadosDoProjeto,
): Promise<Projeto> {
  const { data, error } = await supabase()
    .from('projetos')
    .insert({ ...dados, company_id: companyId })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'projeto')
}

export async function excluirProjeto(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('projetos')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'projeto')
}

export type DadosDaAtividade = {
  titulo: string
  descricao: string | null
  projeto_id: string | null
  sprint_id: string | null
  key_result_id: string | null
  parent_atividade_id: string | null
  area_id: string | null
  responsavel_user_id: string | null
  status: string
  prioridade: string
  horizonte: string
  data_prazo: string | null
  estimativa_h: number | null
}

export async function criarAtividade(
  companyId: string,
  dados: DadosDaAtividade,
): Promise<Atividade> {
  const { data, error } = await supabase()
    .from('atividades')
    .insert({ ...dados, company_id: companyId })
    .select()
    .maybeSingle()
  const criada = exigeLinhaAfetada({ data, error }, 'atividade')

  // Nasce atividade, muda o denominador do progresso do projeto. A conta é do
  // banco: a tela não recalcula porcentagem por conta própria.
  if (criada.projeto_id) await recalcularProgresso(criada.projeto_id)
  return criada
}

export async function excluirAtividade(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('atividades')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  const removida = exigeLinhaAfetada({ data, error }, 'atividade')
  if (removida.projeto_id) await recalcularProgresso(removida.projeto_id)
}

/** Reaplica o progresso do projeto a partir das atividades concluídas. */
export async function recalcularProgresso(projetoId: string): Promise<Projeto> {
  const { data, error } = await supabase().rpc('projeto_progresso', {
    p_projeto_id: projetoId,
  })
  if (error) throw error
  return data as unknown as Projeto
}

export type DadosDaSprint = {
  nome: string
  objetivo: string | null
  area_id: string | null
  data_inicio: string
  data_fim: string
  status: string
}

export async function criarSprint(
  companyId: string,
  dados: DadosDaSprint,
): Promise<Sprint> {
  const { data, error } = await supabase()
    .from('sprints')
    .insert({ ...dados, company_id: companyId })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'sprint')
}

export async function atualizarSprint(id: string, patch: Partial<DadosDaSprint>) {
  const { data, error } = await supabase()
    .from('sprints')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'sprint')
}

export async function excluirSprint(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('sprints')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'sprint')
}

/** OKRs do ano para o select de vínculo do projeto com a estratégia. */
export async function okrsParaVinculo(companyId: string, ano: number) {
  const { data, error } = await supabase()
    .from('okrs')
    .select('id, titulo, nivel, areas(nome)')
    .eq('company_id', companyId)
    .eq('ano', ano)
    .neq('status', 'cancelado')
    .order('titulo')
    .order('id')
  if (error) throw error
  return (data ?? []).map((o) => ({
    value: o.id,
    label: o.titulo,
    description: (o as unknown as { areas: { nome: string } | null }).areas?.nome ?? o.nivel,
  }))
}

/** Key results de uma área, para ligar a atividade ao KR que ela avança. */
export async function krsParaVinculo(companyId: string, ano: number) {
  const { data, error } = await supabase()
    .from('key_results')
    .select('id, descricao, okrs!inner(titulo, ano)')
    .eq('company_id', companyId)
    .eq('okrs.ano', ano)
    .order('descricao')
    .order('id')
  if (error) throw error
  return (data ?? []).map((k) => ({
    value: k.id,
    label: k.descricao,
    description: (k as unknown as { okrs: { titulo: string } }).okrs?.titulo,
  }))
}

/**
 * Projetos abertos, para o seletor do formulário de atividade.
 *
 * Só os que ainda recebem trabalho: pendurar atividade nova em projeto
 * concluído ou cancelado é quase sempre engano, e listá-los faz o seletor
 * crescer com o histórico da empresa inteira.
 */
export async function projetosParaSelect(companyId: string) {
  const { data, error } = await supabase()
    .from('projetos')
    .select('id, nome, status, areas(nome)')
    .eq('company_id', companyId)
    .not('status', 'in', '("concluido","cancelado")')
    .order('nome')
    .order('id')
  if (error) throw error
  return (data ?? []).map((p) => ({
    value: p.id,
    label: p.nome,
    description: (p as unknown as { areas: { nome: string } | null }).areas?.nome ?? 'sem área',
    badge: p.status,
  }))
}

export const CATEGORIAS_DE_PROJETO = [
  'estrutural',
  'melhoria',
  'ia',
  'gestao_projetos',
  'comite',
] as const

export const STATUS_DE_PROJETO = [
  'backlog',
  'planejado',
  'em_andamento',
  'pausado',
  'concluido',
  'cancelado',
] as const

export const PRIORIDADES = ['baixa', 'media', 'alta', 'critica'] as const

export const HORIZONTES = ['anual', 'trimestral', 'mensal', 'semanal', 'diario'] as const
