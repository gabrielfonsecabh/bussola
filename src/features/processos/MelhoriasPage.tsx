import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { CircleCheck, LoaderCircle, Pencil, Plus, TriangleAlert, UserRoundCheck } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CarregandoTabela,
  ConsultaFalhou,
  EstadoDaTela,
  SemCorrespondencia,
  ValorOuSemDado,
} from '@/components/ui/estado-da-tela'
import { Skeleton } from '@/components/ui/skeleton'
import {
  atualizarMelhoria,
  avancarFase,
  carregarQuadroDeMelhorias,
  concluirTollgate,
  criarMelhoria,
  excluirMelhoria,
  FASES_DMAIC,
  listarEtapas,
  type LinhaDoQuadro,
} from '@/features/processos/api'
import {
  chaveDoRegistroDeMelhoria,
  FormularioDeMelhoria,
  type DadosDoFormularioDeMelhoria,
} from '@/features/processos/FormularioDeMelhoria'
import { useAuth } from '@/hooks/use-auth'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'
import { cn } from '@/lib/utils'

/**
 * A mesma melhoria aparece em várias leituras: o quadro, as etapas do painel, a
 * contagem de melhorias ativas do inventário e os cartões de melhoria e de
 * ganho dos painéis executivo e de áreas. Invalidar só a que está na frente
 * deixa as outras mostrando o número de antes da gravação.
 */
function invalidarMelhorias(queryClient: QueryClient, id?: string) {
  void queryClient.invalidateQueries({ queryKey: ['melhorias'] })
  void queryClient.invalidateQueries({ queryKey: ['processos'] })
  void queryClient.invalidateQueries({ queryKey: ['painel-executivo'] })
  void queryClient.invalidateQueries({ queryKey: ['painel-areas'] })
  // O OPR monta "melhorias em curso" da área a partir desta mesma tabela: sem
  // isto ele continua listando a melhoria excluída, ou sem a que acabou de ser
  // aberta, e o autor do relatório escreve em cima do dado velho.
  void queryClient.invalidateQueries({ queryKey: ['opr'] })
  if (!id) return
  void queryClient.invalidateQueries({ queryKey: chaves.melhoria(id) })
  void queryClient.invalidateQueries({ queryKey: chaveDoRegistroDeMelhoria(id) })
}

/**
 * O belt pode mexer no DMAIC que ele lidera, mesmo sem `melhoria.edit`.
 *
 * Isto não é regra desta tela: é o que a policy `melhoria_update` de
 * `app.projetos_melhoria` já diz (`belt_user_id = (select auth.uid())`), e o
 * mesmo gate que `melhoria_avancar_fase`, `dmaic_concluir_tollgate` e
 * `melhoria_dar_corpo` levantam. A tela estava MAIS restritiva que o banco:
 * o belt via os botões sumidos e concluía que o sistema não era dele.
 *
 * Cuidado com o que NÃO está aqui: abrir melhoria nova continua exigindo
 * `melhoria.edit` (policy `melhoria_insert`), e excluir exige
 * `processo.delete` (policy `melhoria_delete`, conferida no formulário).
 */
function ehOBelt(melhoria: LinhaDoQuadro, meuId: string | null): boolean {
  return !!meuId && melhoria.belt_user_id === meuId
}

/**
 * Soma de um conjunto em que parte das linhas não tem valor. O número é
 * verdadeiro, mas só sobre quem tem dado: sem esta frase, a soma de 3
 * melhorias se lê como o ganho das 12.
 */
function parcial(com: number | null, total: number | null): string | null {
  if (com === null || total === null || com === 0 || com >= total) return null
  return `soma de ${com} de ${total} com valor`
}

function juntar(partes: Array<string | null | undefined>): string | undefined {
  const limpo = partes.filter((p): p is string => !!p)
  return limpo.length > 0 ? limpo.join(' · ') : undefined
}

/**
 * Tom do status no cartão do quadro. `melhorias_quadro` devolve TODA melhoria
 * da empresa, inclusive a cancelada e a pausada: sem esta marca, uma melhoria
 * cancelada fica idêntica a uma em andamento dentro da coluna, e o quadro
 * passa a afirmar trabalho que ninguém está tocando. Em andamento não recebe
 * marca, que é o caso normal.
 */
const TOM_DO_STATUS: Record<string, 'secondary' | 'warning-subtle' | 'success-subtle'> = {
  backlog: 'secondary',
  pausado: 'warning-subtle',
  concluido: 'success-subtle',
  cancelado: 'secondary',
}

export function MelhoriasPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const { usuario } = useAuth()
  const empresaId = empresaAtiva?.id ?? null
  const meuId = usuario?.id ?? null
  const queryClient = useQueryClient()
  // A permissão de empresa. Ela basta para CRIAR (policy `melhoria_insert`);
  // para editar, ela é só um dos dois caminhos, o outro é ser o belt da linha.
  const temPermissaoDeMelhoria = podeFazer('melhoria.edit')

  // Guardamos o ID, não o objeto capturado no clique. Editar a melhoria refaz
  // a consulta do quadro, e uma foto tirada no clique continuaria mostrando o
  // nome, o ganho e a fase de antes da edição.
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [ultimaSelecionada, setUltimaSelecionada] = useState<LinhaDoQuadro | null>(null)
  const [criando, setCriando] = useState(false)
  const [soOsMeus, setSoOsMeus] = useState(false)

  const consulta = useQuery({
    queryKey: chaves.melhorias(empresaId, null),
    enabled: !!empresaId,
    queryFn: () => carregarQuadroDeMelhorias(empresaId!, null),
  })

  const criar = useMutation({
    mutationFn: (dados: DadosDoFormularioDeMelhoria) =>
      // `ganho_realizado` nasce nulo e continua nulo até o Control: quem
      // preenche é a fase, não o cadastro.
      criarMelhoria(empresaId!, { ...dados, ganho_realizado: null }),
    onSuccess: () => {
      setCriando(false)
      criar.reset()
      invalidarMelhorias(queryClient)
    },
  })

  const linhas = useMemo(() => consulta.data ?? [], [consulta.data])

  /**
   * "Só os meus" recorta pelo `belt_user_id` que a RPC JÁ devolve: nenhuma ida
   * nova ao banco, e nenhum campo novo. Devolve `null` quando a consulta não
   * respondeu, para os cartões saberem a diferença entre "ninguém" e "não sei".
   */
  const recorte = useMemo(() => {
    const dados = consulta.data
    if (!dados) return null
    if (!soOsMeus || !meuId) return dados
    return dados.filter((m) => m.belt_user_id === meuId)
  }, [consulta.data, soOsMeus, meuId])

  const visiveis = useMemo(() => recorte ?? [], [recorte])

  const porFase = useMemo(() => {
    const mapa = new Map<string, LinhaDoQuadro[]>()
    for (const f of FASES_DMAIC) mapa.set(f, [])
    for (const m of visiveis) {
      if (m.fase_atual === 'concluido') continue
      mapa.set(m.fase_atual, [...(mapa.get(m.fase_atual) ?? []), m])
    }
    return mapa
  }, [visiveis])

  // Os cartões saem de `recorte`, e não de `visiveis`. Quando a consulta
  // falha, `visiveis` cai para lista vazia e os quatro números virariam zero: o
  // quadro avisaria do erro enquanto a capa afirmava "nenhuma melhoria".
  // Seguem o mesmo filtro do quadro de propósito: capa e quadro contando
  // conjuntos diferentes é como a tela passa a se contradizer sozinha.
  const resumo = useMemo(() => {
    const dados = recorte
    if (!dados) {
      return {
        total: null,
        ativas: null,
        concluidas: null,
        estimado: null,
        realizado: null,
        comEstimado: null,
        comRealizado: null,
      }
    }
    const comEstimado = dados.filter((m) => m.ganho_estimado !== null)
    const comRealizado = dados.filter((m) => m.ganho_realizado !== null)
    return {
      total: dados.length,
      ativas: dados.filter((m) => m.status === 'em_andamento').length,
      concluidas: dados.filter((m) => m.status === 'concluido').length,
      comEstimado: comEstimado.length,
      comRealizado: comRealizado.length,
      estimado:
        comEstimado.length === 0
          ? null
          : comEstimado.reduce((s, m) => s + (m.ganho_estimado ?? 0), 0),
      realizado:
        comRealizado.length === 0
          ? null
          : comRealizado.reduce((s, m) => s + (m.ganho_realizado ?? 0), 0),
    }
  }, [recorte])

  /**
   * O quadro tem as cinco fases do método, e só elas. Quem está em
   * `fase_atual = 'concluido'` (ou numa fase que o banco passe a aceitar e esta
   * tela ainda não conheça) continua no recorte e nos cartões, mas não tem
   * coluna. Sem esta contagem, os números de cima falariam de linhas que
   * ninguém encontra embaixo: some a linha, não some o número.
   */
  const foraDoQuadro = useMemo(() => {
    const colunas: readonly string[] = FASES_DMAIC
    return visiveis.filter((m) => !colunas.includes(m.fase_atual)).length
  }, [visiveis])

  const recorteNoCartao = soOsMeus ? 'só as suas' : null

  // Sempre a linha fresca da consulta, e da lista COMPLETA: o painel aberto
  // continua válido mesmo que o filtro "só os meus" tire aquela melhoria do
  // quadro atrás dele.
  const selecionada = linhas.find((m) => m.id === selecionadaId) ?? ultimaSelecionada

  function abrir(melhoria: LinhaDoQuadro) {
    setSelecionadaId(melhoria.id)
    setUltimaSelecionada(melhoria)
  }

  function fechar() {
    setSelecionadaId(null)
    setUltimaSelecionada(null)
  }

  return (
    <Page
      title="Melhorias (DMAIC)"
      description="Quadro por fase, com os tollgates"
      semPadding
      actions={
        <>
          {/* Sem sessão resolvida não dá para dizer o que é "meu": o botão nem
              aparece, em vez de aparecer e filtrar para lista vazia. */}
          {meuId && (
            <Button
              size="sm"
              variant={soOsMeus ? 'default' : 'outline'}
              aria-pressed={soOsMeus}
              onClick={() => setSoOsMeus((v) => !v)}
            >
              <UserRoundCheck className="size-4" aria-hidden />
              {soOsMeus ? 'Mostrando só os meus' : 'Só os meus'}
            </Button>
          )}
          {temPermissaoDeMelhoria && (
            <Button size="sm" onClick={() => setCriando(true)}>
              <Plus className="size-4" aria-hidden />
              Nova melhoria
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 px-4 py-6 lg:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Com o filtro ligado, os quatro números falam só do recorte. Dizer
              isso no cartão evita ler "Ganho estimado" como o da empresa. */}
          <CartaoDeMetrica
            rotulo="Em andamento"
            valor={resumo.ativas}
            detalhe={juntar([recorteNoCartao])}
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Concluídas"
            valor={resumo.concluidas}
            tom="success"
            detalhe={juntar([recorteNoCartao])}
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Ganho estimado"
            valor={resumo.estimado}
            formatar={fmt.moeda}
            detalhe={juntar([recorteNoCartao, parcial(resumo.comEstimado, resumo.total)])}
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Ganho realizado"
            valor={resumo.realizado}
            formatar={fmt.moeda}
            tom="success"
            detalhe={juntar([
              recorteNoCartao,
              parcial(resumo.comRealizado, resumo.total),
              'só é preenchido na fase Control',
            ])}
            carregando={consulta.isLoading}
          />
        </div>

        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={visiveis.length}
          aoTentarDeNovo={() => void consulta.refetch()}
          carregandoNode={
            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={`esqueleto-${i}`} className="h-64 rounded-lg" />
              ))}
            </div>
          }
          vazio={
            // Duas ausências diferentes, e a diferença muda o que a pessoa faz
            // em seguida: limpar o filtro ou abrir a primeira melhoria.
            soOsMeus && linhas.length > 0 ? (
              <SemCorrespondencia
                className="rounded-lg border border-border bg-card"
                titulo="Nenhuma melhoria tem você como belt"
                descricao={
                  linhas.length === 1
                    ? 'Isto é o filtro, não uma falha de consulta: existe 1 melhoria nesta empresa, e ela não está no seu nome.'
                    : `Isto é o filtro, não uma falha de consulta: existem ${linhas.length} melhorias nesta empresa, e nenhuma delas está no seu nome.`
                }
                acao={
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => setSoOsMeus(false)}
                  >
                    Mostrar todas
                  </Button>
                }
              />
            ) : (
              <SemCorrespondencia
                className="rounded-lg border border-border bg-card"
                titulo="Nenhum projeto de melhoria cadastrado"
                descricao="Isto é ausência de registro, não zero de resultado. Abra uma melhoria a partir de um processo que já tenha SIPOC e ao menos um indicador Y."
                acao={
                  temPermissaoDeMelhoria ? (
                    <Button size="sm" className="mt-1" onClick={() => setCriando(true)}>
                      <Plus className="size-4" aria-hidden />
                      Nova melhoria
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        >
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[64rem] grid-cols-5 gap-3">
              {FASES_DMAIC.map((fase, indice) => {
                const lista = porFase.get(fase) ?? []
                return (
                  <section
                    key={fase}
                    className="flex flex-col rounded-lg border border-border bg-muted/30"
                  >
                    <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                      <h2 className="flex items-center gap-1.5 text-xs font-semibold">
                        <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {indice + 1}
                        </span>
                        {rotulo(rotulos.fase_dmaic, fase)}
                      </h2>
                      <Badge variant="secondary">{lista.length}</Badge>
                    </header>

                    <ul className="min-h-24 flex-1 space-y-2 p-2">
                      {lista.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => abrir(m)}
                            className="w-full rounded-md border border-border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <p className="text-xs font-medium">{m.nome}</p>
                            <p className="truncate pt-1 text-[10px] text-muted-foreground">
                              {m.processo_nome ?? 'sem processo'}
                              {m.belt_nome ? ` · ${m.belt_nome}` : ''}
                            </p>
                            <div className="flex flex-wrap items-center gap-1 pt-2">
                              <Badge variant="outline" className="text-[10px]">
                                {rotulo(rotulos.metodo_melhoria, m.metodo)}
                              </Badge>
                              {/* Marca em RÓTULO, não em cor: com o filtro
                                  desligado é isso que separa o que é seu do
                                  resto do quadro. */}
                              {ehOBelt(m, meuId) && (
                                <Badge variant="info-subtle" className="text-[10px]">
                                  Você é o belt
                                </Badge>
                              )}
                              {/* Status só quando ele muda a leitura do cartão:
                                  em andamento é o caso normal e não vira selo.
                                  Rótulo junto, nunca cor sozinha. */}
                              {m.status !== 'em_andamento' && (
                                <Badge
                                  variant={TOM_DO_STATUS[m.status] ?? 'secondary'}
                                  className="text-[10px]"
                                >
                                  {rotulo(rotulos.status_melhoria, m.status)}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {m.tollgates_concluidos}/5 tollgates
                              </span>
                            </div>
                            {/* Trilha dos tollgates: cinco marcas, uma por fase. */}
                            <div className="flex gap-0.5 pt-2" aria-hidden>
                              {FASES_DMAIC.map((f) => (
                                <span
                                  key={f}
                                  className={cn(
                                    'h-1 flex-1 rounded-full',
                                    m.fases_concluidas.includes(f) ? 'bg-success' : 'bg-muted',
                                  )}
                                />
                              ))}
                            </div>
                          </button>
                        </li>
                      ))}

                      {lista.length === 0 && (
                        <li className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                          vazio
                        </li>
                      )}
                    </ul>
                  </section>
                )
              })}
            </div>
          </div>

          {foraDoQuadro > 0 && (
            <p className="pt-2 text-xs text-muted-foreground">
              {foraDoQuadro === 1
                ? '1 melhoria não está em nenhuma das cinco fases do método (concluída, ou numa fase nova do banco) e por isso não aparece em coluna nenhuma. Ela continua contando nos cartões acima.'
                : `${foraDoQuadro} melhorias não estão em nenhuma das cinco fases do método (concluídas, ou numa fase nova do banco) e por isso não aparecem em coluna nenhuma. Elas continuam contando nos cartões acima.`}
            </p>
          )}
        </EstadoDaTela>
      </div>

      {selecionadaId && selecionada && (
        <DetalheDaMelhoria
          melhoria={selecionada}
          podeEditar={temPermissaoDeMelhoria || ehOBelt(selecionada, meuId)}
          aoFechar={fechar}
        />
      )}

      {criando && (
        <FormularioDeMelhoria
          melhoriaId={null}
          salvando={criar.isPending}
          erro={criar.error ? mensagemDeErro(criar.error) : null}
          aoFechar={() => {
            setCriando(false)
            criar.reset()
          }}
          aoSalvar={(dados) => criar.mutate(dados)}
        />
      )}
    </Page>
  )
}

function DetalheDaMelhoria({
  melhoria,
  podeEditar,
  aoFechar,
}: {
  melhoria: LinhaDoQuadro
  /**
   * Vem pronto de cima porque depende da linha: `melhoria.edit` OU ser o belt
   * desta melhoria. Os três gates que este painel aciona (update, avançar fase
   * e concluir tollgate) aceitam as duas formas no banco.
   */
  podeEditar: boolean
  aoFechar: () => void
}) {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)

  const etapas = useQuery({
    queryKey: chaves.melhoria(melhoria.id),
    queryFn: () => listarEtapas(melhoria.id),
  })

  function invalidar() {
    invalidarMelhorias(queryClient, melhoria.id)
  }

  const concluir = useMutation({
    mutationFn: (fase: string) => concluirTollgate(melhoria.id, fase),
    onSuccess: invalidar,
  })

  const avancar = useMutation({
    mutationFn: (fase: string) => avancarFase(melhoria.id, fase),
    onSuccess: () => {
      invalidar()
      aoFechar()
    },
  })

  const salvar = useMutation({
    mutationFn: (dados: DadosDoFormularioDeMelhoria) => atualizarMelhoria(melhoria.id, dados),
    onSuccess: () => {
      setEditando(false)
      salvar.reset()
      invalidar()
    },
  })

  const remover = useMutation({
    mutationFn: () => excluirMelhoria(melhoria.id),
    onSuccess: () => {
      invalidar()
      aoFechar()
    },
  })

  const indiceAtual = FASES_DMAIC.indexOf(melhoria.fase_atual as (typeof FASES_DMAIC)[number])
  const proxima = indiceAtual >= 0 ? FASES_DMAIC[indiceAtual + 1] : undefined
  const porFase = new Map((etapas.data ?? []).map((e) => [e.fase, e]))
  const erroDoPainel = avancar.error ?? concluir.error
  // Excluir sai de dentro do formulário, e o painel fica fechado enquanto ele
  // está aberto: o erro da exclusão precisa aparecer lá, não aqui atrás.
  const erroDaEdicao = salvar.error ?? remover.error

  return (
    <>
      <PainelDeDetalhe
        aberto={!editando}
        largura="larga"
        aoFechar={aoFechar}
        titulo={melhoria.nome}
        origem={`Quadro DMAIC · ${melhoria.processo_nome ?? 'sem processo'} · belt ${
          melhoria.belt_nome ?? 'não definido'
        }`}
        acoes={
          podeEditar && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="mr-auto"
                onClick={() => setEditando(true)}
              >
                <Pencil className="size-4" aria-hidden />
                Editar
              </Button>
              {proxima && (
                <Button
                  size="sm"
                  disabled={avancar.isPending}
                  onClick={() => avancar.mutate(proxima)}
                >
                  {avancar.isPending && (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  )}
                  Avançar para {rotulo(rotulos.fase_dmaic, proxima)}
                </Button>
              )}
              {!proxima && melhoria.fase_atual === 'control' && (
                <Button
                  size="sm"
                  disabled={avancar.isPending}
                  onClick={() => avancar.mutate('concluido')}
                >
                  Concluir melhoria
                </Button>
              )}
            </>
          )
        }
      >
        <div className="space-y-5">
          {erroDoPainel && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{mensagemDeErro(erroDoPainel)}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Bloco rotulo="Método">
              <Badge variant="secondary">{rotulo(rotulos.metodo_melhoria, melhoria.metodo)}</Badge>
            </Bloco>
            <Bloco rotulo="Fase atual">
              <Badge variant="info-subtle">{rotulo(rotulos.fase_dmaic, melhoria.fase_atual)}</Badge>
            </Bloco>
            <Bloco rotulo="Ganho estimado">
              <ValorOuSemDado
                valor={melhoria.ganho_estimado}
                formatar={fmt.moeda}
                className="text-sm font-medium"
              />
            </Bloco>
            <Bloco rotulo="Ganho realizado">
              <ValorOuSemDado
                valor={melhoria.ganho_realizado}
                formatar={fmt.moeda}
                className="text-sm font-medium"
              />
            </Bloco>
          </div>

          {melhoria.problema && <Texto rotulo="Problema" valor={melhoria.problema} />}
          {melhoria.meta_smart && <Texto rotulo="Meta SMART" valor={melhoria.meta_smart} />}

          <div>
            <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Tollgates
            </h3>
            <p className="pb-2 text-xs text-muted-foreground">
              Avançar de fase exige o tollgate anterior concluído. Essa regra vive no banco, não
              nesta tela: se você tentar pular, a gravação é recusada com a explicação.
            </p>

            {/* As cinco fases são constantes, então a lista nunca fica vazia e
                `EstadoDaTela` não serve aqui: quem pode faltar é o status de
                cada tollgate. Com a consulta falha, renderizar a lista diria
                "nenhum tollgate concluído", que é o resultado zero mentindo. */}
            {etapas.isLoading ? (
              <CarregandoTabela linhas={5} />
            ) : etapas.error ? (
              <ConsultaFalhou
                erro={etapas.error}
                aoTentarDeNovo={() => void etapas.refetch()}
                className="rounded-md border border-border bg-card"
              />
            ) : (
              <ol className="space-y-2">
                {FASES_DMAIC.map((fase, i) => {
                  const etapa = porFase.get(fase)
                  const concluida = etapa?.status === 'concluido'
                  const atual = melhoria.fase_atual === fase
                  return (
                    <li
                      key={fase}
                      className={cn(
                        'flex items-center gap-3 rounded-md border p-3',
                        concluida ? 'border-success/40 bg-success-subtle' : 'border-border',
                        atual && !concluida && 'border-primary/50',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                          concluida
                            ? 'bg-success text-success-foreground'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {concluida ? <CircleCheck className="size-3.5" aria-hidden /> : i + 1}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {rotulo(rotulos.fase_dmaic, fase)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {concluida
                            ? `concluído em ${fmt.data(etapa?.data_conclusao) ?? 'data não registrada'}`
                            : atual
                              ? 'fase atual'
                              : 'pendente'}
                        </span>
                      </span>

                      {podeEditar && !concluida && (
                        <Button
                          size="xs"
                          variant="outline"
                          // Trava todos enquanto uma gravação corre (duas
                          // fases em voo se atrapalham), mas o giro aparece só
                          // no botão que foi clicado: cinco spinners diriam
                          // que cinco tollgates estão sendo concluídos.
                          disabled={concluir.isPending}
                          onClick={() => concluir.mutate(fase)}
                        >
                          {concluir.isPending && concluir.variables === fase ? (
                            <LoaderCircle className="size-3 animate-spin" aria-hidden />
                          ) : null}
                          Concluir tollgate
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      </PainelDeDetalhe>

      {editando && (
        <FormularioDeMelhoria
          melhoriaId={melhoria.id}
          salvando={salvar.isPending}
          excluindo={remover.isPending}
          erro={erroDaEdicao ? mensagemDeErro(erroDaEdicao) : null}
          aoFechar={() => {
            setEditando(false)
            salvar.reset()
            remover.reset()
          }}
          aoSalvar={(dados) => salvar.mutate(dados)}
          aoExcluir={() => remover.mutate()}
        />
      )}
    </>
  )
}

function Bloco({ rotulo: r, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <p className="pb-1 text-[11px] text-muted-foreground">{r}</p>
      {children}
    </div>
  )
}

function Texto({ rotulo: r, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {r}
      </p>
      <p className="text-sm">{valor}</p>
    </div>
  )
}
