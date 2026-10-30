import { createContext } from 'react'

export type Tema = 'light' | 'dark' | 'system'

export type TemaContexto = {
  /** O que o usuário escolheu (pode ser 'system'). */
  tema: Tema
  /** O que está de fato aplicado agora ('system' já resolvido). */
  resolvido: 'light' | 'dark'
  definirTema: (tema: Tema) => void
}

/** Mesma chave usada pelo script anti-flash no index.html. */
export const CHAVE_TEMA = 'bussola-tema'

export const TemaContext = createContext<TemaContexto | null>(null)
