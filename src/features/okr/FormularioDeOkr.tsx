import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleAlert, LoaderCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Button } from '@/components/ui/button'
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
  atualizarOkr,
  criarOkr,
  excluirOkr,
  listarObjetivos,
  listarPerspectivas,
  NIVEIS_DE_OKR,
  STATUS_DE_OKR,
  type DadosDoOkr,
  type Okr,
} from '@/features/okr/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { anoAtual, rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

/** O Select do shadcn não aceita valor vazio, então estas duas viram sentinela. */
const SEM_PERSPECTIVA = 'sem-perspectiva'
const ANUAL = 'anual'

const TRIMESTRES = ['1', '2', '3', '4'] as const

const esquema = z.object({
  titulo: z.string().trim().min(3, 'Dê um título com pelo menos 3 caracteres'),
  descricao: z.string(),
  nivel: z.string(),
  area_id: z.string().nullable(),
  owner_user_id: z.string().nullable(),
  objetivo_estrategico_id: z.string().nullable(),
  perspectiva_id: z.string(),
  ano: z.string().regex(/^\d{4}$/, 'Informe o ano com quatro dígitos'),
  trimestre: z.string(),
  status: z.string(),
})

type Campos = z.infer<typeof esquema>

export interface FormularioDeOkrProps {
  /** OKR em edição, ou null para criar. */
  okr: Okr | null
  /**
   * Pré-preenchimentos de quem abriu o formulário. O mapa estratégico cria o
   * OKR já ligado ao objetivo clicado, à perspectiva dele e no nível corporativo.
   */
  objetivoEstrategicoId?: string | null
  perspectivaId?: string | null
  nivel?: string
  areaId?: string | null
  ownerUserId?: string | null
  /** OKR pai, quando este nasce de um desdobramento. */
  parentOkrId?: string | null
  ano?: number
  /** Proveniência no cabeçalho: de que tela este painel foi aberto. */
  origem?: string
  aoFechar: () => void
  /** Recebe a linha gravada, ou null quando o OKR foi excluído. */
  aoConcluir: (okr: Okr | null) => void
}

/**
 * OKR em SHEET, e não em dialog: o usuário precisa comparar o que está
 * cadastrando com o mapa (ou com a árvore) que ficou atrás, e fechar tem que
 * devolver a tela exatamente como estava.
 */
export function FormularioDeOkr({
  okr,
  objetivoEstrategicoId = null,
  perspectivaId = null,
  nivel = 'gerencia',
  areaId = null,
  ownerUserId = null,
  parentOkrId = null,
  ano,
  origem,
  aoFechar,
  aoConcluir,
}: FormularioDeOkrProps) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      titulo: okr?.titulo ?? '',
      descricao: okr?.descricao ?? '',
      nivel: okr?.nivel ?? nivel,
      area_id: okr?.area_id ?? areaId,
      owner_user_id: okr?.owner_user_id ?? ownerUserId,
      objetivo_estrategico_id: okr?.objetivo_estrategico_id ?? objetivoEstrategicoId,
      perspectiva_id: okr?.perspectiva_id ?? perspectivaId ?? SEM_PERSPECTIVA,
      ano: String(okr?.ano ?? ano ?? anoAtual()),
      trimestre: okr?.trimestre ? String(okr.trimestre) : ANUAL,
      status: okr?.status ?? 'ativo',
    },
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

  const objetivos = useQuery({
    queryKey: chaves.objetivos(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarObjetivos(empresaId!),
  })

  const perspectivas = useQuery({
    queryKey: chaves.perspectivas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPerspectivas(empresaId!),
  })

  const salvar = useMutation({
    mutationFn: (dados: DadosDoOkr) =>
      okr ? atualizarOkr(okr.id, dados) : criarOkr(empresaId!, dados),
    onSuccess: (linha) => aoConcluir(linha),
  })

  const remover = useMutation({
    mutationFn: (id: string) => excluirOkr(id),
    onSuccess: () => aoConcluir(null),
  })

  const semObjetivo = !useWatch({ control: form.control, name: 'objetivo_estrategico_id' })
  const semDono = !useWatch({ control: form.control, name: 'owner_user_id' })

  const erro = salvar.error ?? remover.error
  const podeExcluir = podeFazer('okr.delete')

  function enviar(c: Campos) {
    salvar.mutate({
      titulo: c.titulo.trim(),
      descricao: vazioVirarNulo(c.descricao),
      nivel: c.nivel,
      area_id: c.area_id,
      owner_user_id: c.owner_user_id,
      objetivo_estrategico_id: c.objetivo_estrategico_id,
      perspectiva_id: c.perspectiva_id === SEM_PERSPECTIVA ? null : c.perspectiva_id,
      parent_okr_id: okr?.parent_okr_id ?? parentOkrId,
      ano: Number(c.ano),
      trimestre: c.trimestre === ANUAL ? null : Number(c.trimestre),
      status: c.status,
    })
  }

  return (
    <PainelDeDetalhe
      aberto
      largura="larga"
      aoFechar={aoFechar}
      titulo={okr ? okr.titulo : 'Novo OKR'}
      origem={
        origem ??
        (okr
          ? `${rotulo(rotulos.nivel_okr, okr.nivel)} · editando`
          : `OKR de ${empresaAtiva?.nome_fantasia ?? 'empresa ativa'} · cadastro`)
      }
      acoes={
        <>
          {okr && podeExcluir && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (confirmandoExclusao ? remover.mutate(okr.id) : setConfirmandoExclusao(true))}
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
          <Button size="sm" type="submit" form="form-okr" disabled={salvar.isPending}>
            {salvar.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {okr ? 'Salvar' : 'Criar OKR'}
          </Button>
        </>
      }
    >
      <form id="form-okr" onSubmit={form.handleSubmit(enviar)} className="space-y-5" noValidate>
        {erro && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
          >
            {mensagemDeErro(erro)}
          </p>
        )}

        {confirmandoExclusao && okr && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
          >
            <p className="font-semibold">Excluir "{okr.titulo}"?</p>
            <p className="pt-0.5">
              Os key results deste OKR vão junto, com todo o histórico de check-in. Os OKRs
              que desdobram dele não são apagados, mas ficam soltos, sem pai na árvore.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ok-titulo">Objetivo do OKR</Label>
          <Input
            id="ok-titulo"
            placeholder="Ex.: Reduzir o custo de servir sem perder nota de atendimento"
            aria-invalid={!!form.formState.errors.titulo}
            {...form.register('titulo')}
          />
          {form.formState.errors.titulo && (
            <p className="text-xs text-destructive">{form.formState.errors.titulo.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ok-descricao">Descrição</Label>
          <textarea
            id="ok-descricao"
            rows={3}
            placeholder="O que muda na empresa se este OKR for atingido"
            className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            {...form.register('descricao')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nível" htmlFor="ok-nivel">
            <Controller
              control={form.control}
              name="nivel"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ok-nivel" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NIVEIS_DE_OKR.map((n) => (
                      <SelectItem key={n} value={n}>
                        {rotulo(rotulos.nivel_okr, n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>

          <Campo rotulo="Status" htmlFor="ok-status">
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ok-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_DE_OKR.map((s) => (
                      <SelectItem key={s} value={s}>
                        {rotulo(rotulos.status_okr, s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>

          <Campo rotulo="Área" htmlFor="ok-area">
            <Controller
              control={form.control}
              name="area_id"
              render={({ field }) => (
                <SearchableSelect
                  id="ok-area"
                  options={(areas.data ?? []).map((a) => ({
                    value: a.id,
                    label: a.nome,
                    description: rotulo(rotulos.tipo_area, a.tipo),
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Sem área (vale para a empresa toda)"
                />
              )}
            />
            <FalhaNaLista erro={areas.error} oQue="as áreas" />
          </Campo>

          <Campo rotulo="Dono do OKR" htmlFor="ok-owner">
            <Controller
              control={form.control}
              name="owner_user_id"
              render={({ field }) => (
                <SearchableSelect
                  id="ok-owner"
                  options={pessoas.data ?? []}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Ainda sem dono"
                />
              )}
            />
            <FalhaNaLista erro={pessoas.error} oQue="as pessoas da empresa" />
          </Campo>

          <Campo rotulo="Ano do ciclo" htmlFor="ok-ano">
            <Input
              id="ok-ano"
              inputMode="numeric"
              aria-invalid={!!form.formState.errors.ano}
              {...form.register('ano')}
            />
            {form.formState.errors.ano && (
              <p className="text-xs text-destructive">{form.formState.errors.ano.message}</p>
            )}
          </Campo>

          <Campo
            rotulo="Trimestre"
            htmlFor="ok-trimestre"
            ajuda="Anual é o OKR que atravessa o ano inteiro; o trimestral é o recorte que entra na rotina de check-in."
          >
            <Controller
              control={form.control}
              name="trimestre"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ok-trimestre" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANUAL}>Anual</SelectItem>
                    {TRIMESTRES.map((t) => (
                      <SelectItem key={t} value={t}>
                        T{t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Origem estratégica
          </legend>

          <Campo
            rotulo="Objetivo estratégico que este OKR persegue"
            htmlFor="ok-objetivo"
            ajuda="É esta ligação que faz o OKR aparecer no mapa, dentro do objetivo que ele serve."
          >
            <Controller
              control={form.control}
              name="objetivo_estrategico_id"
              render={({ field }) => (
                <SearchableSelect
                  id="ok-objetivo"
                  options={(objetivos.data ?? []).map((o) => ({
                    value: o.id,
                    label: o.titulo,
                    description: o.ciclo,
                    badge: o.is_estrela_do_norte ? 'Estrela do Norte' : undefined,
                  }))}
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v)
                    // A perspectiva acompanha o objetivo: um OKR que serve um
                    // objetivo de Clientes não é de outra perspectiva. Fica
                    // editável logo abaixo para o caso raro em que difere.
                    const escolhido = objetivos.data?.find((o) => o.id === v)
                    if (escolhido?.perspectiva_id) {
                      form.setValue('perspectiva_id', escolhido.perspectiva_id)
                    }
                  }}
                  placeholder="Não ligado a nenhum objetivo"
                />
              )}
            />
            <FalhaNaLista erro={objetivos.error} oQue="os objetivos estratégicos" />
          </Campo>

          <Campo rotulo="Perspectiva do BSC" htmlFor="ok-perspectiva">
            <Controller
              control={form.control}
              name="perspectiva_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ok-perspectiva" className="w-full">
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
            <FalhaNaLista erro={perspectivas.error} oQue="as perspectivas" />
          </Campo>
        </fieldset>

        {/* Não bloqueia: às vezes o OKR é registrado antes de ter dono definido,
            e travar o cadastro só deixaria a informação fora do sistema. */}
        {(semObjetivo || semDono) && (
          <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Este OKR vai nascer incompleto.</p>
              <p className="pt-0.5">
                Falta {semObjetivo && 'o objetivo estratégico de origem'}
                {semObjetivo && semDono && ' e '}
                {semDono && 'o dono'}. Dá para salvar assim, mas
                {semObjetivo && ' ele não aparece em nenhum card do mapa'}
                {semObjetivo && semDono && ' e'}
                {semDono && ' ninguém é cobrado pelo check-in'}.
              </p>
            </div>
          </div>
        )}
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

/**
 * Lista vazia por falha não é lista vazia. Sem este aviso, o usuário conclui
 * que a empresa não tem áreas (ou pessoas, ou objetivos) e salva errado.
 */
function FalhaNaLista({ erro, oQue }: { erro: unknown; oQue: string }) {
  if (!erro) return null
  return (
    <p role="alert" className="text-xs text-destructive">
      Não foi possível carregar {oQue}, então esta lista está vazia por falha, não por
      ausência de cadastro. {mensagemDeErro(erro)}
    </p>
  )
}
