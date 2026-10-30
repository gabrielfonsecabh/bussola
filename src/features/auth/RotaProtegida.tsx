import { LoaderCircle } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/hooks/use-auth'

/**
 * Guarda de rota. Ela existe para a EXPERIÊNCIA (mandar para o login em vez de
 * mostrar tela vazia), não para segurança: quem protege os dados é a RLS.
 * Uma guarda no cliente é contornável; uma policy não é.
 */
export function RotaProtegida() {
  const { session, carregando, contexto } = useAuth()
  const local = useLocation()

  if (carregando) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Carregando sessão...
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/entrar" replace state={{ de: local.pathname + local.search }} />
  }

  // Senha definida por outra pessoa é senha conhecida por outra pessoa.
  // Enquanto o usuário não escolher a dele, o app não abre.
  if (contexto?.perfil.deve_trocar_senha && local.pathname !== '/definir-senha') {
    return <Navigate to="/definir-senha" replace />
  }

  return <Outlet />
}
