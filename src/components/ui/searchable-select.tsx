import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Contrato deliberadamente pequeno.
 * Um `<select>` nativo fica inutilizável passando de ~20 opções, e este app é
 * denso em dimensões (áreas, pessoas, projetos, processos).
 */
export interface SearchableSelectOption {
  value: string
  label: string
  /** Linha secundária: código, contexto, cargo. */
  description?: string
  /** Marcador curto de status. */
  badge?: string
  disabled?: boolean
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  /** Mostra o X para voltar a "nenhum". */
  clearable?: boolean
  disabled?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecionar...',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Nada encontrado.',
  clearable = true,
  disabled,
  className,
  id,
  ...resto
}: SearchableSelectProps) {
  const [aberto, setAberto] = useState(false)
  const idDaLista = useId()
  const selecionada = options.find((o) => o.value === value) ?? null
  const mostrarLimpar = clearable && selecionada !== null && !disabled

  return (
    // O botão de limpar fica FORA do trigger: controle interativo dentro de
    // <button> é HTML inválido e quebra navegação por teclado.
    <div className={cn('relative w-full', className)}>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={aberto}
            aria-controls={idDaLista}
            aria-haspopup="listbox"
            aria-label={resto['aria-label']}
            disabled={disabled}
            className={cn(
              'w-full justify-between bg-input-background font-normal',
              !selecionada && 'text-muted-foreground',
              mostrarLimpar && 'pr-14',
            )}
          >
            <span className="truncate">{selecionada ? selecionada.label : placeholder}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          id={idDaLista}
          className="w-(--radix-popover-trigger-width) p-0"
          align="start"
        >
          <Command
            filter={(valorItem, busca) => {
              // Busca por rótulo E descrição, nunca pelo value cru (que é uuid).
              const opcao = options.find((o) => o.value === valorItem)
              const alvo = `${opcao?.label ?? ''} ${opcao?.description ?? ''}`.toLowerCase()
              return alvo.includes(busca.toLowerCase()) ? 1 : 0
            }}
          >
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((opcao) => (
                  <CommandItem
                    key={opcao.value}
                    value={opcao.value}
                    disabled={opcao.disabled}
                    onSelect={(v) => {
                      onChange(v === value ? null : v)
                      setAberto(false)
                    }}
                    className="gap-2"
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0',
                        opcao.value === value ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{opcao.label}</span>
                      {opcao.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {opcao.description}
                        </span>
                      )}
                    </span>
                    {opcao.badge && (
                      <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                        {opcao.badge}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {mostrarLimpar && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Limpar seleção"
          className="absolute top-1/2 right-8 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}
