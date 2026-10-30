import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listarAreas, listarPerfisDaEmpresa } from '@/features/admin/api'
import {
  TIPOS_DE_ETAPA,
  type DadosDaEtapa,
  type EtapaDoFluxo,
} from '@/features/processos/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'

/**
 * Tempo continua sendo TEXTO no formulário.
 *
 * Com `z.coerce.number()` o campo em branco viraria 0, e a tela perderia para
 * sempre a diferença entre "etapa medida em zero minuto" e "etapa que ninguém
 * cronometrou ainda". A segunda é a informação que importa: é ela que o resumo
 * do fluxo conta em `etapas_sem_tempo`.
 */
const tempoOpcional = z
  .string()
  .trim()
  .refine((v) => v === '' || !Number.isNaN(Number(v.replace(',', '.'))), {
    message: 'Use apenas números (vírgula ou ponto para o decimal)',
  })
  .refine((v) => v === '' || Number(v.replace(',', '.')) > 0, {
    message: 'Tempo zero não é medição. Deixe em branco enquanto ninguém tiver medido.',
  })

const esquema = z.object({
  titulo: z.string().trim().min(3, 'Descreva a etapa em pelo menos 3 caracteres'),
  tipo: z.string(),
  descricao: z.string().trim(),
  responsavel_user_id: z.string().nullable(),
  area_id: z.string().nullable(),
  sistema: z.string().trim(),
  tempo_estimado_min: tempoOpcional,
  eh_gargalo: z.boolean(),
  rotulo_sim: z.string().trim(),
  rotulo_nao: z.string().trim(),
  desvio_para_etapa_id: z.string().nullable(),
})

type Campos = z.infer<typeof esquema>

function paraCampos(etapa: EtapaDoFluxo | null): Campos {
  return {
    titulo: etapa?.titulo ?? '',
    tipo: etapa?.tipo ?? 'atividade',
    descricao: etapa?.descricao ?? '',
    responsavel_user_id: etapa?.responsavel_user_id ?? null,
    area_id: etapa?.area_id ?? null,
    sistema: etapa?.sistema ?? '',
    tempo_estimado_min:
      etapa?.tempo_estimado_min != null ? String(etapa.tempo_estimado_min) : '',
    eh_gargalo: etapa?.eh_gargalo ?? false,
    rotulo_sim: etapa?.rotulo_sim ?? '',
    rotulo_nao: etapa?.rotulo_nao ?? '',
    desvio_para_etapa_id: etapa?.desvio_para_etapa_id ?? null,
  }
}

/**
 * Mesma ordenação do banco (`order by ordem, id`): é ela que decide a posição
 * que a lista mostra ao lado de cada etapa.
 */
function vemAntes(a: EtapaDoFluxo, b: EtapaDoFluxo): boolean {
  if (a.ordem !== b.ordem) return a.ordem < b.ordem
  return a.id < b.id
}

function paraNumeroOuNulo(v: string): number | null {
  const limpo = v.replace(',', '.').trim()
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isNaN(n) || n <= 0 ? null : n
}

export interface FormularioDeEtapaProps {
  etapa: EtapaDoFluxo | null
  processoId: string
  /** As outras etapas, para o select de desvio da decisão. */
  outrasEtapas: EtapaDoFluxo[]
  /** Ordem sugerida quando está criando. */
  proximaOrdem: number
  aoFechar: () => void
  aoSalvar: (dados: DadosDaEtapa) => void
  aoExcluir?: () => void
  salvando: boolean
  excluindo?: boolean
  erro: string | null
}

/**
 * Etapa em DIALOG: é uma decisão focada sobre um registro só. A lista e o
 * desenho continuam atrás, mas enquanto se escreve a etapa não há nada para
 * comparar com eles.
 */
export function FormularioDeEtapa({
  etapa,
  processoId,
  outrasEtapas,
  proximaOrdem,
  aoFechar,
  aoSalvar,
  aoExcluir,
  salvando,
  excluindo,
  erro,
}: FormularioDeEtapaProps) {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null

  // Excluir etapa muda a estrutura do processo e ainda apaga o desvio de
  // qualquer decisão que apontava para ela. Por isso pede um segundo clique.
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: paraCampos(etapa),
  })

  const pessoas = useQuery({
    queryKey: chaves.perfis(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPerfisDaEmpresa(empresaId!),
  })

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  // O desvio é escolhido pelo número que a pessoa vê na lista, e esse número é a
  // POSIÇÃO na sequência, não a coluna `ordem` (que fica com buracos depois de
  // uma exclusão). A etapa em edição não vem em `outrasEtapas`: quem está depois
  // dela ocupa na lista uma posição a mais do que o índice deste array.
  const opcoesDeDesvio = useMemo(
    () =>
      outrasEtapas.map((e, i) => ({
        value: e.id,
        label: `${i + 1 + (etapa && !vemAntes(e, etapa) ? 1 : 0)}. ${e.titulo}`,
        description: rotulo(rotulos.tipo_etapa, e.tipo),
      })),
    [outrasEtapas, etapa],
  )

  // `useWatch` assina só este campo: `form.watch` devolveria função nova a
  // cada render e o compilador desiste de memoizar o formulário inteiro.
  const ehDecisao = useWatch({ control: form.control, name: 'tipo' }) === 'decisao'

  function enviar(c: Campos) {
    // Lê o tipo dos valores enviados, não do estado observado: é o que foi
    // submetido que decide se os campos de ramo têm sentido nesta gravação.
    const decisao = c.tipo === 'decisao'
    aoSalvar({
      processo_id: processoId,
      ordem: etapa?.ordem ?? proximaOrdem,
      tipo: c.tipo,
      titulo: c.titulo.trim(),
      descricao: vazioVirarNulo(c.descricao),
      responsavel_user_id: c.responsavel_user_id,
      area_id: c.area_id,
      sistema: vazioVirarNulo(c.sistema),
      tempo_estimado_min: paraNumeroOuNulo(c.tempo_estimado_min),
      eh_gargalo: c.eh_gargalo,
      // Os três campos do ramo só existem em decisão. Sem esta limpeza, uma
      // decisão rebaixada a atividade continuaria carregando um desvio que o
      // desenho não mostra mais e que ninguém consegue encontrar para apagar.
      rotulo_sim: decisao ? vazioVirarNulo(c.rotulo_sim) : null,
      rotulo_nao: decisao ? vazioVirarNulo(c.rotulo_nao) : null,
      desvio_para_etapa_id: decisao ? c.desvio_para_etapa_id : null,
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {etapa ? 'Editar etapa' : 'Nova etapa'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            As etapas em sequência formam o "P" do SIPOC: o caminho que o trabalho faz
            entre o que entra e o que sai.
          </DialogDescription>
        </DialogHeader>

        <form id="form-etapa" onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
          {erro && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {erro}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="et-titulo">O que acontece nesta etapa</Label>
            <Input
              id="et-titulo"
              placeholder="Ex.: Conferir o cadastro do cliente antes de gerar a ordem"
              aria-invalid={!!form.formState.errors.titulo}
              {...form.register('titulo')}
            />
            {form.formState.errors.titulo && (
              <p className="text-xs text-destructive">{form.formState.errors.titulo.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="et-tipo">Tipo</Label>
              <Controller
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="et-tipo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_DE_ETAPA.map((t) => (
                        <SelectItem key={t} value={t}>
                          {rotulo(rotulos.tipo_etapa, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Decisão abre dois caminhos. Espera é tempo parado, e é onde o prazo do
                processo costuma se perder.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="et-tempo">Tempo estimado (minutos)</Label>
              <Input
                id="et-tempo"
                inputMode="decimal"
                placeholder="opcional"
                aria-invalid={!!form.formState.errors.tempo_estimado_min}
                {...form.register('tempo_estimado_min')}
              />
              {form.formState.errors.tempo_estimado_min ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.tempo_estimado_min.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Em branco fica sem tempo medido, e sem tempo medido não é zero minuto.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="et-descricao">Como é feito</Label>
            <textarea
              id="et-descricao"
              rows={3}
              className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="opcional: a regra, o critério ou o passo a passo que quem executa precisa saber"
              {...form.register('descricao')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="et-responsavel">Responsável</Label>
              <Controller
                control={form.control}
                name="responsavel_user_id"
                render={({ field }) => (
                  <SearchableSelect
                    id="et-responsavel"
                    options={pessoas.data ?? []}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Sem responsável"
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Etapa sem responsável aparece destacada no desenho: etapa sem dono é o
                defeito mais comum de processo mapeado.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="et-area">Área que executa</Label>
              <Controller
                control={form.control}
                name="area_id"
                render={({ field }) => (
                  <SearchableSelect
                    id="et-area"
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
              <p className="text-xs text-muted-foreground">
                É a troca de área entre uma etapa e a seguinte que revela a entrega de
                bastão, onde o processo costuma esperar.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="et-sistema">Sistema onde acontece</Label>
            <Input
              id="et-sistema"
              placeholder="opcional (ex.: ERP, CRM, planilha, WhatsApp)"
              {...form.register('sistema')}
            />
            <p className="text-xs text-muted-foreground">
              É este campo que revela o retrabalho manual escondido entre dois sistemas:
              quando a etapa seguinte roda em outro lugar, alguém está digitando de novo o
              que já existia.
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded-md border border-border p-3">
            <Controller
              control={form.control}
              name="eh_gargalo"
              render={({ field }) => (
                <Checkbox
                  id="et-gargalo"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                />
              )}
            />
            <Label htmlFor="et-gargalo" className="block text-sm font-normal">
              <span className="font-medium">Esta etapa é um gargalo</span>
              <span className="block pt-0.5 text-xs text-muted-foreground">
                Gargalo é a etapa que dita o ritmo de tudo: acelerar qualquer outra não
                muda o tempo total do processo.
              </span>
            </Label>
          </div>

          {ehDecisao && (
            <fieldset className="space-y-3 rounded-lg border border-border p-4">
              <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Os dois ramos da decisão
              </legend>

              <p className="text-xs text-muted-foreground">
                O ramo "sim" segue para a próxima etapa da sequência. O ramo "não" vai para
                a etapa escolhida abaixo. Deixando o desvio em branco, os dois ramos seguem
                juntos para a próxima etapa.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="et-rotulo-sim">Texto do ramo "sim"</Label>
                  <Input
                    id="et-rotulo-sim"
                    placeholder="opcional (padrão: Sim)"
                    {...form.register('rotulo_sim')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="et-rotulo-nao">Texto do ramo "não"</Label>
                  <Input
                    id="et-rotulo-nao"
                    placeholder="opcional (padrão: Não)"
                    {...form.register('rotulo_nao')}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="et-desvio">O ramo "não" vai para</Label>
                <Controller
                  control={form.control}
                  name="desvio_para_etapa_id"
                  render={({ field }) => (
                    <SearchableSelect
                      id="et-desvio"
                      options={opcoesDeDesvio}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Segue para a próxima etapa"
                      emptyMessage="Nenhuma outra etapa para desviar."
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Apontar para uma etapa anterior é o que desenha o retrabalho: a devolução
                  que faz o processo voltar atrás.
                </p>
              </div>
            </fieldset>
          )}

          {confirmandoExclusao && (
            <p
              role="alert"
              className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground"
            >
              Excluir remove a etapa da sequência e apaga o desvio de qualquer decisão que
              apontava para ela. Clique em "Confirmar exclusão" para seguir.
            </p>
          )}
        </form>

        <DialogFooter>
          {etapa && aoExcluir && (
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
          <Button size="sm" type="submit" form="form-etapa" disabled={salvando}>
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {etapa ? 'Salvar' : 'Adicionar etapa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
