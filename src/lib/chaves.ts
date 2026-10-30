/**
 * Chaves de cache do TanStack Query, num lugar só.
 *
 * Toda chave começa pela empresa ativa. Isso não é estilo: é o que garante
 * que trocar de empresa não mostre o dado da anterior enquanto a nova carrega.
 * Chave montada à mão na tela é como cache de tenant vaza.
 */
export const chaves = {
  contexto: (userId: string | null) => ['auth', 'contexto', userId] as const,

  empresas: () => ['empresas'] as const,
  areas: (empresa: string | null) => ['areas', empresa] as const,
  pessoas: (empresa: string | null) => ['pessoas', empresa] as const,
  presets: () => ['presets-de-permissao'] as const,
  perfis: (empresa: string | null) => ['perfis', empresa] as const,

  perspectivas: (empresa: string | null) => ['perspectivas', empresa] as const,
  mapaEstrategico: (empresa: string | null, ano: number) =>
    ['mapa-estrategico', empresa, ano] as const,
  okrArvore: (empresa: string | null, ano: number, area: string | null) =>
    ['okr-arvore', empresa, ano, area] as const,
  okrGrafo: (empresa: string | null, ano: number, area: string | null) =>
    ['okr-grafo', empresa, ano, area] as const,
  okr: (id: string) => ['okr', id] as const,
  meusOkrs: (empresa: string | null, ano: number) => ['meus-okrs', empresa, ano] as const,
  krCheckins: (krId: string) => ['kr-checkins', krId] as const,
  objetivos: (empresa: string | null) => ['objetivos-estrategicos', empresa] as const,

  projetos: (empresa: string | null, filtros: unknown, pagina: number, tamanho: number) =>
    ['projetos', empresa, filtros, pagina, tamanho] as const,
  portfolioResumo: (empresa: string | null, filtros: unknown) =>
    ['portfolio-resumo', empresa, filtros] as const,
  projeto: (id: string) => ['projeto', id] as const,
  sprints: (empresa: string | null) => ['sprints', empresa] as const,
  projetosParaSelect: (empresa: string | null) =>
    ['projetos-para-select', empresa] as const,
  kanban: (sprintId: string | null) => ['kanban', sprintId] as const,
  sprintsDoQuadro: (empresa: string | null, area: string | null) =>
    ['sprints-do-quadro', empresa, area] as const,
  minhasAtividades: (empresa: string | null) => ['minhas-atividades', empresa] as const,
  cronograma: (empresa: string | null, area: string | null) =>
    ['cronograma', empresa, area] as const,
  cronogramaCarga: (empresa: string | null, area: string | null) =>
    ['cronograma-carga', empresa, area] as const,
  atividadesDoProjeto: (projetoId: string) => ['atividades-do-projeto', projetoId] as const,

  processos: (empresa: string | null, area: string | null, categoria: string | null = null) =>
    ['processos', empresa, area, categoria] as const,
  categoriasDeProcesso: (empresa: string | null, area: string | null) =>
    ['categorias-de-processo', empresa, area] as const,
  processo: (id: string) => ['processo', id] as const,
  indicadores: (processoId: string, de: string | null, ate: string | null, grao: string) =>
    ['indicadores', processoId, de, ate, grao] as const,
  melhorias: (empresa: string | null, processo: string | null) =>
    ['melhorias', empresa, processo] as const,
  melhoria: (id: string) => ['melhoria', id] as const,
  sipoc: (processoId: string) => ['sipoc', processoId] as const,
  indicadoresDoProcesso: (processoId: string) => ['indicadores-lista', processoId] as const,
  fluxo: (processoId: string) => ['fluxo', processoId] as const,
  fluxoResumo: (processoId: string) => ['fluxo-resumo', processoId] as const,
  pop: (processoId: string) => ['pop', processoId] as const,
  popRevisoes: (popId: string | null) => ['pop-revisoes', popId] as const,
  jornada: (empresa: string | null, area: string | null) =>
    ['jornada', empresa, area] as const,
  placar: (empresa: string | null) => ['jornada-placar', empresa] as const,
  missoes: (empresa: string | null, area: string | null) =>
    ['missoes', empresa, area] as const,

  kit: (empresa: string | null, periodo: string) => ['kit', empresa, periodo] as const,
  opr: (empresa: string | null, area: string | null, periodo: string) =>
    ['opr', empresa, area, periodo] as const,
  oprSnapshot: (area: string | null, periodo: string) =>
    ['opr-snapshot', area, periodo] as const,
  bonusConfig: (empresa: string | null, ano: number) => ['bonus-config', empresa, ano] as const,
  bonusApuracao: (empresa: string | null, periodo: string) =>
    ['bonus-apuracao', empresa, periodo] as const,

  painelExecutivo: (empresa: string | null, ano: number) =>
    ['painel-executivo', empresa, ano] as const,
  painelAreas: (empresa: string | null, ano: number) => ['painel-areas', empresa, ano] as const,
  painelComite: (comite: string | null, ano: number) => ['painel-comite', comite, ano] as const,

  comites: (empresa: string | null) => ['comites', empresa] as const,
  comite: (id: string) => ['comite', id] as const,
  comiteMembros: (comiteId: string | null) => ['comite-membros', comiteId] as const,
  minhasAreas: (empresa: string | null) => ['minhas-areas', empresa] as const,
  meusDmaics: (empresa: string | null) => ['meus-dmaics', empresa] as const,
}
