import type { VariantProps } from 'class-variance-authority'

import { Badge, badgeVariants } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type VarianteDeBadge = NonNullable<VariantProps<typeof badgeVariants>['variant']>

/**
 * Estado do farol. Quem CALCULA é o banco (função/view), a partir de
 * atingimento vs. tempo decorrido do ciclo. O componente só mapeia estado
 * para token semântico, nunca escolhe cor por conta própria.
 *
 * `sem_dado` existe de propósito: farol sem medição não é verde nem vermelho,
 * e jamais pode ser renderizado como zero.
 */
export type EstadoDoFarol = 'verde' | 'amarelo' | 'vermelho' | 'neutro' | 'sem_dado'

const MAPA: Record<
  EstadoDoFarol,
  { rotulo: string; solido: VarianteDeBadge; suave: VarianteDeBadge }
> = {
  verde: { rotulo: 'No ritmo', solido: 'success', suave: 'success-subtle' },
  amarelo: { rotulo: 'Atenção', solido: 'warning', suave: 'warning-subtle' },
  vermelho: { rotulo: 'Risco', solido: 'destructive', suave: 'destructive-subtle' },
  neutro: { rotulo: 'Informativo', solido: 'info', suave: 'info-subtle' },
  sem_dado: { rotulo: 'Sem dado', solido: 'outline', suave: 'outline' },
}

export interface FarolProps {
  estado: EstadoDoFarol
  /** Sobrescreve o rótulo padrão (ex.: "92% da meta"). */
  rotulo?: string
  /** Versão suave, para tabela densa onde o sólido pesa demais. */
  suave?: boolean
  className?: string
}

export function Farol({ estado, rotulo, suave, className }: FarolProps) {
  const item = MAPA[estado]

  return (
    <Badge
      variant={suave ? item.suave : item.solido}
      className={cn('gap-1.5', className)}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full bg-current',
          estado === 'sem_dado' && 'opacity-40',
        )}
      />
      {rotulo ?? item.rotulo}
    </Badge>
  )
}
