import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Info, LoaderCircle, Trash2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Button } from '@/components/ui/button'
import { EstadoDaTela, SemCorrespondencia } from '@/components/ui/estado-da-tela'
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
  carregarMelhoria,
  METODOS_DE_MELHORIA,
  processosParaSelect,
  STATUS_DE_MELHORIA,
  type DadosDaMelhoria,
  type Melhoria,
} from '@/features/processos/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'

/**
 * `ganho_realizado` fica de fora de propósito: quem decide esse número é o
 * Control, e a função `melhoria_avancar_fase` zera o campo enquanto a melhoria
 * estiver antes dele. Deixar o campo aqui só criaria um valor que o banco
 * apaga sozinho na próxima transição de fase.
 */
export type DadosDoFormularioDeMelhoria = Omit<DadosDaMelhoria, 'ganho_realizado'>

/**
 * A linha crua da melhoria, que só este formulário lê. Fica exportada para a
 * página invalidar a mesma chave depois de gravar, em vez de repetir o
 * literal e deixar o formulário reabrir com o dado de antes da edição.
 */
export const chaveDoRegistroDeMelhoria = (id: string | null) =>
  ['melhoria-registro', id] as const

function ehNumeroOuVazio(v: string): boolean {
  const limpo = v.replace(',', '.').trim()
  return limpo === '' || (!Number.isNaN(Number(limpo)) && Number(limpo) >= 0)
}

const esquema = z
  .object({
    nome: z.string().trim().min(3, 'Dê um nome com pelo menos 3 caracteres'),
    processo_id: z.string().nullable(),
    area_id: z.string().nullable(),
    metodo: z.string(),
    belt_user_id: z.string().nullable(),
    problema: z.string(),
    meta_smart: z.string(),
    ganho_estimado: z.string(),
    status: z.string(),
    inicio_previsto: z.string(),
    termino_previsto: z.string(),
  })
  .refine((v) => ehNumeroOuVazio(v.ganho_estimado), {
    path: ['ganho_estimado'],
    message: 'Informe um valor em reais, sem sinal negativo, ou deixe em branco',
  })
  .refine(
    (v) => !v.inicio_previsto || !v.termino_previsto || v.inicio_previsto <= v.termino_previsto,
    {
      path: ['termino_previsto'],
      message: 'O término não pode ser antes do início',
    },
  )

type Campos = z.infer<typeof esquema>

function paraCampos(melhoria: Melhoria | null): Campos {
  return {
    nome: melhoria?.nome ?? '',
    processo_id: melhoria?.processo_id ?? null,
    area_id: melhoria?.area_id ?? null,
    metodo: melhoria?.metodo ?? 'dmaic',
    belt_user_id: melhoria?.belt_user_id ?? null,
    problema: melhoria?.problema ?? '',
    meta_smart: melhoria?.meta_smart ?? '',
    ganho_estimado: melhoria?.ganho_estimado != null ? String(melhoria.ganho_estimado) : '',
    status: melhoria?.status ?? 'backlog',
    inicio_previsto: melhoria?.inicio_previsto ?? '',
    termino_previsto: melhoria?.termino_previsto ?? '',
  }
}

function paraApi(c: Campos): DadosDoFormularioDeMelhoria {
  const ganho = c.ganho_estimado.replace(',', '.').trim()
  return {
    nome: c.nome.trim(),
    processo_id: c.processo_id,
    area_id: c.area_id,
    metodo: c.metodo,
    belt_user_id: c.belt_user_id,
    problema: vazioVirarNulo(c.problema),
    meta_smart: vazioVirarNulo(c.meta_smart),
    ganho_estimado: ganho === '' ? null : Number(ganho),
    status: c.status,
    inicio_previsto: vazioVirarNulo(c.inicio_previsto),
    termino_previsto: vazioVirarNulo(c.termino_previsto),
  }
}

export interface FormularioDeMelhoriaProps {
  /** ID da melhoria em edição, ou null para abrir uma nova. */
  melhoriaId: string | null
  aoFechar: () => void
  aoSalvar: (dados: DadosDoFormularioDeMelhoria) => void
  aoExcluir?: () => void
  salvando: boolean
  excluindo?: boolean
  erro: string | null
}

/**
 * Cadastro em SHEET: o quadro DMAIC continua atrás, e é contra ele que o
 * usuário confere em que fase a melhoria vai entrar.
 */
export function FormularioDeMelhoria(props: FormularioDeMelhoriaProps) {
  const { melhoriaId, aoFechar } = props

  // O card do quadro é um recorte: área e início previsto não vêm na RPC.
  // Montar o formulário com esse recorte gravaria campo em branco por cima do
  // que já está no banco, então a linha inteira é buscada antes.
  const registro = useQuery({
    queryKey: chaveDoRegistroDeMelhoria(melhoriaId),
    enabled: !!melhoriaId,
    queryFn: () => carregarMelhoria(melhoriaId!),
  })

  if (melhoriaId && !registro.data) {
    return (
      <PainelDeDetalhe
        aberto
        largura="larga"
        aoFechar={aoFechar}
        titulo="Projeto de melhoria"
        origem="Quadro DMAIC · editando"
      >
        <EstadoDaTela
          carregando={registro.isLoading}
          erro={registro.error}
          quantidade={0}
          aoTentarDeNovo={() => void registro.refetch()}
          vazio={
            <SemCorrespondencia
              titulo="Este projeto de melhoria não está mais no banco"
              descricao="Ele pode ter sido excluído depois que o quadro carregou. Feche o painel e recarregue a tela."
            />
          }
        >
          {null}
        </EstadoDaTela>
      </PainelDeDetalhe>
    )
  }

  return <Formulario {...props} melhoria={registro.data ?? null} />
}

function Formulario({
  melhoria,
  aoFechar,
  aoSalvar,
  aoExcluir,
  salvando,
  excluindo,
  erro,
}: FormularioDeMelhoriaProps & { melhoria: Melhoria | null }) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: paraCampos(melhoria),
  })

  const processos = useQuery({
    queryKey: ['processos-para-select', empresaId],
    enabled: !!empresaId,
    queryFn: () => processosParaSelect(empresaId!),
  })

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  const pessoas = useQuery({
    queryKey: chaves.perfis(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPerfisDaEmpresa(empresaId!),
  })

  // Excluir melhoria é gate de `processo.delete` no banco, não de
  // `melhoria.edit`: quem só edita não pode apagar o histórico dos tollgates.
  const podeExcluir = podeFazer('processo.delete')

  return (
    <PainelDeDetalhe
      aberto
      largura="larga"
      aoFechar={aoFechar}
      titulo={melhoria ? melhoria.nome : 'Novo projeto de melhoria'}
      origem={
        melhoria
          ? `Quadro DMAIC de ${empresaAtiva?.nome_fantasia} · editando`
          : `Quadro DMAIC de ${empresaAtiva?.nome_fantasia} · cadastro`
      }
      acoes={
        <>
          {melhoria && aoExcluir && podeExcluir && (
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
          <Button size="sm" form="form-melhoria" type="submit" disabled={salvando}>
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {melhoria ? 'Salvar' : 'Abrir melhoria'}
          </Button>
        </>
      }
    >
      <form
        id="form-melhoria"
        onSubmit={form.handleSubmit((c) => aoSalvar(paraApi(c)))}
        className="space-y-5"
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
          <Label htmlFor="ml-nome">Nome do projeto de melhoria</Label>
          <Input
            id="ml-nome"
            placeholder="Ex.: Reduzir o retrabalho na conferência fiscal"
            aria-invalid={!!form.formState.errors.nome}
            {...form.register('nome')}
          />
          {form.formState.errors.nome && (
            <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Processo"
            htmlFor="ml-processo"
            ajuda="Sem processo, a melhoria não aparece no inventário como trabalho em andamento."
          >
            <Controller
              control={form.control}
              name="processo_id"
              render={({ field }) => (
                <SearchableSelect
                  id="ml-processo"
                  options={processos.data ?? []}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Sem processo ligado"
                />
              )}
            />
          </Campo>

          <Campo rotulo="Área" htmlFor="ml-area">
            <Controller
              control={form.control}
              name="area_id"
              render={({ field }) => (
                <SearchableSelect
                  id="ml-area"
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
          </Campo>

          <Campo rotulo="Método" htmlFor="ml-metodo">
            <Controller
              control={form.control}
              name="metodo"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ml-metodo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METODOS_DE_MELHORIA.map((m) => (
                      <SelectItem key={m} value={m}>
                        {rotulo(rotulos.metodo_melhoria, m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>

          <Campo rotulo="Status" htmlFor="ml-status">
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ml-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_DE_MELHORIA.map((s) => (
                      <SelectItem key={s} value={s}>
                        {rotulo(rotulos.status_melhoria, s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>

          <Campo
            rotulo="Belt responsável"
            htmlFor="ml-belt"
            ajuda="O belt é quem responde pelos tollgates desta melhoria."
          >
            <Controller
              control={form.control}
              name="belt_user_id"
              render={({ field }) => (
                <SearchableSelect
                  id="ml-belt"
                  options={pessoas.data ?? []}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Ainda sem belt"
                />
              )}
            />
          </Campo>

          <Campo
            rotulo="Ganho estimado (R$)"
            htmlFor="ml-ganho"
            ajuda="Estimativa de abertura. Deixe em branco enquanto não houver número defensável."
          >
            <Input
              id="ml-ganho"
              inputMode="decimal"
              placeholder="opcional"
              aria-invalid={!!form.formState.errors.ganho_estimado}
              {...form.register('ganho_estimado')}
            />
            {form.formState.errors.ganho_estimado && (
              <p className="text-xs text-destructive">
                {form.formState.errors.ganho_estimado.message}
              </p>
            )}
          </Campo>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ml-problema">Problema</Label>
          <textarea
            id="ml-problema"
            rows={3}
            placeholder="O que está acontecendo hoje, com número: quanto, onde e desde quando"
            className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            {...form.register('problema')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ml-meta">Meta SMART</Label>
          <textarea
            id="ml-meta"
            rows={3}
            placeholder="Ex.: reduzir o retrabalho de 12% para 5% até 31/12, medido pelo indicador Y do processo"
            className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            {...form.register('meta_smart')}
          />
        </div>

        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Prazos
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Início previsto" htmlFor="ml-inicio">
              <Input id="ml-inicio" type="date" {...form.register('inicio_previsto')} />
            </Campo>
            <Campo rotulo="Término previsto" htmlFor="ml-termino">
              <Input id="ml-termino" type="date" {...form.register('termino_previsto')} />
              {form.formState.errors.termino_previsto && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.termino_previsto.message}
                </p>
              )}
            </Campo>
          </div>
        </fieldset>

        <div className="flex items-start gap-2.5 rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p>
              O ganho realizado não é preenchido aqui: ele só pode ser registrado na fase
              Control, e o banco zera o campo enquanto a melhoria estiver antes dela.
            </p>
            {!melhoria && (
              <p>
                Toda melhoria nasce na fase Define. As fases seguintes são liberadas pelo
                quadro, uma a uma, com o tollgate anterior concluído.
              </p>
            )}
          </div>
        </div>
      </form>
    </PainelDeDetalhe>
  )
}

function Campo({
  rotulo: r,
  htmlFor,
  ajuda,
  children,
}: {
  rotulo: string
  htmlFor: string
  ajuda?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{r}</Label>
      {children}
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  )
}
