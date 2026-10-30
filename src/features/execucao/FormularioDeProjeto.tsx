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
  CATEGORIAS_DE_PROJETO,
  okrsParaVinculo,
  PRIORIDADES,
  STATUS_DE_PROJETO,
  type DadosDoProjeto,
  type Projeto,
} from '@/features/execucao/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { anoAtual, rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'

const esquema = z
  .object({
    nome: z.string().trim().min(3, 'Dê um nome com pelo menos 3 caracteres'),
    descricao: z.string().trim(),
    area_id: z.string().nullable(),
    okr_id: z.string().nullable(),
    categoria: z.string(),
    responsavel_user_id: z.string().nullable(),
    patrocinador_user_id: z.string().nullable(),
    status: z.string(),
    prioridade: z.string(),
    inicio_previsto: z.string(),
    termino_previsto: z.string(),
    inicio_real: z.string(),
    termino_real: z.string(),
  })
  .refine((v) => !v.inicio_previsto || !v.termino_previsto || v.inicio_previsto <= v.termino_previsto, {
    path: ['termino_previsto'],
    message: 'O término não pode ser antes do início',
  })
  .refine((v) => !v.inicio_real || !v.termino_real || v.inicio_real <= v.termino_real, {
    path: ['termino_real'],
    message: 'O término real não pode ser antes do início real',
  })

type Campos = z.infer<typeof esquema>

function paraCampos(projeto: Projeto | null): Campos {
  return {
    nome: projeto?.nome ?? '',
    descricao: projeto?.descricao ?? '',
    area_id: projeto?.area_id ?? null,
    okr_id: projeto?.okr_id ?? null,
    categoria: projeto?.categoria ?? 'gestao_projetos',
    responsavel_user_id: projeto?.responsavel_user_id ?? null,
    patrocinador_user_id: projeto?.patrocinador_user_id ?? null,
    status: projeto?.status ?? 'planejado',
    prioridade: projeto?.prioridade ?? 'media',
    inicio_previsto: projeto?.inicio_previsto ?? '',
    termino_previsto: projeto?.termino_previsto ?? '',
    inicio_real: projeto?.inicio_real ?? '',
    termino_real: projeto?.termino_real ?? '',
  }
}

function paraApi(c: Campos): DadosDoProjeto {
  return {
    nome: c.nome.trim(),
    descricao: vazioVirarNulo(c.descricao),
    area_id: c.area_id,
    okr_id: c.okr_id,
    categoria: c.categoria,
    // O tipo acompanha a categoria: iniciativa de IA é o que o PRD chama de
    // "gestão de projetos e de IA", e não faz sentido pedir os dois ao usuário.
    tipo: c.categoria === 'ia' ? 'iniciativa_ia' : 'projeto',
    responsavel_user_id: c.responsavel_user_id,
    patrocinador_user_id: c.patrocinador_user_id,
    status: c.status,
    prioridade: c.prioridade,
    inicio_previsto: vazioVirarNulo(c.inicio_previsto),
    termino_previsto: vazioVirarNulo(c.termino_previsto),
    inicio_real: vazioVirarNulo(c.inicio_real),
    termino_real: vazioVirarNulo(c.termino_real),
  }
}

export interface FormularioDeProjetoProps {
  projeto: Projeto | null
  aoFechar: () => void
  aoSalvar: (dados: DadosDoProjeto) => void
  aoExcluir?: () => void
  salvando: boolean
  excluindo?: boolean
  erro: string | null
}

export function FormularioDeProjeto({
  projeto,
  aoFechar,
  aoSalvar,
  aoExcluir,
  salvando,
  excluindo,
  erro,
}: FormularioDeProjetoProps) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: paraCampos(projeto),
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

  const okrs = useQuery({
    queryKey: ['okrs-para-vinculo', empresaId, anoAtual()],
    enabled: !!empresaId,
    queryFn: () => okrsParaVinculo(empresaId!, anoAtual()),
  })

  // `useWatch` em vez de `form.watch`: assina só estes dois campos e não
  // devolve função nova a cada render, que é o que impede a memoização.
  const semResponsavel = !useWatch({ control: form.control, name: 'responsavel_user_id' })
  const semPrazo = !useWatch({ control: form.control, name: 'termino_previsto' })

  return (
    <PainelDeDetalhe
      aberto
      largura="larga"
      aoFechar={aoFechar}
      titulo={projeto ? projeto.nome : 'Novo projeto'}
      origem={
        projeto
          ? `Portfólio de ${empresaAtiva?.nome_fantasia} · editando`
          : `Portfólio de ${empresaAtiva?.nome_fantasia} · cadastro`
      }
      acoes={
        <>
          {projeto && aoExcluir && podeFazer('projeto.delete') && (
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
          <Button
            size="sm"
            form="form-projeto"
            type="submit"
            disabled={salvando}
          >
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {projeto ? 'Salvar' : 'Criar projeto'}
          </Button>
        </>
      }
    >
      <form
        id="form-projeto"
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
          <Label htmlFor="pj-nome">Nome do projeto</Label>
          <Input
            id="pj-nome"
            placeholder="Ex.: Fechamento contábil em 6 dias úteis"
            aria-invalid={!!form.formState.errors.nome}
            {...form.register('nome')}
          />
          {form.formState.errors.nome && (
            <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pj-descricao">Descrição</Label>
          <textarea
            id="pj-descricao"
            rows={3}
            placeholder="O que este projeto entrega, e por quê"
            className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            {...form.register('descricao')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Área" htmlFor="pj-area">
            <Controller
              control={form.control}
              name="area_id"
              render={({ field }) => (
                <SearchableSelect
                  id="pj-area"
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

          <Campo rotulo="Categoria" htmlFor="pj-categoria">
            <Controller
              control={form.control}
              name="categoria"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="pj-categoria" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_DE_PROJETO.map((c) => (
                      <SelectItem key={c} value={c}>
                        {rotulo(rotulos.categoria_projeto, c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>

          <Campo rotulo="Responsável" htmlFor="pj-responsavel">
            <Controller
              control={form.control}
              name="responsavel_user_id"
              render={({ field }) => (
                <SearchableSelect
                  id="pj-responsavel"
                  options={pessoas.data ?? []}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Ainda sem responsável"
                />
              )}
            />
          </Campo>

          <Campo rotulo="Patrocinador" htmlFor="pj-patrocinador">
            <Controller
              control={form.control}
              name="patrocinador_user_id"
              render={({ field }) => (
                <SearchableSelect
                  id="pj-patrocinador"
                  options={pessoas.data ?? []}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Sem patrocinador"
                />
              )}
            />
          </Campo>

          <Campo rotulo="Status" htmlFor="pj-status">
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="pj-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_DE_PROJETO.map((s) => (
                      <SelectItem key={s} value={s}>
                        {rotulo(rotulos.status_projeto, s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>

          <Campo rotulo="Prioridade" htmlFor="pj-prioridade">
            <Controller
              control={form.control}
              name="prioridade"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="pj-prioridade" className="w-full">
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
          </Campo>
        </div>

        <Campo
          rotulo="OKR que este projeto move"
          htmlFor="pj-okr"
          ajuda="Sem esta ligação o projeto vira trabalho solto: ninguém consegue responder que objetivo ele serve."
        >
          <Controller
            control={form.control}
            name="okr_id"
            render={({ field }) => (
              <SearchableSelect
                id="pj-okr"
                options={okrs.data ?? []}
                value={field.value}
                onChange={field.onChange}
                placeholder="Não ligado a nenhum OKR"
              />
            )}
          />
        </Campo>

        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Prazos
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Início previsto" htmlFor="pj-inicio">
              <Input id="pj-inicio" type="date" {...form.register('inicio_previsto')} />
            </Campo>
            <Campo rotulo="Término previsto" htmlFor="pj-termino">
              <Input id="pj-termino" type="date" {...form.register('termino_previsto')} />
              {form.formState.errors.termino_previsto && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.termino_previsto.message}
                </p>
              )}
            </Campo>
            <Campo rotulo="Início real" htmlFor="pj-inicio-real">
              <Input id="pj-inicio-real" type="date" {...form.register('inicio_real')} />
            </Campo>
            <Campo rotulo="Término real" htmlFor="pj-termino-real">
              <Input id="pj-termino-real" type="date" {...form.register('termino_real')} />
              {form.formState.errors.termino_real && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.termino_real.message}
                </p>
              )}
            </Campo>
          </div>
        </fieldset>

        {/* O PRD diz que projeto órfão não deveria existir. O aviso é claro,
            mas não bloqueia: às vezes o projeto é registrado antes de ter dono,
            e travar o cadastro só faria a informação ficar fora do sistema. */}
        {(semResponsavel || semPrazo) && (
          <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">
                Este projeto vai entrar como órfão no painel.
              </p>
              <p className="pt-0.5">
                Falta {semResponsavel && 'responsável'}
                {semResponsavel && semPrazo && ' e '}
                {semPrazo && 'término previsto'}. Dá para salvar assim, mas ele aparece
                contado em "projetos órfãos" no painel executivo até ser resolvido.
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
