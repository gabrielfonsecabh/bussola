import { LogOut, ShieldCheck, UserRound } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { useAuth } from '@/hooks/use-auth'
import { useEmpresa } from '@/hooks/use-empresa'

function iniciais(nome: string | null | undefined, email: string | null | undefined) {
  const base = (nome ?? email ?? '?').trim()
  const partes = base.split(/[\s@.]+/).filter(Boolean)
  return (partes[0]?.[0] ?? '?').concat(partes.length > 1 ? (partes[1]?.[0] ?? '') : '').toUpperCase()
}

export function UserMenu() {
  const { contexto, usuario, sair } = useAuth()
  const { empresaAtiva } = useEmpresa()

  const nome = contexto?.perfil.nome ?? usuario?.email ?? null
  const email = contexto?.perfil.email ?? usuario?.email ?? null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Menu de ${nome ?? 'usuário'}`}>
          <Avatar className="size-7">
            {contexto?.perfil.avatar_url && (
              <AvatarImage src={contexto.perfil.avatar_url} alt="" />
            )}
            <AvatarFallback className="bg-secondary text-[11px] font-medium">
              {nome ? iniciais(nome, email) : <UserRound className="size-3.5" aria-hidden />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{nome ?? 'Sem nome'}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
          <div className="flex flex-wrap gap-1 pt-2">
            {contexto?.perfil.super_admin && (
              <Badge variant="info-subtle" className="gap-1">
                <ShieldCheck className="size-3" aria-hidden />
                super admin
              </Badge>
            )}
            {empresaAtiva && <Badge variant="secondary">{empresaAtiva.nivel}</Badge>}
            {empresaAtiva?.is_admin && <Badge variant="secondary">admin da empresa</Badge>}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void sair()} className="gap-2">
          <LogOut className="size-4" aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
