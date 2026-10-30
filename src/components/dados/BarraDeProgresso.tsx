import { cn } from '@/lib/utils'

export interface BarraDeProgressoProps {
  /** 0 a 100. `null` significa sem dado, e sem dado não é zero. */
  valor: number | null | undefined
  tom?: 'primary' | 'success' | 'warning' | 'destructive' | 'info'
  className?: string
  rotulo?: string
}

const TOM = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
} as const

export function BarraDeProgresso({
  valor,
  tom = 'primary',
  className,
  rotulo,
}: BarraDeProgressoProps) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) {
    return (
      <span className="text-xs text-muted-foreground" title="Sem dado registrado. Não é zero.">
        sem dado
      </span>
    )
  }
  const pct = Math.max(0, Math.min(100, valor))

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={rotulo ?? 'Progresso'}
      >
        <div className={cn('h-full rounded-full transition-all', TOM[tom])} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {Math.round(pct)}%
      </span>
    </div>
  )
}
