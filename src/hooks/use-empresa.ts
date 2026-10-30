import { use } from 'react'

import { EmpresaContext } from '@/app/empresa-context'

export function useEmpresa() {
  const ctx = use(EmpresaContext)
  if (!ctx) throw new Error('useEmpresa precisa estar dentro de <EmpresaProvider>.')
  return ctx
}
