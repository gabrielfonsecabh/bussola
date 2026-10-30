/**
 * Estado de filtro de tela, num objeto só.
 *
 * Um objeto (e não um useState por coluna) é o que permite serializar,
 * limpar como unidade, mandar para o banco inteiro e, mais tarde, colocar na
 * URL sem reescrever as telas.
 *
 * Regra que vem junto:
 * FILTRO VIAJA PARA O BANCO. Identidade de linha (ids selecionados) pode
 * ficar no cliente. Nunca baixe a tabela inteira para filtrar no browser.
 */

export type ValorDeFiltro =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'selecao'; valor: string[] }
  | { tipo: 'intervalo'; valor: { de?: string; ate?: string } }

export type Filtros = Record<string, ValorDeFiltro>

export function filtroEstaVazio(valor: ValorDeFiltro | undefined): boolean {
  if (!valor) return true
  switch (valor.tipo) {
    case 'texto':
      return valor.valor.trim() === ''
    case 'selecao':
      return valor.valor.length === 0
    case 'intervalo':
      return !valor.valor.de && !valor.valor.ate
  }
}

/** Só os filtros que de fato restringem algo. */
export function filtrosAtivos(filtros: Filtros): [string, ValorDeFiltro][] {
  return Object.entries(filtros).filter(([, v]) => !filtroEstaVazio(v))
}

export function contarFiltrosAtivos(filtros: Filtros): number {
  return filtrosAtivos(filtros).length
}

export function definirFiltro(
  filtros: Filtros,
  chave: string,
  valor: ValorDeFiltro,
): Filtros {
  if (filtroEstaVazio(valor)) return removerFiltro(filtros, chave)
  return { ...filtros, [chave]: valor }
}

export function removerFiltro(filtros: Filtros, chave: string): Filtros {
  if (!(chave in filtros)) return filtros
  const copia = { ...filtros }
  delete copia[chave]
  return copia
}

/** Texto do chip na barra de filtros ativos. */
export function descreverFiltro(
  valor: ValorDeFiltro,
  rotuloDoValor?: (v: string) => string,
): string {
  const rotular = rotuloDoValor ?? ((v: string) => v)
  switch (valor.tipo) {
    case 'texto':
      return `"${valor.valor.trim()}"`
    case 'selecao': {
      const itens = valor.valor.map(rotular)
      if (itens.length <= 2) return itens.join(', ')
      return `${itens.slice(0, 2).join(', ')} +${itens.length - 2}`
    }
    case 'intervalo': {
      const { de, ate } = valor.valor
      if (de && ate) return `${de} a ${ate}`
      if (de) return `a partir de ${de}`
      return `até ${ate}`
    }
  }
}

export type Ordenacao = { coluna: string; direcao: 'asc' | 'desc' }

/**
 * Paginação server-side. A ordenação SEMPRE precisa terminar numa chave única
 * (`id`), senão `.range()` pula e duplica linha em silêncio.
 */
export type Paginacao = { pagina: number; tamanho: number }

export function intervaloDaPagina({ pagina, tamanho }: Paginacao): [number, number] {
  const de = (pagina - 1) * tamanho
  return [de, de + tamanho - 1]
}

export const TAMANHOS_DE_PAGINA = [25, 50, 100, 200] as const
