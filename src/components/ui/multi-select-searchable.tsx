import { Check, ChevronsUpDown } from 'lucide-react'
import { useId, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SearchableSelectOption } from '@/components/ui/searchable-select'
import { cn } from '@/lib/utils'

export interface MultiSelectSearchableProps {
  options: SearchableSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  /** A partir de quantos selecionados mostrar "N selecionados" em vez de chips. */
  resumirApartirDe?: number
  disabled?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}

/** O mesmo do SearchableSelect, quando o filtro é "qualquer um destes". */
export function MultiSelectSearchable({
  options,
  value,
  onChange,
  placeholder = 'Todos',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Nada encontrado.',
  resumirApartirDe = 3,
  disabled,
  className,
  id,
  ...resto
}: MultiSelectSearchableProps) {
  const [aberto, setAberto] = useState(false)
  const idDaLista = useId()
  const selecionadas = options.filter((o) => value.includes(o.value))

  // Chips só quando cabem. Rótulo de área tem 40+ caracteres e dois deles
  // estouram o trigger, deixando texto cortado no meio da palavra.
  const comprimentoDosRotulos = selecionadas.reduce((t, o) => t + o.label.length, 0)
  const mostrarChips =
    selecionadas.length > 0 &&
    selecionadas.length < resumirApartirDe &&
    comprimentoDosRotulos <= 28

  function alternar(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  return (
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
            'w-full justify-between gap-2 bg-input-background font-normal',
            selecionadas.length === 0 && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1">
            {selecionadas.length === 0 && <span className="truncate">{placeholder}</span>}

            {mostrarChips && (
              <span className="flex min-w-0 gap-1">
                {selecionadas.map((o) => (
                  <Badge key={o.value} variant="secondary" className="max-w-32 truncate">
                    {o.label}
                  </Badge>
                ))}
              </span>
            )}

            {selecionadas.length > 0 && !mostrarChips && (
              <Badge variant="secondary">
                {selecionadas.length === 1
                  ? '1 selecionado'
                  : `${selecionadas.length} selecionados`}
              </Badge>
            )}
          </span>
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
            // A ação "Limpar seleção" nunca some com a busca.
            if (valorItem === '__limpar__') return 1
            const opcao = options.find((o) => o.value === valorItem)
            const alvo = `${opcao?.label ?? ''} ${opcao?.description ?? ''}`.toLowerCase()
            return alvo.includes(busca.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((opcao) => {
                const marcada = value.includes(opcao.value)
                return (
                  <CommandItem
                    key={opcao.value}
                    value={opcao.value}
                    disabled={opcao.disabled}
                    onSelect={() => alternar(opcao.value)}
                    className="gap-2"
                  >
                    <span
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded-sm border border-input',
                        marcada && 'border-primary bg-primary text-primary-foreground',
                      )}
                      aria-hidden
                    >
                      {marcada && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{opcao.label}</span>
                      {opcao.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {opcao.description}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>

            {value.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__limpar__"
                    onSelect={() => onChange([])}
                    className="justify-center text-sm text-muted-foreground"
                  >
                    Limpar seleção
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
