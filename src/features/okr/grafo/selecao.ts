import type { EdgeChange, NodeChange } from '@xyflow/react'

import type { ArestaFlow, NoFlow } from '@/features/okr/grafo/contexto'

/**
 * Aplica só as mudanças de SELEÇÃO (`type === 'select'`) que o React Flow
 * emite via `onNodesChange`/`onEdgesChange` a um conjunto de ids
 * selecionados. Ignora todo o resto do lote: posição (`type: 'position'`,
 * derivada do layout e que nunca vira estado, regra do projeto), dimensão,
 * `add`, `remove` e `replace`, que não têm efeito aqui porque o canvas é
 * controlado e os nós não são arrastáveis nem redimensionáveis por fora do
 * layout.
 *
 * Por que isto existe como função separada, sem React: o `<ReactFlow>` é
 * controlado (`nodes`/`edges` vêm de fora), e um canvas controlado sem
 * `onNodesChange`/`onEdgesChange` descarta toda mudança de seleção em
 * silêncio (ver `triggerNodeChanges` em `@xyflow/react`). Este é o tratador
 * que falta, extraído para poder ser testado sem montar o React Flow
 * inteiro.
 *
 * Pura: mesma entrada, mesma saída. Quando o lote não MUDA o conteúdo de
 * `atual`, não só quando não tem mudança de seleção nenhuma, mas também
 * quando toda mudança de seleção do lote reafirma o que já era (selecionar
 * de novo um id já selecionado, ou desselecionar um que já não estava),
 * devolve a MESMA referência de `atual` (não uma cópia), para o
 * `setState((atual) => aplicarSelecao(atual, changes))` que a chama poder
 * pular o re-render (o React compara o novo estado com `Object.is`).
 */
export function aplicarSelecao(
  atual: Set<string>,
  changes: ReadonlyArray<NodeChange<NoFlow> | EdgeChange<ArestaFlow>>,
): Set<string> {
  let proximo: Set<string> | null = null
  for (const mudanca of changes) {
    if (mudanca.type !== 'select') continue
    // `base` é o conjunto mais atual até aqui: `proximo`, se este laço já
    // mudou algo antes, senão `atual`. Comparar contra ele (e não sempre
    // contra `atual`) é o que evita alocar `proximo` para uma mudança que só
    // reafirma o estado já vigente, inclusive dentro do mesmo lote.
    const base = proximo ?? atual
    if (mudanca.selected === base.has(mudanca.id)) continue
    if (!proximo) proximo = new Set(atual)
    if (mudanca.selected) proximo.add(mudanca.id)
    else proximo.delete(mudanca.id)
  }
  return proximo ?? atual
}
