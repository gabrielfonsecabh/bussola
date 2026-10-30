import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LayoutList, RefreshCw, Workflow } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'

import { Page } from '@/components/shell/Page'
import { Button } from '@/components/ui/button'
import { CarregandoTabela } from '@/components/ui/estado-da-tela'
import { recalcularFarois } from '@/features/okr/api'
import { invalidarOkr } from '@/features/okr/grafo/invalidar'
import { ListaDeOkr } from '@/features/okr/ListaDeOkr'
import { SeletorDeAno } from '@/features/okr/SeletorDeAno'
import { useEmpresa } from '@/hooks/use-empresa'
import { anoAtual } from '@/lib/formato'
import { cn } from '@/lib/utils'

/**
 * O canvas traz o React Flow, que só esta rota usa. `lazy` deixa o chunk
 * fora do bundle de quem nunca abre o desdobramento.
 */
const CanvasDeOkr = lazy(() =>
  import('@/features/okr/grafo/CanvasDeOkr').then((m) => ({ default: m.CanvasDeOkr })),
)

type Modo = 'canvas' | 'lista'
const CHAVE_DO_MODO = 'bussola-okr-modo'

function lerModo(): Modo {
  try {
    return localStorage.getItem(CHAVE_DO_MODO) === 'lista' ? 'lista' : 'canvas'
  } catch {
    return 'canvas'
  }
}

function gravarModo(modo: Modo) {
  try {
    localStorage.setItem(CHAVE_DO_MODO, modo)
  } catch {
    // Conveniência por navegador; sem storage a página só não lembra.
  }
}

export function ArvoreDeOkrPage() {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()

  const [ano, setAno] = useState(anoAtual())
  const [areaId, setAreaId] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>(lerModo)

  const recalcular = useMutation({
    mutationFn: () => recalcularFarois(empresaId!),
    onSuccess: () => invalidarOkr(queryClient),
  })

  function trocarModo(proximo: Modo) {
    setModo(proximo)
    gravarModo(proximo)
  }

  return (
    <Page
      title="Árvore de OKR"
      description="Desdobramento do corporativo até o individual"
      actions={
        <>
          <div role="group" aria-label="Modo de visualização" className="flex rounded-md border border-border p-0.5">
            <Button
              size="sm"
              variant={modo === 'canvas' ? 'default' : 'ghost'}
              aria-pressed={modo === 'canvas'}
              onClick={() => trocarModo('canvas')}
              className={cn('h-7', modo !== 'canvas' && 'text-muted-foreground')}
            >
              <Workflow className="size-4" aria-hidden />
              Canvas
            </Button>
            <Button
              size="sm"
              variant={modo === 'lista' ? 'default' : 'ghost'}
              aria-pressed={modo === 'lista'}
              onClick={() => trocarModo('lista')}
              className={cn('h-7', modo !== 'lista' && 'text-muted-foreground')}
            >
              <LayoutList className="size-4" aria-hidden />
              Lista
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => recalcular.mutate()}
            disabled={recalcular.isPending || !empresaId}
            title="O farol depende do tempo decorrido do ciclo, então ele envelhece sozinho."
          >
            <RefreshCw className={cn('size-4', recalcular.isPending && 'animate-spin')} aria-hidden />
            Recalcular faróis
          </Button>
          <SeletorDeAno ano={ano} aoMudar={setAno} />
        </>
      }
    >
      {modo === 'lista' ? (
        <ListaDeOkr ano={ano} areaId={areaId} aoMudarArea={setAreaId} />
      ) : (
        <Suspense fallback={<CarregandoTabela linhas={8} />}>
          <CanvasDeOkr ano={ano} areaId={areaId} aoMudarArea={setAreaId} />
        </Suspense>
      )}

      {recalcular.isSuccess && (
        <p className="pt-3 text-xs text-muted-foreground" aria-live="polite">
          {recalcular.data} farol(óis) atualizado(s). O farol compara o atingimento com o esperado
          pelo tempo decorrido do ciclo, então ele muda mesmo sem ninguém tocar no KR.
        </p>
      )}
    </Page>
  )
}
