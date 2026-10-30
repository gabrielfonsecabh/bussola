/** Formatação pt-BR num lugar só, para a mesma grandeza não virar dois formatos. */

const numero = new Intl.NumberFormat('pt-BR')
const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})
const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const mesAno = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })

export const fmt = {
  numero: (v: number) => numero.format(v),
  moeda: (v: number) => moeda.format(v),
  percentual: (v: number, casas = 0) =>
    `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`,
  /** Atingimento vem do banco como fração (0.92). A tela mostra 92%. */
  atingimento: (v: number | null | undefined) =>
    v === null || v === undefined ? null : Math.round(v * 100),
  data: (v: string | null | undefined) => (v ? dataCurta.format(new Date(`${v}T12:00:00`)) : null),
  mesAno: (v: string) => mesAno.format(new Date(`${v}-01T12:00:00`)),
}

/** 'YYYY-MM' do mês corrente, o período padrão do Kit e do OPR. */
export function periodoAtual(): string {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

export function anoAtual(): number {
  return new Date().getFullYear()
}

/** Rótulos legíveis para os enums de texto do banco. */
export const rotulos = {
  periodicidade: {
    diario: 'Diário',
    semanal: 'Semanal',
    quinzenal: 'Quinzenal',
    mensal: 'Mensal',
    bimestral: 'Bimestral',
    trimestral: 'Trimestral',
    semestral: 'Semestral',
    anual: 'Anual',
    sob_demanda: 'Sob demanda',
    continuo: 'Contínuo',
  },
  estagio_jornada: {
    nao_comecou: 'Não começou',
    em_mapeamento: 'Em mapeamento',
    mapeado: 'Mapeado',
    melhoria_continua: 'Em melhoria contínua',
  },
  status_pop: {
    inexistente: 'Sem POP',
    rascunho: 'Rascunho',
    em_revisao: 'Em revisão',
    vigente: 'Vigente',
    obsoleto: 'Obsoleto',
  },
  selo: {
    dono: 'Dono',
    sipoc: 'SIPOC',
    fluxo: 'Fluxo',
    pop: 'POP',
    indicador: 'Indicador',
    melhoria: 'Melhoria',
  },
  origem_do_registro: {
    manual: 'Cadastrado na tela',
    importacao: 'Veio de planilha',
  },
  status_projeto: {
    backlog: 'Backlog',
    planejado: 'Planejado',
    em_andamento: 'Em andamento',
    pausado: 'Pausado',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  } as Record<string, string>,
  categoria_projeto: {
    estrutural: 'Estrutural',
    melhoria: 'Melhoria',
    ia: 'IA',
    gestao_projetos: 'Gestão de projetos',
    comite: 'Comitê',
  } as Record<string, string>,
  status_atividade: {
    a_fazer: 'A fazer',
    fazendo: 'Fazendo',
    revisao: 'Revisão',
    concluido: 'Concluído',
    bloqueado: 'Bloqueado',
  } as Record<string, string>,
  horizonte: {
    anual: 'Anual',
    trimestral: 'Trimestral',
    mensal: 'Mensal',
    semanal: 'Semanal',
    diario: 'Diário',
  } as Record<string, string>,
  prioridade: {
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
    critica: 'Crítica',
  } as Record<string, string>,
  nivel_okr: {
    corporativo: 'Corporativo',
    diretoria: 'Diretoria',
    gerencia: 'Gerência',
    individual: 'Individual',
  } as Record<string, string>,
  tipo_area: {
    diretoria: 'Diretoria',
    gerencia: 'Gerência',
    especialista: 'Especialista',
    comite: 'Comitê',
  } as Record<string, string>,
  fase_dmaic: {
    define: 'Define',
    measure: 'Measure',
    analyze: 'Analyze',
    improve: 'Improve',
    control: 'Control',
    concluido: 'Concluído',
  } as Record<string, string>,
  tipo_processo: {
    primario: 'Primário',
    apoio: 'Apoio',
    gestao: 'Gestão',
  } as Record<string, string>,
  item_kit: {
    mapa_estrategico: 'Mapa estratégico',
    processos_procedimentos: 'Processos e procedimentos',
    opr: 'OPR',
  } as Record<string, string>,
  status_okr: {
    rascunho: 'Rascunho',
    ativo: 'Ativo',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  } as Record<string, string>,
  tipo_kr: {
    numerico: 'Numérico',
    percentual: 'Percentual',
    moeda: 'Moeda',
    marco: 'Marco',
  } as Record<string, string>,
  direcao_kr: {
    subir: 'Quanto maior melhor',
    descer: 'Quanto menor melhor',
  } as Record<string, string>,
  perspectiva: {
    financeiro: 'Financeiro',
    clientes: 'Clientes',
    processos: 'Processos',
    aprendizagem: 'Aprendizagem organizacional',
  } as Record<string, string>,
  status_processo: {
    rascunho: 'Rascunho',
    ativo: 'Ativo',
    revisao: 'Em revisão',
    descontinuado: 'Descontinuado',
  } as Record<string, string>,
  metodo_melhoria: {
    dmaic: 'DMAIC',
    kaizen: 'Kaizen',
    just_do_it: 'Just do it',
  } as Record<string, string>,
  status_melhoria: {
    backlog: 'Backlog',
    em_andamento: 'Em andamento',
    pausado: 'Pausado',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  } as Record<string, string>,
  tipo_etapa: {
    inicio: 'Início',
    atividade: 'Atividade',
    decisao: 'Decisão',
    documento: 'Documento',
    espera: 'Espera',
    fim: 'Fim',
  } as Record<string, string>,
  tipo_indicador: {
    Y: 'Y (resultado)',
    X: 'X (causa)',
  } as Record<string, string>,
  nivel_usuario: {
    diretor: 'Diretor',
    gerente: 'Gerente',
    gerente_regional: 'Gerente regional',
    coordenador: 'Coordenador',
    coordenador_regional: 'Coordenador regional',
    especialista: 'Especialista',
    colaborador: 'Colaborador',
  } as Record<string, string>,
}

export function rotulo(mapa: Record<string, string>, chave: string | null | undefined): string {
  if (!chave) return 'sem informação'
  return mapa[chave] ?? chave
}

/**
 * Campo de texto vazio vira NULL no banco, não string vazia.
 *
 * `''` e `null` parecem a mesma coisa na tela e são coisas diferentes na
 * consulta: `where termino_previsto is null` não encontra a string vazia, e o
 * projeto sem prazo deixa de ser contado como órfão.
 */
export function vazioVirarNulo(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return v.trim() === '' ? null : v
}
