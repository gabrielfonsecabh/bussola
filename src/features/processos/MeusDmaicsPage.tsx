import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, LoaderCircle, Sigma, SquareArrowOutUpRight, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela, SemCorrespondencia, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Skeleton } from '@/components/ui/skeleton'
import {
  carregarMeusDmaics,
  darCorpoAMelhoria,
  FASES_DMAIC,
  type MeuDmaic,
} from '@/features/processos/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

/**
 * A lente do belt.
 *
 * Até a 0029 o belt era o único papel sem tela própria: liderava o DMAIC, mas
 * o DMAIC não tinha corpo de projeto, então não recebia atividade, não entrava
 * em sprint e não aparecia no cronograma. Esta tela responde "quais são os
 * meus" e oferece, em cada um, o botão que dá esse corpo.
 *
 * Quem recorta é o banco: `meus_dmaics` filtra por `belt_user_id = auth.uid()`
 * e já descarta o cancelado (`and m.status <> 'cancelado'`, lido no
 * `pg_get_functiondef`). A tela não refiltra nada no navegador, e por isso
 * "ativo" aqui significa exatamente "não concluído": o cancelado nem chega.
 */

/**
 * DEFEITO CONHECIDO DA RPC, e o motivo de esta tela não escrever "abertas".
 *
 * `meus_dmaics` conta `atividades a where a.projeto_id = m.projeto_id and
 * a.status <> 'concluida'`, mas `atividades_status_check` só aceita
 * a_fazer | fazendo | revisao | concluido | bloqueado. O valor 'concluida' não
 * existe, então a comparação é verdadeira para toda linha e o número devolvido
 * é o TOTAL de atividades do projeto, não as abertas. Enquanto a migration não
 * trocar para `<> 'concluido'`, chamar isto de "aberta" seria a tela afirmando
 * o que o dado não sustenta. O número é exibido como ele é: atividades do
 * projeto. Corrigida a RPC, só o texto muda.
 */

/**
 * A chave canônica desta leitura é `chaves.meusDmaics(empresa)`, que ainda não
 * existe em `src/lib/chaves.ts` (arquivo de outra frente). Fica aqui no MESMO
 * formato que ela terá, para a invalidação por prefixo já valer e a troca ser
 * de uma linha quando a chave chegar lá.
 */
const chaveMeusDmaics = (empresa: string | null) => ['meus-dmaics', empresa] as const

/**
 * A fase 'concluido' não está em FASES_DMAIC (ela não é etapa do método), mas
 * a RPC devolve melhorias nela. Sem este grupo, o DMAIC concluído sumiria da
 * lista sem que ninguém percebesse: some linha, não some número.
 */
const FASES_DA_LISTA: readonly string[] = [...FASES_DMAIC, 'concluido']

const TOM_DO_STATUS: Record<
  string,
  'secondary' | 'info-subtle' | 'warning-subtle' | 'success-subtle'
> = {
  backlog: 'secondary',
  em_andamento: 'info-subtle',
  pausado: 'warning-subtle',
  concluido: 'success-subtle',
}

const hoje = () => new Date().toISOString().slice(0, 10)

/**
 * Recorte na URL, a mesma convenção do cronograma e dos painéis de área:
 * `?projeto=<uuid>` no portfólio, `?processo=<uuid>` no inventário. As duas
 * telas de destino ainda não leem o parâmetro (são de outras frentes), então o
 * rótulo do link promete só o que acontece hoje: abrir a tela. Quando elas
 * lerem, o link já chega recortado sem mudar nada aqui.
 */
function comRecorte(rota: string, recorte: Record<string, string | null>): string {
  const parametros = new URLSearchParams()
  for (const [chave, valor] of Object.entries(recorte)) {
    // Chave sem valor não entra na URL: `?projeto=` vazio é um filtro que a
    // tela de destino leria como "nenhum projeto".
    if (valor === null || valor === '') continue
    parametros.set(chave, valor)
  }
  const consulta = parametros.toString()
  return consulta ? `${rota}?${consulta}` : rota
}

/**
 * Soma de um conjunto em que parte das linhas não tem valor. O total é
 * verdadeiro, mas só sobre quem tem dado: sem esta frase, a soma de 3 DMAICs
 * se lê como o ganho dos 8.
 */
function parcial(com: number | null, total: number | null): string | null {
  if (com === null || total === null || com === 0 || com >= total) return null
  return `soma de ${com} de ${total} com valor`
}

function juntar(partes: Array<string | null | undefined>): string | undefined {
  const limpo = partes.filter((p): p is string => !!p)
  return limpo.length > 0 ? limpo.join(' · ') : undefined
}

export function MeusDmaicsPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const navegar = useNavigate()

  // O portfólio e o inventário têm guarda de rota própria. Oferecer o link a
  // quem não tem a permissão levaria a pessoa à tela de acesso negado, que se
  // lê como defeito, e não como recorte de cargo.
  const podeVerProjetos = podeFazer('projeto.view')
  const podeVerProcessos = podeFazer('processo.view')

  const consulta = useQuery({
    queryKey: chaveMeusDmaics(empresaId),
    enabled: !!empresaId,
    queryFn: () => carregarMeusDmaics(empresaId!),
  })

  /**
   * `melhoria_dar_corpo` é idempotente: se o projeto já existe, ela devolve o
   * que existe em vez de criar um segundo. Não passa por `exigeLinhaAfetada`
   * porque não é um update barrado em silêncio: o gate dela levanta 42501, e
   * esse erro chega aqui como erro de mutation.
   */
  const darCorpo = useMutation({
    mutationFn: (id: string) => darCorpoAMelhoria(id),
    onSuccess: () => {
      // O projeto novo aparece em quatro leituras diferentes. Invalidar só
      // esta deixaria o portfólio e o cronograma sem o projeto que a pessoa
      // acabou de criar, e ela clicaria de novo achando que não funcionou.
      void queryClient.invalidateQueries({ queryKey: ['meus-dmaics'] })
      void queryClient.invalidateQueries({ queryKey: ['melhorias'] })
      void queryClient.invalidateQueries({ queryKey: ['projetos'] })
      void queryClient.invalidateQueries({ queryKey: ['portfolio-resumo'] })
      void queryClient.invalidateQueries({ queryKey: ['cronograma'] })
    },
  })

  const linhas = useMemo(() => consulta.data ?? [], [consulta.data])

  /**
   * Os cartões saem de `consulta.data`, nunca de `linhas`: com a consulta
   * falhada `linhas` cai para lista vazia e os quatro números virariam zero,
   * com a lista avisando do erro enquanto a capa afirma "nenhum DMAIC".
   *
   * Ganho estimado e ganho realizado só somam quando ALGUMA linha tem o valor.
   * `ganho_realizado` nasce nulo e só é preenchido no Control: somar nulo como
   * zero anunciaria "R$ 0 de ganho" para um DMAIC que ainda nem chegou lá.
   */
  const resumo = useMemo(() => {
    const dados = consulta.data
    if (!dados) {
      return {
        total: null,
        ativos: null,
        concluidos: null,
        atividades: null,
        comProjeto: null,
        estimado: null,
        realizado: null,
        comEstimado: null,
        comRealizado: null,
      }
    }
    // `atividades_abertas` de um DMAIC sem projeto volta 0 da RPC porque não
    // há projeto para contar atividade, e isso é "não se aplica", não zero.
    // Por isso a soma é só sobre quem já tem corpo, e o cartão fica sem dado
    // enquanto nenhum tiver.
    const comProjeto = dados.filter((d) => d.projeto_id !== null)
    const comEstimado = dados.filter((d) => d.ganho_estimado !== null)
    const comRealizado = dados.filter((d) => d.ganho_realizado !== null)
    return {
      total: dados.length,
      ativos: dados.filter((d) => d.status !== 'concluido').length,
      concluidos: dados.filter((d) => d.status === 'concluido').length,
      comProjeto: comProjeto.length,
      atividades:
        comProjeto.length === 0
          ? null
          : comProjeto.reduce((s, d) => s + d.atividades_abertas, 0),
      comEstimado: comEstimado.length,
      comRealizado: comRealizado.length,
      estimado:
        comEstimado.length === 0
          ? null
          : comEstimado.reduce((s, d) => s + (d.ganho_estimado ?? 0), 0),
      realizado:
        comRealizado.length === 0
          ? null
          : comRealizado.reduce((s, d) => s + (d.ganho_realizado ?? 0), 0),
    }
  }, [consulta.data])

  /**
   * Agrupa na ordem do método e, só depois, qualquer fase que a tela não
   * conheça. O Map preserva a ordem de inserção, então uma fase nova no banco
   * entra no fim da lista em vez de descartar a linha em silêncio.
   */
  const grupos = useMemo(() => {
    const mapa = new Map<string, MeuDmaic[]>()
    for (const fase of FASES_DA_LISTA) mapa.set(fase, [])
    for (const d of linhas) mapa.set(d.fase_atual, [...(mapa.get(d.fase_atual) ?? []), d])
    return [...mapa.entries()].filter(([, lista]) => lista.length > 0)
  }, [linhas])

  /**
   * "Ativos" é "não concluídos" (a RPC já descartou o cancelado). O detalhe diz
   * quantos dos seus fecharam: escrever "com os concluídos" sem nenhum
   * concluído afirmaria que existe algo fora da conta de cima.
   */
  const detalheDosAtivos =
    resumo.total === null || resumo.concluidos === null || resumo.total === 0
      ? undefined
      : resumo.concluidos === 0
        ? `${resumo.total} no total, nenhum concluído`
        : `${resumo.total} no total, ${resumo.concluidos} concluído${
            resumo.concluidos > 1 ? 's' : ''
          }`

  // O alerta de falha precisa dizer QUAL DMAIC não gravou: com a lista cheia,
  // um erro solto no topo não diz em qual botão a ação parou.
  const nomeQueFalhou = linhas.find((d) => d.id === darCorpo.variables)?.nome ?? null

  return (
    <Page
      title="Meus DMAICs"
      description="Os projetos de melhoria em que você é o belt"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoDeMetrica
            rotulo="DMAICs ativos"
            valor={resumo.ativos}
            icone={Sigma}
            detalhe={detalheDosAtivos}
            carregando={consulta.isLoading}
          />
          {/* Não é "abertas": a RPC conta todas as atividades do projeto (veja
              o defeito documentado no topo do arquivo). */}
          <CartaoDeMetrica
            rotulo="Atividades nos projetos"
            valor={resumo.atividades}
            detalhe={
              resumo.comProjeto === null
                ? undefined
                : resumo.comProjeto === 0
                  ? 'nenhum DMAIC seu tem projeto ainda'
                  : `em ${resumo.comProjeto} DMAIC${resumo.comProjeto > 1 ? 's' : ''} com projeto`
            }
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Ganho estimado"
            valor={resumo.estimado}
            formatar={fmt.moeda}
            detalhe={juntar([parcial(resumo.comEstimado, resumo.total)])}
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Ganho realizado"
            valor={resumo.realizado}
            formatar={fmt.moeda}
            tom="success"
            detalhe={juntar([
              parcial(resumo.comRealizado, resumo.total),
              'só é preenchido na fase Control',
            ])}
            carregando={consulta.isLoading}
          />
        </div>

        {darCorpo.error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              {/* Sem afirmar que nada foi gravado: um erro de rede pode chegar
                  depois do commit. Como a função é idempotente, o caminho
                  seguro é tentar de novo, e é isso que a frase oferece. */}
              {nomeQueFalhou
                ? `Não foi possível planejar as entregas de ${nomeQueFalhou}. ${mensagemDeErro(
                    darCorpo.error,
                  )} Tentar de novo é seguro: a ação não cria um segundo projeto.`
                : mensagemDeErro(darCorpo.error)}
            </p>
          </div>
        )}

        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={linhas.length}
          aoTentarDeNovo={() => void consulta.refetch()}
          carregandoNode={
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={`esqueleto-${i}`} className="h-28 rounded-lg" />
              ))}
            </div>
          }
          vazio={
            <SemCorrespondencia
              className="rounded-lg border border-border bg-card"
              titulo="Você não lidera nenhum DMAIC"
              descricao="A consulta respondeu: isto é ausência de correspondência, não falha de consulta. Nenhuma melhoria desta empresa tem você como belt. Quem define o belt é quem abre a melhoria, no quadro DMAIC."
              acao={
                podeVerProcessos ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => navegar('/processos/melhorias')}
                  >
                    Ver o quadro de melhorias
                  </Button>
                ) : undefined
              }
            />
          }
        >
          <div className="space-y-4">
            {grupos.map(([fase, lista]) => {
              const indice = FASES_DMAIC.indexOf(fase as (typeof FASES_DMAIC)[number])
              return (
                <section key={fase} className="space-y-2">
                  <header className="flex items-center gap-2">
                    {indice >= 0 && (
                      <span
                        className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                        aria-hidden
                      >
                        {indice + 1}
                      </span>
                    )}
                    <h2 className="text-sm font-semibold">{rotulo(rotulos.fase_dmaic, fase)}</h2>
                    <Badge variant="secondary">{lista.length}</Badge>
                  </header>

                  <ul className="space-y-2">
                    {lista.map((d) => (
                      <li key={d.id}>
                        <CartaoDoDmaic
                          dmaic={d}
                          podeVerProjetos={podeVerProjetos}
                          podeVerProcessos={podeVerProcessos}
                          planejando={darCorpo.isPending && darCorpo.variables === d.id}
                          aoPlanejar={() => darCorpo.mutate(d.id)}
                          aoAbrirProcesso={() =>
                            navegar(comRecorte('/processos/inventario', { processo: d.processo_id }))
                          }
                          aoAbrirProjeto={() =>
                            navegar(comRecorte('/execucao/projetos', { projeto: d.projeto_id }))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </EstadoDaTela>
      </div>
    </Page>
  )
}

function CartaoDoDmaic({
  dmaic: d,
  podeVerProjetos,
  podeVerProcessos,
  planejando,
  aoPlanejar,
  aoAbrirProcesso,
  aoAbrirProjeto,
}: {
  dmaic: MeuDmaic
  podeVerProjetos: boolean
  podeVerProcessos: boolean
  planejando: boolean
  aoPlanejar: () => void
  aoAbrirProcesso: () => void
  aoAbrirProjeto: () => void
}) {
  const prazo = fmt.data(d.termino_previsto)
  const vencido =
    !!d.termino_previsto && d.termino_previsto < hoje() && d.status !== 'concluido'

  return (
    <article className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{d.nome}</p>
          <p className="pt-0.5 text-xs text-muted-foreground">
            {d.processo_nome ?? 'sem processo vinculado'}
            {' · '}
            {d.area_nome ?? 'sem área'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{rotulo(rotulos.metodo_melhoria, d.metodo)}</Badge>
          {/* Status nunca só pela cor: o rótulo vai junto, sempre. */}
          <Badge variant={TOM_DO_STATUS[d.status] ?? 'secondary'}>
            {rotulo(rotulos.status_melhoria, d.status)}
          </Badge>
          {vencido && <Badge variant="destructive-subtle">Prazo vencido</Badge>}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] text-muted-foreground">Ganho estimado</dt>
          <dd className="pt-0.5 text-sm">
            <ValorOuSemDado valor={d.ganho_estimado} formatar={fmt.moeda} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Ganho realizado</dt>
          <dd className="pt-0.5 text-sm">
            {/* Só o Control preenche este campo. Antes dele, "sem dado" é a
                leitura correta, e um R$ 0 seria um resultado inventado. */}
            <ValorOuSemDado valor={d.ganho_realizado} formatar={fmt.moeda} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Término previsto</dt>
          <dd className="pt-0.5 text-sm">
            {prazo ? (
              <span className={vencido ? 'font-medium text-destructive' : undefined}>{prazo}</span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-muted-foreground"
                title="Sem prazo registrado."
              >
                <CircleAlert className="size-3.5" aria-hidden />
                sem prazo
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* O link já sai com `?processo=<uuid>`, a convenção de recorte do
          cronograma e dos painéis, mas o inventário ainda não lê o parâmetro
          (é de outra frente). Por isso o rótulo promete só o que acontece
          hoje: abrir o inventário. Nada de "ver o processo", que seria o botão
          prometendo um recorte que não chega. */}
      {d.processo_id && podeVerProcessos && (
        <div className="pt-3">
          <Button
            variant="link"
            size="xs"
            className="h-auto p-0"
            aria-label={`Abrir o inventário de processos, onde está ${
              d.processo_nome ?? 'o processo deste DMAIC'
            }`}
            onClick={aoAbrirProcesso}
          >
            <SquareArrowOutUpRight className="size-3" aria-hidden />
            Abrir o inventário de processos
          </Button>
        </div>
      )}

      {d.projeto_id === null ? (
        <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Este DMAIC ainda não tem projeto. Planejar entregas cria o projeto que permite a ele
            receber atividade, entrar em sprint e aparecer no cronograma. A ação é idempotente:
            clicar duas vezes não cria um segundo projeto, devolve o mesmo.
          </p>
          <Button
            size="sm"
            className="mt-2"
            disabled={planejando}
            aria-label={`Planejar entregas de ${d.nome}`}
            onClick={aoPlanejar}
          >
            {planejando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Planejar entregas
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs">
            {/* Aqui o zero é zero de verdade: existe projeto, a contagem rodou.
                Em palavras, para não parecer campo em branco. E "no projeto",
                não "aberta": a RPC conta todas (defeito documentado no topo). */}
            {d.atividades_abertas === 0
              ? 'Projeto criado, nenhuma atividade cadastrada.'
              : `${fmt.numero(d.atividades_abertas)} atividade${
                  d.atividades_abertas > 1 ? 's' : ''
                } no projeto.`}
          </p>
          {podeVerProjetos && (
            <Button
              variant="outline"
              size="xs"
              aria-label={`Abrir o projeto de ${d.nome} no portfólio`}
              onClick={aoAbrirProjeto}
            >
              <SquareArrowOutUpRight className="size-3" aria-hidden />
              Abrir no portfólio
            </Button>
          )}
        </div>
      )}
    </article>
  )
}
