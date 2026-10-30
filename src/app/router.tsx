import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'

import { navegacao, ROTA_INICIAL } from '@/app/navigation'
import { AppLayout } from '@/components/shell/AppLayout'
import { ExigePermissao } from '@/components/shell/ExigePermissao'
import { Page } from '@/components/shell/Page'
import { RotaProtegida } from '@/features/auth/RotaProtegida'
import { ErroDeRota } from '@/features/erros/ErroDeRota'
import { NaoEncontrado } from '@/features/erros/NaoEncontrado'

/**
 * Cada tela é um `lazy` de rota: o bundle inicial carrega o shell e a rota
 * pedida, não o produto inteiro. Sem isto, abrir o login baixaria também o
 * kanban, o gráfico e a apuração de bônus.
 *
 * O mapa é indexado pela MESMA rota que a sidebar usa. O que não estiver aqui
 * cai no placeholder da fase, que diz qual fase entrega a tela e onde está a
 * spec. Não existe rota sem dono.
 */
const telas: Record<string, NonNullable<RouteObject['lazy']>> = {
  '/estrategia/mapa': async () => ({
    Component: (await import('@/features/okr/MapaEstrategicoPage')).MapaEstrategicoPage,
  }),
  '/estrategia/okr': async () => ({
    Component: (await import('@/features/okr/ArvoreDeOkrPage')).ArvoreDeOkrPage,
  }),
  '/estrategia/meu-okr': async () => ({
    Component: (await import('@/features/okr/MeuOkrPage')).MeuOkrPage,
  }),
  '/execucao/projetos': async () => ({
    Component: (await import('@/features/execucao/PortfolioPage')).PortfolioPage,
  }),
  '/execucao/sprints': async () => ({
    Component: (await import('@/features/execucao/SprintsPage')).SprintsPage,
  }),
  '/execucao/minhas-atividades': async () => ({
    Component: (await import('@/features/execucao/MinhasAtividadesPage')).MinhasAtividadesPage,
  }),
  '/execucao/cronograma': async () => ({
    Component: (await import('@/features/execucao/CronogramaPage')).CronogramaPage,
  }),
  '/processos/inventario': async () => ({
    Component: (await import('@/features/processos/InventarioPage')).InventarioPage,
  }),
  '/processos/jornada': async () => ({
    Component: (await import('@/features/processos/JornadaPage')).JornadaPage,
  }),
  '/processos/importar': async () => ({
    Component: (await import('@/features/processos/ImportarPage')).ImportarPage,
  }),
  '/processos/meus-dmaics': async () => ({
    Component: (await import('@/features/processos/MeusDmaicsPage')).MeusDmaicsPage,
  }),
  '/admin/comites': async () => ({
    Component: (await import('@/features/comites/ComitesPage')).ComitesPage,
  }),
  '/processos/melhorias': async () => ({
    Component: (await import('@/features/processos/MelhoriasPage')).MelhoriasPage,
  }),
  '/processos/indicadores': async () => ({
    Component: (await import('@/features/processos/IndicadoresPage')).IndicadoresPage,
  }),
  '/gestao/kit': async () => ({
    Component: (await import('@/features/gestao/KitPage')).KitPage,
  }),
  '/gestao/opr': async () => ({
    Component: (await import('@/features/gestao/OprPage')).OprPage,
  }),
  '/gestao/bonus': async () => ({
    Component: (await import('@/features/gestao/BonusPage')).BonusPage,
  }),
  '/paineis/executivo': async () => ({
    Component: (await import('@/features/paineis/PainelExecutivoPage')).PainelExecutivoPage,
  }),
  '/paineis/area': async () => ({
    Component: (await import('@/features/paineis/PainelAreasPage')).PainelAreasPage,
  }),
  '/paineis/comites': async () => ({
    Component: (await import('@/features/paineis/PainelComitesPage')).PainelComitesPage,
  }),
  '/admin/empresas': async () => ({
    Component: (await import('@/features/admin/EmpresasPage')).EmpresasPage,
  }),
  '/admin/areas': async () => ({
    Component: (await import('@/features/admin/AreasPage')).AreasPage,
  }),
  '/admin/pessoas': async () => ({
    Component: (await import('@/features/admin/PessoasPage')).PessoasPage,
  }),
  '/admin/permissoes': async () => ({
    Component: (await import('@/features/admin/PermissoesPage')).PermissoesPage,
  }),
}

const rotasDosModulos: RouteObject[] = navegacao.flatMap((grupo) =>
  grupo.itens.map((item) => {
    const caminho = item.para.replace(/^\//, '')
    const carregar = telas[item.para]
    if (carregar) {
      /* A guarda entra como rota PAI e a tela como filha de índice. Esconder o
         item da sidebar não basta: a URL continua digitável, e sem guarda a
         tela carrega consultas que a RLS vai devolver vazias, o que se lê como
         "não há nada aqui" em vez de "isto não é seu". */
      return item.permissao
        ? ({
            path: caminho,
            element: <ExigePermissao chave={item.permissao} />,
            children: [{ index: true, lazy: carregar }],
          } satisfies RouteObject)
        : ({ path: caminho, lazy: carregar } satisfies RouteObject)
    }

    return {
      path: caminho,
      element: <Page title={item.rotulo} description={grupo.titulo}>{null}</Page>,
    } satisfies RouteObject
  }),
)

export const router = createBrowserRouter([
  {
    path: '/entrar',
    lazy: async () => ({ Component: (await import('@/features/auth/LoginPage')).LoginPage }),
    errorElement: <ErroDeRota />,
  },
  {
    path: '/definir-senha',
    lazy: async () => ({
      Component: (await import('@/features/auth/DefinirSenhaPage')).DefinirSenhaPage,
    }),
    errorElement: <ErroDeRota />,
  },
  {
    element: <RotaProtegida />,
    errorElement: <ErroDeRota />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to={ROTA_INICIAL} replace /> },
          ...rotasDosModulos,
          {
            path: 'design-system',
            lazy: async () => ({
              Component: (await import('@/features/design-system/DesignSystemPage'))
                .DesignSystemPage,
            }),
          },
          { path: '*', element: <NaoEncontrado /> },
        ],
      },
    ],
  },
])
