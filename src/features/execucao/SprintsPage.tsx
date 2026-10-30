import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GripVertical, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Page } from '@/components/shell/Page'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  atividadesDaSprint,
  atualizarAtividade,
  atualizarSprint,
  carregarSprintsDoQuadro,
  criarAtividade,
  criarSprint,
  excluirAtividade,
  excluirSprint,
  moverAtividade,
  sprintDeHoje,
  STATUS_DO_KANBAN,
  type CartaoDoKanban,
  type DadosDaAtividade,
  type DadosDaSprint,
  type SprintDoQuadro,
} from '@/features/execucao/api'
import { FormularioDeAtividade } from '@/features/execucao/FormularioDeAtividade'
import { FormularioDeSprint } from '@/features/execucao/FormularioDeSprint'
import { ReguaDeSprints, ResumoDaSprint } from '@/features/execucao/ReguaDeSprints'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'
import { cn } from '@/lib/utils'

const TOM_DA_COLUNA: Record<string, string> = {
  a_fazer: 'border-t-muted-foreground/40',
  fazendo: 'border-t-info',
  revisao: 'border-t-warning',
  concluido: 'border-t-success',
  bloqueado: 'border-t-destructive',
}

export function SprintsPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const podeMover = podeFazer('atividade.edit')

  const [sprintEscolhida, setSprintEscolhida] = useState<string | null>(null)
  const [projetoFiltrado, setProjetoFiltrado] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<CartaoDoKanban | null>(null)
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null)
  const [criandoSprint, setCriandoSprint] = useState(false)
  const [editandoSprint, setEditandoSprint] = useState<SprintDoQuadro | null>(null)
  const [criandoCartao, setCriandoCartao] = useState(false)
  const [cartaoEmEdicao, setCartaoEmEdicao] = useState<CartaoDoKanban | null>(null)
  /* O dia é lido UMA vez, na montagem. Ler o relógio durante a renderização faz
     a sprint "de hoje" poder mudar entre dois renders do mesmo segundo. */
  const [hoje] = useState(() => new Date().toISOString().slice(0, 10))

  const sprints = useQuery({
    queryKey: chaves.sprintsDoQuadro(empresaId, null),
    enabled: !!empresaId,
    queryFn: () => carregarSprintsDoQuadro(empresaId!, null),
  })

  /* A sprint aberta por padrão é a que CONTÉM HOJE, não a primeira da lista e
     não a de status 'ativa'. Status é campo que alguém precisa lembrar de virar
     à mão, e quando ninguém lembra o quadro abre em setembro no meio de
     novembro. A data não depende de ninguém lembrar de nada. */
  const sprintDeHojeId = useMemo(
    () => sprintDeHoje(sprints.data ?? [], hoje),
    [sprints.data, hoje],
  )
  const sprintId = sprintEscolhida ?? sprintDeHojeId

  const cartoes = useQuery({
    queryKey: chaves.kanban(sprintId),
    enabled: !!sprintId,
    queryFn: () => atividadesDaSprint(sprintId!),
  })

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ['sprints'] })
    /* A régua mostra contadores por sprint. Sem isto, mover um cartão para
       "concluído" muda o quadro e deixa a barra de progresso da régua contando
       a versão anterior, logo acima, na mesma tela. */
    void queryClient.invalidateQueries({ queryKey: ['sprints-do-quadro'] })
    void queryClient.invalidateQueries({ queryKey: ['kanban'] })
    void queryClient.invalidateQueries({ queryKey: ['projetos'] })
    void queryClient.invalidateQueries({ queryKey: ['portfolio-resumo'] })
    void queryClient.invalidateQueries({ queryKey: ['minhas-atividades'] })
  }

  const salvarSprint = useMutation({
    mutationFn: (dados: DadosDaSprint) =>
      editandoSprint
        ? atualizarSprint(editandoSprint.id, dados)
        : criarSprint(empresaId!, dados),
    onSuccess: (registro) => {
      // Sprint recém-criada vira a sprint aberta: quem acabou de criar quer
      // colocar cartão nela, não procurá-la de volta no seletor.
      if (!editandoSprint) setSprintEscolhida(registro.id)
      setCriandoSprint(false)
      setEditandoSprint(null)
      salvarSprint.reset()
      invalidar()
    },
  })

  const removerSprint = useMutation({
    mutationFn: (id: string) => excluirSprint(id),
    onSuccess: () => {
      setEditandoSprint(null)
      setSprintEscolhida(null)
      removerSprint.reset()
      invalidar()
    },
  })

  const salvarCartao = useMutation({
    mutationFn: (dados: DadosDaAtividade) =>
      cartaoEmEdicao
        ? atualizarAtividade(cartaoEmEdicao.id, dados)
        : criarAtividade(empresaId!, dados),
    onSuccess: () => {
      setCriandoCartao(false)
      setCartaoEmEdicao(null)
      salvarCartao.reset()
      invalidar()
    },
  })

  const removerCartao = useMutation({
    mutationFn: (id: string) => excluirAtividade(id),
    onSuccess: () => {
      setCartaoEmEdicao(null)
      removerCartao.reset()
      invalidar()
    },
  })

  const mover = useMutation({
    mutationFn: (dados: { cartao: CartaoDoKanban; status: string }) =>
      moverAtividade({
        id: dados.cartao.id,
        status: dados.status,
        versao: dados.cartao.updated_at,
      }),
    onSuccess: invalidar,
  })

  /* Os projetos presentes NESTA sprint. Sai dos cartões já carregados, e não de
     uma consulta nova: filtrar o quadro é recorte de uma lista que a tela
     inteira já tem na mão, não uma pergunta diferente para o banco. */
  const projetosDaSprint = useMemo(() => {
    const mapa = new Map<string, { nome: string; qtd: number }>()
    for (const c of cartoes.data ?? []) {
      if (!c.projeto_id) continue
      const atual = mapa.get(c.projeto_id)
      mapa.set(c.projeto_id, {
        nome: c.projetos?.nome ?? 'projeto sem nome',
        qtd: (atual?.qtd ?? 0) + 1,
      })
    }
    return [...mapa.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .toSorted((a, b) => b.qtd - a.qtd)
  }, [cartoes.data])

  const visiveis = useMemo(
    () =>
      (cartoes.data ?? []).filter(
        (c) => !projetoFiltrado || c.projeto_id === projetoFiltrado,
      ),
    [cartoes.data, projetoFiltrado],
  )

  const porStatus = useMemo(() => {
    const mapa = new Map<string, CartaoDoKanban[]>()
    for (const s of STATUS_DO_KANBAN) mapa.set(s, [])
    for (const c of visiveis) {
      mapa.set(c.status, [...(mapa.get(c.status) ?? []), c])
    }
    return mapa
  }, [visiveis])

  const sprintAtual = sprints.data?.find((s) => s.id === sprintId)
  const erroDeCartao = salvarCartao.error ?? removerCartao.error
  const erroDeSprint = salvarSprint.error ?? removerSprint.error

  return (
    <Page
      title="Sprints"
      description="Quadro de execução da área"
      semPadding
      actions={
        <>
          {podeMover && (
            <>
              <Button size="sm" onClick={() => setCriandoSprint(true)}>
                <Plus className="size-4" aria-hidden />
                Nova sprint
              </Button>
              {sprintAtual && (
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Editar sprint"
                  onClick={() => setEditandoSprint(sprintAtual)}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
              )}
            </>
          )}
        </>
      }
    >
      <div className="flex h-full flex-col">
        {mover.error && (
          <div
            role="alert"
            className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground lg:mx-6"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{mensagemDeErro(mover.error)}</p>
          </div>
        )}

        {(sprints.data ?? []).length > 0 && (
          <ReguaDeSprints
            sprints={sprints.data ?? []}
            sprintId={sprintId}
            sprintDeHojeId={sprintDeHojeId}
            aoEscolher={(id) => {
              setSprintEscolhida(id)
              /* O filtro pertence à sprint que estava aberta. Carregá-lo para a
                 próxima esconderia cartões numa sprint que a pessoa nem viu
                 ainda, e o quadro pareceria vazio sem motivo. */
              setProjetoFiltrado(null)
            }}
          />
        )}

        {sprintAtual && (
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 lg:px-6">
            <ResumoDaSprint sprint={sprintAtual} />
            {podeMover && (
              <Button size="xs" variant="outline" onClick={() => setCriandoCartao(true)}>
                <Plus className="size-3" aria-hidden />
                Nova atividade
              </Button>
            )}
          </div>
        )}

        {/* O recorte por projeto só aparece quando há mais de um projeto na
            sprint, que é exatamente quando o quadro fica difícil de ler. Com um
            projeto só, o filtro não recortaria nada. */}
        {projetosDaSprint.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 lg:px-6">
            <span className="pr-1 text-[11px] text-muted-foreground">Ver:</span>
            <Button
              size="xs"
              variant={projetoFiltrado === null ? 'secondary' : 'ghost'}
              onClick={() => setProjetoFiltrado(null)}
            >
              todos os projetos ({cartoes.data?.length ?? 0})
            </Button>
            {projetosDaSprint.map((pj) => (
              <Button
                key={pj.id}
                size="xs"
                variant={projetoFiltrado === pj.id ? 'secondary' : 'ghost'}
                onClick={() => setProjetoFiltrado(pj.id)}
                className="max-w-64 justify-start"
              >
                <span className="truncate">{pj.nome}</span>
                <span className="text-muted-foreground">({pj.qtd})</span>
              </Button>
            ))}
          </div>
        )}

        {sprints.isLoading && (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5 lg:p-6">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-64 rounded-lg" />
            ))}
          </div>
        )}

        {!sprints.isLoading && (sprints.data ?? []).length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium">Nenhuma sprint cadastrada nesta empresa</p>
            <p className="pt-1 text-xs text-muted-foreground">
              Sem correspondência, não falha de consulta. A sprint é a janela de execução da
              área, e só atividade com sprint aparece neste quadro.
            </p>
            {podeMover && (
              <Button size="sm" className="mt-3" onClick={() => setCriandoSprint(true)}>
                <Plus className="size-4" aria-hidden />
                Criar a primeira sprint
              </Button>
            )}
          </div>
        )}

        {sprintId && (
          <div className="min-h-0 flex-1 overflow-x-auto px-4 py-4 lg:px-6">
            <EstadoDaTela
              carregando={cartoes.isLoading}
              erro={cartoes.error}
              /* O quadro vazio é um estado legítimo: mostramos as colunas. */
              quantidade={1}
              aoTentarDeNovo={() => void cartoes.refetch()}
            >
              <div className="grid min-w-[64rem] grid-cols-5 gap-3">
                {STATUS_DO_KANBAN.map((status) => {
                  const lista = porStatus.get(status) ?? []
                  return (
                    <div
                      key={status}
                      aria-label={`Coluna ${rotulo(rotulos.status_atividade, status)}`}
                      onDragOver={(e) => {
                        if (!podeMover || !arrastando) return
                        e.preventDefault()
                        setColunaAlvo(status)
                      }}
                      onDragLeave={() => setColunaAlvo((c) => (c === status ? null : c))}
                      onDrop={(e) => {
                        e.preventDefault()
                        setColunaAlvo(null)
                        if (!arrastando || arrastando.status === status) return
                        mover.mutate({ cartao: arrastando, status })
                        setArrastando(null)
                      }}
                      className={cn(
                        'flex flex-col rounded-lg border border-t-2 border-border bg-muted/30 transition-colors',
                        TOM_DA_COLUNA[status],
                        colunaAlvo === status && 'bg-accent/60 ring-2 ring-ring',
                      )}
                    >
                      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <h2 className="text-xs font-semibold">
                          {rotulo(rotulos.status_atividade, status)}
                        </h2>
                        <Badge variant="secondary">{lista.length}</Badge>
                      </header>

                      <ul className="min-h-24 flex-1 space-y-2 px-2 pb-2">
                        {lista.map((c) => (
                          <li key={c.id}>
                            <div
                              draggable={podeMover}
                              onDragStart={() => setArrastando(c)}
                              onDragEnd={() => {
                                setArrastando(null)
                                setColunaAlvo(null)
                              }}
                              className={cn(
                                'rounded-md border border-border bg-card p-2.5 shadow-sm',
                                podeMover && 'cursor-grab active:cursor-grabbing',
                                arrastando?.id === c.id && 'opacity-50',
                              )}
                            >
                              <div className="flex items-start gap-1.5">
                                {podeMover && (
                                  <GripVertical
                                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                )}
                                <p className="min-w-0 flex-1 text-xs font-medium">{c.titulo}</p>
                                {podeMover && (
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    className="-mt-1 -mr-1 shrink-0"
                                    aria-label={`Editar ${c.titulo}`}
                                    onClick={() => setCartaoEmEdicao(c)}
                                  >
                                    <Pencil className="size-3" aria-hidden />
                                  </Button>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-1 pt-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {rotulo(rotulos.horizonte, c.horizonte)}
                                </Badge>
                                {c.prioridade === 'critica' && (
                                  <Badge variant="destructive-subtle" className="text-[10px]">
                                    crítica
                                  </Badge>
                                )}
                                {c.data_prazo && (
                                  <span
                                    className={cn(
                                      'text-[10px]',
                                      c.data_prazo < new Date().toISOString().slice(0, 10) &&
                                        c.status !== 'concluido'
                                        ? 'text-destructive'
                                        : 'text-muted-foreground',
                                    )}
                                  >
                                    {fmt.data(c.data_prazo)}
                                  </span>
                                )}
                              </div>

                              {/* O nome do projeto em duas linhas, não cortado.
                                  Num quadro que mistura projetos, "Orçamento
                                  anual: cons..." e "Orçamento anual: cont..." são
                                  o mesmo texto na tela, e era preciso abrir o
                                  cartão para saber de qual projeto ele é. */}
                              <p className="line-clamp-2 pt-1.5 text-[10px] leading-tight text-muted-foreground">
                                {c.projetos?.nome ?? 'sem projeto'}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {c.profiles?.nome ?? 'sem responsável'}
                              </p>

                              {/* Arrastar é gesto de mouse. Este seletor é o
                                  caminho equivalente por teclado, não um extra. */}
                              {podeMover && (
                                <Select
                                  value={c.status}
                                  onValueChange={(v) =>
                                    v !== c.status && mover.mutate({ cartao: c, status: v })
                                  }
                                  disabled={mover.isPending}
                                >
                                  <SelectTrigger
                                    size="sm"
                                    className="mt-2 h-7 w-full text-[10px]"
                                    aria-label={`Mover ${c.titulo} para outra coluna`}
                                  >
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
                            </div>
                          </li>
                        ))}

                        {lista.length === 0 && (
                          <li className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                            {projetoFiltrado ? 'nada deste projeto aqui' : 'vazio'}
                          </li>
                        )}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </EstadoDaTela>
          </div>
        )}
      </div>

      {(criandoSprint || editandoSprint) && (
        <FormularioDeSprint
          sprint={editandoSprint}
          salvando={salvarSprint.isPending}
          excluindo={removerSprint.isPending}
          erro={erroDeSprint ? mensagemDeErro(erroDeSprint) : null}
          aoFechar={() => {
            setCriandoSprint(false)
            setEditandoSprint(null)
            salvarSprint.reset()
            removerSprint.reset()
          }}
          aoSalvar={(dados) => salvarSprint.mutate(dados)}
          aoExcluir={editandoSprint ? () => removerSprint.mutate(editandoSprint.id) : undefined}
        />
      )}

      {(criandoCartao || cartaoEmEdicao) && (
        <FormularioDeAtividade
          atividade={cartaoEmEdicao}
          projetoId={cartaoEmEdicao?.projeto_id ?? null}
          areaId={cartaoEmEdicao?.area_id ?? sprintAtual?.area_id ?? null}
          salvando={salvarCartao.isPending}
          excluindo={removerCartao.isPending}
          erro={erroDeCartao ? mensagemDeErro(erroDeCartao) : null}
          aoFechar={() => {
            setCriandoCartao(false)
            setCartaoEmEdicao(null)
            salvarCartao.reset()
            removerCartao.reset()
          }}
          // Cartão criado a partir do quadro já nasce na sprint aberta.
          aoSalvar={(dados) =>
            salvarCartao.mutate({ ...dados, sprint_id: dados.sprint_id ?? sprintId })
          }
          aoExcluir={cartaoEmEdicao ? () => removerCartao.mutate(cartaoEmEdicao.id) : undefined}
        />
      )}
    </Page>
  )
}
