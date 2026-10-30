import { z } from 'zod'

/**
 * Variáveis de ambiente do frontend.
 *
 * Só o que tem prefixo VITE_ chega ao browser, e tudo que chega ao browser é
 * público. A `service_role` NUNCA entra aqui (ver docs/04-seguranca.md).
 *
 * A validação não derruba o app: se faltar variável, `env.ok` é false e o
 * `App` mostra a tela de configuração em vez de um erro de rede sem contexto.
 * Falha silenciosa é o inimigo declarado deste projeto, inclusive na config.
 */
const esquema = z.object({
  VITE_SUPABASE_URL: z
    .string()
    .min(1, 'está vazia')
    .refine((v) => {
      try {
        return new URL(v).protocol === 'https:'
      } catch {
        return false
      }
    }, 'precisa ser uma URL https válida (ex.: https://xxxx.supabase.co)'),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'está vazia ou curta demais'),
  VITE_APP_NAME: z.string().min(1).default('Bússola'),
})

export type Env = z.infer<typeof esquema>

type ResultadoEnv =
  | { ok: true; valores: Env; problemas: [] }
  | { ok: false; valores: null; problemas: string[] }

function ler(): ResultadoEnv {
  const parsed = esquema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_APP_NAME: import.meta.env.VITE_APP_NAME || undefined,
  })

  if (parsed.success) {
    return { ok: true, valores: parsed.data, problemas: [] }
  }

  const problemas = parsed.error.issues.map((i) => {
    const campo = i.path.join('.') || '(raiz)'
    return `${campo}: ${i.message}`
  })
  return { ok: false, valores: null, problemas }
}

export const env = ler()

/** Nome do app para o shell. Funciona mesmo sem o .env preenchido. */
export const nomeDoApp = env.ok ? env.valores.VITE_APP_NAME : 'Bússola'
