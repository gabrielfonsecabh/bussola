import { createContext } from 'react'

import type { Empresa } from '@/features/auth/auth-context'

export type { Empresa }

export type EmpresaContexto = {
  empresas: Empresa[]
  empresaAtiva: Empresa | null
  definirEmpresaAtiva: (id: string) => void
  carregando: boolean
  /**
   * Preview de UI: diz se o botão aparece habilitado.
   * NÃO é autorização. Quem nega de verdade é a RLS e o gate da função, e a
   * tela precisa continuar tratando o 42501 quando ele vier mesmo assim.
   */
  podeFazer: (chave: string) => boolean
}

export const CHAVE_EMPRESA = 'bussola-empresa-ativa'

export const EmpresaContext = createContext<EmpresaContexto | null>(null)
