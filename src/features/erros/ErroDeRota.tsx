import { TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { ROTA_INICIAL } from '@/app/navigation'

/**
 * Substitui o shell inteiro quando a rota estoura, então não pode depender de
 * nenhum contexto do layout.
 */
export function ErroDeRota() {
  const erro = useRouteError()

  const titulo = isRouteErrorResponse(erro)
    ? `${erro.status} ${erro.statusText}`
    : 'Algo quebrou nesta tela'

  const detalhe = isRouteErrorResponse(erro)
    ? erro.data
    : erro instanceof Error
      ? erro.message
      : 'Erro desconhecido.'

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <TriangleAlert className="size-9 text-destructive" aria-hidden />
        <h1 className="text-lg font-semibold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{String(detalhe)}</p>
        <Button asChild variant="outline" className="mt-2">
          <a href={ROTA_INICIAL}>Voltar ao painel</a>
        </Button>
      </div>
    </div>
  )
}
