import type { LucideIcon } from 'lucide-react'

import { ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface CartaoDeMetricaProps {
  rotulo: string
  valor: number | null | undefined
  formatar?: (v: number) => string
  /** Contexto do número: "de 8 áreas", "meta 95%". */
  detalhe?: string
  icone?: LucideIcon
  /** Cor do realce. Sempre token semântico, nunca tom. */
  tom?: 'neutro' | 'success' | 'warning' | 'destructive' | 'info'
  carregando?: boolean
  /** Torna o cartão clicável, para o drill-down do número. */
  aoClicar?: () => void
  className?: string
}

const TOM: Record<NonNullable<CartaoDeMetricaProps['tom']>, string> = {
  neutro: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning-subtle-foreground',
  destructive: 'text-destructive',
  info: 'text-info',
}

/**
 * Número de capa. Ele sabe a diferença entre zero e sem dado, e quando recebe
 * `aoClicar` vira a porta de entrada do drill-down daquele número.
 */
export function CartaoDeMetrica({
  rotulo,
  valor,
  formatar,
  detalhe,
  icone: Icone,
  tom = 'neutro',
  carregando,
  aoClicar,
  className,
}: CartaoDeMetricaProps) {
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
        {Icone && <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      <div className={cn('pt-1.5 text-2xl font-semibold tracking-tight', TOM[tom])}>
        {carregando ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <ValorOuSemDado valor={valor} formatar={formatar} />
        )}
      </div>
      {detalhe && <p className="pt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
    </>
  )

  if (aoClicar) {
    return (
      <button
        type="button"
        onClick={aoClicar}
        className={cn(
          'rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-colors',
          'hover:border-primary/40 hover:bg-accent/40',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          className,
        )}
      >
        {conteudo}
      </button>
    )
  }

  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 shadow-sm', className)}>
      {conteudo}
    </div>
  )
}
