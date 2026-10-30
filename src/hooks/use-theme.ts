import { use } from 'react'

import { TemaContext } from '@/components/theme/theme-context'

export function useTema() {
  const ctx = use(TemaContext)
  if (!ctx) throw new Error('useTema precisa estar dentro de <ThemeProvider>.')
  return ctx
}
