import { useCallback, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { AppSidebar } from '@/components/shell/AppSidebar'
import { BannerDeConfiguracao } from '@/components/shell/BannerDeConfiguracao'
import {
  AppLayoutContext,
  CHAVE_SIDEBAR,
  type AppLayoutContexto,
} from '@/components/shell/AppLayoutContext'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

function lerRecolhida(): boolean {
  try {
    return localStorage.getItem(CHAVE_SIDEBAR) === '1'
  } catch {
    return false
  }
}

/**
 * A grade do app: sidebar fixa + região de conteúdo que rola.
 * Só isto. Título de página é do AppHeader, navegação é da AppSidebar.
 */
export function AppLayout() {
  const [menuAberto, definirMenuAberto] = useState(false)
  const [recolhida, setRecolhida] = useState(lerRecolhida)

  const alternarRecolhida = useCallback(() => {
    setRecolhida((atual) => {
      const proxima = !atual
      try {
        localStorage.setItem(CHAVE_SIDEBAR, proxima ? '1' : '0')
      } catch {
        /* sem persistência: vale só nesta aba */
      }
      return proxima
    })
  }, [])

  const valor = useMemo<AppLayoutContexto>(
    () => ({ menuAberto, definirMenuAberto, recolhida, alternarRecolhida }),
    [menuAberto, recolhida, alternarRecolhida],
  )

  return (
    <AppLayoutContext value={valor}>
      <div className="flex h-full min-h-screen bg-background">
        {/* Desktop: sidebar permanente. */}
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 transition-[width] duration-200 lg:block',
            recolhida ? 'w-16' : 'w-64',
          )}
        >
          <AppSidebar />
        </aside>

        {/* Mobile: a mesma sidebar dentro de um drawer. */}
        <Sheet open={menuAberto} onOpenChange={definirMenuAberto}>
          <SheetContent
            side="left"
            className="w-72 border-sidebar-border bg-sidebar p-0 [&>button]:text-sidebar-foreground"
          >
            <SheetTitle className="sr-only">Navegação principal</SheetTitle>
            <AppSidebar sempreExpandida aoNavegar={() => definirMenuAberto(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <BannerDeConfiguracao />
          <Outlet />
        </div>
      </div>
    </AppLayoutContext>
  )
}
