import { use } from 'react'

import { AuthContext } from '@/features/auth/auth-context'

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  return ctx
}
