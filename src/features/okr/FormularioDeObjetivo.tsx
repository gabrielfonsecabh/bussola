import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LoaderCircle, Star, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  atualizarObjetivo,
  criarObjetivo,
  excluirObjetivo,
  listarPerspectivas,
  type DadosDoObjetivo,
  type ObjetivoEstrategico,
} from '@/features/okr/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { vazioVirarNulo } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

/** O Select do shadcn não aceita valor vazio, então "nenhuma" precisa de sentinela. */
const SEM_PERSPECTIVA = 'sem-perspectiva'

/** Mesmo default do banco. `ciclo` é NOT NULL: nunca sai daqui como null. */
const CICLO_PADRAO = '2026-2029'

const esquema = z.object({
  titulo: z.string().trim().min(3, 'Dê um título com pelo menos 3 caracteres'),
  descricao: z.string(),
  perspectiva_id: z.string(),
  ciclo: z.string().trim().min(1, 'O ciclo é obrigatório: sem ele o objetivo não tem horizonte'),
  is_estrela_do_norte: z.boolean(),
})

type Campos = z.infer<typeof esquema>

function paraApi(c: Campos): DadosDoObjetivo {
  return {
    titulo: c.titulo.trim(),
    descricao: vazioVirarNulo(c.descricao),
    perspectiva_id: c.perspectiva_id === SEM_PERSPECTIVA ? null : c.perspectiva_id,
    ciclo: c.ciclo.trim(),
    is_estrela_do_norte: c.is_estrela_do_norte,
  }
}

export interface FormularioDeObjetivoProps {
  /** Objetivo em edição, ou null para criar. */
  objetivo: ObjetivoEstrategico | null
  /** Perspectiva já escolhida por quem abriu o formulário (card vazio do mapa). */
  perspectivaId?: string | null
  /** Título do objetivo que hoje é a Estrela do Norte, para avisar sobre a troca. */
  estrelaDoNorteAtual?: string | null
  aoFechar: () => void
  /** Recebe a linha gravada, ou null quando o objetivo foi excluído. */
  aoConcluir: (objetivo: ObjetivoEstrategico | null) => void
}

/**
 * Objetivo estratégico em DIALOG: é uma decisão focada sobre um registro, e o
 * mapa que ficou atrás não precisa ser comparado campo a campo.
 */
export function FormularioDeObjetivo({
  objetivo,
  perspectivaId = null,
  estrelaDoNorteAtual = null,
  aoFechar,
  aoConcluir,
}: FormularioDeObjetivoProps) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      titulo: objetivo?.titulo ?? '',
      descricao: objetivo?.descricao ?? '',
      perspectiva_id: objetivo?.perspectiva_id ?? perspectivaId ?? SEM_PERSPECTIVA,
      ciclo: objetivo?.ciclo ?? CICLO_PADRAO,
      is_estrela_do_norte: objetivo?.is_estrela_do_norte ?? false,
    },
  })

  const perspectivas = useQuery({
    queryKey: chaves.perspectivas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPerspectivas(empresaId!),
  })

  const salvar = useMutation({
    mutationFn: (dados: DadosDoObjetivo) =>
      objetivo ? atualizarObjetivo(objetivo.id, dados) : criarObjetivo(empresaId!, dados),
    onSuccess: (linha) => aoConcluir(linha),
  })

  const remover = useMutation({
    mutationFn: (id: string) => excluirObjetivo(id),
    onSuccess: () => aoConcluir(null),
  })

  // `useWatch` assina só o campo, sem devolver função nova a cada render.
  const marcadaComoEstrela = useWatch({ control: form.control, name: 'is_estrela_do_norte' })
  const semPerspectiva =
    useWatch({ control: form.control, name: 'perspectiva_id' }) === SEM_PERSPECTIVA

  const erro = salvar.error ?? remover.error
  const podeExcluir = podeFazer('okr.delete')
  const trocaDeEstrela =
    marcadaComoEstrela && !!estrelaDoNorteAtual && !objetivo?.is_estrela_do_norte

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {objetivo ? 'Editar objetivo estratégico' : 'Novo objetivo estratégico'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            O objetivo é a raiz: é dele que nasce o OKR corporativo e todo o desdobramento
            até o individual.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-objetivo"
          onSubmit={form.handleSubmit((c) => salvar.mutate(paraApi(c)))}
          className="space-y-4"
          noValidate
        >
          {erro && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {mensagemDeErro(erro)}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ob-titulo">Objetivo</Label>
            <Input
              id="ob-titulo"
              placeholder="Ex.: Elevar a margem EBITDA para 22% até 2028"
              aria-invalid={!!form.formState.errors.titulo}
              {...form.register('titulo')}
            />
            {form.formState.errors.titulo && (
              <p className="text-xs text-destructive">{form.formState.errors.titulo.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ob-descricao">Descrição</Label>
            <textarea
              id="ob-descricao"
              rows={3}
              placeholder="O que este objetivo muda na empresa, e por quê"
              className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              {...form.register('descricao')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ob-perspectiva">Perspectiva do BSC</Label>
              <Controller
                control={form.control}
                name="perspectiva_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ob-perspectiva" className="w-full">
                      <SelectValue placeholder="Escolha a perspectiva" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_PERSPECTIVA}>Sem perspectiva</SelectItem>
                      {(perspectivas.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {perspectivas.error && (
                <p role="alert" className="text-xs text-destructive">
                  A lista de perspectivas não carregou, e por isso está vazia. Isto não
                  significa que a empresa esteja sem perspectivas: {mensagemDeErro(perspectivas.error)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ob-ciclo">Ciclo</Label>
              <Input
                id="ob-ciclo"
                placeholder={CICLO_PADRAO}
                aria-invalid={!!form.formState.errors.ciclo}
                {...form.register('ciclo')}
              />
              {form.formState.errors.ciclo ? (
                <p className="text-xs text-destructive">{form.formState.errors.ciclo.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  O horizonte plurianual do plano, no formato {CICLO_PADRAO}.
                </p>
              )}
            </div>
          </div>

          {semPerspectiva && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">
                  Sem perspectiva, este objetivo fica fora dos cards do BSC.
                </p>
                <p className="pt-0.5">
                  O mapa agrupa os objetivos nos quatro cards do BSC. Sem perspectiva, este
                  fica gravado e só aparece na lista "Fora do mapa", no fim da tela, até
                  alguém escolher uma.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-md border border-border p-3">
            <Controller
              control={form.control}
              name="is_estrela_do_norte"
              render={({ field }) => (
                <Checkbox
                  id="ob-estrela"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                />
              )}
            />
            <Label htmlFor="ob-estrela" className="block text-sm font-normal">
              <span className="flex items-center gap-1.5 font-medium">
                <Star className="size-3.5 fill-warning text-warning" aria-hidden />
                Estrela do Norte
              </span>
              <span className="block pt-0.5 text-xs text-muted-foreground">
                A Estrela do Norte é o indicador único que a companhia inteira persegue, a
                margem EBITDA, e é ela que aparece em destaque no painel executivo.
              </span>
            </Label>
          </div>

          {trocaDeEstrela && (
            <p
              role="alert"
              className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground"
            >
              Hoje a Estrela do Norte é "{estrelaDoNorteAtual}". Marcar este aqui deixa a
              empresa com duas, e o painel executivo passa a mostrar as duas em destaque.
              Se a intenção é trocar, desmarque a outra depois de salvar.
            </p>
          )}
        </form>

        {confirmandoExclusao && objetivo && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
          >
            <p className="font-semibold">Excluir "{objetivo.titulo}"?</p>
            <p className="pt-0.5">
              Os OKRs ligados a ele não são apagados: eles ficam sem objetivo, órfãos no
              mapa, e ninguém mais consegue dizer que estratégia eles serviam.
            </p>
          </div>
        )}

        <DialogFooter>
          {objetivo && podeExcluir && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                confirmandoExclusao ? remover.mutate(objetivo.id) : setConfirmandoExclusao(true)
              }
              disabled={remover.isPending}
              className="mr-auto text-destructive hover:text-destructive"
            >
              {remover.isPending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              {confirmandoExclusao ? 'Confirmar exclusão' : 'Excluir'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button size="sm" type="submit" form="form-objetivo" disabled={salvar.isPending}>
            {salvar.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {objetivo ? 'Salvar' : 'Criar objetivo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
