import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Client único do Supabase.
 *
 * Decisões que valem para o projeto inteiro:
 *
 * 1. `db.schema: 'app'` - todas as tabelas da Bússola vivem no schema `app`
 *    (migration 0001), não em `public`. Com isso, `supabase.from('okrs')` já
 *    aponta para `app.okrs` e `supabase.rpc('kr_checkin')` para
 *    `app.kr_checkin`. Lembre de expor o schema em
 *    Supabase Dashboard > Settings > API > Exposed schemas.
 *
 * 2. Só a chave pública. A `service_role` ignora TODA a RLS e não existe no
 *    frontend, em nenhuma hipótese.
 *
 * 3. A autorização é da RLS. O client não filtra por empresa "por segurança":
 *    ele filtra por empresa por ERGONOMIA. Quem garante o isolamento é a
 *    policy no banco.
 */

export type Client = SupabaseClient<Database, 'app'>

function criar(): Client | null {
  if (!env.ok) return null

  return createClient<Database, 'app'>(
    env.valores.VITE_SUPABASE_URL,
    env.valores.VITE_SUPABASE_ANON_KEY,
    {
      db: { schema: 'app' },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'bussola-auth',
      },
      global: {
        headers: { 'x-application-name': 'bussola' },
      },
    },
  )
}

const clientOuNulo = criar()

/**
 * Use este acessor em vez da constante crua: ele falha com uma mensagem que
 * diz o que fazer, em vez de estourar `undefined` no meio de uma query.
 */
export function supabase(): Client {
  if (!clientOuNulo) {
    throw new Error(
      'Supabase não configurado. Preencha VITE_SUPABASE_URL e ' +
        'VITE_SUPABASE_ANON_KEY em .env.local e reinicie o `npm run dev`.',
    )
  }
  return clientOuNulo
}

/** True quando o .env está preenchido e o client existe. */
export const supabaseConfigurado = clientOuNulo !== null
