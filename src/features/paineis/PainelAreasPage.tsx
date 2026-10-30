import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Farol } from '@/components/ui/farol'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { estadoDoFarol } from '@/features/okr/api'
import { SeletorDeAno } from '@/features/okr/SeletorDeAno'
import { carregarPainelDeAreas, type LinhaDoPainelDeAreas } from '@/features/paineis/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { baixarCsv } from '@/lib/exportar'
import { anoAtual, fmt, periodoAtual, rotulo, rotulos } from '@/lib/formato'
import { cn } from '@/lib/utils'

/**
 * CONVENÇÃO DE RECORTE NA URL, a mesma do painel executivo e do cronograma:
 *
 *   ?area=<uuid>     recorte de área (inclui as áreas abaixo dela)
 *   ?ano=<numero>    ano do ciclo
 *   ?status=<a,b>    lista separada por vírgula
 *   ?atraso=1        só os atrasados
 *
 * Chave sem valor não entra: `?area=` do outro lado vira filtro por string
 * vazia, que devolve zero linhas e se lê como "não há nada aqui".
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

function anoDaUrl(parametros: URLSearchParams): number {
  const bruto = Number(parametros.get('ano'))
  return Number.isInteger(bruto) && bruto >= 2000 && bruto <= 2100 ? bruto : anoAtual()
}

/**
 * Número que leva ao próprio recorte.
 *
 * É um <button> de verdade, e não um `onClick` na célula: a linha inteira já
 * navega no clique do mouse, e sem um alvo focável o teclado não chegaria a
 * lugar nenhum. `stopPropagation` impede que o clique do número também dispare
 * a navegação da linha.
 */
function NumeroComRecorte({
  para,
  descricao,
  className,
  children,
}: {
  para: string
  descricao: string
  className?: string
  children: React.ReactNode
}) {
  const navegar = useNavigate()
  return (
    <button
      type="button"
      aria-label={descricao}
      title={descricao}
      onClick={(evento) => {
        evento.stopPropagation()
        navegar(para)
      }}
      className={cn(
        'rounded-sm underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
    >
      {children}
    </button>
  )
}

type Grupo = {
  /** A área no topo da cadeia de `parent_area_id`: a diretoria. */
  raiz: LinhaDoPainelDeAreas
  /** A raiz e tudo que pende dela, na ordem que o banco devolveu. */
  linhas: LinhaDoPainelDeAreas[]
}

type Consolidado = {
  areas: number
  okrs: number
  krs: number
  projetos: number
  projetos_atrasados: number
  atividades_abertas: number
  processos: number
  melhorias_ativas: number
  atingimento: number | null
  kit_percentual: number | null
  areasComMedicao: number
  areasComKit: number
}

/**
 * Rótulo do clique de um número.
 *
 * `?area=` recorta a área E as áreas abaixo dela. Numa área folha isso é
 * exatamente o número da linha; numa área com gerências abaixo, o destino
 * mostra mais do que esta linha soma (a linha é só da própria área). Por isso,
 * quando há filhas, o rótulo descreve o RECORTE e não repete o número: prometer
 * "abrir os 5 processos" e entregar 8 é a desconfiança que o drill-down existe
 * para evitar.
 */
function descreveClique(
  item: string,
  contagem: number,
  areaNome: string,
  temFilhas: boolean,
): string {
  return temFilhas
    ? `Abrir ${item} de ${areaNome} e das áreas abaixo dela`
    : `Abrir ${contagem} ${item} de ${areaNome}`
}

/** Média das áreas QUE TÊM o número. Lista vazia devolve null, nunca zero. */
function media(valores: number[]): number | null {
  if (valores.length === 0) return null
  return valores.reduce((soma, v) => soma + v, 0) / valores.length
}

function consolidar(linhas: LinhaDoPainelDeAreas[]): Consolidado {
  const somar = (pegar: (l: LinhaDoPainelDeAreas) => number) =>
    linhas.reduce((total, l) => total + pegar(l), 0)

  const atingimentos = linhas
    .map((l) => l.atingimento)
    .filter((v): v is number => v !== null)
  const kits = linhas.map((l) => l.kit_percentual).filter((v): v is number => v !== null)

  return {
    areas: linhas.length,
    okrs: somar((l) => l.okrs),
    krs: somar((l) => l.krs),
    projetos: somar((l) => l.projetos),
    projetos_atrasados: somar((l) => l.projetos_atrasados),
    atividades_abertas: somar((l) => l.atividades_abertas),
    processos: somar((l) => l.processos),
    melhorias_ativas: somar((l) => l.melhorias_ativas),
    /* Média SIMPLES, e o rótulo diz isso. A ponderada exigiria o peso de cada
       KR, que a RPC não devolve: inventar peso aqui produziria um número que
       não fecha com o da árvore de OKR. Nenhuma área com medição devolve null,
       nunca zero. */
    atingimento: media(atingimentos),
    kit_percentual: media(kits),
    areasComMedicao: atingimentos.length,
    areasComKit: kits.length,
  }
}

/**
 * Uma área por linha, agrupada pela diretoria, para o diretor ver as gerências
 * dele juntas. A hierarquia vem de `parent_area_id`, que a RPC já devolve.
 *
 * Cada número é a porta de entrada da tela onde ele é detalhado, e leva o
 * recorte na URL. Filtrar por uma área inclui as áreas abaixo dela: por isso a
 * linha consolidada da diretoria e o destino do clique dela são o mesmo
 * conjunto. Já a linha de uma área é só daquela área, então o clique de uma
 * área COM filhas abre um conjunto maior, e o rótulo do clique diz isso em vez
 * de repetir o número (ver `descreveClique`).
 */
export function PainelAreasPage() {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const navegar = useNavigate()
  const [parametros, definirParametros] = useSearchParams()
  const ano = anoDaUrl(parametros)

  const consulta = useQuery({
    queryKey: chaves.painelAreas(empresaId, ano),
    enabled: !!empresaId,
    queryFn: () => carregarPainelDeAreas(empresaId!, ano),
  })

  const linhas = useMemo(() => consulta.data ?? [], [consulta.data])

  function mudarAno(novo: number) {
    const proximos = new URLSearchParams(parametros)
    proximos.set('ano', String(novo))
    definirParametros(proximos, { replace: true })
  }

  /* O Kit é sempre o do MÊS CORRENTE: painel_areas chama kit_matriz com
     to_char(current_date,'YYYY-MM'), e não com o ano selecionado. O drill-down
     leva esse período, senão o Kit abriria em outro mês e mostraria outro
     número. */
  const periodoDoKit = periodoAtual()

  const grupos = useMemo<Grupo[]>(() => {
    const porId = new Map(linhas.map((l) => [l.area_id, l]))

    /* Sobe a cadeia até a área sem pai conhecido. O `visitados` não é zelo
       decorativo: um organograma com ciclo (A filha de B, B filha de A) trava
       a tela inteira num while infinito, e o banco não proíbe isso hoje. */
    const raizDe = (linha: LinhaDoPainelDeAreas) => {
      let atual = linha
      const visitados = new Set<string>([linha.area_id])
      while (atual.parent_area_id) {
        const pai = porId.get(atual.parent_area_id)
        if (!pai || visitados.has(pai.area_id)) break
        visitados.add(pai.area_id)
        atual = pai
      }
      return atual
    }

    // A RPC ordena por tipo e nome, então a diretoria aparece antes das
    // gerências dela: a ordem de inserção do Map já é a ordem da tela.
    const mapa = new Map<string, Grupo>()
    for (const linha of linhas) {
      const raiz = raizDe(linha)
      const grupo = mapa.get(raiz.area_id) ?? { raiz, linhas: [] }
      grupo.linhas.push(linha)
      mapa.set(raiz.area_id, grupo)
    }
    return [...mapa.values()]
  }, [linhas])

  return (
    <Page
      title="Painel por área"
      /* Não promete "cada diretoria com as gerências dela": num organograma
         plano não há o que agrupar, e a linha consolidada não aparece. */
      description="Uma linha por área, agrupada pela diretoria"
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={linhas.length === 0}
            onClick={() =>
              baixarCsv(
                `painel-areas-${empresaAtiva?.nome_fantasia ?? 'empresa'}-${ano}`,
                grupos.flatMap((g) =>
                  g.linhas.map((l) => ({
                    diretoria: g.raiz.area_nome,
                    area: l.area_nome,
                    tipo: rotulo(rotulos.tipo_area, l.area_tipo),
                    responsavel: l.responsavel_nome ?? '',
                    okrs: l.okrs,
                    key_results: l.krs,
                    atingimento_pct: fmt.atingimento(l.atingimento) ?? '',
                    /* "cinza" é o nome interno do farol sem medição. Numa
                       planilha, ao lado de verde e vermelho, ele se lê como uma
                       quarta nota, e não como ausência de nota. */
                    farol: l.farol === 'cinza' ? 'sem dado' : l.farol,
                    projetos: l.projetos,
                    projetos_atrasados: l.projetos_atrasados,
                    atividades_abertas: l.atividades_abertas,
                    processos: l.processos,
                    melhorias_ativas: l.melhorias_ativas,
                    kit_periodo: periodoDoKit,
                    kit_pct: l.kit_percentual ?? '',
                  })),
                ),
              )
            }
          >
            <Download className="size-4" aria-hidden />
            Exportar
          </Button>
          <SeletorDeAno ano={ano} aoMudar={mudarAno} />
        </>
      }
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={linhas.length}
          aoTentarDeNovo={() => void consulta.refetch()}
          vazio={
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium">Nenhuma área cadastrada</p>
              <p className="pt-1 text-xs text-muted-foreground">
                Cadastre o organograma em Administração {'>'} Áreas.
              </p>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-56">Área</TableHead>
                  <TableHead className="text-center">OKRs</TableHead>
                  <TableHead className="min-w-36">Atingimento</TableHead>
                  <TableHead className="text-center">Projetos</TableHead>
                  <TableHead className="text-center">Atividades abertas</TableHead>
                  <TableHead className="text-center">Processos</TableHead>
                  <TableHead className="min-w-32">Kit ({fmt.mesAno(periodoDoKit)})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map((g) => {
                  const total = consolidar(g.linhas)
                  return (
                    <Fragment key={g.raiz.area_id}>
                      {/* --- cabeçalho da diretoria: o consolidado do ramo.
                          Só existe quando há o que consolidar: numa diretoria
                          sem gerências ele repetiria a linha de baixo palavra
                          por palavra. --- */}
                      {g.linhas.length > 1 && (
                        <TableRow className="bg-muted/60 hover:bg-muted/60">
                          <TableCell className="whitespace-normal">
                            <div className="max-w-[22rem]">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <NumeroComRecorte
                                  para={comRecorte('/gestao/kit', {
                                    area: g.raiz.area_id,
                                    periodo: periodoDoKit,
                                  })}
                                  descricao={`Abrir o Kit de gestão de ${g.raiz.area_nome} e das áreas abaixo dela`}
                                  className="text-sm font-semibold"
                                >
                                  {g.raiz.area_nome}
                                </NumeroComRecorte>
                                <Badge variant="outline">consolidado</Badge>
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {rotulo(rotulos.tipo_area, g.raiz.area_tipo)} e mais{' '}
                                {total.areas - 1} área(s) abaixo dela
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="text-center">
                            <NumeroComRecorte
                              para={comRecorte('/estrategia/okr', {
                                area: g.raiz.area_id,
                                ano,
                              })}
                              descricao={`Abrir os ${total.okrs} OKRs de ${g.raiz.area_nome} e das áreas abaixo dela`}
                              className="text-sm font-semibold"
                            >
                              {total.okrs}
                            </NumeroComRecorte>
                            <span className="block text-xs text-muted-foreground">
                              {total.krs} KR
                            </span>
                          </TableCell>

                          <TableCell>
                            <ValorOuSemDado
                              valor={fmt.atingimento(total.atingimento)}
                              formatar={(v) => `${v}%`}
                              className="text-sm font-semibold"
                            />
                            <span className="block text-xs text-muted-foreground">
                              {total.areasComMedicao === 0
                                ? 'nenhuma área com medição'
                                : `média simples de ${total.areasComMedicao} área(s)`}
                            </span>
                          </TableCell>

                          <TableCell className="text-center">
                            <NumeroComRecorte
                              para={comRecorte('/execucao/projetos', { area: g.raiz.area_id })}
                              descricao={`Abrir os ${total.projetos} projetos de ${g.raiz.area_nome} e das áreas abaixo dela`}
                              className="text-sm font-semibold"
                            >
                              {total.projetos}
                            </NumeroComRecorte>
                            {total.projetos_atrasados > 0 && (
                              <NumeroComRecorte
                                para={comRecorte('/execucao/projetos', {
                                  area: g.raiz.area_id,
                                  atraso: 1,
                                })}
                                descricao={`Abrir os ${total.projetos_atrasados} projetos atrasados de ${g.raiz.area_nome} e das áreas abaixo dela`}
                                className="ml-1.5"
                              >
                                <Badge variant="destructive-subtle">
                                  {total.projetos_atrasados} atras.
                                </Badge>
                              </NumeroComRecorte>
                            )}
                          </TableCell>

                          <TableCell className="text-center text-sm font-semibold">
                            {total.atividades_abertas}
                          </TableCell>

                          <TableCell className="text-center">
                            <NumeroComRecorte
                              para={comRecorte('/processos/inventario', {
                                area: g.raiz.area_id,
                              })}
                              descricao={`Abrir os ${total.processos} processos de ${g.raiz.area_nome} e das áreas abaixo dela`}
                              className="text-sm font-semibold"
                            >
                              {total.processos}
                            </NumeroComRecorte>
                            {/* Mesmo destino da linha de área: o número da
                                diretoria não pode ser o único do painel que
                                mostra uma contagem e não abre nada. */}
                            {total.melhorias_ativas > 0 && (
                              <NumeroComRecorte
                                para={comRecorte('/processos/melhorias', {
                                  area: g.raiz.area_id,
                                  status: 'em_andamento',
                                })}
                                descricao={`Abrir as ${total.melhorias_ativas} melhorias em andamento de ${g.raiz.area_nome} e das áreas abaixo dela`}
                                className="block w-full text-center text-xs text-muted-foreground"
                              >
                                {total.melhorias_ativas} melhoria(s)
                              </NumeroComRecorte>
                            )}
                          </TableCell>

                          <TableCell>
                            <BarraDeProgresso
                              valor={total.kit_percentual}
                              tom={
                                total.kit_percentual === null
                                  ? 'primary'
                                  : total.kit_percentual === 100
                                    ? 'success'
                                    : total.kit_percentual === 0
                                      ? 'destructive'
                                      : 'warning'
                              }
                              rotulo={`Kit consolidado de ${g.raiz.area_nome}`}
                            />
                            <span className="block pt-0.5 text-xs text-muted-foreground">
                              {total.areasComKit === 0
                                ? 'nenhuma área elegível'
                                : `média de ${total.areasComKit} área(s)`}
                            </span>
                          </TableCell>
                        </TableRow>
                      )}

                      {/* --- as áreas do ramo, a própria diretoria inclusive --- */}
                      {g.linhas.map((l) => {
                        const filha = l.area_id !== g.raiz.area_id
                        // Tem gerência (ou especialista) pendurada nela? Então
                        // o clique abre mais do que esta linha mostra.
                        const temFilhas = linhas.some((o) => o.parent_area_id === l.area_id)
                        return (
                          <TableRow
                            key={l.area_id}
                            /* O clique na linha repete o destino do nome da
                               área. Quem usa teclado chega pelo botão do nome;
                               o `onClick` aqui é só o atalho do mouse. */
                            onClick={() =>
                              navegar(
                                comRecorte('/gestao/kit', {
                                  area: l.area_id,
                                  periodo: periodoDoKit,
                                }),
                              )
                            }
                            className="cursor-pointer"
                          >
                            <TableCell className="whitespace-normal">
                              <div className={cn('max-w-[22rem]', filha && 'pl-4')}>
                                <NumeroComRecorte
                                  para={comRecorte('/gestao/kit', {
                                    area: l.area_id,
                                    periodo: periodoDoKit,
                                  })}
                                  descricao={`Abrir o Kit de gestão de ${l.area_nome}${
                                    temFilhas ? ' e das áreas abaixo dela' : ''
                                  }`}
                                  className="block text-left font-medium"
                                >
                                  {l.area_nome}
                                </NumeroComRecorte>
                                <span className="block text-xs text-muted-foreground">
                                  {rotulo(rotulos.tipo_area, l.area_tipo)}
                                  {l.responsavel_nome
                                    ? ` · ${l.responsavel_nome}`
                                    : ' · sem responsável'}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="text-center">
                              <NumeroComRecorte
                                para={comRecorte('/estrategia/okr', {
                                  area: l.area_id,
                                  ano,
                                })}
                                descricao={descreveClique('OKRs', l.okrs, l.area_nome, temFilhas)}
                                className="text-sm"
                              >
                                {l.okrs}
                              </NumeroComRecorte>
                              <span className="block text-xs text-muted-foreground">
                                {l.krs} KR
                              </span>
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Farol estado={estadoDoFarol(l.farol)} suave />
                                <ValorOuSemDado
                                  valor={fmt.atingimento(l.atingimento)}
                                  formatar={(v) => `${v}%`}
                                  className="text-sm"
                                />
                              </div>
                            </TableCell>

                            <TableCell className="text-center">
                              <NumeroComRecorte
                                para={comRecorte('/execucao/projetos', { area: l.area_id })}
                                descricao={descreveClique(
                                  'projetos',
                                  l.projetos,
                                  l.area_nome,
                                  temFilhas,
                                )}
                                className="text-sm"
                              >
                                {l.projetos}
                              </NumeroComRecorte>
                              {l.projetos_atrasados > 0 && (
                                <NumeroComRecorte
                                  para={comRecorte('/execucao/projetos', {
                                    area: l.area_id,
                                    atraso: 1,
                                  })}
                                  descricao={descreveClique(
                                    'projetos atrasados',
                                    l.projetos_atrasados,
                                    l.area_nome,
                                    temFilhas,
                                  )}
                                  className="ml-1.5"
                                >
                                  <Badge variant="destructive-subtle">
                                    {l.projetos_atrasados} atras.
                                  </Badge>
                                </NumeroComRecorte>
                              )}
                            </TableCell>

                            {/* Atividades abertas não tem tela de destino por
                                área hoje: minhas-atividades é só do usuário e o
                                kanban é por sprint. Fica sem clique de
                                propósito, em vez de prometer um recorte que
                                nenhuma rota entrega. */}
                            <TableCell className="text-center text-sm">
                              {l.atividades_abertas}
                            </TableCell>

                            <TableCell className="text-center">
                              <NumeroComRecorte
                                para={comRecorte('/processos/inventario', { area: l.area_id })}
                                descricao={descreveClique(
                                  'processos',
                                  l.processos,
                                  l.area_nome,
                                  temFilhas,
                                )}
                                className="text-sm"
                              >
                                {l.processos}
                              </NumeroComRecorte>
                              {l.melhorias_ativas > 0 && (
                                <NumeroComRecorte
                                  para={comRecorte('/processos/melhorias', {
                                    area: l.area_id,
                                    status: 'em_andamento',
                                  })}
                                  descricao={descreveClique(
                                    'melhorias em andamento',
                                    l.melhorias_ativas,
                                    l.area_nome,
                                    temFilhas,
                                  )}
                                  className="block w-full text-center text-xs text-muted-foreground"
                                >
                                  {l.melhorias_ativas} melhoria(s)
                                </NumeroComRecorte>
                              )}
                            </TableCell>

                            <TableCell>
                              <BarraDeProgresso
                                valor={l.kit_percentual}
                                tom={
                                  l.kit_percentual === null
                                    ? 'primary'
                                    : l.kit_percentual === 100
                                      ? 'success'
                                      : l.kit_percentual === 0
                                        ? 'destructive'
                                        : 'warning'
                                }
                                rotulo={`Kit de ${l.area_nome}`}
                              />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </EstadoDaTela>
      </div>

      <p className="pt-3 text-xs text-muted-foreground">
        O Kit é sempre o do mês corrente ({fmt.mesAno(periodoDoKit)}), não o do ano
        selecionado: é assim que a RPC o calcula. A linha consolidada soma a diretoria e as
        áreas abaixo dela; atingimento e Kit ali são média simples das áreas que têm medição, e
        área sem medição aparece como "sem dado", nunca como zero. Cada número abre a tela onde
        ele é detalhado levando a área (<span className="font-mono">?area=</span>) e o ano ou o
        período na URL.
      </p>
    </Page>
  )
}
