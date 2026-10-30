import { Monitor, Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTema } from '@/hooks/use-theme'
import type { Tema } from '@/components/theme/theme-context'

const OPCOES: { valor: Tema; rotulo: string; icone: typeof Sun }[] = [
  { valor: 'light', rotulo: 'Claro', icone: Sun },
  { valor: 'dark', rotulo: 'Escuro', icone: Moon },
  { valor: 'system', rotulo: 'Do sistema', icone: Monitor },
]

export function ThemeToggle() {
  const { tema, resolvido, definirTema } = useTema()
  const IconeAtual = resolvido === 'dark' ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Trocar tema">
          <IconeAtual className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPCOES.map(({ valor, rotulo, icone: Icone }) => (
          <DropdownMenuCheckboxItem
            key={valor}
            checked={tema === valor}
            onCheckedChange={() => definirTema(valor)}
            className="gap-2"
          >
            <Icone className="size-4 text-muted-foreground" aria-hidden />
            {rotulo}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
