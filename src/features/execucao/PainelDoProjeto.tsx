import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, CircleCheck, LoaderCircle, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  atividadesDoProjeto,
  atualizarAtividade,
  atualizarProjeto,
  criarAtividade,
  excluirAtividade,
  excluirProjeto,
  moverAtividade,
  type Atividade,
  type DadosDaAtividade,
  type DadosDoProjeto,
  type ProjetoComContexto,
} from '@/features/execucao/api'
import { FormularioDeAtividade } from '@/features/execucao/FormularioDeAtividade'
import { FormularioDeProjeto } from '@/features/execucao/FormularioDeProjeto'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'
import { cn } from '@/lib/utils'

const TRIMESTRES = [1, 2, 3, 4] as const

type NoDaAtividade = Atividade & { filhas: NoDaAtividade[]; profundidade: number }

/**
 * Monta a hierarquia das atividades. Uma anual quebra em trimestrais, que
 * quebram em mensais: é o mesmo registro, recortado por horizonte.
 */
function montarHierarquia(atividades: Atividade[]): NoDaAtividade[] {
  const porId = new Map<string, NoDaAtividade>(
    atividades.map((a) => [a.id, { ...a, filhas: [], profundidade: 0 }]),
  )
  const raizes: NoDaAtividade[] = []

  for (const a of atividades) {
    const no = porId.get(a.id)
    if (!no) continue
    const mae = a.parent_atividade_id ? porId.get(a.parent_atividade_id) : null
    if (mae) mae.filhas.push(no)
    else raizes.push(no)
  }

  aprofundar(raizes, 0)
  return raizes
}

function aprofundar(nos: NoDaAtividade[], nivel: number) {
  for (const no of nos) {
    no.profundidade = nivel
    aprofundar(no.filhas, nivel + 1)
  }
}

function achatar(nos: NoDaAtividade[]): NoDaAtividade[] {
  return nos.flatMap((no) => [no, ...achatar(no.filhas)])
}

/**
 * Detalhe do projeto com a AÇÃO dentro dele.
 *
 * Um painel só de leitura manda o usuário corrigir o problema em outro lugar
 * e voltar desconfiando da tela. Aqui ele edita o projeto, cria e conclui
 * atividade no mesmo lugar em que diagnosticou.
 */
export function PainelDoProjeto({
  projeto,
  aoFechar,
}: {
  projeto: ProjetoComContexto
  aoFechar: () => void
}) {
  const { podeFazer } = useEmpresa()
  const queryClient = useQueryClient()
  const podeEditar = podeFazer('projeto.edit')
  const podeMover = podeFazer('atividade.edit')

  const [editandoProjeto, setEditandoProjeto] = useState(false)
  const [atividadeEmEdicao, setAtividadeEmEdicao] = useState<Atividade | null>(null)
  const [criandoAtividade, setCriandoAtividade] = useState(false)

  const atividades = useQuery({
    queryKey: chaves.projeto(projeto.id),
    queryFn: () => atividadesDoProjeto(projeto.id),
  })

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chaves.projeto(projeto.id) })
    void queryClient.invalidateQueries({ queryKey: ['projetos'] })
    void queryClient.invalidateQueries({ queryKey: ['portfolio-resumo'] })
    void queryClient.invalidateQueries({ queryKey: ['cronograma'] })
    void queryClient.invalidateQueries({ queryKey: ['kanban'] })
    void queryClient.invalidateQueries({ queryKey: ['minhas-atividades'] })
    void queryClient.invalidateQueries({ queryKey: ['painel-executivo'] })
  }

  const salvarProjeto = useMutation({
    mutationFn: (dados: DadosDoProjeto) => atualizarProjeto(projeto.id, dados),
    onSuccess: () => {
      setEditandoProjeto(false)
      salvarProjeto.reset()
      invalidar()
    },
  })

  const removerProjeto = useMutation({
    mutationFn: () => excluirProjeto(projeto.id),
    onSuccess: () => {
      invalidar()
      aoFechar()
    },
  })

  const mudarStatus = useMutation({
    mutationFn: (status: string) => atualizarProjeto(projeto.id, { status }),
    onSuccess: invalidar,
  })

  const salvarAtividade = useMutation({
    mutationFn: (dados: DadosDaAtividade) =>
      atividadeEmEdicao
        ? atualizarAtividade(atividadeEmEdicao.id, dados)
        : criarAtividade(projeto.company_id, dados),
    onSuccess: () => {
      setAtividadeEmEdicao(null)
      setCriandoAtividade(false)
      salvarAtividade.reset()
      invalidar()
    },
  })

  const removerAtividade = useMutation({
    mutationFn: (id: string) => excluirAtividade(id),
    onSuccess: () => {
      setAtividadeEmEdicao(null)
      removerAtividade.reset()
      invalidar()
    },
  })

  const concluir = useMutation({
    mutationFn: (dados: { id: string; versao: string }) =>
      moverAtividade({ id: dados.id, status: 'concluido', versao: dados.versao }),
    onSuccess: invalidar,
  })

  const linhas = useMemo(() => atividades.data ?? [], [atividades.data])
  const hierarquia = useMemo(() => achatar(montarHierarquia(linhas)), [linhas])
  const concluidas = linhas.filter((a) => a.status === 'concluido').length

  const erroDeAtividade = salvarAtividade.error ?? removerAtividade.error
  const erroDoPainel = mudarStatus.error ?? concluir.error ?? removerProjeto.error

  return (
    <>
      <PainelDeDetalhe
        aberto={!editandoProjeto}
        largura="larga"
        aoFechar={aoFechar}
        titulo={projeto.nome}
        origem={`Portfólio · ${projeto.areas?.nome ?? 'sem área'} · ${rotulo(
          rotulos.categoria_projeto,
          projeto.categoria,
        )}`}
        acoes={
          <>
            {podeEditar && (
              <Button
                variant="outline"
                size="sm"
                className="mr-auto"
                onClick={() => setEditandoProjeto(true)}
              >
                <Pencil className="size-4" aria-hidden />
                Editar projeto
              </Button>
            )}
            {podeEditar && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status</span>
                <Select
                  value={projeto.status}
                  onValueChange={(v) => mudarStatus.mutate(v)}
                  disabled={mudarStatus.isPending}
                >
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(rotulos.status_projeto).map((s) => (
                      <SelectItem key={s} value={s}>
                        {rotulo(rotulos.status_projeto, s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        }
      >
        <div className="space-y-5">
          {erroDoPainel && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {mensagemDeErro(erroDoPainel)}
            </p>
          )}

          {projeto.descricao && (
            <p className="text-sm text-muted-foreground">{projeto.descricao}</p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Item rotulo="Prioridade">
              <Badge
                variant={projeto.prioridade === 'critica' ? 'destructive-subtle' : 'secondary'}
              >
                {rotulo(rotulos.prioridade, projeto.prioridade)}
              </Badge>
            </Item>
            <Item rotulo="Início previsto">
              <span className="text-sm">
                {fmt.data(projeto.inicio_previsto) ?? (
                  <span className="text-xs text-muted-foreground">sem data</span>
                )}
              </span>
            </Item>
            <Item rotulo="Término previsto">
              <span className="text-sm">
                {fmt.data(projeto.termino_previsto) ?? (
                  <span className="text-xs text-warning-subtle-foreground">sem prazo</span>
                )}
              </span>
            </Item>
            <Item rotulo="Atividades">
              <span className="text-sm">
                {concluidas} de {linhas.length}
              </span>
            </Item>
          </div>

          <div>
            <p className="pb-1.5 text-xs font-medium text-muted-foreground">
              Progresso (calculado pelo banco a partir das atividades concluídas)
            </p>
            <BarraDeProgresso
              valor={projeto.progresso_pct}
              tom={projeto.status === 'concluido' ? 'success' : 'primary'}
              rotulo={`Progresso de ${projeto.nome}`}
            />
          </div>

          {projeto.okrs?.titulo ? (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Move o OKR{' '}
              <span className="font-medium text-foreground">{projeto.okrs.titulo}</span>.
            </p>
          ) : (
            <p className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              Este projeto não está ligado a nenhum OKR. Sem essa ligação, não dá para
              responder que objetivo ele serve.
            </p>
          )}

          <div>
            <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Cronograma do ano
            </h3>
            <div className="grid grid-cols-4 gap-1.5">
              {TRIMESTRES.map((t) => {
                const inicio = projeto.inicio_previsto
                  ? Math.ceil((new Date(projeto.inicio_previsto).getMonth() + 1) / 3)
                  : 1
                const fim = projeto.termino_previsto
                  ? Math.ceil((new Date(projeto.termino_previsto).getMonth() + 1) / 3)
                  : 4
                const dentro = t >= inicio && t <= fim
                return (
                  <div
                    key={t}
                    className={
                      dentro
                        ? 'rounded-md bg-primary/20 py-2 text-center text-xs font-medium text-foreground'
                        : 'rounded-md bg-muted py-2 text-center text-xs text-muted-foreground'
                    }
                  >
                    T{t}
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 pb-2">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Atividades
              </h3>
              {podeMover && (
                <Button size="xs" variant="outline" onClick={() => setCriandoAtividade(true)}>
                  <Plus className="size-3" aria-hidden />
                  Nova atividade
                </Button>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <EstadoDaTela
                carregando={atividades.isLoading}
                erro={atividades.error}
                quantidade={linhas.length}
                aoTentarDeNovo={() => void atividades.refetch()}
                vazio={
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-medium">Nenhuma atividade neste projeto</p>
                    <p className="pt-1 text-xs text-muted-foreground">
                      O progresso é calculado a partir das atividades concluídas. Sem
                      atividade, ele fica travado em zero por falta de dado, não por falta
                      de trabalho.
                    </p>
                    {podeMover && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => setCriandoAtividade(true)}
                      >
                        <Plus className="size-4" aria-hidden />
                        Adicionar a primeira
                      </Button>
                    )}
                  </div>
                }
              >
                <ul className="divide-y divide-border">
                  {hierarquia.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 py-2.5 pr-3"
                      style={{ paddingLeft: `${0.75 + a.profundidade * 1.25}rem` }}
                    >
                      {a.profundidade > 0 && (
                        <ChevronRight
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}

                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-sm',
                            a.status === 'concluido' && 'text-muted-foreground line-through',
                          )}
                        >
                          {a.titulo}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {rotulo(rotulos.horizonte, a.horizonte)}
                          {a.data_prazo ? ` · ${fmt.data(a.data_prazo)}` : ' · sem prazo'}
                        </span>
                      </span>

                      <Badge
                        variant={a.status === 'concluido' ? 'success-subtle' : 'outline'}
                        className="shrink-0"
                      >
                        {rotulo(rotulos.status_atividade, a.status)}
                      </Badge>

                      {podeMover && (
                        <>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Editar ${a.titulo}`}
                            onClick={() => setAtividadeEmEdicao(a)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                          {a.status !== 'concluido' && (
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label={`Concluir ${a.titulo}`}
                              disabled={concluir.isPending}
                              onClick={() => concluir.mutate({ id: a.id, versao: a.updated_at })}
                            >
                              {concluir.isPending ? (
                                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                              ) : (
                                <CircleCheck className="size-3.5" aria-hidden />
                              )}
                            </Button>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </EstadoDaTela>
            </div>
          </div>
        </div>
      </PainelDeDetalhe>

      {editandoProjeto && (
        <FormularioDeProjeto
          projeto={projeto}
          salvando={salvarProjeto.isPending}
          excluindo={removerProjeto.isPending}
          erro={salvarProjeto.error ? mensagemDeErro(salvarProjeto.error) : null}
          aoFechar={() => {
            setEditandoProjeto(false)
            salvarProjeto.reset()
          }}
          aoSalvar={(dados) => salvarProjeto.mutate(dados)}
          aoExcluir={() => removerProjeto.mutate()}
        />
      )}

      {(criandoAtividade || atividadeEmEdicao) && (
        <FormularioDeAtividade
          atividade={atividadeEmEdicao}
          projetoId={projeto.id}
          areaId={projeto.area_id}
          possiveisMaes={linhas.filter((a) => a.id !== atividadeEmEdicao?.id)}
          salvando={salvarAtividade.isPending}
          excluindo={removerAtividade.isPending}
          erro={erroDeAtividade ? mensagemDeErro(erroDeAtividade) : null}
          aoFechar={() => {
            setCriandoAtividade(false)
            setAtividadeEmEdicao(null)
            salvarAtividade.reset()
            removerAtividade.reset()
          }}
          aoSalvar={(dados) => salvarAtividade.mutate(dados)}
          aoExcluir={
            atividadeEmEdicao ? () => removerAtividade.mutate(atividadeEmEdicao.id) : undefined
          }
        />
      )}
    </>
  )
}

function Item({ rotulo: r, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <p className="pb-1 text-[11px] text-muted-foreground">{r}</p>
      {children}
    </div>
  )
}
