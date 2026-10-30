import { Building2, Check, ChevronsUpDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmpresa } from '@/hooks/use-empresa'
import { cn } from '@/lib/utils'

/**
 * O seletor de empresa fica no SHELL, ao lado do título da página, nunca
 * dentro de uma tela. É a resposta sempre visível para "qual empresa estou
 * vendo?". Errar isso é como alguém lê o relatório certo da entidade errada.
 */
export function CompanySwitcher() {
  const { empresas, empresaAtiva, definirEmpresaAtiva, carregando } = useEmpresa()

  if (carregando) return <Skeleton className="h-8 w-44 rounded-md" />

  if (!empresaAtiva) {
    return (
      <Badge variant="warning-subtle" className="gap-1.5">
        <Building2 className="size-3" aria-hidden />
        Sem empresa vinculada
      </Badge>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 max-w-[15rem] gap-1.5 pr-2 pl-2.5"
          aria-label={`Empresa ativa: ${empresaAtiva.nome_fantasia}. Trocar de empresa.`}
        >
          <Building2 className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="truncate font-medium">{empresaAtiva.nome_fantasia}</span>
          {empresas.length > 1 && (
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Empresa</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {empresas.map((empresa) => {
          const ativa = empresa.id === empresaAtiva.id
          return (
            <DropdownMenuItem
              key={empresa.id}
              onSelect={() => definirEmpresaAtiva(empresa.id)}
              className="gap-2"
            >
              <Check
                className={cn('size-4 shrink-0', ativa ? 'opacity-100' : 'opacity-0')}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{empresa.nome_fantasia}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {empresa.cargo ?? empresa.nivel}
                </span>
              </span>
              <Badge variant={empresa.tipo === 'holding' ? 'info-subtle' : 'secondary'}>
                {empresa.tipo}
              </Badge>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
