import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
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
  TIPOS_DE_INDICADOR,
  type DadosDoIndicador,
  type Indicador,
} from '@/features/processos/api'
import { rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'

/**
 * Campo numérico opcional continua sendo TEXTO no formulário.
 *
 * Com `z.coerce.number()` o campo vazio viraria 0, e 0 é uma meta legítima:
 * a tela perderia para sempre a diferença entre "meta zero" e "sem meta".
 */
const numeroOpcional = z
  .string()
  .trim()
  .refine((v) => v === '' || !Number.isNaN(Number(v.replace(',', '.'))), {
    message: 'Use apenas números (vírgula ou ponto para o decimal)',
  })

const esquema = z.object({
  nome: z.string().trim().min(3, 'Dê um nome com pelo menos 3 caracteres'),
  tipo: z.string(),
  formula: z.string(),
  unidade: z.string(),
  meta: numeroOpcional,
  baseline: numeroOpcional,
})

type Campos = z.infer<typeof esquema>

function paraNumeroOuNulo(v: string): number | null {
  const limpo = v.replace(',', '.').trim()
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isNaN(n) ? null : n
}

function paraCampos(indicador: Indicador | null): Campos {
  return {
    nome: indicador?.nome ?? '',
    tipo: indicador?.tipo ?? 'Y',
    formula: indicador?.formula ?? '',
    unidade: indicador?.unidade ?? '',
    meta: indicador?.meta != null ? String(indicador.meta) : '',
    baseline: indicador?.baseline != null ? String(indicador.baseline) : '',
  }
}

export interface FormularioDeIndicadorProps {
  /** Indicador em edição, ou null para criar. */
  indicador: Indicador | null
  /** Processo ao qual o indicador pertence. */
  processoId: string
  aoFechar: () => void
  aoSalvar: (dados: DadosDoIndicador) => void
  aoExcluir?: () => void
  salvando: boolean
  excluindo?: boolean
  erro: string | null
}

/**
 * Indicador em DIALOG: são seis campos e uma decisão só (Y ou X). O painel de
 * séries continua atrás porque é dele que vem o contexto do cadastro.
 */
export function FormularioDeIndicador({
  indicador,
  processoId,
  aoFechar,
  aoSalvar,
  aoExcluir,
  salvando,
  excluindo,
  erro,
}: FormularioDeIndicadorProps) {
  // Excluir indicador leva junto o histórico de medições, que não volta.
  // Por isso a exclusão pede um segundo clique em vez de disparar direto.
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: paraCampos(indicador),
  })

  function enviar(c: Campos) {
    aoSalvar({
      processo_id: processoId,
      nome: c.nome.trim(),
      tipo: c.tipo,
      formula: vazioVirarNulo(c.formula),
      unidade: vazioVirarNulo(c.unidade),
      meta: paraNumeroOuNulo(c.meta),
      baseline: paraNumeroOuNulo(c.baseline),
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {indicador ? 'Editar indicador' : 'Novo indicador'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Y é o resultado que se quer mover, X é a causa que se controla para mover o Y.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-indicador"
          onSubmit={form.handleSubmit(enviar)}
          className="space-y-4"
          noValidate
        >
          {erro && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {erro}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ind-nome">Nome do indicador</Label>
            <Input
              id="ind-nome"
              placeholder="Ex.: Prazo médio de fechamento contábil (dias)"
              aria-invalid={!!form.formState.errors.nome}
              {...form.register('nome')}
            />
            {form.formState.errors.nome && (
              <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ind-tipo">Tipo</Label>
              <Controller
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ind-tipo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_DE_INDICADOR.map((t) => (
                        <SelectItem key={t} value={t}>
                          {rotulo(rotulos.tipo_indicador, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Sem pelo menos um Y o processo não fica pronto para DMAIC.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ind-unidade">Unidade</Label>
              <Input
                id="ind-unidade"
                placeholder="opcional (dias, %, R$)"
                {...form.register('unidade')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ind-meta">Meta</Label>
              <Input
                id="ind-meta"
                inputMode="decimal"
                placeholder="opcional"
                aria-invalid={!!form.formState.errors.meta}
                {...form.register('meta')}
              />
              {form.formState.errors.meta ? (
                <p className="text-xs text-destructive">{form.formState.errors.meta.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Em branco fica sem meta, e sem meta não é zero.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ind-baseline">Baseline</Label>
              <Input
                id="ind-baseline"
                inputMode="decimal"
                placeholder="opcional"
                aria-invalid={!!form.formState.errors.baseline}
                {...form.register('baseline')}
              />
              {form.formState.errors.baseline ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.baseline.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  O ponto de partida: é contra ele que o ganho é provado.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ind-formula">Fórmula de cálculo</Label>
            <Input
              id="ind-formula"
              placeholder="opcional (ex.: soma dos dias de fechamento / nº de fechamentos)"
              {...form.register('formula')}
            />
            <p className="text-xs text-muted-foreground">
              Escrever a fórmula é o que impede duas pessoas medirem o mesmo indicador de
              jeitos diferentes.
            </p>
          </div>

          {confirmandoExclusao && (
            <p
              role="alert"
              className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground"
            >
              Excluir apaga junto todas as medições já registradas neste indicador. Clique em
              "Confirmar exclusão" para seguir.
            </p>
          )}
        </form>

        <DialogFooter>
          {indicador && aoExcluir && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirmandoExclusao) aoExcluir()
                else setConfirmandoExclusao(true)
              }}
              disabled={excluindo}
              className="mr-auto text-destructive hover:text-destructive"
            >
              {excluindo ? (
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
          <Button size="sm" type="submit" form="form-indicador" disabled={salvando}>
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {indicador ? 'Salvar' : 'Criar indicador'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
