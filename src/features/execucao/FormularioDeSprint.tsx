import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, Trash2 } from 'lucide-react'
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
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listarAreas } from '@/features/admin/api'
import type { DadosDaSprint, Sprint } from '@/features/execucao/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'

const STATUS_DE_SPRINT = ['planejada', 'ativa', 'encerrada'] as const

const esquema = z
  .object({
    nome: z.string().trim().min(2, 'Dê um nome à sprint'),
    objetivo: z.string().trim(),
    area_id: z.string().nullable(),
    data_inicio: z.string().min(1, 'Informe o início'),
    data_fim: z.string().min(1, 'Informe o fim'),
    status: z.string(),
  })
  .refine((v) => v.data_inicio <= v.data_fim, {
    path: ['data_fim'],
    message: 'O fim não pode ser antes do início',
  })

type Campos = z.infer<typeof esquema>

/** Duas semanas a partir de hoje, que é a janela mais comum de sprint. */
function janelaPadrao() {
  const hoje = new Date()
  const fim = new Date(hoje)
  fim.setDate(fim.getDate() + 13)
  return {
    inicio: hoje.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  }
}

export function FormularioDeSprint({
  sprint,
  aoFechar,
  aoSalvar,
  aoExcluir,
  salvando,
  excluindo,
  erro,
}: {
  /* Estruturalmente aberto de propósito: a régua do quadro trabalha com
     `SprintDoQuadro` (a sprint mais os contadores), e o formulário só precisa
     dos campos editáveis. Exigir a linha crua obrigaria a tela a manter uma
     segunda consulta viva só para poder abrir este dialog. */
  sprint: Pick<
    Sprint,
    'nome' | 'objetivo' | 'area_id' | 'data_inicio' | 'data_fim' | 'status'
  > | null
  aoFechar: () => void
  aoSalvar: (dados: DadosDaSprint) => void
  aoExcluir?: () => void
  salvando: boolean
  excluindo?: boolean
  erro: string | null
}) {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const padrao = janelaPadrao()

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nome: sprint?.nome ?? '',
      objetivo: sprint?.objetivo ?? '',
      area_id: sprint?.area_id ?? null,
      data_inicio: sprint?.data_inicio ?? padrao.inicio,
      data_fim: sprint?.data_fim ?? padrao.fim,
      status: sprint?.status ?? 'ativa',
    },
  })

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {sprint ? 'Editar sprint' : 'Nova sprint'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            A sprint é a janela de execução da área. Atividade sem sprint não aparece no
            quadro.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-sprint"
          onSubmit={form.handleSubmit((c) =>
            aoSalvar({
              nome: c.nome.trim(),
              objetivo: vazioVirarNulo(c.objetivo),
              area_id: c.area_id,
              data_inicio: c.data_inicio,
              data_fim: c.data_fim,
              status: c.status,
            }),
          )}
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
            <Label htmlFor="sp-nome">Nome</Label>
            <Input
              id="sp-nome"
              placeholder="Ex.: Sprint 12 · Tesouraria"
              aria-invalid={!!form.formState.errors.nome}
              {...form.register('nome')}
            />
            {form.formState.errors.nome && (
              <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-objetivo">Objetivo da sprint</Label>
            <Input
              id="sp-objetivo"
              placeholder="O que precisa estar pronto no fim desta janela"
              {...form.register('objetivo')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-area">Área</Label>
            <Controller
              control={form.control}
              name="area_id"
              render={({ field }) => (
                <SearchableSelect
                  id="sp-area"
                  options={(areas.data ?? []).map((a) => ({
                    value: a.id,
                    label: a.nome,
                    description: rotulo(rotulos.tipo_area, a.tipo),
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Sem área"
                />
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sp-inicio">Início</Label>
              <Input id="sp-inicio" type="date" {...form.register('data_inicio')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-fim">Fim</Label>
              <Input id="sp-fim" type="date" {...form.register('data_fim')} />
              {form.formState.errors.data_fim && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.data_fim.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-status">Status</Label>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="sp-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_DE_SPRINT.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              O quadro abre sozinho na sprint que contém a data de hoje.
            </p>
          </div>
        </form>

        <DialogFooter>
          {sprint && aoExcluir && (
            <Button
              variant="ghost"
              size="sm"
              onClick={aoExcluir}
              disabled={excluindo}
              className="mr-auto text-destructive hover:text-destructive"
            >
              {excluindo ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              Excluir
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button size="sm" type="submit" form="form-sprint" disabled={salvando}>
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {sprint ? 'Salvar' : 'Criar sprint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
