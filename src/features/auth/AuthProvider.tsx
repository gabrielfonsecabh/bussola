import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AuthContext, type Contexto } from '@/features/auth/auth-context'
import { chaves } from '@/lib/chaves'
import { supabase, supabaseConfigurado } from '@/lib/supabase'

/**
 * Sessão + contexto do usuário.
 *
 * A sessão diz QUEM é o usuário. Ela não diz o que ele pode fazer: isso é da
 * RLS e dos gates das funções. O `contexto` que vem de `app.meu_contexto()`
 * traz empresas e permissões para a UI decidir o que MOSTRAR, o que é outra
 * coisa.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessaoResolvida, setSessaoResolvida] = useState(!supabaseConfigurado)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!supabaseConfigurado) return

    let vivo = true
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!vivo) return
        setSession(data.session)
        setSessaoResolvida(true)
      })
      .catch(() => {
        if (vivo) setSessaoResolvida(true)
      })

    const { data: sub } = supabase().auth.onAuthStateChange((evento, nova) => {
      setSession(nova)
      setSessaoResolvida(true)
      // Sair precisa apagar o cache: dado de um usuário nunca pode aparecer
      // para o próximo que logar na mesma aba.
      if (evento === 'SIGNED_OUT') queryClient.clear()
    })

    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [queryClient])

  const consulta = useQuery({
    queryKey: chaves.contexto(session?.user.id ?? null),
    enabled: supabaseConfigurado && !!session,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Contexto> => {
      const { data, error } = await supabase().rpc('meu_contexto')
      if (error) throw error
      return data as unknown as Contexto
    },
  })

  const sair = useCallback(async () => {
    if (!supabaseConfigurado) return
    await supabase().auth.signOut()
    queryClient.clear()
  }, [queryClient])

  /**
   * Devolve a PROMESSA da invalidação, e não void.
   *
   * A versão anterior disparava e retornava na hora. Quem chamava (a tela de
   * definir senha) navegava em seguida, a guarda lia o contexto ainda em cache
   * com `deve_trocar_senha = true`, e mandava a pessoa de volta para a mesma
   * tela: ela trocava a senha DUAS vezes para conseguir entrar. O banco estava
   * certo o tempo todo; a corrida era daqui.
   */
  const recarregarContexto = useCallback(
    () => queryClient.invalidateQueries({ queryKey: chaves.contexto(session?.user.id ?? null) }),
    [queryClient, session],
  )

  const valor = useMemo(
    () => ({
      session,
      usuario: session?.user ?? null,
      contexto: consulta.data ?? null,
      carregando: !sessaoResolvida || (!!session && consulta.isLoading),
      erroDeContexto: consulta.error,
      sair,
      recarregarContexto,
    }),
    [session, sessaoResolvida, consulta.data, consulta.isLoading, consulta.error, sair, recarregarContexto],
  )

  return <AuthContext value={valor}>{children}</AuthContext>
}
