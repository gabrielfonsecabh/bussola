import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { descreverFiltro, filtrosAtivos, type Filtros } from '@/lib/filtros'
import { cn } from '@/lib/utils'

export interface ActiveFiltersBarProps {
  filters: Filtros
  /** chave da coluna -> rótulo humano. */
  columnLabels: Record<string, string>
  /** Opcional: traduz o value de uma opção (uuid) para o rótulo dela. */
  valueLabels?: Record<string, (valor: string) => string>
  onClearFilter: (chave: string) => void
  /** Não é opcional na prática: sem ele o usuário recarrega a página. */
  onClearAll: () => void
  className?: string
}

/**
 * Filtros aplicados como chips removíveis.
 *
 * Sem esta barra o usuário esquece que um filtro está ligado e reporta o
 * número como errado. E ele tem razão, para a visão que ele acha que está
 * vendo.
 */
export function ActiveFiltersBar({
  filters,
  columnLabels,
  valueLabels,
  onClearFilter,
  onClearAll,
  className,
}: ActiveFiltersBarProps) {
  const ativos = filtrosAtivos(filters)
  if (ativos.length === 0) return null

  return (
    <section
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      aria-label="Filtros ativos"
    >
      <span className="text-xs text-muted-foreground">Filtros:</span>

      {ativos.map(([chave, valor]) => (
        <span
          key={chave}
          className="inline-flex max-w-72 items-center gap-1 rounded-full border border-border bg-secondary py-0.5 pr-0.5 pl-2 text-xs text-secondary-foreground"
        >
          <span className="truncate">
            <span className="text-muted-foreground">{columnLabels[chave] ?? chave}:</span>{' '}
            {descreverFiltro(valor, valueLabels?.[chave])}
          </span>
          <button
            type="button"
            onClick={() => onClearFilter(chave)}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Remover filtro ${columnLabels[chave] ?? chave}`}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}

      <Button
        variant="ghost"
        size="xs"
        onClick={onClearAll}
        className="text-xs text-muted-foreground"
      >
        Limpar tudo
      </Button>
    </section>
  )
}
