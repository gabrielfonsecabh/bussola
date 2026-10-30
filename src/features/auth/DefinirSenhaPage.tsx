import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { IconeDaMarca, ROTA_INICIAL } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { mensagemDeErro } from '@/lib/query'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'

/**
 * Espelha a política do Auth do Supabase (mínimo 10, com minúscula, maiúscula
 * e dígito). Validar aqui não substitui a regra do servidor: serve para o
 * usuário saber o que falta ANTES de submeter, em vez de receber um erro
 * genérico em inglês depois.
 */
const esquema = z
  .object({
    senha: z
      .string()
      .min(10, 'Use pelo menos 10 caracteres')
      .regex(/[a-z]/, 'Inclua ao menos uma letra minúscula')
      .regex(/[A-Z]/, 'Inclua ao menos uma letra maiúscula')
      .regex(/\d/, 'Inclua ao menos um número'),
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas não conferem',
  })

type Campos = z.infer<typeof esquema>

/**
 * Destino do link de recuperação. O Supabase já troca o token da URL por uma
 * sessão antes de chegar aqui (detectSessionInUrl), então basta atualizar a
 * senha do usuário logado.
 */
export function DefinirSenhaPage() {
  const { session, carregando, contexto, recarregarContexto } = useAuth()
  const navegar = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const primeiroAcesso = contexto?.perfil.deve_trocar_senha === true

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: { senha: '', confirmacao: '' },
  })

  async function salvar(campos: Campos) {
    setErro(null)
    const { error } = await supabase().auth.updateUser({ password: campos.senha })
    if (error) {
      setErro(mensagemDeErro(error))
      return
    }

    // Só o banco libera a trava, e só para o próprio usuário logado.
    const { error: erroDaFlag } = await supabase().rpc('senha_trocada')
    if (erroDaFlag) {
      setErro(mensagemDeErro(erroDaFlag))
      return
    }

    // `await` é o conserto: sem ele a navegação acontece antes de o contexto
    // recarregar, a guarda lê o cache velho e devolve a pessoa para cá.
    await recarregarContexto()
    navegar(ROTA_INICIAL, { replace: true })
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-gradient-primary text-primary-foreground">
            <IconeDaMarca className="size-6" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="font-semibold">Bússola</p>
            <p className="text-xs text-muted-foreground">Definir senha</p>
          </div>
        </div>

        {primeiroAcesso && (
          <div className="mb-4 rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
            <Badge variant="info-subtle" className="mb-1.5">
              primeiro acesso
            </Badge>
            <p className="font-semibold">Escolha a sua senha para continuar.</p>
            <p className="pt-1">
              A senha atual foi definida pela administração, então mais alguém a conhece. O app
              só abre depois que você trocar.
            </p>
          </div>
        )}

        {!carregando && !session && !primeiroAcesso && (
          <div className="mb-4 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
            <p className="font-semibold">Link inválido ou expirado.</p>
            <p className="pt-1">
              Volte para <a className="underline" href="/entrar">a tela de entrada</a> e peça
              um novo link em "Esqueci minha senha".
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

        <form onSubmit={form.handleSubmit(salvar)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="senha">Nova senha</Label>
            <Input id="senha" type="password" autoComplete="new-password" {...form.register('senha')} />
            <p className="text-xs text-muted-foreground">
              Mínimo de 10 caracteres, com maiúscula, minúscula e número.
            </p>
            {form.formState.errors.senha && (
              <p className="text-xs text-destructive">{form.formState.errors.senha.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmacao">Repita a senha</Label>
            <Input
              id="confirmacao"
              type="password"
              autoComplete="new-password"
              {...form.register('confirmacao')}
            />
            {form.formState.errors.confirmacao && (
              <p className="text-xs text-destructive">
                {form.formState.errors.confirmacao.message}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || !session}>
            {form.formState.isSubmitting && (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            )}
            Salvar e entrar
          </Button>
        </form>
      </div>
    </div>
  )
}
