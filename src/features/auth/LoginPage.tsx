import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, LoaderCircle, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router-dom'
import { z } from 'zod'

import { IconeDaMarca, ROTA_INICIAL } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { env } from '@/lib/env'
import { mensagemDeErro } from '@/lib/query'
import { supabase, supabaseConfigurado } from '@/lib/supabase'

const esquema = z.object({
  email: z.string().min(1, 'Informe o e-mail').email('E-mail inválido'),
  senha: z.string().min(1, 'Informe a senha'),
})

type Campos = z.infer<typeof esquema>

export function LoginPage() {
  const { session, carregando } = useAuth()
  const local = useLocation()
  const [erro, setErro] = useState<string | null>(null)
  const [recuperacaoEnviada, setRecuperacaoEnviada] = useState(false)
  const [enviandoRecuperacao, setEnviandoRecuperacao] = useState(false)

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: { email: '', senha: '' },
  })

  if (session && !carregando) {
    const destino = (local.state as { de?: string } | null)?.de ?? ROTA_INICIAL
    return <Navigate to={destino} replace />
  }

  async function entrar(campos: Campos) {
    setErro(null)
    const { error } = await supabase().auth.signInWithPassword({
      email: campos.email.trim(),
      password: campos.senha,
    })
    if (error) {
      // A mensagem crua do Supabase é em inglês e genérica de propósito
      // (não revela se o e-mail existe). Mantemos essa propriedade.
      setErro(
        error.message.toLowerCase().includes('invalid login')
          ? 'E-mail ou senha incorretos.'
          : mensagemDeErro(error),
      )
    }
  }

  async function recuperarSenha() {
    const email = form.getValues('email').trim()
    if (!email) {
      form.setError('email', { message: 'Informe o e-mail para receber o link' })
      return
    }
    setErro(null)
    setEnviandoRecuperacao(true)
    const { error } = await supabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/definir-senha`,
    })
    setEnviandoRecuperacao(false)
    if (error) setErro(mensagemDeErro(error))
    else setRecuperacaoEnviada(true)
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Painel de marca: só decoração, some no mobile. */}
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
            <IconeDaMarca className="size-6" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="font-semibold">Bússola</p>
            <p className="text-xs text-sidebar-muted-foreground">Gestão estratégica open source</p>
          </div>
        </div>

        <div className="max-w-md space-y-4">
          <p className="text-2xl leading-snug font-semibold tracking-tight">
            Da Estrela do Norte até a atividade de hoje.
          </p>
          <p className="text-sm text-sidebar-muted-foreground">
            Estratégia, OKR, projetos, processos e o Kit mínimo de gestão no mesmo lugar,
            com a linha direta entre o que você faz e o objetivo da companhia.
          </p>
        </div>

        <p className="text-xs text-sidebar-muted-foreground">
          Acesso restrito. O que você enxerga é definido pelo seu vínculo com a empresa.
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-lg bg-gradient-primary text-primary-foreground">
              <IconeDaMarca className="size-6" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="font-semibold">Bússola</p>
              <p className="text-xs text-muted-foreground">Gestão estratégica open source</p>
            </div>
          </div>

          <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
          <p className="pt-1 pb-6 text-sm text-muted-foreground">
            Use o seu e-mail corporativo.
          </p>

          {!supabaseConfigurado && (
            <div className="mb-4 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <p className="font-semibold">Supabase não configurado.</p>
              <ul className="list-inside list-disc pt-1">
                {env.ok ? null : env.problemas.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          )}

          {recuperacaoEnviada && (
            <div
              aria-live="polite"
              className="mb-4 flex items-start gap-2 rounded-md border border-success/40 bg-success-subtle p-3 text-xs text-success-subtle-foreground"
            >
              <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Se este e-mail tiver acesso, o link para definir a senha chegou na caixa
                de entrada. O link vale por uma hora.
              </p>
            </div>
          )}

          {erro && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{erro}</p>
            </div>
          )}

          <form onSubmit={form.handleSubmit(entrar)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="nome@empresa.com.br"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="senha">Senha</Label>
                <button
                  type="button"
                  onClick={recuperarSenha}
                  disabled={enviandoRecuperacao || !supabaseConfigurado}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
                >
                  {enviandoRecuperacao ? 'Enviando...' : 'Esqueci minha senha'}
                </button>
              </div>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!form.formState.errors.senha}
                {...form.register('senha')}
              />
              {form.formState.errors.senha && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.senha.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting || !supabaseConfigurado}
            >
              {form.formState.isSubmitting && (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              )}
              Entrar
            </Button>
          </form>

          <p className="pt-6 text-xs text-muted-foreground">
            Primeiro acesso? Use "Esqueci minha senha" para definir a sua. O cadastro do
            usuário é feito pela administração.
          </p>
        </div>
      </div>
    </div>
  )
}
