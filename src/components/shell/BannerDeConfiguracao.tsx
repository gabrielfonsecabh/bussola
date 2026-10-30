import { CircleAlert } from 'lucide-react'

import { env } from '@/lib/env'

/**
 * O .env não preenchido é a causa nº 1 de "não funciona" num projeto novo.
 * Em vez de deixar o app quebrar numa chamada de rede sem contexto, ele diz o
 * que falta e onde preencher. Some sozinho quando as variáveis existirem.
 */
export function BannerDeConfiguracao() {
  if (env.ok) return null

  return (
    <div
      aria-live="polite"
      className="border-b border-warning/40 bg-warning-subtle px-4 py-2.5 text-warning-subtle-foreground lg:px-6"
    >
      <div className="flex items-start gap-2.5">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 text-xs leading-relaxed">
          <p className="font-semibold">
            Supabase ainda não configurado. O shell funciona, mas nenhuma tela vai
            carregar dados.
          </p>
          <p className="pt-0.5">
            Copie <code>.env.example</code> para <code>.env.local</code>, preencha as
            variáveis e reinicie o <code>npm run dev</code>.
          </p>
          <ul className="list-inside list-disc pt-1 opacity-90">
            {env.problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
