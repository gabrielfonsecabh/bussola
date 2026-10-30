import { supabase, supabaseConfigurado } from '@/lib/supabase'

/**
 * FASE 0: só o mínimo para o resto do app não importar `supabase.auth` solto.
 * A Fase 2 (Auth, tenant e administração) constrói em cima daqui: login,
 * guarda de rotas, sincronização de `app.profiles` e o vínculo de empresas.
 *
 * A sessão NÃO é autorização. Ela diz quem é o usuário; o que ele pode ver e
 * fazer é decidido pela RLS e pelas funções de permissão no banco.
 */

export async function sessaoAtual() {
  if (!supabaseConfigurado) return null
  const { data, error } = await supabase().auth.getSession()
  if (error) throw error
  return data.session
}

export async function usuarioAtual() {
  if (!supabaseConfigurado) return null
  const { data, error } = await supabase().auth.getUser()
  if (error) return null
  return data.user
}

export async function sair() {
  await supabase().auth.signOut()
}

/** Chaves de query relacionadas à sessão, para invalidar em bloco no logout. */
export const chavesDeAuth = {
  sessao: ['auth', 'sessao'] as const,
  usuario: ['auth', 'usuario'] as const,
}
