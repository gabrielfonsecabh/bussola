import { useCallback, useEffect, useMemo, useState } from 'react'

import { CHAVE_TEMA, TemaContext, type Tema } from '@/components/theme/theme-context'

function lerTemaSalvo(): Tema {
  try {
    const v = localStorage.getItem(CHAVE_TEMA)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* localStorage bloqueado (aba privada, política do browser) */
  }
  return 'system'
}

function preferenciaDoSistema(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTema] = useState<Tema>(lerTemaSalvo)
  const [doSistema, setDoSistema] = useState<'light' | 'dark'>(preferenciaDoSistema)

  // Acompanha a preferência do SO enquanto o usuário estiver em 'system'.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const aoMudar = (e: MediaQueryListEvent) => setDoSistema(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', aoMudar)
    return () => mq.removeEventListener('change', aoMudar)
  }, [])

  const resolvido: 'light' | 'dark' = tema === 'system' ? doSistema : tema

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvido === 'dark')
  }, [resolvido])

  const definirTema = useCallback((novo: Tema) => {
    setTema(novo)
    try {
      localStorage.setItem(CHAVE_TEMA, novo)
    } catch {
      /* sem persistência: o tema vale só nesta aba */
    }
  }, [])

  const valor = useMemo(
    () => ({ tema, resolvido, definirTema }),
    [tema, resolvido, definirTema],
  )

  return <TemaContext value={valor}>{children}</TemaContext>
}
