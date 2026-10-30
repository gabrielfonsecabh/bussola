import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { NoObjetivoFlow } from '@/features/okr/grafo/contexto'
import { cn } from '@/lib/utils'

/** Faixa lateral na cor da perspectiva. Classes completas, porque o Tailwind não monta nome dinâmico. */
const FAIXA_DA_PERSPECTIVA: Record<string, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  primary: 'bg-primary',
  destructive: 'bg-destructive',
}

export function NoDeObjetivo({ data, selected }: NodeProps<NoObjetivoFlow>) {
  const { no, pendencias, esmaecido } = data
  return (
    <div
      className={cn(
        'relative flex h-full w-full overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-opacity',
        selected && 'ring-2 ring-ring',
        esmaecido && 'opacity-30',
      )}
    >
      <span
        aria-hidden
        className={cn('w-1.5 shrink-0', FAIXA_DA_PERSPECTIVA[no.perspectiva_cor ?? ''] ?? 'bg-muted-foreground')}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
        <div className="flex items-start gap-2">
          {no.is_estrela_do_norte && (
            <Star className="mt-0.5 size-3.5 shrink-0 fill-warning text-warning" aria-label="Estrela do Norte" />
          )}
          <p className="line-clamp-2 text-sm leading-tight font-medium">{no.titulo}</p>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{no.perspectiva_nome ?? 'Sem perspectiva'}</span>
          <Badge variant="outline">{no.total_okrs} OKR</Badge>
        </div>
      </div>

      {pendencias > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-warning text-[10px] font-semibold text-warning-foreground"
          title={`${pendencias} pendência(s)`}
        >
          {pendencias}
        </span>
      )}

      <Handle type="source" position={Position.Right} id="filhos" />
    </div>
  )
}
