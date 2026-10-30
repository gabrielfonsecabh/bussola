/**
 * Entre as arestas que a PESSOA selecionou de propósito (`arestasSelecionadas`,
 * o estado que `aplicarSelecao` mantém a partir de cliques e do retângulo de
 * seleção), conta só as que não tocam nenhum dos OKRs que vão ser excluídos.
 *
 * Por que a conta não é simplesmente "quantas arestas chegaram no
 * `onBeforeDelete`": o `edges` que o React Flow entrega ali (via
 * `getElementsToRemove`, fonte da lib) é a UNIÃO das arestas selecionadas com
 * `getConnectedEdges` dos nós que serão excluídos, ou seja, toda aresta
 * ligada a um nó excluído entra nesse array mesmo que ninguém a tenha
 * selecionado. Contar esse array inteiro faz o aviso de "vínculo ignorado"
 * aparecer em quase toda exclusão (qualquer OKR com pai ou filho já teria
 * `edges.length >= 1`), para vínculos que NÃO precisam de aviso nenhum: a
 * aresta com o pai some sozinha quando o nó excluído some, e os filhos que
 * ficam soltos já são comunicados por `filhosQueFicamSoltos`.
 *
 * Uma aresta é "ignorada" de verdade só quando ela (a) foi selecionada pela
 * pessoa E (b) não tem nenhuma ponta num nó que está sendo excluído, nesse
 * caso ela sobrevive à exclusão exatamente como estava, sem que a pessoa
 * tenha pedido isso.
 */
export function contarVinculosIgnorados(
  arestasSelecionadas: ReadonlySet<string>,
  arestas: ReadonlyArray<{ id: string; source: string; target: string }>,
  idsExcluidos: ReadonlySet<string>,
): number {
  let total = 0
  for (const aresta of arestas) {
    if (!arestasSelecionadas.has(aresta.id)) continue
    if (idsExcluidos.has(aresta.source) || idsExcluidos.has(aresta.target)) continue
    total += 1
  }
  return total
}

/**
 * Decide quais arestas o `onBeforeDelete` pode de fato devolver como
 * aprovadas quando NENHUM nó OKR está sendo excluído (o outro ramo do
 * handler, o de "só arestas selecionadas", abre o diálogo e não passa por
 * aqui).
 *
 * Por que isto precisa existir: o mesmo `edges` do `onBeforeDelete` que
 * infla `contarVinculosIgnorados` (ver a função acima) também infla este
 * caso, e aqui o efeito é pior, porque esse `edges` filtrado incorretamente
 * seria devolvido como { nodes: [], edges }, uma autorização de verdade,
 * que o React Flow completa chamando `onEdgesDelete` para cada aresta do
 * array. Sem este filtro, selecionar SÓ um objetivo estratégico (ele não é
 * OKR, então `okrs.length` é zero) e apertar `Delete` devolvia TODAS as
 * arestas ligadas a ele (via `getConnectedEdges`, que ninguém selecionou) e
 * cada uma virava uma escrita real no banco (`vincular.mutate` desligando o
 * corporativo do objetivo), em silêncio, sem diálogo.
 *
 * `arestasAutorizadas` restringe a devolução às arestas que a PESSOA
 * selecionou de propósito. Uma aresta que o React Flow só agregou por estar
 * ligada a um nó da seleção nunca é devolvida: sem gesto explícito sobre
 * ela, nada nela pode ser tocado.
 */
export function arestasAutorizadas<Aresta extends { id: string }>(
  edges: ReadonlyArray<Aresta>,
  arestasSelecionadas: ReadonlySet<string>,
): Aresta[] {
  return edges.filter((aresta) => arestasSelecionadas.has(aresta.id))
}
