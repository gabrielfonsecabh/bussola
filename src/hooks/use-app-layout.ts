import { use } from 'react'

import { AppLayoutContext } from '@/components/shell/AppLayoutContext'

export function useAppLayout() {
  const ctx = use(AppLayoutContext)
  if (!ctx) throw new Error('useAppLayout precisa estar dentro de <AppLayout>.')
  return ctx
}
