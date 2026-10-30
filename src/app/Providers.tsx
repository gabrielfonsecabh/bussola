import { QueryClientProvider } from '@tanstack/react-query'

import { EmpresaProvider } from '@/app/EmpresaProvider'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { queryClient } from '@/lib/query'

/**
 * Ordem importa: tema por fora (mexe no <html>), dados em volta da sessão
 * (o AuthProvider usa useQuery), e a empresa ativa por dentro, porque a lista
 * de empresas vem do contexto do usuário.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <EmpresaProvider>
            <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
          </EmpresaProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
