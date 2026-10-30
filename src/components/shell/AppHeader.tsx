import { Menu } from 'lucide-react'

import { CompanySwitcher } from '@/components/shell/CompanySwitcher'
import { UserMenu } from '@/components/shell/UserMenu'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { useAppLayout } from '@/hooks/use-app-layout'

export interface AppHeaderProps {
  /**
   * OBRIGATÓRIO. Uma página sem nome é bug, e o tipo transforma esse bug em
   * erro de compilação em vez de um header vazio em produção.
   */
  title: string
  description?: string
  /** Ações de nível de página, alinhadas à direita. */
  actions?: React.ReactNode
}

export function AppHeader({ title, description, actions }: AppHeaderProps) {
  const { definirMenuAberto } = useAppLayout()

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 shadow-sm backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => definirMenuAberto(true)}
            aria-label="Abrir menu de navegação"
          >
            <Menu className="size-4" aria-hidden />
          </Button>

          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-base leading-tight font-semibold tracking-tight">
              {title}
            </h1>
            {description && (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>

          {/* O seletor de empresa mora aqui, ao lado do título. Nunca na página. */}
          <div className="hidden sm:block">
            <CompanySwitcher />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      {/* No mobile o seletor desce para a própria linha, mas continua no shell. */}
      <div className="border-t border-border px-4 py-2 sm:hidden">
        <CompanySwitcher />
      </div>
    </header>
  )
}
