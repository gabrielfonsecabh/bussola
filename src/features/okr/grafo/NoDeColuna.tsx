import type { NodeProps } from '@xyflow/react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useCanvasAcoes, type NoColunaFlow, type NoFaixaFlow } from '@/features/okr/grafo/contexto'

/**
 * Cabeçalho de coluna. É um nó do React Flow (não selecionável, não
 * arrastável) para acompanhar o pan e o zoom junto com o resto.
 */
export function NoDeColuna({ data }: NodeProps<NoColunaFlow>) {
  const acoes = useCanvasAcoes()
  const criavel = data.coluna !== 'objetivo'
  return (
    <div
      className="flex items-center justify-between border-b border-border pb-1"
      style={{ width: data.largura }}
    >
      <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {data.rotulo}
      </span>
      {criavel && acoes.podeEditar && (
        <Button
          size="xs"
          variant="ghost"
          className="nodrag nopan"
          aria-label={`Criar OKR de ${data.rotulo.toLowerCase()}`}
          onClick={(e) => {
            e.stopPropagation()
            acoes.criarSolto(data.coluna)
          }}
        >
          <Plus aria-hidden />
        </Button>
      )}
    </div>
  )
}

export function NoDeFaixa({ data }: NodeProps<NoFaixaFlow>) {
  return (
    <div
      className="flex items-center gap-3 text-[11px] font-semibold tracking-wider text-warning-subtle-foreground uppercase"
      style={{ width: data.largura }}
    >
      <span>Soltos: sem vínculo com o desdobramento</span>
      <span aria-hidden className="h-px flex-1 border-t border-dashed border-warning/60" />
    </div>
  )
}
