import {
  Building2,
  CalendarRange,
  ChartNoAxesCombined,
  ClipboardList,
  Compass,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Grid2x2,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  Map as MapaIcone,
  Network,
  Route,
  ShieldCheck,
  Sigma,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ItemDeNavegacao = {
  rotulo: string
  para: string
  icone: LucideIcon
  /** Chave de permissão que o item exige. Aplicada na Fase 2. */
  permissao?: string
}

export type GrupoDeNavegacao = {
  titulo: string
  itens: ItemDeNavegacao[]
}

/**
 * A navegação espelha os módulos do produto (docs/09-design-system.md).
 * Uma fonte só: a sidebar, o roteador e o breadcrumb leem daqui.
 */
export const navegacao: GrupoDeNavegacao[] = [
  {
    // O primeiro grupo é o das lentes de PESSOA, não de módulo. "Minhas
    // atividades" é a primeira tela de colaborador e especialista e estava
    // enterrada no quarto grupo; "Meu OKR" é lente de pessoa e estava em
    // Estratégia; e o belt não tinha nenhuma tela que respondesse "os meus".
    titulo: 'Meu trabalho',
    itens: [
      {
        rotulo: 'Minhas atividades',
        para: '/execucao/minhas-atividades',
        icone: ListChecks,
        permissao: 'atividade.view',
      },
      { rotulo: 'Meu OKR', para: '/estrategia/meu-okr', icone: Target, permissao: 'okr.view' },
      {
        rotulo: 'Meus DMAICs',
        para: '/processos/meus-dmaics',
        icone: Sigma,
        permissao: 'processo.view',
      },
    ],
  },
  {
    titulo: 'Estratégia',
    itens: [
      { rotulo: 'Mapa estratégico', para: '/estrategia/mapa', icone: MapaIcone, permissao: 'okr.view' },
      { rotulo: 'Árvore de OKR', para: '/estrategia/okr', icone: Network, permissao: 'okr.view' },
    ],
  },
  {
    titulo: 'Execução',
    itens: [
      {
        rotulo: 'Portfólio de projetos',
        para: '/execucao/projetos',
        icone: ClipboardList,
        permissao: 'projeto.view',
      },
      { rotulo: 'Sprints', para: '/execucao/sprints', icone: KanbanSquare, permissao: 'projeto.view' },
      {
        rotulo: 'Cronograma',
        para: '/execucao/cronograma',
        icone: CalendarRange,
        permissao: 'projeto.view',
      },
    ],
  },
  {
    titulo: 'Processos',
    itens: [
      {
        rotulo: 'Inventário',
        para: '/processos/inventario',
        icone: Workflow,
        permissao: 'processo.view',
      },
      {
        rotulo: 'Jornada de mapeamento',
        para: '/processos/jornada',
        icone: Trophy,
        permissao: 'processo.view',
      },
      {
        rotulo: 'Importar planilha',
        para: '/processos/importar',
        icone: FileSpreadsheet,
        permissao: 'processo.edit',
      },
      {
        rotulo: 'Melhorias (DMAIC)',
        para: '/processos/melhorias',
        icone: Sigma,
        permissao: 'processo.view',
      },
      {
        rotulo: 'Indicadores',
        para: '/processos/indicadores',
        icone: TrendingUp,
        permissao: 'processo.view',
      },
    ],
  },
  {
    titulo: 'Gestão',
    itens: [
      { rotulo: 'Kit de gestão', para: '/gestao/kit', icone: Grid2x2, permissao: 'kit.view' },
      { rotulo: 'OPR', para: '/gestao/opr', icone: FileText, permissao: 'opr.edit' },
      { rotulo: 'Bônus', para: '/gestao/bonus', icone: ChartNoAxesCombined, permissao: 'bonus.view' },
    ],
  },
  {
    titulo: 'Painéis',
    itens: [
      { rotulo: 'Executivo', para: '/paineis/executivo', icone: LayoutDashboard, permissao: 'kit.view' },
      { rotulo: 'Por área', para: '/paineis/area', icone: GitBranch, permissao: 'kit.view' },
      { rotulo: 'Comitês', para: '/paineis/comites', icone: Route, permissao: 'okr.view' },
    ],
  },
  {
    titulo: 'Administração',
    itens: [
      { rotulo: 'Empresas', para: '/admin/empresas', icone: Building2 },
      {
        rotulo: 'Comitês',
        para: '/admin/comites',
        icone: Route,
        permissao: 'comite.manage',
      },
      { rotulo: 'Áreas', para: '/admin/areas', icone: Network, permissao: 'admin.areas' },
      { rotulo: 'Pessoas', para: '/admin/pessoas', icone: Users, permissao: 'admin.pessoas' },
      {
        rotulo: 'Permissões',
        para: '/admin/permissoes',
        icone: ShieldCheck,
        permissao: 'admin.permissoes',
      },
    ],
  },
]

/** Ícone da marca, usado no topo da sidebar e no favicon. */
export const IconeDaMarca = Compass

/** Rota inicial depois do login. */
export const ROTA_INICIAL = '/paineis/executivo'

const indice = new Map<string, ItemDeNavegacao>()
for (const grupo of navegacao) {
  for (const item of grupo.itens) indice.set(item.para, item)
}

/** Item de navegação correspondente a um pathname, para título e breadcrumb. */
export function itemPorRota(pathname: string): ItemDeNavegacao | undefined {
  return indice.get(pathname)
}
