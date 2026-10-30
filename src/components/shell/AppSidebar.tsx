import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { IconeDaMarca, navegacao, ROTA_INICIAL } from '@/app/navigation'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppLayout } from '@/hooks/use-app-layout'
import { cn } from '@/lib/utils'
import { useEmpresa } from '@/hooks/use-empresa'

/**
 * A sidebar tem paleta PRÓPRIA (tokens --sidebar-*), escura mesmo no tema
 * claro. Isso separa navegação de conteúdo sem borda pesada e faz o dark mode
 * mudar só a área de trabalho: o chrome fica no lugar.
 *
 * Nenhuma cor daqui pode vir dos tokens de conteúdo, e nenhuma tela pode usar
 * os tokens --sidebar-*.
 */
export function AppSidebar({
  aoNavegar,
  sempreExpandida,
}: {
  aoNavegar?: () => void
  /**
   * O drawer do mobile mostra a navegação inteira, sempre. Sem isto ele
   * herdaria o "recolhida" do desktop e apareceria só com ícones, sem rótulo.
   */
  sempreExpandida?: boolean
}) {
  const { recolhida: recolhidaNoDesktop, alternarRecolhida } = useAppLayout()
  const recolhida = sempreExpandida ? false : recolhidaNoDesktop
  const { podeFazer, carregando } = useEmpresa()

  /**
   * A navegação só mostra o que o cargo alcança.
   *
   * `navigation.ts` declarava `permissao` em 18 dos 22 itens com o comentário
   * "aplicada na Fase 2", e nenhum arquivo lia o campo: todo mundo via os 22,
   * inclusive Permissões, Pessoas e Bônus. Era o "mar de coisa que não é minha"
   * no primeiro segundo de uso.
   *
   * Enquanto o contexto carrega, mostra tudo: esconder e reaparecer faria a
   * sidebar saltar a cada login, o que é pior que esperar.
   */
  const gruposVisiveis = navegacao
    .map((grupo) => ({
      ...grupo,
      itens: grupo.itens.filter(
        (item) => carregando || !item.permissao || podeFazer(item.permissao),
      ),
    }))
    // Grupo sem item some junto com o título: um cabeçalho "Gestão" sobre o
    // vazio ocupa espaço e sugere que faltou carregar alguma coisa.
    .filter((grupo) => grupo.itens.length > 0)

  return (
    <nav
      aria-label="Navegação principal"
      data-recolhida={recolhida || undefined}
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground',
        'border-r border-sidebar-border',
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4',
          recolhida && 'justify-center px-0',
        )}
      >
        <NavLink
          to={ROTA_INICIAL}
          onClick={aoNavegar}
          className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
            <IconeDaMarca className="size-5" aria-hidden />
          </span>
          {!recolhida && (
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">Bússola</span>
              <span className="text-[11px] text-sidebar-muted-foreground">
                Gestão estratégica
              </span>
            </span>
          )}
        </NavLink>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
        {gruposVisiveis.map((grupo, indice) => (
          <div key={grupo.titulo} className="px-3 pb-4">
            {recolhida ? (
              indice > 0 && (
                <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
              )
            ) : (
              <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-muted-foreground uppercase">
                {grupo.titulo}
              </p>
            )}

            <ul className="space-y-0.5">
              {grupo.itens.map((item) => {
                const Icone = item.icone
                const link = (
                  <NavLink
                    to={item.para}
                    onClick={aoNavegar}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors outline-none',
                        'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                        recolhida && 'justify-center px-0',
                        isActive &&
                          'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden
                          className={cn(
                            'absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-sidebar-primary opacity-0 transition-opacity',
                            isActive && 'opacity-100',
                            recolhida && 'hidden',
                          )}
                        />
                        <Icone
                          className={cn(
                            'size-4 shrink-0',
                            isActive ? 'text-sidebar-primary' : 'text-sidebar-muted-foreground',
                          )}
                          aria-hidden
                        />
                        {!recolhida && <span className="truncate">{item.rotulo}</span>}
                      </>
                    )}
                  </NavLink>
                )

                return (
                  <li key={item.para} className="relative">
                    {recolhida ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.rotulo}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="hidden shrink-0 border-t border-sidebar-border p-2 lg:block">
        <button
          type="button"
          onClick={alternarRecolhida}
          aria-expanded={!recolhida}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-sidebar-muted-foreground transition-colors outline-none',
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            recolhida && 'justify-center px-0',
          )}
        >
          {recolhida ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden />
          )}
          {!recolhida && <span>Recolher menu</span>}
          <span className="sr-only">
            {recolhida ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          </span>
        </button>
      </div>
    </nav>
  )
}
