import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList,
  Grid2x2,
  Sparkles,
  Star,
  Target,
  TriangleAlert,
  Workflow,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { EstadoDaTela, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Farol } from '@/components/ui/farol'
import { Skeleton } from '@/components/ui/skeleton'
import { estadoDoFarol } from '@/features/okr/api'
import { SeletorDeAno } from '@/features/okr/SeletorDeAno'
import { carregarPainelExecutivo } from '@/features/paineis/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { anoAtual, fmt, periodoAtual } from '@/lib/formato'

/**
 * CONVENÇÃO DE RECORTE NA URL (idêntica no painel executivo, no painel por
 * área e no cronograma):
 *
 *   ?area=<uuid>     recorte de área (inclui as áreas abaixo dela)
 *   ?ano=<numero>    ano do ciclo
 *   ?status=<a,b>    lista separada por vírgula
 *   ?atraso=1        só os atrasados
 *
 * Fora dessas quatro, cada destino recebe o recorte que o número dele tem:
 * ?farol, ?perspectiva, ?okr, ?categoria, ?orfao, ?periodo, ?projeto.
 *
 * Chave sem valor não entra na URL. `?area=` do outro lado é filtro por string
 * vazia, e isso devolve lista vazia, que a tela de destino leria como "não há
 * nada aqui" em vez de "sem filtro de área".
 */
function comRecorte(
  rota: string,
  recorte: Record<string, string | number | null | undefined>,
): string {
  const parametros = new URLSearchParams()
  for (const [chave, valor] of Object.entries(recorte)) {
    if (valor === null || valor === undefined || valor === '') continue
    parametros.set(chave, String(valor))
  }
  const consulta = parametros.toString()
  return consulta ? `${rota}?${consulta}` : rota
}

/** O ano vive na URL, para o painel ser compartilhável e o voltar funcionar. */
function anoDaUrl(parametros: URLSearchParams): number {
  const bruto = Number(parametros.get('ano'))
  return Number.isInteger(bruto) && bruto >= 2000 && bruto <= 2100 ? bruto : anoAtual()
}

export function PainelExecutivoPage() {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const navegar = useNavigate()
  const [parametros, definirParametros] = useSearchParams()
  const ano = anoDaUrl(parametros)

  const consulta = useQuery({
    queryKey: chaves.painelExecutivo(empresaId, ano),
    enabled: !!empresaId,
    queryFn: () => carregarPainelExecutivo(empresaId!, ano),
  })

  const d = consulta.data

  function mudarAno(novo: number) {
    const proximos = new URLSearchParams(parametros)
    proximos.set('ano', String(novo))
    // `replace`: trocar o ano cinco vezes não pode exigir cinco cliques no
    // voltar para sair do painel.
    definirParametros(proximos, { replace: true })
  }

  /* O Kit do painel é sempre o do MÊS CORRENTE: a RPC chama kit_matriz com
     to_char(current_date,'YYYY-MM'), independente do ano selecionado. O
     drill-down leva esse mesmo período, senão a tela de destino abriria outro
     mês e mostraria outro número. */
  const periodoDoKit = periodoAtual()

  /* Guardas de "vazio não é zero". Quando o denominador não existe, a
     distribuição não é zero: ela não existe. Sem isto, o painel de uma empresa
     sem projeto nenhum mostra "0 projetos atrasados" em verde, que se lê como
     "está tudo em dia". */
  const temOkr = (d?.okr.total ?? 0) > 0
  const temProjetos = (d?.projetos.total ?? 0) > 0
  const temProcessos = (d?.processos.processos ?? 0) > 0
  const temAreasNoKit = (d?.kit.areas ?? 0) > 0

  /* Detalhe único dos quatro cartões de farol quando não há OKR no ciclo. Sem
     ele, "Sem medição" continuava dizendo "é falta de check-in" numa empresa
     que não tem OKR nenhum para medir. */
  const semOkrNoCiclo = temOkr ? undefined : `nenhum OKR aberto em ${ano}`

  return (
    <Page
      title="Painel executivo"
      description={empresaAtiva?.nome_fantasia ?? 'Visão consolidada'}
      actions={<SeletorDeAno ano={ano} aoMudar={mudarAno} />}
    >
      <EstadoDaTela
        carregando={consulta.isLoading}
        erro={consulta.error}
        quantidade={d ? 1 : 0}
        aoTentarDeNovo={() => void consulta.refetch()}
        carregandoNode={
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-lg" />
            <div className="grid gap-3 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          </div>
        }
      >
        {d && (
          <div className="space-y-6">
            {/* --- Estrela do Norte --- */}
            <section>
              <h2 className="flex items-center gap-1.5 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                <Star className="size-3.5 fill-warning text-warning" aria-hidden />
                Estrela do Norte
              </h2>

              {d.estrela_do_norte.length === 0 ? (
                <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
                  Nenhum objetivo marcado como Estrela do Norte no mapa desta empresa.
                </p>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {d.estrela_do_norte.map((e) => {
                    const conteudo = (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{e.titulo}</p>
                            <p className="pt-0.5 text-xs text-muted-foreground">
                              {e.kr_descricao ?? 'Nenhum key result mede este objetivo ainda'}
                            </p>
                          </div>
                          <Farol estado={estadoDoFarol(e.farol)} />
                        </div>

                        <div className="flex items-end justify-between gap-4 pt-3">
                          <div>
                            <p className="text-2xl font-semibold tracking-tight">
                              <ValorOuSemDado valor={e.atual} />
                              {e.unidade && e.atual !== null && (
                                <span className="pl-1 text-sm text-muted-foreground">
                                  {e.unidade}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              meta <ValorOuSemDado valor={e.meta} /> · base{' '}
                              <ValorOuSemDado valor={e.baseline} />
                            </p>
                          </div>
                          <div className="w-40">
                            <BarraDeProgresso
                              valor={
                                e.atingimento === null
                                  ? null
                                  : Math.max(0, Math.min(100, e.atingimento * 100))
                              }
                              tom={
                                e.farol === 'verde'
                                  ? 'success'
                                  : e.farol === 'amarelo'
                                    ? 'warning'
                                    : e.farol === 'vermelho'
                                      ? 'destructive'
                                      : 'info'
                              }
                              rotulo={`Atingimento de ${e.titulo}`}
                            />
                          </div>
                        </div>
                      </>
                    )

                    const classesDoCartao =
                      'rounded-lg border border-border bg-card p-4 shadow-sm'
                    const chave = `${e.objetivo_id}-${e.kr_id ?? 'sem-kr'}`

                    /* Sem OKR do ano não existe tela de destino: o objetivo
                       está no mapa e ninguém o mede ainda. Um cartão clicável
                       que cai numa árvore vazia é pior que um cartão parado. */
                    if (!e.okr_id) {
                      return (
                        <article key={chave} className={classesDoCartao}>
                          {conteudo}
                        </article>
                      )
                    }

                    return (
                      <button
                        key={chave}
                        type="button"
                        onClick={() =>
                          navegar(
                            comRecorte('/estrategia/okr', { ano, okr: e.okr_id }),
                          )
                        }
                        aria-label={`Abrir o OKR que mede ${e.titulo}`}
                        className={`${classesDoCartao} w-full text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
                      >
                        {conteudo}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            {/* --- Faróis de OKR --- */}
            <section>
              <h2 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                OKR em {ano}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <CartaoDeMetrica
                  rotulo="OKRs no ciclo"
                  valor={d.okr.total}
                  icone={Target}
                  aoClicar={() => navegar(comRecorte('/estrategia/okr', { ano }))}
                />
                <CartaoDeMetrica
                  rotulo="No ritmo"
                  valor={temOkr ? d.okr.verde : null}
                  tom={temOkr ? 'success' : 'neutro'}
                  detalhe={semOkrNoCiclo}
                  aoClicar={() =>
                    navegar(comRecorte('/estrategia/okr', { ano, farol: 'verde' }))
                  }
                />
                <CartaoDeMetrica
                  rotulo="Atenção"
                  valor={temOkr ? d.okr.amarelo : null}
                  tom={temOkr ? 'warning' : 'neutro'}
                  detalhe={semOkrNoCiclo}
                  aoClicar={() =>
                    navegar(comRecorte('/estrategia/okr', { ano, farol: 'amarelo' }))
                  }
                />
                <CartaoDeMetrica
                  rotulo="Risco"
                  valor={temOkr ? d.okr.vermelho : null}
                  tom={temOkr ? 'destructive' : 'neutro'}
                  detalhe={semOkrNoCiclo}
                  aoClicar={() =>
                    navegar(comRecorte('/estrategia/okr', { ano, farol: 'vermelho' }))
                  }
                />
                <CartaoDeMetrica
                  rotulo="Sem medição"
                  valor={temOkr ? d.okr.sem_dado : null}
                  detalhe={semOkrNoCiclo ?? 'não é zero: é falta de check-in'}
                  aoClicar={() =>
                    navegar(comRecorte('/estrategia/okr', { ano, farol: 'cinza' }))
                  }
                />
              </div>
            </section>

            {/* --- Mapa por perspectiva --- */}
            <section>
              <h2 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Mapa por perspectiva
              </h2>
              {d.perspectivas.length === 0 && (
                <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
                  Esta empresa ainda não tem as perspectivas do BSC cadastradas.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {d.perspectivas.map((p) => (
                  <button
                    key={p.perspectiva_id}
                    type="button"
                    onClick={() =>
                      navegar(
                        comRecorte('/estrategia/mapa', {
                          ano,
                          perspectiva: p.perspectiva_id,
                        }),
                      )
                    }
                    aria-label={`Abrir o mapa estratégico na perspectiva ${p.nome}`}
                    className="rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <p className="text-sm font-medium">{p.nome}</p>
                    {/* Os dois números têm recortes diferentes na RPC: objetivo
                        é do mapa inteiro, OKR é do ano. Lado a lado sem dizer
                        isso, "3 objetivo(s) · 1 OKR(s)" se lê como dois
                        objetivos sem OKR NESTE ano, que pode não ser o caso. */}
                    <p className="pt-0.5 text-xs text-muted-foreground">
                      {p.objetivos} objetivo(s) no mapa · {p.okrs} OKR(s) em {ano}
                    </p>
                    <div className="pt-3">
                      <BarraDeProgresso
                        valor={
                          p.atingimento === null
                            ? null
                            : Math.max(0, Math.min(100, p.atingimento * 100))
                        }
                        rotulo={`Atingimento de ${p.nome}`}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* --- Execução, processos e Kit --- */}
            <section>
              <h2 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Execução, processos e gestão
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* A carteira de projetos NÃO é recortada por ano na RPC: ela é
                    a empresa inteira. Mandar ?ano para o portfólio faria a tela
                    de destino mostrar um número menor que o do cartão, que é
                    exatamente a desconfiança que o drill-down existe para
                    eliminar. */}
                <CartaoDeMetrica
                  rotulo="Projetos"
                  valor={d.projetos.total}
                  icone={ClipboardList}
                  detalhe={
                    temProjetos
                      ? `${d.projetos.em_andamento} em andamento`
                      : 'nenhum projeto cadastrado ainda'
                  }
                  aoClicar={() => navegar('/execucao/projetos')}
                />
                <CartaoDeMetrica
                  rotulo="Projetos atrasados"
                  valor={temProjetos ? d.projetos.atrasados : null}
                  icone={TriangleAlert}
                  tom={
                    !temProjetos ? 'neutro' : d.projetos.atrasados > 0 ? 'destructive' : 'success'
                  }
                  detalhe={temProjetos ? undefined : 'sem carteira para avaliar'}
                  aoClicar={() => navegar(comRecorte('/execucao/projetos', { atraso: 1 }))}
                />
                <CartaoDeMetrica
                  rotulo="Projetos órfãos"
                  valor={temProjetos ? d.projetos.orfaos : null}
                  tom={!temProjetos ? 'neutro' : d.projetos.orfaos > 0 ? 'warning' : 'success'}
                  detalhe="sem responsável ou sem prazo"
                  aoClicar={() => navegar(comRecorte('/execucao/projetos', { orfao: 1 }))}
                />
                <CartaoDeMetrica
                  rotulo="Iniciativas de IA"
                  valor={temProjetos ? d.projetos.iniciativas_ia : null}
                  icone={Sparkles}
                  tom={temProjetos ? 'info' : 'neutro'}
                  aoClicar={() =>
                    navegar(comRecorte('/execucao/projetos', { categoria: 'ia' }))
                  }
                />

                <CartaoDeMetrica
                  rotulo="Processos mapeados"
                  valor={d.processos.processos}
                  icone={Workflow}
                  detalhe={
                    temProcessos
                      ? `${d.processos.com_sipoc} com SIPOC`
                      : 'nenhum processo no inventário'
                  }
                  aoClicar={() => navegar('/processos/inventario')}
                />
                <CartaoDeMetrica
                  rotulo="Melhorias em curso"
                  valor={d.processos.melhorias_ativas}
                  aoClicar={() =>
                    navegar(comRecorte('/processos/melhorias', { status: 'em_andamento' }))
                  }
                />
                <CartaoDeMetrica
                  rotulo="Ganho realizado"
                  valor={d.processos.ganho_realizado}
                  formatar={fmt.moeda}
                  /* Verde só com ganho maior que zero. R$ 0 em verde se lê como
                     conquista; ele é o total lançado até agora, que é zero. */
                  tom={(d.processos.ganho_realizado ?? 0) > 0 ? 'success' : 'neutro'}
                  detalhe={
                    d.processos.ganho_estimado !== null
                      ? `estimado ${fmt.moeda(d.processos.ganho_estimado)}`
                      : 'nenhum ganho estimado lançado'
                  }
                  /* O ganho soma TODAS as melhorias, de qualquer status: o
                     destino é a lista inteira, sem recorte, porque recortar
                     aqui mostraria uma soma menor que a do cartão. */
                  aoClicar={() => navegar('/processos/melhorias')}
                />
                <CartaoDeMetrica
                  rotulo="Kit de gestão"
                  valor={d.kit.percentual_medio}
                  formatar={(v) => `${Math.round(v)}%`}
                  icone={Grid2x2}
                  tom={
                    d.kit.percentual_medio === null
                      ? 'neutro'
                      : d.kit.percentual_medio >= 80
                        ? 'success'
                        : d.kit.percentual_medio >= 40
                          ? 'warning'
                          : 'destructive'
                  }
                  detalhe={
                    temAreasNoKit
                      ? `${d.kit.em_dia} de ${d.kit.areas} áreas completas em ${fmt.mesAno(periodoDoKit)}`
                      : 'nenhuma área elegível ao Kit neste mês'
                  }
                  aoClicar={() => navegar(comRecorte('/gestao/kit', { periodo: periodoDoKit }))}
                />
              </div>
            </section>

            {/* O texto antigo prometia recorte em TODO cartão, e três deles
                abrem a lista inteira de propósito (a carteira de projetos, o
                inventário e o ganho não são recortados por ano na RPC). Texto
                que promete o que a tela não faz custa mais caro que texto
                nenhum. */}
            <p className="text-xs text-muted-foreground">
              Cada cartão abre a tela onde o número é detalhado, levando na URL o recorte que
              ele representa (ano, farol, perspectiva, atraso, período). Os cartões que contam a
              carteira inteira abrem a lista sem filtro, porque recortar ali mostraria menos que
              o número da capa. Números ausentes aparecem como "sem dado", nunca como zero.{' '}
              <Badge variant="outline" className="ml-1">
                gerado em {new Date(d.gerado_em).toLocaleString('pt-BR')}
              </Badge>
            </p>
          </div>
        )}
      </EstadoDaTela>
    </Page>
  )
}
