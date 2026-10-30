import { AppHeader, type AppHeaderProps } from '@/components/shell/AppHeader'
import { cn } from '@/lib/utils'

export interface PageProps extends AppHeaderProps {
  children?: React.ReactNode
  /** Use quando a tela for uma superfície própria (kanban, mapa) sem padding. */
  semPadding?: boolean
}

/**
 * Toda rota renderiza uma <Page>. Como `title` é obrigatório no AppHeader,
 * não existe caminho para uma página anônima chegar em produção.
 */
export function Page({ children, semPadding, ...header }: PageProps) {
  return (
    <>
      <AppHeader {...header} />
      <main className={cn('min-w-0 flex-1', !semPadding && 'px-4 py-6 lg:px-6')}>
        {children}
      </main>
    </>
  )
}
