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
import { listarPerfisDaEmpresa } from '@/features/admin/api'
import {
  HORIZONTES,
  krsParaVinculo,
  projetosParaSelect,
  listarSprints,
  PRIORIDADES,
  STATUS_DO_KANBAN,
  type Atividade,
  type DadosDaAtividade,
} from '@/features/execucao/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { mensagemDeErro } from '@/lib/query'
import { anoAtual, rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'

const esquema = z.object({
  titulo: z.string().trim().min(3, 'Descreva a atividade em pelo menos 3 caracteres'),
  descricao: z.string().trim(),
  responsavel_user_id: z.string().nullable(),
  projeto_id: z.string().nullable(),
  sprint_id: z.string().nullable(),
  key_result_id: z.string().nullable(),
  parent_atividade_id: z.string().nullable(),
  status: z.string(),
  prioridade: z.string(),
  horizonte: z.string(),
  data_prazo: z.string(),
  estimativa_h: z.string(),
})

type Campos = z.infer<typeof esquema>

const SEM_MAES: Atividade[] = []

export interface FormularioDeAtividadeProps {
  /** Atividade em edição, ou null para criar. */
  atividade: Atividade | null
  /** Projeto ao qual a atividade pertence. */
  projetoId: string | null
  areaId: string | null
  /** Candidatas a atividade-mãe (para desdobrar anual em trimestral, etc.). */
  possiveisMaes?: Atividade[]
  aoFechar: () => void
  aoSalvar: (dados: DadosDaAtividade) => void
  aoExcluir?: () => void
  salvando: boolean
  excluindo?: boolean
  erro: string | null
}

/**
 * Atividade em DIALOG: é uma decisão focada sobre um registro, e a resposta é
 * uma ação só. O painel do projeto continua atrás, mas aqui o usuário não
 * precisa comparar nada com ele.
 */
export function FormularioDeAtividade({
  atividade,
  projetoId,
  areaId,
  possiveisMaes = SEM_MAES,
  aoFechar,
  aoSalvar,
  aoExcluir,
  salvando,
  excluindo,
  erro,
}: FormularioDeAtividadeProps) {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      titulo: atividade?.titulo ?? '',
      descricao: atividade?.descricao ?? '',
      responsavel_user_id: atividade?.responsavel_user_id ?? null,
      projeto_id: atividade?.projeto_id ?? projetoId,
      sprint_id: atividade?.sprint_id ?? null,
      key_result_id: atividade?.key_result_id ?? null,
      parent_atividade_id: atividade?.parent_atividade_id ?? null,
      status: atividade?.status ?? 'a_fazer',
      prioridade: atividade?.prioridade ?? 'media',
      horizonte: atividade?.horizonte ?? 'semanal',
      data_prazo: atividade?.data_prazo ?? '',
      estimativa_h: atividade?.estimativa_h != null ? String(atividade.estimativa_h) : '',
    },
  })

  const pessoas = useQuery({
    queryKey: chaves.perfis(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPerfisDaEmpresa(empresaId!),
  })

  const projetos = useQuery({
    queryKey: chaves.projetosParaSelect(empresaId),
    enabled: !!empresaId,
    queryFn: () => projetosParaSelect(empresaId!),
  })

  const sprints = useQuery({
    queryKey: chaves.sprints(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarSprints(empresaId!),
  })

  const krs = useQuery({
    queryKey: ['krs-para-vinculo', empresaId, anoAtual()],
    enabled: !!empresaId,
    queryFn: () => krsParaVinculo(empresaId!, anoAtual()),
  })

  function enviar(c: Campos) {
    const horas = c.estimativa_h.replace(',', '.').trim()
    aoSalvar({
      titulo: c.titulo.trim(),
      descricao: vazioVirarNulo(c.descricao),
      projeto_id: c.projeto_id,
      sprint_id: c.sprint_id,
      key_result_id: c.key_result_id,
      parent_atividade_id: c.parent_atividade_id,
      area_id: areaId,
      responsavel_user_id: c.responsavel_user_id,
      status: c.status,
      prioridade: c.prioridade,
      horizonte: c.horizonte,
      data_prazo: vazioVirarNulo(c.data_prazo),
      estimativa_h: horas === '' || Number.isNaN(Number(horas)) ? null : Number(horas),
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {atividade ? 'Editar atividade' : 'Nova atividade'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            O horizonte é o que deixa o mesmo quadro servir do plano anual ao que
            precisa ser feito hoje.
          </DialogDescription>
        </DialogHeader>

        <form id="form-atividade" onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
          {erro && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {erro}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="at-titulo">O que precisa ser feito</Label>
            <Input
              id="at-titulo"
              placeholder="Ex.: Levantar o inventário de contratos com a auditoria"
              aria-invalid={!!form.formState.errors.titulo}
              {...form.register('titulo')}
            />
            {form.formState.errors.titulo && (
              <p className="text-xs text-destructive">{form.formState.errors.titulo.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="at-descricao">Detalhes</Label>
            <textarea
              id="at-descricao"
              rows={2}
              className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              {...form.register('descricao')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="at-responsavel">Responsável</Label>
              <Controller
                control={form.control}
                name="responsavel_user_id"
                render={({ field }) => (
                  <SearchableSelect
                    id="at-responsavel"
                    options={pessoas.data ?? []}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Sem responsável"
                  />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="at-prazo">Prazo</Label>
              <Input id="at-prazo" type="date" {...form.register('data_prazo')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="at-horizonte">Horizonte</Label>
              <Controller
                control={form.control}
                name="horizonte"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="at-horizonte" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HORIZONTES.map((h) => (
                        <SelectItem key={h} value={h}>
                          {rotulo(rotulos.horizonte, h)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="at-status">Status</Label>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="at-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_DO_KANBAN.map((s) => (
                        <SelectItem key={s} value={s}>
                          {rotulo(rotulos.status_atividade, s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="at-prioridade">Prioridade</Label>
              <Controller
                control={form.control}
                name="prioridade"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="at-prioridade" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORIDADES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {rotulo(rotulos.prioridade, p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="at-estimativa">Estimativa (horas)</Label>
              <Input
                id="at-estimativa"
                inputMode="decimal"
                placeholder="opcional"
                {...form.register('estimativa_h')}
              />
            </div>
          </div>

          <fieldset className="space-y-3 rounded-lg border border-border p-4">
            <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Ligações
            </legend>

            <div className="space-y-1.5">
              <Label htmlFor="at-projeto">Projeto</Label>
              <Controller
                control={form.control}
                name="projeto_id"
                render={({ field }) => (
                  <SearchableSelect
                    id="at-projeto"
                    options={projetos.data ?? []}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={
                      projetos.isLoading
                        ? 'Carregando projetos...'
                        : projetos.error
                          ? 'A lista de projetos não carregou'
                          : 'Sem projeto'
                    }
                    disabled={projetos.isLoading || !!projetos.error}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Atividade sem projeto não entra no progresso de projeto nenhum, e some do
                portfólio e do cronograma. Vale deixar em branco só para trabalho avulso.
              </p>
              {!!projetos.error && (
                <p role="alert" className="text-xs text-destructive">
                  A lista de projetos não carregou, e por isso está vazia. Isto não significa
                  que a empresa esteja sem projetos: {mensagemDeErro(projetos.error)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="at-sprint">Sprint</Label>
              <Controller
                control={form.control}
                name="sprint_id"
                render={({ field }) => (
                  <SearchableSelect
                    id="at-sprint"
                    options={(sprints.data ?? []).map((s) => ({
                      value: s.id,
                      label: s.nome,
                      badge: s.status,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Fora de sprint"
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Só atividades com sprint aparecem no quadro kanban.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="at-kr">Key result que esta atividade avança</Label>
              <Controller
                control={form.control}
                name="key_result_id"
                render={({ field }) => (
                  <SearchableSelect
                    id="at-kr"
                    options={krs.data ?? []}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Nenhum"
                  />
                )}
              />
            </div>

            {possiveisMaes.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="at-mae">Faz parte de</Label>
                <Controller
                  control={form.control}
                  name="parent_atividade_id"
                  render={({ field }) => (
                    <SearchableSelect
                      id="at-mae"
                      options={possiveisMaes.map((a) => ({
                        value: a.id,
                        label: a.titulo,
                        description: rotulo(rotulos.horizonte, a.horizonte),
                      }))}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="É uma atividade de primeiro nível"
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  É assim que uma atividade anual se quebra em trimestrais, mensais e
                  diárias, sem sair da mesma base.
                </p>
              </div>
            )}
          </fieldset>
        </form>

        <DialogFooter>
          {atividade && aoExcluir && (
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
          <Button size="sm" type="submit" form="form-atividade" disabled={salvando}>
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {atividade ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
