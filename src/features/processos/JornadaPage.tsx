import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Circle,
  CircleCheck,
  CircleDashed,
  FileText,
  Gauge,
  Route,
  TriangleAlert,
  Trophy,
  Workflow,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Page } from '@/components/shell/Page'
import { ActiveFiltersBar } from '@/components/ui/active-filters-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela, SemCorrespondencia } from '@/components/ui/estado-da-tela'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listarAreas } from '@/features/admin/api'
import {
  carregarJornada,
  criarIndicador,
  SELOS,
  type DadosDoIndicador,
  type LinhaDaJornada,
  type Selo,
} from '@/features/processos/api'
import { FormularioDeIndicador } from '@/features/processos/FormularioDeIndicador'
import { MissoesDaSemana } from '@/features/processos/MissoesDaSemana'
import { PainelDoFluxo } from '@/features/processos/PainelDoFluxo'
import { PainelDoPop } from '@/features/processos/PainelDoPop'
import { PlacarDasAreas } from '@/features/processos/PlacarDasAreas'
import { SelosDaJornada } from '@/features/processos/SelosDaJornada'
import { TrilhaDeMapeamento } from '@/features/processos/TrilhaDeMapeamento'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import type { Filtros } from '@/lib/filtros'
import { rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

/**
 * A jornada de mapeamento.
 *
 * Mapear processo é trabalho chato que ninguém cobra, e é por isso que
 * planilha de mapeamento morre no terceiro mês. Esta tela não inventa um
 * dado novo: ela torna visível e comparável o que já está no banco, em três
 * alturas (a semana, a área, o processo). Lúdico aqui é placar e meta curta,
 * com a seriedade de um sistema de gestão.
 *
 * E, principalmente: A TELA QUE APONTA O BURACO É A QUE O TAMPA. Cada selo
 * apagado abre, daqui mesmo, a camada que produz o dado que falta; cada missão
 * recorta a lista nos processos exatamente daquela lacuna; e a busca por texto
 * existe porque achar um processo entre 41 nomes de 160 caracteres era o
 * gargalo real. Sem isso o gerente decorava o nome, ia para o inventário e
 * gastava oito cliques para chegar onde o clique já estava.
 */

/** As camadas que a jornada consegue abrir por cima do processo. */
type Camada = 'trilha' | 'fluxo' | 'pop' | 'indicador'

/**
 * Para onde cada selo apagado leva.
 *
 * `dono` e `sipoc` caem na mesma trilha porque ela pergunta as duas coisas em
 * sequência (dono no passo 1, SIPOC nos passos 2 e 3). `melhoria` é NULO de
 * propósito: o formulário de melhoria não recebe o processo por parâmetro, e
 * abrir um formulário que não sabe de qual processo está falando devolveria o
 * usuário ao problema de decorar o nome. Enquanto ele não aceitar um processo
 * inicial, o selo de melhoria continua informativo.
 */
const CAMADA_DO_SELO: Record<Selo, Camada | null> = {
  dono: 'trilha',
  sipoc: 'trilha',
  fluxo: 'fluxo',
  pop: 'pop',
  indicador: 'indicador',
  melhoria: null,
}

const SELOS_COM_DESTINO: readonly Selo[] = SELOS.filter((s) => CAMADA_DO_SELO[s] !== null)

/**
 * Quais selos esta pessoa consegue de fato fechar.
 *
 * `processo.edit` abre todos os que têm destino. `pop.aprovar` é permissão
 * PRÓPRIA: `app.processo_pop_aprovar` exige só ela (ou ser admin da empresa),
 * então quem a tem fecha o selo do POP mesmo sem `processo.edit`. Esconder o
 * atalho dele deixaria a tela mais restritiva que a policy, que é o mesmo
 * defeito do botão que promete o que o banco nega, só na direção contrária.
 */
function selosQuePodeAcionar(
  podeEditar: boolean,
  podeAprovarPop: boolean,
  temEmpresa: boolean,
): readonly Selo[] {
  const base = podeEditar ? SELOS_COM_DESTINO : podeAprovarPop ? ['pop' as Selo] : []
  // Sem empresa ativa o insert do indicador ficaria sem `company_id`. O selo
  // continua informativo em vez de abrir um formulário que não tem como gravar.
  return temEmpresa ? base : base.filter((s) => s !== 'indicador')
}

/**
 * O código da missão vira o recorte da lista. Os códigos são os da função
 * `app.jornada_lacunas`: se um nascer lá e não entrar aqui, a missão deixa de
 * filtrar (e a tela avisa, em vez de mostrar a lista inteira como se o filtro
 * tivesse valido).
 */
const LACUNA: Record<string, (l: LinhaDaJornada) => boolean> = {
  dar_dono: (l) => !l.selo_dono,
  completar_sipoc: (l) => !l.selo_sipoc,
  mapear_fluxo: (l) => !l.selo_fluxo,
  publicar_pop: (l) => !l.selo_pop,
  registrar_indicador: (l) => !l.selo_indicador,
  fechar_pendencia: (l) => l.pendencia_de_mapeamento !== null,
}

const ROTULO_DA_LACUNA: Record<string, string> = {
  dar_dono: 'dar dono',
  completar_sipoc: 'fechar o SIPOC',
  mapear_fluxo: 'desenhar o fluxo',
  publicar_pop: 'publicar o POP',
  registrar_indicador: 'registrar indicador',
  fechar_pendencia: 'resolver pendência',
}

/**
 * Busca sem acento e sem caixa. "logistica" precisa achar "Logística": um
 * filtro que exige o acento certo é um filtro que a pessoa usa uma vez.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function JornadaPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const podeEditar = podeFazer('processo.edit')
  const podeAprovarPop = podeFazer('pop.aprovar')
  const selosAcionaveis = selosQuePodeAcionar(podeEditar, podeAprovarPop, !!empresaId)

  const [areaId, setAreaId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [lacuna, setLacuna] = useState<string | null>(null)
  // Guardamos o ID, não o objeto capturado no clique: gravar pela camada muda a
  // linha no banco, e com a foto do clique o painel continuaria exibindo os
  // selos de antes da gravação, que é o oposto do que esta tela promete.
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [ultimoSelecionado, setUltimoSelecionado] = useState<LinhaDaJornada | null>(null)
  const [camadaInicial, setCamadaInicial] = useState<Camada | null>(null)

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  // O filtro de área viaja até o banco como argumento da função: recortar no
  // navegador o que a RPC já sabe recortar é o caminho para a tela divergir do
  // placar, que é calculado lá. Busca e lacuna são o oposto: recortam uma lista
  // que já veio inteira, e ir ao banco de novo só adicionaria espera.
  const consulta = useQuery({
    queryKey: chaves.jornada(empresaId, areaId),
    enabled: !!empresaId,
    queryFn: () => carregarJornada(empresaId!, areaId),
  })

  const linhas = useMemo(() => consulta.data ?? [], [consulta.data])
  const areaNome = (areas.data ?? []).find((a) => a.id === areaId)?.nome ?? null

  const linhasVisiveis = useMemo(() => {
    const termo = normalizar(busca)
    const teste = lacuna === null ? undefined : LACUNA[lacuna]
    return linhas.filter((l) => {
      if (teste && !teste(l)) return false
      if (termo === '') return true
      return normalizar(`${l.nome} ${l.categoria ?? ''} ${l.area_nome ?? ''}`).includes(termo)
    })
  }, [linhas, busca, lacuna])

  const filtroLocalAtivo = lacuna !== null || busca.trim() !== ''
  // Código de missão que a tela não sabe traduzir em lacuna. Filtrar por nada e
  // mostrar a lista inteira faria o usuário acreditar que todos os processos
  // são os da missão.
  const lacunaDesconhecida = lacuna !== null && !LACUNA[lacuna]

  const filtrosDaLista: Filtros = useMemo(() => {
    const f: Filtros = {}
    if (busca.trim() !== '') f['busca'] = { tipo: 'texto', valor: busca }
    if (lacuna !== null) f['lacuna'] = { tipo: 'selecao', valor: [lacuna] }
    return f
  }, [busca, lacuna])

  /**
   * Os cartões saem de `consulta.data`, nunca de `linhas`.
   *
   * Com a consulta falhada, `linhas` cai para lista vazia e os quatro números
   * virariam zero: a capa afirmaria "nenhum processo sem dono" enquanto a
   * tabela avisa que a consulta quebrou. E com recorte vazio, só a contagem de
   * processos é um zero de verdade: selos ganhos, completos e sem dono saem de
   * um conjunto vazio, então são ausência de dado, não zero.
   *
   * Os cartões também NÃO seguem a busca nem a lacuna: eles descrevem o recorte
   * da área, que é o que o placar e as missões medem. Seguir o filtro local
   * faria "Sem dono" cair para 1 só porque a pessoa digitou três letras.
   */
  const resumo = useMemo(() => {
    const dados = consulta.data
    if (!dados) {
      return {
        processos: null,
        selos: null,
        possiveis: null,
        completos: null,
        semDono: null,
        semArea: null,
      }
    }
    if (dados.length === 0) {
      return {
        processos: 0,
        selos: null,
        possiveis: null,
        completos: null,
        semDono: null,
        semArea: 0,
      }
    }
    return {
      processos: dados.length,
      selos: dados.reduce((soma, l) => soma + l.selos, 0),
      possiveis: dados.length * SELOS.length,
      completos: dados.filter((l) => l.selos === SELOS.length).length,
      semDono: dados.filter((l) => !l.selo_dono).length,
      // O placar parte das áreas cadastradas: processo sem área não entra em
      // linha nenhuma lá. Contamos aqui para o placar poder dizer por que a
      // coluna dele soma menos que a capa desta página.
      semArea: dados.filter((l) => l.area_id === null).length,
    }
  }, [consulta.data])

  // Zero e "sem dado" levam ao mesmo lugar aqui: nos dois casos não existe
  // lista de processos sem dono para abrir, e o cartão não vira botão.
  const temSemDono = resumo.semDono !== null && resumo.semDono > 0

  // Sempre a linha FRESCA da consulta. O último selecionado é só a rede de
  // segurança do instante do refetch, em que a lista fica vazia por um frame.
  const selecionado = linhas.find((l) => l.processo_id === selecionadoId) ?? ultimoSelecionado

  /**
   * O que precisa ser relido depois que qualquer camada grava.
   *
   * As camadas invalidam as chaves DELAS, e a trilha e o POP já invalidam a
   * jornada. O painel do fluxo não: ele foi escrito para o inventário, onde o
   * selo não existe. Invalidar aqui, ao fechar a camada, é o que garante que o
   * selo acenda sem depender de cada camada conhecer esta tela.
   */
  function invalidarJornada() {
    void queryClient.invalidateQueries({ queryKey: ['jornada'] })
    void queryClient.invalidateQueries({ queryKey: ['jornada-placar'] })
    void queryClient.invalidateQueries({ queryKey: ['missoes'] })
    void queryClient.invalidateQueries({ queryKey: ['processos'] })
  }

  function abrir(linha: LinhaDaJornada, camada: Camada | null = null) {
    setSelecionadoId(linha.processo_id)
    setUltimoSelecionado(linha)
    setCamadaInicial(camada)
  }

  function fechar() {
    setSelecionadoId(null)
    setUltimoSelecionado(null)
    setCamadaInicial(null)
  }

  /**
   * Trocar de área limpa a lacuna.
   *
   * A missão é da área: manter o recorte da anterior deixaria um chip ligado
   * que não corresponde a missão nenhuma da nova. Vale para os DOIS caminhos,
   * o select e o placar. Quando só o select limpava, chegar pela área do placar
   * prendia o filtro sem nenhum cartão de missão aceso para desligá-lo.
   */
  function escolherArea(id: string | null) {
    setAreaId(id)
    setLacuna(null)
  }

  function limparFiltrosDaLista() {
    setBusca('')
    setLacuna(null)
  }

  return (
    <Page
      title="Jornada de mapeamento"
      description="Seis selos por processo, placar por área e a meta curta da semana"
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoDeMetrica
            rotulo="Processos no recorte"
            valor={resumo.processos}
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Selos conquistados"
            valor={resumo.selos}
            detalhe={resumo.possiveis === null ? undefined : `de ${resumo.possiveis} possíveis`}
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Processos completos"
            valor={resumo.completos}
            tom="success"
            detalhe="com os seis selos"
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Sem dono"
            valor={resumo.semDono}
            tom={temSemDono ? 'warning' : 'neutro'}
            detalhe={
              temSemDono
                ? 'ninguém responde por eles · clique para ver quais'
                : 'ninguém responde por eles'
            }
            carregando={consulta.isLoading}
            // O número vira a lista. É o único cartão cujo recorte já existe
            // como lacuna (`dar_dono`), e é o único caminho para esse recorte
            // quando nenhuma área está escolhida: sem área não há missão para
            // clicar, e era justamente aí que a contagem virava beco sem saída.
            aoClicar={temSemDono ? () => setLacuna('dar_dono') : undefined}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-72">
            <Label htmlFor="jornada-area" className="pb-1.5 text-xs text-muted-foreground">
              Área
            </Label>
            <SearchableSelect
              id="jornada-area"
              options={(areas.data ?? []).map((a) => ({
                value: a.id,
                label: a.nome,
                description: rotulo(rotulos.tipo_area, a.tipo),
              }))}
              value={areaId}
              onChange={escolherArea}
              placeholder="Todas as áreas"
              aria-label="Filtrar por área"
            />
          </div>

          <div className="w-80 max-w-full">
            <Label htmlFor="jornada-busca" className="pb-1.5 text-xs text-muted-foreground">
              Buscar processo
            </Label>
            <Input
              id="jornada-busca"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Parte do nome, da categoria ou da área"
            />
          </div>
        </div>

        {/* Com o recorte de uma área, `processos` é exatamente o tamanho dela, e
            é esse número que separa "área em dia" de "área que não começou".
            Sem recorte a missão nem é consultada, então passar nulo é honesto. */}
        <MissoesDaSemana
          areaId={areaId}
          areaNome={areaNome}
          processosDaArea={areaId === null ? null : resumo.processos}
          lacunaAtiva={lacuna}
          // Clicar de novo na mesma missão desliga o recorte: o caminho de volta
          // é o mesmo do caminho de ida.
          aoAlternarLacuna={(codigo) => setLacuna((atual) => (atual === codigo ? null : codigo))}
        />

        <PlacarDasAreas
          areaSelecionada={areaId}
          aoEscolherArea={escolherArea}
          // Com filtro de área aberto só enxergamos aquela área: dizer quantos
          // processos da EMPRESA estão sem área seria chute, então vai nulo.
          processosSemArea={areaId === null ? resumo.semArea : null}
        />

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-2">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Processos e seus selos
            </h2>
            {/* Quantos de quantos. Sem esta linha, uma lista recortada por
                lacuna se lê como "a área só tem estes cinco processos". */}
            {filtroLocalAtivo && consulta.data && (
              <p className="text-xs text-muted-foreground tabular-nums">
                mostrando {linhasVisiveis.length} de {linhas.length} processos do recorte
              </p>
            )}
          </div>

          {filtroLocalAtivo && (
            <ActiveFiltersBar
              className="pb-2"
              filters={filtrosDaLista}
              columnLabels={{ busca: 'Busca', lacuna: 'Filtrando por' }}
              valueLabels={{ lacuna: (v) => ROTULO_DA_LACUNA[v] ?? v }}
              onClearFilter={(chave) => (chave === 'busca' ? setBusca('') : setLacuna(null))}
              onClearAll={limparFiltrosDaLista}
            />
          )}

          {lacunaDesconhecida && (
            <p
              role="alert"
              className="mb-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground"
            >
              Esta missão é nova e a tela ainda não sabe traduzi-la em lacuna, então a lista
              abaixo NÃO está recortada por ela. Limpe o filtro para não ler a lista inteira
              como se fosse a da missão.
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <EstadoDaTela
              carregando={consulta.isLoading}
              erro={consulta.error}
              quantidade={linhasVisiveis.length}
              aoTentarDeNovo={() => void consulta.refetch()}
              vazio={
                // Duas ausências diferentes: "o recorte não tem processo" e "o
                // filtro desta tela não deixou nenhum passar". Tratar as duas
                // com a mesma frase manda o usuário cadastrar o que já existe.
                linhas.length > 0 ? (
                  <SemCorrespondencia
                    titulo="Nenhum processo corresponde à busca ou à lacuna"
                    descricao={`Os ${linhas.length} processos do recorte continuam lá: o que está de fora é só desta lista.`}
                    acao={
                      <Button size="sm" variant="outline" onClick={limparFiltrosDaLista}>
                        Limpar filtros da lista
                      </Button>
                    }
                  />
                ) : (
                  <div className="px-6 py-12 text-center">
                    <p className="text-sm font-medium">Nenhum processo neste recorte</p>
                    <p className="pt-1 text-xs text-muted-foreground">
                      A jornada só existe depois que os processos entram no inventário. Processo
                      descontinuado fica de fora de propósito.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => navegar('/processos/inventario')}
                    >
                      Ir para o inventário
                    </Button>
                  </div>
                )
              }
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[26rem] min-w-64">Processo</TableHead>
                      <TableHead className="min-w-40">Cadência</TableHead>
                      <TableHead className="min-w-36">Estágio</TableHead>
                      <TableHead className="min-w-72">Selos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* A ordem é a do banco (mais selos primeiro): reordenar
                        aqui faria a lista discordar do placar. */}
                    {linhasVisiveis.map((l) => (
                      <TableRow
                        key={l.processo_id}
                        onClick={() => abrir(l)}
                        className="cursor-pointer"
                      >
                        <TableCell className="align-top">
                          {/* O teto de largura vive numa div DENTRO da célula,
                              e não na própria célula: no layout automático de
                              tabela o navegador ignora max-width em <td> e
                              dimensiona a coluna pelo conteúdo. Os nomes de 160
                              caracteres que vieram da planilha empurravam os
                              selos, que são o assunto da tela, para fora dela. */}
                          <div className="w-[24rem] max-w-full whitespace-normal">
                            {/* O nome é um BOTÃO de verdade, e não só uma linha
                                clicável: `onClick` em <tr> não cria parada de
                                teclado, e quem navega por Tab ficaria sem
                                nenhum caminho para abrir o processo. */}
                            <button
                              type="button"
                              onClick={(evento) => {
                                evento.stopPropagation()
                                abrir(l)
                              }}
                              className="block cursor-pointer text-left font-medium break-words hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              title={l.nome}
                            >
                              <span className="line-clamp-2 block">{l.nome}</span>
                            </button>
                            <span className="block text-xs text-muted-foreground">
                              {l.categoria ?? 'sem categoria'} · {l.area_nome ?? 'sem área'}
                            </span>
                            {l.pendencia_de_mapeamento && (
                              // Mapeamento parado por decisão pendente, não por
                              // falta de vontade. A pergunta fica à vista para
                              // alguém poder respondê-la.
                              <span className="mt-1.5 flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning-subtle px-2 py-1.5 text-xs text-warning-subtle-foreground">
                                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                <span>
                                  <span className="font-medium">Pendência: </span>
                                  {l.pendencia_de_mapeamento}
                                </span>
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="align-top text-xs whitespace-normal text-muted-foreground">
                          {/* `prazo_referencia` é texto livre por decisão do
                              banco ("15 dias antes do vencimento", "do 1º ao
                              3º dia útil"), e TableCell aplica whitespace-nowrap em
                              TODA célula. Sem o whitespace-normal aqui e o teto
                              de largura na div DE DENTRO (o layout automático
                              de tabela ignora max-width no <td>), a frase
                              esticava a coluna e empurrava os selos, que são o
                              assunto da tela, para fora dela. */}
                          <div className="w-40 max-w-full">
                            <span className="block text-sm text-foreground">
                              {l.periodicidade ? (
                                rotulo(rotulos.periodicidade, l.periodicidade)
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  cadência não classificada
                                </span>
                              )}
                            </span>
                            <span className="block pt-0.5">
                              {l.prazo_referencia ?? 'sem prazo de referência'}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="align-top">
                          <SeloDeEstagio estagio={l.estagio} />
                        </TableCell>

                        <TableCell className="align-top">
                          <SelosDaJornada
                            linha={l}
                            // Oferecer a ação e o banco negar depois é pior do
                            // que não oferecer. O conjunto sai das permissões
                            // que a policy de fato exige, nem mais nem menos.
                            selosAcionaveis={selosAcionaveis}
                            aoAcionar={(selo, linha) => abrir(linha, CAMADA_DO_SELO[selo])}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </EstadoDaTela>
          </div>
        </section>
      </div>

      {selecionadoId && selecionado && (
        <PainelDoProcesso
          // A chave amarra o estado de camada ao processo: sem ela, abrir outro
          // processo herdaria a camada aberta do anterior.
          key={selecionadoId}
          linha={selecionado}
          camadaInicial={camadaInicial}
          aoFechar={fechar}
          aoGravar={invalidarJornada}
        />
      )}
    </Page>
  )
}

/**
 * O processo da jornada, com a AÇÃO dentro dele.
 *
 * Painel enxuto de propósito: ele não repete o detalhe do inventário (SIPOC
 * expandido, indicadores, ganho acumulado) porque não faz consulta nenhuma
 * própria, só mostra a linha que a jornada já trouxe. O que ele acrescenta é o
 * caminho: os mesmos componentes autônomos que o inventário usa (trilha, fluxo,
 * POP, indicador), abertos a partir do selo que está apagado.
 */
function PainelDoProcesso({
  linha,
  camadaInicial,
  aoFechar,
  aoGravar,
}: {
  linha: LinhaDaJornada
  camadaInicial: Camada | null
  aoFechar: () => void
  aoGravar: () => void
}) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const podeEditar = podeFazer('processo.edit')
  const podeAprovarPop = podeFazer('pop.aprovar')
  const selosAcionaveis = selosQuePodeAcionar(podeEditar, podeAprovarPop, !!empresaId)

  const [camada, setCamada] = useState<Camada | null>(camadaInicial)
  /**
   * "Gravou" não é "resolveu".
   *
   * O selo de indicador conta `meta is not null` (é a mesma régua da função do
   * banco), e o formulário aceita indicador sem meta DE PROPÓSITO, porque meta
   * zero é meta legítima. Só que quem chegou aqui clicando no selo apagado
   * voltaria para o mesmo selo apagado, depois de um salvamento bem-sucedido,
   * sem nenhuma explicação. Guardamos o nome para poder dizer o que faltou.
   */
  const [indicadorSemMeta, setIndicadorSemMeta] = useState<string | null>(null)

  const gravarIndicador = useMutation({
    mutationFn: (dados: DadosDoIndicador) => criarIndicador(empresaId!, dados),
    onSuccess: (indicador) => {
      void queryClient.invalidateQueries({
        queryKey: chaves.indicadoresDoProcesso(linha.processo_id),
      })
      setIndicadorSemMeta(indicador.meta === null ? indicador.nome : null)
      fecharCamada()
    },
  })

  /** Abrir uma camada zera o aviso da gravação anterior. */
  function abrirCamada(destino: Camada) {
    setIndicadorSemMeta(null)
    setCamada(destino)
  }

  function fecharCamada() {
    setCamada(null)
    gravarIndicador.reset()
    // Invalidamos ao FECHAR, e não só no sucesso de cada gravação: as camadas
    // gravam por conta própria (a trilha grava a cada passo) e nem todas
    // conhecem as chaves desta tela. O custo de uma releitura a mais é menor
    // que o de um selo que continua apagado depois de resolvido.
    aoGravar()
  }

  // O painel se esconde enquanto a camada está aberta, em vez de desmontar:
  // fechar a camada devolve o processo exatamente como estava, com os selos já
  // relidos. É esse retorno que responde "deu certo?" sem sair da tela.
  //
  // `camadaVisivel` existe para o painel nunca se esconder por uma camada que
  // não vai aparecer: o formulário de indicador depende da empresa ativa, e sem
  // ela a tela ficaria em branco, sem camada para usar e sem painel para ler.
  const camadaVisivel = camada === 'indicador' && !empresaId ? null : camada
  const painelAberto = camadaVisivel === null

  return (
    <>
      <PainelDeDetalhe
        aberto={painelAberto}
        largura="larga"
        aoFechar={aoFechar}
        titulo={linha.nome}
        origem={`Jornada de mapeamento · ${linha.area_nome ?? 'sem área'} · ${linha.selos} de ${
          SELOS.length
        } selos`}
        acoes={
          podeEditar ? (
            <>
              <Button size="sm" variant="outline" onClick={() => abrirCamada('fluxo')}>
                <Workflow className="size-4" aria-hidden />
                Mapear fluxo
              </Button>
              <Button size="sm" variant="outline" onClick={() => abrirCamada('pop')}>
                <FileText className="size-4" aria-hidden />
                POP
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!empresaId}
                onClick={() => abrirCamada('indicador')}
              >
                <Gauge className="size-4" aria-hidden />
                Novo indicador
              </Button>
              <Button size="sm" onClick={() => abrirCamada('trilha')}>
                <Route className="size-4" aria-hidden />
                Mapear com a trilha
              </Button>
            </>
          ) : (
            // Sem permissão de edição o fluxo e o POP continuam VISÍVEIS: eles
            // são a documentação do processo, e ler não muda nada. Quem tem
            // `pop.aprovar` sem `processo.edit` age no POP, então o rótulo dele
            // não promete só leitura.
            <>
              <Button size="sm" variant="outline" onClick={() => abrirCamada('fluxo')}>
                <Workflow className="size-4" aria-hidden />
                Ver fluxo
              </Button>
              <Button size="sm" variant="outline" onClick={() => abrirCamada('pop')}>
                <FileText className="size-4" aria-hidden />
                {podeAprovarPop ? 'POP' : 'Ver POP'}
              </Button>
            </>
          )
        }
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <SeloDeEstagio estagio={linha.estagio} />
              <SelosDaJornada
                linha={linha}
                selosAcionaveis={selosAcionaveis}
                aoAcionar={(selo) => {
                  const destino = CAMADA_DO_SELO[selo]
                  if (destino) abrirCamada(destino)
                }}
              />
            </div>
            {podeEditar && (
              <p className="text-xs text-muted-foreground">
                Clique num selo apagado para resolvê-lo agora. O de melhoria é o único que fica
                de fora: projeto de melhoria se abre no quadro DMAIC, que ainda não recebe o
                processo já escolhido.
              </p>
            )}
            {podeEditar && !podeAprovarPop && (
              // Editar e aprovar são permissões separadas de propósito (um POP
              // aprovado por quem o escreveu não tem controle nenhum). Dizer
              // isso aqui evita que o selo do POP pareça quebrado.
              <p className="text-xs text-muted-foreground">
                O selo do POP só acende com o POP publicado, e publicar exige a permissão de
                aprovar (pop.aprovar), separada da de editar. Sem ela você escreve o POP aqui e
                outra pessoa aprova.
              </p>
            )}
          </div>

          {indicadorSemMeta && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Indicador gravado, selo ainda apagado. </span>O
                indicador {indicadorSemMeta} foi salvo SEM meta, e o selo exige meta: sem ela
                dá para medir o processo e não dá para dizer se ele está bom. A meta se
                preenche editando o indicador no painel do processo, no inventário.
              </span>
            </p>
          )}

          {linha.pendencia_de_mapeamento && (
            <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Pendência de mapeamento: </span>
                {linha.pendencia_de_mapeamento}
              </span>
            </p>
          )}

          <div>
            <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              A rotina
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Item rotulo="Área">{linha.area_nome ?? <SemDado />}</Item>
              <Item rotulo="Categoria">{linha.categoria ?? <SemDado />}</Item>
              <Item rotulo="Cadência">
                {linha.periodicidade ? (
                  rotulo(rotulos.periodicidade, linha.periodicidade)
                ) : (
                  <SemDado texto="não classificada" />
                )}
              </Item>
              <Item rotulo="Prazo de referência">{linha.prazo_referencia ?? <SemDado />}</Item>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Os selos são calculados pelo banco a partir do cadastro, do SIPOC, das etapas, do
            POP, dos indicadores e dos projetos de melhoria. Não existe caminho para marcar um
            selo à mão: ele acende quando o dado que ele representa passa a existir.
          </p>
        </div>
      </PainelDeDetalhe>

      {camadaVisivel === 'trilha' && (
        <TrilhaDeMapeamento
          processoId={linha.processo_id}
          processoNome={linha.nome}
          aoFechar={fecharCamada}
          aoConcluir={aoGravar}
        />
      )}

      {camadaVisivel === 'fluxo' && (
        <PainelDoFluxo
          processoId={linha.processo_id}
          processoNome={linha.nome}
          areaNome={linha.area_nome}
          aoFechar={fecharCamada}
        />
      )}

      {camadaVisivel === 'pop' && (
        <PainelDoPop
          processoId={linha.processo_id}
          processoNome={linha.nome}
          aoFechar={fecharCamada}
        />
      )}

      {camadaVisivel === 'indicador' && empresaId && (
        <FormularioDeIndicador
          indicador={null}
          processoId={linha.processo_id}
          salvando={gravarIndicador.isPending}
          erro={gravarIndicador.error ? mensagemDeErro(gravarIndicador.error) : null}
          aoFechar={fecharCamada}
          aoSalvar={(dados) => gravarIndicador.mutate(dados)}
        />
      )}
    </>
  )
}

function Item({ rotulo: r, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <p className="pb-1 text-[11px] text-muted-foreground">{r}</p>
      <p className="text-sm break-words">{children}</p>
    </div>
  )
}

function SemDado({ texto = 'sem dado' }: { texto?: string }) {
  return <span className="text-xs text-muted-foreground">{texto}</span>
}

/**
 * Estágio da jornada. Cada um tem ÍCONE próprio além da cor: quem não
 * distingue os tons continua separando "não começou" de "em melhoria
 * contínua" pela forma.
 */
const ESTAGIO: Record<
  string,
  { variante: React.ComponentProps<typeof Badge>['variant']; icone: LucideIcon }
> = {
  nao_comecou: { variante: 'outline', icone: Circle },
  em_mapeamento: { variante: 'warning-subtle', icone: CircleDashed },
  mapeado: { variante: 'info-subtle', icone: CircleCheck },
  melhoria_continua: { variante: 'success-subtle', icone: Trophy },
}

function SeloDeEstagio({ estagio }: { estagio: string }) {
  // Estágio novo vindo do banco cai no neutro em vez de sumir da tela.
  const conf = ESTAGIO[estagio] ?? { variante: 'outline' as const, icone: Circle }
  const Icone = conf.icone

  return (
    <Badge variant={conf.variante} className="gap-1">
      <Icone className="size-3" aria-hidden />
      {rotulo(rotulos.estagio_jornada, estagio)}
    </Badge>
  )
}
