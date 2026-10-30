import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { Unlink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useCanvasAcoes, type ArestaFlow } from '@/features/okr/grafo/contexto'

/**
 * Aresta pai -> filho. Selecionada, mostra o botão de desvincular no meio.
 * `Delete` faz a mesma coisa (onEdgesDelete no canvas).
 */
export function ArestaDeOkr(props: EdgeProps<ArestaFlow>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, markerEnd, style } = props
  const acoes = useCanvasAcoes()
  const [caminho, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  })

  return (
    <>
      <BaseEdge id={id} path={caminho} markerEnd={markerEnd} style={style} />
      {selected && acoes.podeEditar && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <Button
              size="xs"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                acoes.desvincular(id)
              }}
              aria-label="Desvincular"
            >
              <Unlink aria-hidden />
              Desvincular
            </Button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
