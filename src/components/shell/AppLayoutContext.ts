import { createContext } from 'react'

export type AppLayoutContexto = {
  /** Drawer da sidebar no mobile. */
  menuAberto: boolean
  definirMenuAberto: (aberto: boolean) => void
  /** Sidebar recolhida (só ícones) no desktop. */
  recolhida: boolean
  alternarRecolhida: () => void
}

export const CHAVE_SIDEBAR = 'bussola-sidebar-recolhida'

/**
 * Estado compartilhado do shell, sem prop drilling.
 * Só isto: abrir/fechar e recolher. Qualquer outra coisa que entrar aqui é
 * estado de página disfarçado de estado de layout.
 */
export const AppLayoutContext = createContext<AppLayoutContexto | null>(null)
