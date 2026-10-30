import type { QueryClient } from '@tanstack/react-query'

/**
 * Toda escrita de OKR (vincular, criar, editar, excluir, mover KR, check-in)
 * invalida as mesmas leituras. Centralizado para que o canvas, a lista, o
 * mapa e os painéis nunca mostrem números diferentes do mesmo fato.
 */
export function invalidarOkr(queryClient: QueryClient): void {
  for (const chave of [
    'okr-grafo',
    'okr-arvore',
    'okr',
    'meus-okrs',
    'painel-executivo',
    'painel-areas',
    // O painel de comitê também lista OKRs com farol e atingimento; sem essa
    // chave, ele continua discutindo o número que o canvas já corrigiu.
    'painel-comite',
  ]) {
    void queryClient.invalidateQueries({ queryKey: [chave] })
  }
}
