import { useQuery } from '@tanstack/react-query'
import { Network, Route, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CarregandoTabela, EstadoDaTela } from '@/components/ui/estado-da-tela'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { listarComites } from '@/features/comites/api'
import { SeletorDeAno } from '@/features/okr/SeletorDeAno'
import { carregarPainelDeComite } from '@/features/paineis/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { anoAtual, fmt, rotulo, rotulos } from '@/lib/formato'

/**
 * O payload de `app.painel_comite` mudou na migration 0026: ela deixou de
 * receber `area_id` e passou a receber `comite_id`, e cada item agora vem com o
 * nome da área DELE. O tipo `PainelDeComite` exportado por
 * `src/features/paineis/api.ts` ainda descreve o formato antigo (area_id, tipo,
 * itens sem área) e aquele arquivo é de outra frente nesta rodada.
 *
 * Este tipo é o que a função devolve hoje, conferido contra a definição da
 * 0026. Quando o api.ts for corrigido, este bloco e o cast somem.
 */
type ItemComArea = { area_nome: string | null }

type PainelTransversal = {
  comite_id: string
  nome: string
  descricao: string | null
  cadencia: string | null
  coordenador: string | null
  ano: number
  membros: { user_id: string; nome: string | null; papel: string }[]
  okrs: (ItemComArea & { id: string; titulo: string; nivel: string; status: string })[]
  projetos: (ItemComArea & {
    id: string
    nome: string
    status: string
    progresso_pct: number
    termino_previsto: string | null
  })[]
  processos: (ItemComArea & { id: string; nome: string; nivel_maturidade: number })[]
  /** Áreas distintas entre os itens acompanhados. É o número que justifica o fórum. */
  areas_atravessadas: number
}

const SEM_AREA = 'Sem área'

/** Chave estável do grupo de itens sem área, que nenhum nome de área produz. */
const CHAVE_SEM_AREA = 'grupo:sem-area'

type GrupoDeArea<T> = {
  /** `null` é "item sem área", e não uma área que se chame "Sem área". */
  area: string | null
  itens: T[]
}

/**
 * Agrupa mantendo a ordem em que a RPC devolveu (ela já ordena por nome de
 * área). Item sem área entra num grupo próprio e nomeado, em vez de sumir:
 * item sem área é exatamente o que o comitê não consegue devolver para ninguém.
 *
 * A chave do Map é `null` para esse grupo, e não a string "Sem área": uma área
 * de verdade com esse nome cairia no mesmo balde, e a tela contaria os dois
 * casos como um só.
 */
function agruparPorArea<T extends ItemComArea>(itens: T[]): GrupoDeArea<T>[] {
  const grupos = new Map<string | null, T[]>()
  for (const item of itens) {
    const chave = item.area_nome
    const atual = grupos.get(chave)
    if (atual) atual.push(item)
    else grupos.set(chave, [item])
  }
  return [...grupos].map(([area, lista]) => ({ area, itens: lista }))
}

/**
 * O painel do fórum transversal.
 *
 * O ponto da tela é mostrar que o comitê ATRAVESSA áreas: por isso todo item
 * aparece agrupado pela área de onde ele vem, e "áreas atravessadas" é o
 * primeiro número da capa. Um comitê que atravessa uma área só não é um comitê,
 * é uma reunião de equipe, e a tela precisa deixar isso visível.
 *
 * Linguagem: o comitê ACOMPANHA o item. Ele não é dono dele. O texto antigo
 * dizia "nenhum processo sob este comitê", que é a frase do modelo errado, o
 * que fazia o item precisar trocar de área para entrar na pauta.
 */
export function PainelComitesPage() {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const [ano, setAno] = useState(anoAtual())
  const [escolhido, setEscolhido] = useState<string | null>(null)

  const comites = useQuery({
    // `chaves.comites` ainda não existe em src/lib/chaves.ts, e aquele arquivo
    // não é desta frente. A chave está escrita na forma exata que ela terá lá
    // (['comites', empresa]), para a invalidação continuar casando depois.
    queryKey: ['comites', empresaId] as const,
    enabled: !!empresaId,
    queryFn: () => listarComites(empresaId!),
  })

  const lista = useMemo(() => comites.data ?? [], [comites.data])

  /* Seleção DERIVADA, sem setState durante o render. Trocar de empresa troca a
     lista inteira: sem o `some`, o id do comitê da empresa anterior continuaria
     escolhido e o painel pediria ao banco um comitê de outro tenant, que volta
     42501 em vez de trocar de assunto. */
  const comiteId =
    escolhido && lista.some((c) => c.id === escolhido) ? escolhido : (lista[0]?.id ?? null)

  const consulta = useQuery({
    queryKey: chaves.painelComite(comiteId, ano),
    enabled: !!comiteId,
    queryFn: async () =>
      (await carregarPainelDeComite(comiteId!, ano)) as unknown as PainelTransversal,
  })

  const d = consulta.data

  /* O `!!empresaId` vem primeiro: sem empresa ativa a consulta nem roda
     (`enabled`), e a lista fica vazia por não ter sido feita. Sem essa guarda a
     tela diria "esta empresa ainda não tem nenhum comitê" quando não há empresa
     nenhuma a respeito de quem afirmar coisa alguma. */
  const semComites = !!empresaId && !comites.isLoading && !comites.error && lista.length === 0

  /* Os nomes das áreas saem dos itens; o NÚMERO sai da RPC, que conta area_id
     distinto. Item sem área não entra em nenhum dos dois lados, então ele não
     produz divergência.

     O que produz: `app.areas` NÃO tem unique em (company_id, nome), então duas
     gerências "Comercial" em diretorias diferentes são dois area_id e um nome
     só. A RPC conta 2 e esta lista mostra 1 chip. Quando isso acontece, o
     número da capa é o correto, e a linha abaixo dos chips diz isso em vez de
     deixar o usuário conferir na mão e concluir que a tela errou. */
  const areas = useMemo(() => {
    if (!d) return []
    const nomes = new Set<string>()
    for (const item of [...d.okrs, ...d.projetos, ...d.processos]) {
      if (item.area_nome) nomes.add(item.area_nome)
    }
    return [...nomes].toSorted((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [d])

  const nomesDeAreaSeRepetem = !!d && areas.length < d.areas_atravessadas

  return (
    <Page
      title="Painel de comitês"
      description="O que cada fórum transversal acompanha, e em quantas áreas"
      actions={
        <>
          <div className="w-64">
            <SearchableSelect
              options={lista.map((c) => ({
                value: c.id,
                label: c.nome,
                description: c.cadencia
                  ? rotulo(rotulos.periodicidade, c.cadencia)
                  : 'sem cadência definida',
              }))}
              value={comiteId}
              onChange={setEscolhido}
              placeholder="Selecionar comitê"
              aria-label="Comitê"
              clearable={false}
              disabled={lista.length === 0}
            />
          </div>
          <SeletorDeAno ano={ano} aoMudar={setAno} />
        </>
      }
    >
      {/* Enquanto a lista de comitês carrega não existe comiteId, e sem ele nem
          o painel nem o estado vazio renderizam: a tela ficaria em branco, sem
          dizer que está buscando alguma coisa. */}
      {comites.isLoading && <CarregandoTabela linhas={4} />}

      {!empresaId && (
        <p className="px-6 py-12 text-center text-xs text-muted-foreground">
          Nenhuma empresa ativa. Este painel é sempre o de uma empresa, e sem ela não há
          recorte para mostrar.
        </p>
      )}

      {comites.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive-subtle px-6 py-5 text-center">
          <p role="alert" className="text-sm font-medium text-destructive-subtle-foreground">
            A lista de comitês não carregou. Esta tela NÃO está afirmando que a empresa não
            tem comitês.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void comites.refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {/* Empresa sem comitê nenhum não ganha painel vazio: painel vazio se lê
          como "o comitê existe e não tem nada", que é outra afirmação. */}
      {semComites && (
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-card px-6 py-12 text-center">
          <Route className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="pt-2 text-sm font-medium">Esta empresa ainda não tem nenhum comitê</p>
          <p className="pt-2 text-xs text-muted-foreground">
            Comitê é um fórum transversal: ele acompanha OKRs, projetos e processos de várias
            áreas ao mesmo tempo, sem ser dono de nenhum deles. Sem um comitê cadastrado, não
            há recorte para este painel mostrar.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/admin/comites">Cadastrar comitês</Link>
          </Button>
        </div>
      )}

      {comiteId && (
        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={d ? 1 : 0}
          aoTentarDeNovo={() => void consulta.refetch()}
          /* Sem isto, a falta de payload cairia no texto padrão "nenhum registro
             corresponde aos filtros", que afirma que o comitê está vazio. Não
             ter payload é outra coisa: a RPC não devolveu o objeto. */
          vazio={
            <p className="px-6 py-12 text-center text-xs text-muted-foreground">
              O painel deste comitê não voltou. Isto NÃO quer dizer que ele esteja sem itens:
              quer dizer que a consulta não devolveu o recorte.
            </p>
          }
        >
          {d && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Três casos, e não dois. Zero área não é "uma área só": ou o
                    comitê ainda não acompanha nada, ou tudo o que ele acompanha
                    está sem área. A frase da reunião de equipe só vale em 1. */}
                <CartaoDeMetrica
                  rotulo="Áreas atravessadas"
                  valor={d.areas_atravessadas}
                  icone={Network}
                  tom={
                    d.areas_atravessadas > 1
                      ? 'info'
                      : d.areas_atravessadas === 1
                        ? 'warning'
                        : 'neutro'
                  }
                  detalhe={
                    d.areas_atravessadas > 1
                      ? 'áreas distintas entre os itens acompanhados'
                      : d.areas_atravessadas === 1
                        ? 'um fórum que atravessa uma área só é uma reunião de equipe'
                        : 'nenhum item acompanhado tem área definida'
                  }
                />
                <CartaoDeMetrica
                  rotulo={`OKRs de ${d.ano}`}
                  valor={d.okrs.length}
                  detalhe="acompanhados por este comitê"
                />
                <CartaoDeMetrica
                  rotulo="Projetos"
                  valor={d.projetos.length}
                  detalhe="acompanhados por este comitê"
                />
                <CartaoDeMetrica
                  rotulo="Processos"
                  valor={d.processos.length}
                  detalhe="acompanhados por este comitê"
                />
              </div>

              <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">{d.nome}</h2>
                <p className="pt-1 text-xs text-muted-foreground">
                  {d.coordenador ? `Coordenado por ${d.coordenador}` : 'Sem coordenador'} ·{' '}
                  {d.cadencia
                    ? rotulo(rotulos.periodicidade, d.cadencia)
                    : 'sem cadência definida'}
                </p>
                {d.descricao && <p className="pt-2 text-sm">{d.descricao}</p>}

                <div className="pt-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    <Users className="size-3.5" aria-hidden />
                    Quem senta na mesa
                  </h3>
                  {d.membros.length === 0 ? (
                    <p className="pt-1.5 text-xs text-warning-subtle-foreground">
                      Nenhum membro registrado. Sem lista de presença não há de quem cobrar a
                      leitura dos itens abaixo.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5 pt-1.5">
                      {d.membros.map((m) => (
                        <li key={m.user_id}>
                          <Badge variant="secondary">
                            {m.nome ?? 'sem nome no cadastro'}
                            {/* O papel vem do check da 0026 (coordenador, membro,
                                convidado) e já é legível em português. Um mapa de
                                rótulo aqui só repetiria a mesma palavra. */}
                            <span className="text-muted-foreground"> · {m.papel}</span>
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="pt-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    <Network className="size-3.5" aria-hidden />
                    Áreas que este comitê atravessa
                  </h3>
                  {areas.length === 0 ? (
                    <p className="pt-1.5 text-xs text-muted-foreground">
                      Nenhuma ainda: o comitê não acompanha nenhum item que esteja numa área.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5 pt-1.5">
                      {areas.map((a) => (
                        <li key={a}>
                          <Badge variant="info-subtle">{a}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {nomesDeAreaSeRepetem && (
                    <p className="pt-1.5 text-xs text-warning-subtle-foreground">
                      A capa conta {d.areas_atravessadas} áreas e acima há {areas.length} nomes
                      distintos: duas áreas diferentes têm o mesmo nome, o que o organograma
                      permite (uma gerência "Comercial" em cada diretoria, por exemplo). O
                      número da capa é o correto.
                    </p>
                  )}
                  <p className="pt-2 text-xs text-muted-foreground">
                    Cada item continua sendo da área dele e continua contando no Kit, no OPR e
                    no bônus daquela área. O comitê acompanha, não é dono.
                  </p>
                </div>
              </section>

              <Bloco
                titulo={`OKRs de ${d.ano} acompanhados`}
                vazio={`Nenhum OKR de ${d.ano} é acompanhado por este comitê.`}
                grupos={agruparPorArea(d.okrs)}
                renderizar={(o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="min-w-48 flex-1 text-sm">{o.titulo}</span>
                    <Badge variant="outline">{rotulo(rotulos.nivel_okr, o.nivel)}</Badge>
                    <Badge variant="secondary">{rotulo(rotulos.status_okr, o.status)}</Badge>
                  </li>
                )}
              />

              <Bloco
                titulo="Projetos acompanhados"
                vazio="Nenhum projeto é acompanhado por este comitê."
                grupos={agruparPorArea(d.projetos)}
                renderizar={(p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="min-w-48 flex-1 text-sm">{p.nome}</span>
                    <Badge variant="secondary">{rotulo(rotulos.status_projeto, p.status)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {fmt.data(p.termino_previsto) ?? 'sem prazo'}
                    </span>
                    <BarraDeProgresso
                      className="w-36"
                      valor={p.progresso_pct}
                      rotulo={`Progresso de ${p.nome}`}
                    />
                  </li>
                )}
              />

              <Bloco
                titulo="Processos acompanhados"
                vazio="Nenhum processo é acompanhado por este comitê."
                grupos={agruparPorArea(d.processos)}
                renderizar={(p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 text-sm">{p.nome}</span>
                    {/* `role="img"` porque as barrinhas são a única pista do nível
                        aqui: sem ele o aria-label num span é ignorado e o leitor
                        de tela não recebe nada. */}
                    <span
                      role="img"
                      className="inline-flex gap-0.5"
                      aria-label={`Maturidade ${p.nivel_maturidade} de 5`}
                    >
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={`${p.id}-nivel-${i + 1}`}
                          aria-hidden
                          className={
                            i < p.nivel_maturidade
                              ? 'h-3 w-1.5 rounded-sm bg-primary'
                              : 'h-3 w-1.5 rounded-sm bg-muted'
                          }
                        />
                      ))}
                    </span>
                  </li>
                )}
              />

              <p className="text-xs text-muted-foreground">
                O ano recorta só os OKRs, que têm ciclo anual. Projeto e processo não têm ano
                de ciclo e aparecem inteiros, independentemente do seletor.
              </p>
            </div>
          )}
        </EstadoDaTela>
      )}
    </Page>
  )
}

/**
 * Bloco de itens agrupado por área.
 *
 * O agrupamento é o argumento visual da tela: ver "Tesouraria (3)",
 * "Controladoria (2)" e "Suprimentos (1)" dentro do mesmo comitê é o que prova
 * que o fórum é transversal. Uma lista corrida esconderia isso.
 */
function Bloco<T extends ItemComArea>({
  titulo,
  vazio,
  grupos,
  renderizar,
}: {
  titulo: string
  vazio: string
  grupos: GrupoDeArea<T>[]
  renderizar: (item: T) => React.ReactNode
}) {
  /* O grupo "Sem área" NÃO conta como área no cabeçalho. Ele contava, e aí um
     bloco com duas áreas mais itens órfãos anunciava "3 áreas" enquanto a capa
     dizia 2, porque a RPC só conta area_id não nulo. Dois números para a mesma
     grandeza, discordando na mesma tela. */
  const comArea = grupos.filter((g) => g.area !== null).length
  const temSemArea = grupos.some((g) => g.area === null)
  const totalDeItens = grupos.reduce((soma, g) => soma + g.itens.length, 0)

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-wider uppercase">{titulo}</h2>
        {grupos.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {totalDeItens === 1 ? '1 item' : `${totalDeItens} itens`}
            {comArea > 0 && (comArea === 1 ? ' em 1 área' : ` em ${comArea} áreas`)}
            {temSemArea && (comArea > 0 ? ', mais itens sem área' : ', todos sem área')}
          </span>
        )}
      </header>

      {grupos.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">{vazio}</p>
          <p className="pt-1 text-xs text-muted-foreground">
            O vínculo se cria na tela do próprio item, não aqui: quem cuida do item é quem
            diz que ele entra na pauta do fórum.
          </p>
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g.area ?? CHAVE_SEM_AREA}>
            <h3 className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-1.5 text-xs font-medium">
              <span className={g.area === null ? 'text-warning-subtle-foreground' : undefined}>
                {g.area ?? SEM_AREA}
              </span>
              <span className="text-muted-foreground">
                {g.itens.length === 1 ? '1 item' : `${g.itens.length} itens`}
              </span>
            </h3>
            <ul className="divide-y divide-border">{g.itens.map((item) => renderizar(item))}</ul>
          </div>
        ))
      )}
    </section>
  )
}
