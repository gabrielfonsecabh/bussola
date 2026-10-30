/**
 * Exportação em CSV.
 *
 * Export não é enfeite: é como uma pessoa de finanças ou de operações confere
 * o software contra a planilha dela. Por isso quem chama SEMPRE passa a lista
 * já filtrada da tela, e não a tabela inteira. Um export que contradiz a tela
 * é o export que ganha, e a tela perde a confiança.
 */

type Valor = string | number | boolean | null | undefined
export type LinhaExportavel = Record<string, Valor>

function escapar(valor: Valor): string {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor)
  // Excel pt-BR usa ; como separador, então o campo precisa de aspas se tiver
  // ; " ou quebra de linha.
  if (/[";\n\r]/.test(texto)) return `"${texto.replaceAll('"', '""')}"`
  return texto
}

export function paraCsv(linhas: LinhaExportavel[]): string {
  if (linhas.length === 0) return ''
  const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))]
  const cabecalho = colunas.map(escapar).join(';')
  const corpo = linhas.map((l) => colunas.map((c) => escapar(l[c])).join(';'))
  return [cabecalho, ...corpo].join('\r\n')
}

export function baixarCsv(nomeBase: string, linhas: LinhaExportavel[]): void {
  if (linhas.length === 0) return

  // BOM: sem ele o Excel abre acentuação quebrada, e o usuário conclui que o
  // sistema exporta errado.
  const conteudo = `﻿${paraCsv(linhas)}`
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const carimbo = new Date().toISOString().slice(0, 10)
  const nome = `${nomeBase}-${carimbo}.csv`
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/[^a-z0-9.-]+/g, '-')

  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
