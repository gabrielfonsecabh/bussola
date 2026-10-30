import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, LoaderCircle, Trash2 } from 'lucide-react'
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
  PERIODICIDADES,
  STATUS_DE_PROCESSO,
  TIPOS_DE_PROCESSO,
  type DadosDoProcesso,
  type Processo,
} from '@/features/processos/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'

const NIVEIS_DE_MATURIDADE = ['1', '2', '3', '4', '5'] as const

const esquema = z.object({
  nome: z.string().trim().min(3, 'Dê um nome com pelo menos 3 caracteres'),
  descricao: z.string().trim(),
  area_id: z.string().nullable(),
  dono_user_id: z.string().nullable(),
  tipo: z.string(),
  nivel_maturidade: z.string(),
  status: z.string(),
  categoria: z.string(),
  periodicidade: z.string().nullable(),
  prazo_referencia: z.string(),
  pendencia_de_mapeamento: z.string(),
})

type Campos = z.infer<typeof esquema>

function paraCampos(processo: Processo | null): Campos {
  return {
    nome: processo?.nome ?? '',
    descricao: processo?.descricao ?? '',
    area_id: processo?.area_id ?? null,
    dono_user_id: processo?.dono_user_id ?? null,
    tipo: processo?.tipo ?? 'primario',
    nivel_maturidade: String(processo?.nivel_maturidade ?? 1),
    status: processo?.status ?? 'rascunho',
    categoria: processo?.categoria ?? '',
    periodicidade: processo?.periodicidade ?? null,
    prazo_referencia: processo?.prazo_referencia ?? '',
    pendencia_de_mapeamento: processo?.pendencia_de_mapeamento ?? '',
  }
}

function paraApi(c: Campos): DadosDoProcesso {
  return {
    nome: c.nome.trim(),
    descricao: vazioVirarNulo(c.descricao),
    area_id: c.area_id,
    dono_user_id: c.dono_user_id,
    tipo: c.tipo,
    nivel_maturidade: Number(c.nivel_maturidade),
    status: c.status,
    categoria: vazioVirarNulo(c.categoria),
    periodicidade: c.periodicidade,
    prazo_referencia: vazioVirarNulo(c.prazo_referencia),
    pendencia_de_mapeamento: vazioVirarNulo(c.pendencia_de_mapeamento),
    // `periodicidade_origem` NÃO entra aqui de propósito: é o que a fonte
    // escreveu, e reclassificar não pode reescrever a origem.
  }
}

export interface FormularioDeProcessoProps {
  /** Processo em edição, ou null para cadastrar. */
  processo: Processo | null
  aoFechar: () => void
  aoSalvar: (dados: DadosDoProcesso) => void
  aoExcluir?: () => void
  salvando: boolean
  excluindo?: boolean
  erro: string | null
}

/**
 * Cadastro de processo em SHEET: o usuário chega aqui do inventário e precisa
 * continuar vendo a linha que estava lendo, para não recadastrar o que já existe.
 */
export function FormularioDeProcesso({
  processo,
  aoFechar,
  aoSalvar,
  aoExcluir,
  salvando,
  excluindo,
  erro,
}: FormularioDeProcessoProps) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: paraCampos(processo),
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

  // `useWatch` assina só este campo: `form.watch` devolveria função nova a
  // cada render e derrubaria a memoização do formulário inteiro.
  const semDono = !useWatch({ control: form.control, name: 'dono_user_id' })

  return (
    <PainelDeDetalhe
      aberto
      largura="larga"
      aoFechar={aoFechar}
      titulo={processo ? processo.nome : 'Novo processo'}
      origem={
        processo
          ? `Inventário de processos de ${empresaAtiva?.nome_fantasia} · editando`
          : `Inventário de processos de ${empresaAtiva?.nome_fantasia} · cadastro`
      }
      acoes={
        <>
          {processo && aoExcluir && podeFazer('processo.delete') && (
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
          <Button size="sm" form="form-processo" type="submit" disabled={salvando}>
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {processo ? 'Salvar' : 'Criar processo'}
          </Button>
        </>
      }
    >
      <form
        id="form-processo"
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
          <Label htmlFor="pr-nome">Nome do processo</Label>
          <Input
            id="pr-nome"
            placeholder="Ex.: Faturamento mensal de contratos"
            aria-invalid={!!form.formState.errors.nome}
            {...form.register('nome')}
          />
          {form.formState.errors.nome && (
            <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pr-descricao">Descrição</Label>
          <textarea
            id="pr-descricao"
            rows={3}
            placeholder="O que este processo transforma, do gatilho até a entrega"
            className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            {...form.register('descricao')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Área" htmlFor="pr-area">
            <Controller
              control={form.control}
              name="area_id"
              render={({ field }) => (
                <SearchableSelect
                  id="pr-area"
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

          <Campo
            rotulo="Dono do processo"
            htmlFor="pr-dono"
            ajuda="Quem responde pelo resultado, não quem executa a tarefa."
          >
            <Controller
              control={form.control}
              name="dono_user_id"
              render={({ field }) => (
                <SearchableSelect
                  id="pr-dono"
                  options={pessoas.data ?? []}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Ainda sem dono"
                />
              )}
            />
          </Campo>

          <Campo rotulo="Tipo" htmlFor="pr-tipo">
            <Controller
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="pr-tipo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_DE_PROCESSO.map((t) => (
                      <SelectItem key={t} value={t}>
                        {rotulo(rotulos.tipo_processo, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>

          <Campo rotulo="Status" htmlFor="pr-status">
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="pr-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_DE_PROCESSO.map((s) => (
                      <SelectItem key={s} value={s}>
                        {rotulo(rotulos.status_processo, s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>
        </div>

        <Campo
          rotulo="Nível de maturidade"
          htmlFor="pr-maturidade"
          ajuda="Escala de 1 a 5: no 1 o processo só existe na cabeça de quem executa, no 5 ele é medido e melhorado com dado."
        >
          <Controller
            control={form.control}
            name="nivel_maturidade"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="pr-maturidade" className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NIVEIS_DE_MATURIDADE.map((n) => (
                    <SelectItem key={n} value={n}>
                      Nível {n} de 5
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Campo>

        {/* A rotina: quando o processo roda e até quando. É o que separa o
            inventário de uma lista de nomes, e é o que a planilha da área
            costuma trazer de mais concreto. */}
        <fieldset className="space-y-4 rounded-lg border border-border p-4">
          <legend className="px-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Rotina
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Categoria"
              htmlFor="pr-categoria"
              ajuda="Agrupamento que a própria área usa, por exemplo Contábil, Fiscal ou Legalização."
            >
              <Input id="pr-categoria" placeholder="opcional" {...form.register('categoria')} />
            </Campo>

            <Campo
              rotulo="Cadência"
              htmlFor="pr-periodicidade"
              ajuda="Deixe em branco quando ainda não se sabe. Cadência desconhecida não é sob demanda."
            >
              <Controller
                control={form.control}
                name="periodicidade"
                render={({ field }) => (
                  <SearchableSelect
                    id="pr-periodicidade"
                    options={PERIODICIDADES.map((v) => ({
                      value: v,
                      label: rotulo(rotulos.periodicidade, v),
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Ainda não sei"
                  />
                )}
              />
            </Campo>
          </div>

          <Campo
            rotulo="Prazo"
            htmlFor="pr-prazo"
            ajuda='Como a área enuncia o prazo: "dia 5", "do 1º ao 3º dia útil", "15 dias antes do vencimento". É regra de calendário, não data.'
          >
            <Input
              id="pr-prazo"
              placeholder="opcional"
              {...form.register('prazo_referencia')}
            />
          </Campo>

          {/* O texto da fonte fica visível porque a classificação acima pode ter
              ficado nula justamente por causa dele, e quem edita precisa ver o
              motivo em vez de achar que faltou preencher. */}
          {processo?.periodicidade_origem && (
            <p className="text-xs text-muted-foreground">
              A planilha de origem dizia:{' '}
              <span className="font-medium text-foreground">
                {processo.periodicidade_origem}
              </span>
              {!processo.periodicidade &&
                '. Não deu para classificar isso numa cadência única, por isso o campo acima está vazio.'}
            </p>
          )}
        </fieldset>

        {processo?.pendencia_de_mapeamento && (
          <Campo
            rotulo="Pendência trazida da planilha"
            htmlFor="pr-pendencia"
            ajuda="Pergunta ou tarefa que veio colada no nome da atividade. Apague quando estiver resolvida: enquanto tiver texto aqui, o processo aparece como mapeamento parado por decisão pendente."
          >
            <Input
              id="pr-pendencia"
              {...form.register('pendencia_de_mapeamento')}
            />
          </Campo>
        )}

        {/* Processo sem dono é registro sem responsável, mas travar o cadastro
            faria a informação ficar fora do sistema, que é pior. */}
        {semDono && (
          <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Este processo vai ficar sem dono.</p>
              <p className="pt-0.5">
                Sem dono não há quem responda pelo resultado nem quem aprove uma mudança
                nele. Dá para salvar assim, e ele aparece contado em "sem dono" no
                inventário até alguém assumir.
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
