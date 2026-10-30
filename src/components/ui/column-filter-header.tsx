import { ArrowDown, ArrowUp, ArrowUpDown, Filter, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelectSearchable } from '@/components/ui/multi-select-searchable'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SearchableSelectOption } from '@/components/ui/searchable-select'
import { Separator } from '@/components/ui/separator'
import { filtroEstaVazio, type Ordenacao, type ValorDeFiltro } from '@/lib/filtros'
import { cn } from '@/lib/utils'

const SEM_OPCOES: SearchableSelectOption[] = []

export interface ColumnFilterHeaderProps {
  /** Chave da coluna no objeto de filtros e na ordenação. */
  columnKey: string
  label: string
  /** Tipo de controle de filtro. Omita para uma coluna só ordenável. */
  filterType?: 'texto' | 'selecao' | 'intervalo'
  /** Opções, quando `filterType` é 'selecao'. */
  options?: SearchableSelectOption[]
  value?: ValorDeFiltro
  onChange?: (valor: ValorDeFiltro | undefined) => void
  sortable?: boolean
  sort?: Ordenacao | null
  onSortChange?: (ordenacao: Ordenacao | null) => void
  align?: 'left' | 'right'
  className?: string
}

/**
 * Filtro e ordenação no cabeçalho da COLUNA, onde o dado está.
 * Um painel de filtros longe da coluna que ele controla é adivinhação.
 */
export function ColumnFilterHeader({
  columnKey,
  label,
  filterType,
  options = SEM_OPCOES,
  value,
  onChange,
  sortable = true,
  sort,
  onSortChange,
  align = 'left',
  className,
}: ColumnFilterHeaderProps) {
  const [aberto, setAberto] = useState(false)
  const temFiltro = !filtroEstaVazio(value)
  const ordenadaPor = sort?.coluna === columnKey ? sort.direcao : null

  function alternarOrdenacao() {
    if (!onSortChange) return
    if (ordenadaPor === 'asc') onSortChange({ coluna: columnKey, direcao: 'desc' })
    else if (ordenadaPor === 'desc') onSortChange(null)
    else onSortChange({ coluna: columnKey, direcao: 'asc' })
  }

  const IconeOrdenacao =
    ordenadaPor === 'asc' ? ArrowUp : ordenadaPor === 'desc' ? ArrowDown : ArrowUpDown

  return (
    <div
      className={cn(
        'flex items-center gap-0.5',
        align === 'right' && 'justify-end',
        className,
      )}
    >
      {sortable && onSortChange ? (
        <button
          type="button"
          onClick={alternarOrdenacao}
          className="-mx-1 flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left font-medium hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Ordenar por ${label}`}
        >
          <span className="truncate">{label}</span>
          <IconeOrdenacao
            className={cn(
              'size-3 shrink-0',
              ordenadaPor ? 'text-foreground' : 'text-muted-foreground/50',
            )}
            aria-hidden
          />
        </button>
      ) : (
        <span className="truncate font-medium">{label}</span>
      )}

      {filterType && onChange && (
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(temFiltro && 'text-primary')}
              aria-label={
                temFiltro ? `Filtro ativo em ${label}` : `Filtrar por ${label}`
              }
            >
              <Filter
                className={cn('size-3', temFiltro && 'fill-current')}
                aria-hidden
              />
            </Button>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-64 space-y-3 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">{label}</Label>
              {temFiltro && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onChange(undefined)}
                  className="h-6 gap-1 text-xs text-muted-foreground"
                >
                  <X className="size-3" aria-hidden />
                  Limpar
                </Button>
              )}
            </div>
            <Separator />

            {filterType === 'texto' && (
              <Input
                placeholder="Contém..."
                value={value?.tipo === 'texto' ? value.valor : ''}
                onChange={(e) => onChange({ tipo: 'texto', valor: e.target.value })}
                className="h-8"
              />
            )}

            {filterType === 'selecao' && (
              <MultiSelectSearchable
                options={options}
                value={value?.tipo === 'selecao' ? value.valor : []}
                onChange={(v) => onChange({ tipo: 'selecao', valor: v })}
                aria-label={`Filtrar ${label}`}
              />
            )}

            {filterType === 'intervalo' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`${columnKey}-de`} className="text-xs">
                    De
                  </Label>
                  <Input
                    id={`${columnKey}-de`}
                    type="date"
                    className="h-8"
                    value={value?.tipo === 'intervalo' ? (value.valor.de ?? '') : ''}
                    onChange={(e) =>
                      onChange({
                        tipo: 'intervalo',
                        valor: {
                          de: e.target.value || undefined,
                          ate: value?.tipo === 'intervalo' ? value.valor.ate : undefined,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${columnKey}-ate`} className="text-xs">
                    Até
                  </Label>
                  <Input
                    id={`${columnKey}-ate`}
                    type="date"
                    className="h-8"
                    value={value?.tipo === 'intervalo' ? (value.valor.ate ?? '') : ''}
                    onChange={(e) =>
                      onChange({
                        tipo: 'intervalo',
                        valor: {
                          de: value?.tipo === 'intervalo' ? value.valor.de : undefined,
                          ate: e.target.value || undefined,
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
