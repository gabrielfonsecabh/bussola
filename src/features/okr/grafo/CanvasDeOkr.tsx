import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
  type NodeMouseHandler,
  type OnBeforeDelete,
  type OnConnectEnd,
  type OnConnectStart,
  type OnReconnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { listarAreas } from '@/features/admin/api'
import {
  atualizarOkr,
  carregarGrafo,
  criarOkr,
  desdobrarOkr,
  excluirOkr,
  vincularOkr,
  type NoDaArvore,
} from '@/features/okr/api'
import { ArestaDeOkr } from '@/features/okr/grafo/ArestaDeOkr'
import {
  CanvasAcoesContext,
  ID_DO_NOVO,
  type ArestaFlow,
  type CanvasAcoes,
  type NoFlow,
} from '@/features/okr/grafo/contexto'
import { arestasAutorizadas, contarVinculosIgnorados } from '@/features/okr/grafo/exclusao'
import { invalidarOkr } from '@/features/okr/grafo/invalidar'
import { calcularLayout, LARGURA_DO_NO } from '@/features/okr/grafo/layout'
import { NoDeColuna, NoDeFaixa } from '@/features/okr/grafo/NoDeColuna'
import { NoDeObjetivo } from '@/features/okr/grafo/NoDeObjetivo'
import { NoDeOkr } from '@/features/okr/grafo/NoDeOkr'
import { contarPendenciasDoNo, noTemPendencia } from '@/features/okr/grafo/pendencias'
import { nivelDoFilho, podeConectar } from '@/features/okr/grafo/regras'
import { aplicarSelecao } from '@/features/okr/grafo/selecao'
import {
  COLUNAS,
  ehOkr,
  ROTULO_DA_COLUNA,
  type ChaveDePendencia,
  type Coluna,
  type NivelDeOkr,
  type NoDeOkr as TipoNoDeOkr,
  type NoDoGrafo,
} from '@/features/okr/grafo/tipos'
import { PainelDoOkr } from '@/features/okr/PainelDoOkr'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'
import { cn } from '@/lib/utils'

import './canvas.css'

/** Definidos fora do componente: o React Flow exige referência estável. */
const TIPOS_DE_NO = { okr: NoDeOkr, objetivo: NoDeObjetivo, coluna: NoDeColuna, faixa: NoDeFaixa }
const TIPOS_DE_ARESTA = { okr: ArestaDeOkr }

const Y_DO_CABECALHO = -56

/**
 * O painel lateral existente lê um `NoDaArvore` (linha da okr_arvore). O
 * grafo tem os mesmos campos com outros nomes; este adaptador evita um
 * segundo painel.
 */
export function noDaArvoreDe(no: TipoNoDeOkr, nos: NoDoGrafo[]): NoDaArvore {
  return {
    id: no.id,
    parent_okr_id: no.parent_okr_id,
    profundidade: 0,
    caminho: [no.id],
    nivel: no.nivel,
    titulo: no.titulo,
    status: no.status,
    ano: no.ano,
    trimestre: no.trimestre,
    area_id: no.area_id,
    area_nome: no.area_nome,
    owner_user_id: no.owner_user_id,
    owner_nome: no.owner_nome,
    perspectiva_chave: no.perspectiva_chave,
    perspectiva_nome: no.perspectiva_nome,
    objetivo_estrategico_id: no.objetivo_estrategico_id,
    objetivo_titulo: no.objetivo_titulo,
    total_krs: no.total_krs,
    total_filhos: nos.filter((n) => ehOkr(n) && n.parent_okr_id === no.id).length,
    atingimento: no.atingimento,
    farol: no.farol,
  }
}

/**
 * O cartão em criação: onde nasce e a quem se liga. Nunca vai ao banco com o
 * id sintético (`ID_DO_NOVO`, constante), então `versao` é o que dá a cada
 * abertura uma identidade nova: sem ela, abrir um segundo rascunho por cima
 * de um primeiro ainda não salvo reconcilia com o MESMO `NoDeOkr` (mesmo id),
 * e o título digitado no primeiro sobrevive e migra para o segundo, agora
 * pendurado noutro pai.
 */
type Rascunho = {
  nivel: NivelDeOkr
  paiId: string | null
  objetivoId: string | null
  areaId: string | null
  versao: number
}

export function CanvasDeOkr(props: {
  ano: number
  areaId: string | null
  aoMudarArea: (areaId: string | null) => void
}) {
  return (
    <ReactFlowProvider>
      <CanvasInterno {...props} />
    </ReactFlowProvider>
  )
}

function CanvasInterno({
  ano,
  areaId,
  aoMudarArea,
}: {
  ano: number
  areaId: string | null
  aoMudarArea: (areaId: string | null) => void
}) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const podeEditar = podeFazer('okr.edit')
  const queryClient = useQueryClient()

  const [krsExpandidos, setKrsExpandidos] = useState<Set<string>>(new Set())
  /**
   * "Selecionado no canvas" (destaque visual + o que `Delete` e o diálogo de
   * exclusão enxergam) e "selecionado para o painel lateral" são conceitos
   * diferentes desde esta seção: um clique único faz os dois ao mesmo tempo
   * (o React Flow seleciona o nó por conta própria E dispara `onNodeClick`),
   * mas Shift+clique ou o retângulo de seleção só mexem no primeiro. Nunca
   * junte os dois de novo num id só.
   */
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [arestasSelecionadas, setArestasSelecionadas] = useState<Set<string>>(new Set())
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [filtro] = useState<Set<ChaveDePendencia>>(new Set())
  const [erro, setErro] = useState<string | null>(null)
  /** id do nó de onde a pessoa está puxando uma conexão; esmaece os alvos inválidos. */
  const [origemDaConexao, setOrigemDaConexao] = useState<string | null>(null)
  const religou = useRef(false)
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [paraExcluir, setParaExcluir] = useState<TipoNoDeOkr[]>([])
  /** Quantas arestas SELECIONADAS DE PROPÓSITO (não as que só estão ligadas a
   * um nó excluído) sobrevivem intocadas a esta exclusão. Ver
   * `contarVinculosIgnorados`: o diálogo avisa em vez de descartar isso em
   * silêncio. */
  const [vinculosIgnorados, setVinculosIgnorados] = useState(0)
  /** Quantos nós de objetivo estratégico entraram na seleção junto com os
   * OKRs. Não existe exclusão de objetivo por aqui (é pelo mapa estratégico);
   * o diálogo avisa em vez de simplesmente descartá-los da seleção. */
  const [objetivosIgnorados, setObjetivosIgnorados] = useState(0)
  /** Cresce a cada rascunho aberto; vira `Rascunho.versao` (ver o tipo acima). */
  const proximaVersaoDoRascunho = useRef(0)
  function abrirRascunho(dados: Omit<Rascunho, 'versao'>) {
    proximaVersaoDoRascunho.current += 1
    setRascunho({ ...dados, versao: proximaVersaoDoRascunho.current })
  }

  const chaveDoGrafo = chaves.okrGrafo(empresaId, ano, areaId)

  /**
   * Otimista: a aresta muda na hora; se o banco recusar, o cache volta e o
   * banner mostra a mensagem dele (em português, com o código no fim).
   */
  const vincular = useMutation({
    mutationFn: vincularOkr,
    onMutate: async (entrada) => {
      await queryClient.cancelQueries({ queryKey: chaveDoGrafo })
      const anterior = queryClient.getQueryData<NoDoGrafo[]>(chaveDoGrafo)
      queryClient.setQueryData<NoDoGrafo[]>(chaveDoGrafo, (atual) =>
        (atual ?? []).map((n) =>
          ehOkr(n) && n.id === entrada.okrId
            ? {
                ...n,
                parent_okr_id: entrada.parentOkrId,
                // Um corporativo não tem pai: o objetivo dele É o vínculo (a RPC faz
                // `v_objetivo := p_objetivo_id`, então null limpa). Os demais níveis
                // herdam o objetivo do pai; a RPC preserva o que já tinham quando
                // `p_objetivo_id` é null, então o fallback para o valor atual é certo.
                objetivo_estrategico_id:
                  n.nivel === 'corporativo'
                    ? entrada.objetivoId
                    : (entrada.objetivoId ?? n.objetivo_estrategico_id),
              }
            : n,
        ),
      )
      setErro(null)
      return { anterior }
    },
    onError: (e, _entrada, ctx) => {
      if (ctx?.anterior) queryClient.setQueryData(chaveDoGrafo, ctx.anterior)
      setErro(mensagemDeErro(e))
    },
    onSettled: () => invalidarOkr(queryClient),
  })

  const criar = useMutation({
    mutationFn: async (titulo: string) => {
      if (!rascunho || !empresaId) throw new Error('Nada para criar')
      if (rascunho.paiId) {
        // Com pai, o okr_desdobrar já herda objetivo, perspectiva e ciclo.
        const okr = await desdobrarOkr({
          okrId: rascunho.paiId,
          titulo,
          areaId: rascunho.areaId,
          ownerUserId: null,
          trimestre: null,
        })
        return { okr, avisoPerspectiva: false }
      }
      const novo = await criarOkr(empresaId, {
        titulo,
        descricao: null,
        nivel: rascunho.nivel,
        area_id: rascunho.areaId ?? areaId,
        owner_user_id: null,
        objetivo_estrategico_id: rascunho.objetivoId,
        perspectiva_id: null,
        parent_okr_id: null,
        ano,
        trimestre: null,
        status: 'rascunho',
      })
      // Corporativo nascido de um objetivo: a RPC preenche a perspectiva a
      // partir do objetivo, coisa que o insert direto não faz. Este passo é
      // COMPLEMENTAR ao insert acima, não parte dele: se falhar, o OKR já
      // existe no banco. Deixar a função inteira rejeitar aqui faria o
      // rascunho continuar na tela com o texto digitado, como se nada tivesse
      // acontecido; um segundo Enter criaria um OKR duplicado. Por isso o erro
      // é capturado e devolvido como aviso, e o fluxo segue para o sucesso.
      let avisoPerspectiva = false
      if (rascunho.objetivoId) {
        try {
          await vincularOkr({ okrId: novo.id, parentOkrId: null, objetivoId: rascunho.objetivoId })
        } catch {
          avisoPerspectiva = true
        }
      }
      return { okr: novo, avisoPerspectiva }
    },
    onSuccess: ({ okr, avisoPerspectiva }) => {
      setRascunho(null)
      setSelecionadoId(okr.id)
      setErro(
        avisoPerspectiva
          ? 'OKR criado, mas a perspectiva não foi herdada do objetivo. Ajuste no painel.'
          : null,
      )
    },
    onError: (e) => setErro(mensagemDeErro(e)),
    onSettled: () => invalidarOkr(queryClient),
  })

  const renomear = useMutation({
    mutationFn: ({ id, titulo }: { id: string; titulo: string }) => atualizarOkr(id, { titulo }),
    onMutate: async ({ id, titulo }) => {
      await queryClient.cancelQueries({ queryKey: chaveDoGrafo })
      const anterior = queryClient.getQueryData<NoDoGrafo[]>(chaveDoGrafo)
      queryClient.setQueryData<NoDoGrafo[]>(chaveDoGrafo, (atual) =>
        (atual ?? []).map((n) => (n.id === id ? { ...n, titulo } : n)),
      )
      return { anterior }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.anterior) queryClient.setQueryData(chaveDoGrafo, ctx.anterior)
      setErro(mensagemDeErro(e))
    },
    onSettled: () => invalidarOkr(queryClient),
  })

  const fecharDialogoDeExclusao = () => {
    setParaExcluir([])
    setVinculosIgnorados(0)
    setObjetivosIgnorados(0)
  }

  const excluir = useMutation({
    mutationFn: async (ids: string[]) => {
      // Em série (de propósito, não por descuido): cada exclusão precisa de
      // "1 linha afetada", e uma falha de permissão no meio não deve
      // mascarar as anteriores nem disparar excluirOkr em paralelo para IDs
      // que já não fazem mais sentido excluir juntos.
      let excluidos = 0
      for (const id of ids) {
        try {
          // oxlint-disable-next-line no-await-in-loop
          await excluirOkr(id)
        } catch (e) {
          // Anuncia quantos já saíram ANTES deste erro: sem isso, "0 linhas
          // afetadas" de um retry num id que já não existe mais mascara a
          // causa real (permissão) atrás de um sintoma de concorrência.
          throw new Error(
            excluidos > 0
              ? `${excluidos} de ${ids.length} excluídos antes do erro: ${mensagemDeErro(e)}`
              : mensagemDeErro(e),
            { cause: e },
          )
        }
        excluidos += 1
        // Tira da lista assim que a exclusão é CONFIRMADA: se o próximo id
        // falhar, o diálogo não mostra mais o título de quem já sumiu, e
        // clicar "Excluir" de novo só reprocessa o que falta.
        setParaExcluir((atual) => atual.filter((n) => n.id !== id))
      }
    },
    onSuccess: () => {
      fecharDialogoDeExclusao()
      setSelecionados(new Set())
      setArestasSelecionadas(new Set())
      setSelecionadoId(null)
      setErro(null)
    },
    onError: (e) => setErro(mensagemDeErro(e)),
    onSettled: () => invalidarOkr(queryClient),
  })

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  const consulta = useQuery({
    queryKey: chaves.okrGrafo(empresaId, ano, areaId),
    enabled: !!empresaId,
    queryFn: () => carregarGrafo(empresaId!, ano, areaId),
  })

  const nosDoBanco = useMemo(() => consulta.data ?? [], [consulta.data])

  /** Com um rascunho aberto, o layout recebe um nó a mais, no lugar certo. */
  const nos = useMemo<NoDoGrafo[]>(() => {
    if (!rascunho) return nosDoBanco
    const sintetico: TipoNoDeOkr = {
      tipo: 'okr',
      id: ID_DO_NOVO,
      titulo: '',
      pendencias: [],
      parent_okr_id: rascunho.paiId,
      objetivo_estrategico_id: rascunho.objetivoId,
      objetivo_titulo: null,
      perspectiva_id: null,
      perspectiva_chave: null,
      perspectiva_nome: null,
      nivel: rascunho.nivel,
      status: 'rascunho',
      ano,
      trimestre: null,
      area_id: rascunho.areaId,
      area_nome: null,
      owner_user_id: null,
      owner_nome: null,
      total_krs: 0,
      atingimento: null,
      farol: 'cinza',
      ultimo_checkin: null,
      krs: [],
    }
    return [...nosDoBanco, sintetico]
  }, [nosDoBanco, rascunho, ano])

  /**
   * Definido só aqui embaixo, não junto da mutação `excluir` (mesmo bloco no
   * brief): a mutação nasceu antes de `nos` existir no arquivo (antes de
   * `areas`/`consulta`/`nosDoBanco`/`nos`), e capturar `nos` naquele ponto
   * do corpo da função dispara "Cannot access 'nos' before initialization"
   * (TDZ) a cada render, porque `nos` é `const` e o array de dependências do
   * `useMemo` é avaliado na hora da chamada.
   */
  const filhosQueFicamSoltos = useMemo(() => {
    const ids = new Set(paraExcluir.map((n) => n.id))
    return nos.filter((n) => ehOkr(n) && n.parent_okr_id !== null && ids.has(n.parent_okr_id) && !ids.has(n.id)).length
  }, [nos, paraExcluir])

  const layout = useMemo(() => calcularLayout(nos, { krsExpandidos }), [nos, krsExpandidos])

  const nosFlow = useMemo<NoFlow[]>(() => {
    const lista: NoFlow[] = []
    for (const coluna of COLUNAS) {
      lista.push({
        id: `coluna:${coluna}`,
        type: 'coluna',
        position: { x: layout.xDaColuna[coluna], y: Y_DO_CABECALHO },
        data: { coluna, rotulo: ROTULO_DA_COLUNA[coluna], largura: LARGURA_DO_NO },
        selectable: false,
        draggable: false,
        connectable: false,
        focusable: false,
      })
    }
    if (layout.yDosSoltos !== null) {
      const larguraTotal = layout.xDaColuna.individual + LARGURA_DO_NO - layout.xDaColuna.objetivo
      lista.push({
        id: 'faixa:soltos',
        type: 'faixa',
        position: { x: layout.xDaColuna.objetivo, y: layout.yDosSoltos - 32 },
        data: { largura: larguraTotal },
        selectable: false,
        draggable: false,
        connectable: false,
        focusable: false,
      })
    }
    for (const no of nos) {
      const p = layout.posicoes.get(no.id)
      if (!p) continue
      const origem = origemDaConexao ? nos.find((n) => n.id === origemDaConexao) : null
      const esmaecido =
        !noTemPendencia(no, filtro) ||
        (!!origem && origem.id !== no.id && !podeConectar(origem, no).ok)
      if (ehOkr(no)) {
        lista.push({
          id: no.id,
          type: 'okr',
          position: { x: p.x, y: p.y },
          width: p.largura,
          height: p.altura,
          data: {
            no,
            pendencias: contarPendenciasDoNo(no),
            solto: p.solto,
            esmaecido,
            expandido: krsExpandidos.has(no.id),
            novo: no.id === ID_DO_NOVO,
            // Identidade da abertura do rascunho (não do id, que é fixo): o
            // cartão sintético usa isto como `key` para resetar o título
            // quando um SEGUNDO rascunho reaproveita o mesmo nó. Ver o
            // comentário em `type Rascunho`. PRECISA ficar travado em `0`
            // para todo nó REAL: este campo entra em `data` de todo OKR do
            // laço, não só do sintético, e qualquer transição de `rascunho`
            // (abrir, cancelar, salvar) está nas dependências deste
            // `useMemo`. Se o valor variasse para nós reais também, cada
            // abertura/fechamento de rascunho remontaria TODOS os cartões
            // reais ao mesmo tempo (mesma `key` usada em `NoDeOkr`),
            // descartando em silêncio qualquer edição de título em
            // andamento em outro cartão.
            versaoDoRascunho: no.id === ID_DO_NOVO ? (rascunho?.versao ?? 0) : 0,
            arrastandoKrDe: null,
          },
          // O rascunho aparece em destaque pelo próprio `data.novo` (o
          // cartão já entra em modo de edição, com o input focado); marcá-lo
          // como `selected` no React Flow não é necessário para isso, e
          // deixava-o sempre selecionável por seleção em massa (Critical 2).
          //
          // `selecionados` é seleção de CANVAS (clique, Shift+clique,
          // retângulo de seleção); `selecionadoId`, logo abaixo, é só quem
          // abriu o painel lateral. Um clique único aciona os dois (o React
          // Flow seleciona por conta própria e ainda chama `onNodeClick`),
          // mas não são a mesma coisa: ver `aoMudarNos`/`aoClicarNo`.
          selected: selecionados.has(no.id),
          draggable: false,
        })
      } else {
        lista.push({
          id: no.id,
          type: 'objetivo',
          position: { x: p.x, y: p.y },
          width: p.largura,
          height: p.altura,
          data: { no, pendencias: contarPendenciasDoNo(no), esmaecido },
          selected: selecionados.has(no.id),
          draggable: false,
        })
      }
    }
    return lista
  }, [nos, layout, krsExpandidos, filtro, selecionados, origemDaConexao, rascunho])

  const arestasFlow = useMemo<ArestaFlow[]>(() => {
    const ids = new Set(nos.map((n) => n.id))
    const lista: ArestaFlow[] = []
    for (const no of nos) {
      if (!ehOkr(no)) continue
      if (no.parent_okr_id && ids.has(no.parent_okr_id)) {
        const id = `${no.parent_okr_id}->${no.id}`
        lista.push({
          id,
          source: no.parent_okr_id,
          sourceHandle: 'filhos',
          target: no.id,
          targetHandle: 'pai',
          type: 'okr',
          data: { deObjetivo: false },
          style: no.id === ID_DO_NOVO ? { strokeDasharray: '6 4' } : undefined,
          selected: arestasSelecionadas.has(id),
        })
      } else if (no.nivel === 'corporativo' && no.objetivo_estrategico_id && ids.has(no.objetivo_estrategico_id)) {
        const id = `${no.objetivo_estrategico_id}->${no.id}`
        lista.push({
          id,
          source: no.objetivo_estrategico_id,
          sourceHandle: 'filhos',
          target: no.id,
          targetHandle: 'pai',
          type: 'okr',
          data: { deObjetivo: true },
          style: no.id === ID_DO_NOVO ? { strokeDasharray: '6 4' } : undefined,
          selected: arestasSelecionadas.has(id),
        })
      }
    }
    return lista
  }, [nos, arestasSelecionadas])

  /**
   * Aplica a regra de nível como preview. Quem decide é a RPC.
   *
   * Guarda de fronteira: o rascunho nunca vai ao banco com `ID_DO_NOVO`. É
   * aqui, em `ligar`/`desligar`/`conexaoValida`, que essa promessa se cumpre
   * de fato, porque toda mutação de vínculo passa por um destes três pontos
   * (conectar, religar, excluir aresta, soltar no vazio de outro rascunho).
   */
  function ligar(origemId: string, destinoId: string) {
    if (origemId === ID_DO_NOVO || destinoId === ID_DO_NOVO) return
    const origem = nos.find((n) => n.id === origemId)
    const destino = nos.find((n) => n.id === destinoId)
    if (!origem || !destino || !ehOkr(destino)) return
    const veredito = podeConectar(origem, destino)
    if (!veredito.ok) {
      setErro(veredito.motivo)
      return
    }
    vincular.mutate(
      ehOkr(origem)
        ? { okrId: destino.id, parentOkrId: origem.id, objetivoId: null }
        : { okrId: destino.id, parentOkrId: null, objetivoId: origem.id },
    )
  }

  function desligar(arestaId: string) {
    const aresta = arestasFlow.find((a) => a.id === arestaId)
    // O rascunho é sempre o lado filho (`target`) de uma aresta; a tracejada
    // até ele não representa um vínculo salvo, então "excluir" essa aresta
    // (Delete, ou soltar a ponta religada no vazio) não tem o que desfazer.
    if (!aresta || aresta.target === ID_DO_NOVO) return
    vincular.mutate({ okrId: aresta.target, parentOkrId: null, objetivoId: null })
  }

  /**
   * `Delete` com nós selecionados abre a confirmação em vez de excluir.
   * Só arestas selecionadas: deixa o React Flow seguir para onEdgesDelete.
   *
   * Definido só aqui embaixo, não junto da mutação `excluir` (que fica lá em
   * cima, perto de `renomear`): esta função lê `arestasFlow` e
   * `arestasSelecionadas`, e o linter do React Compiler (`oxlint` categoria
   * `react`) não consegue provar que o `useMemo` de `arestasFlow` continua
   * memoizado quando uma função definida ANTES dele já fecha sobre essa
   * variável, mesmo não havendo TDZ de verdade em runtime (a função só é
   * CHAMADA depois que o render termina, quando `arestasFlow` já existe).
   * Mesmo caso de `filhosQueFicamSoltos`, adiante: aqui a ferramenta de
   * análise estática, lá o JavaScript em si.
   *
   * Seleção mista (nós OKR + arestas ao mesmo tempo): devolver `false` aqui
   * cancela os dois lados juntos (é assim que `onBeforeDelete` funciona no
   * React Flow, não dá pra deixar só a aresta passar). Em vez de descartar
   * a aresta em silêncio, o diálogo avisa quantos vínculos ficaram de fora
   * desta exclusão.
   *
   * A contagem NÃO usa `edges.length` direto: o `edges` que chega aqui é a
   * união das arestas selecionadas com `getConnectedEdges` dos nós a
   * excluir (fonte do React Flow), então toda aresta ligada a um nó
   * excluído aparece nesse array mesmo sem ter sido selecionada. Contar
   * `edges.length` faria o aviso aparecer em quase toda exclusão, para
   * vínculos que somem como CONSEQUÊNCIA (a aresta com o pai) e já têm aviso
   * próprio (`filhosQueFicamSoltos`). `contarVinculosIgnorados` parte do
   * estado de seleção deliberada (`arestasSelecionadas`) e só conta quem não
   * toca em nenhum nó excluído.
   *
   * Objetivo estratégico na seleção: não existe exclusão de objetivo aqui
   * (é pelo mapa estratégico), então ele é descartado do array `okrs`
   * abaixo, mas o diálogo avisa quantos foram descartados assim, em vez de
   * simplesmente ignorá-los sem uma palavra.
   *
   * NENHUM OKR selecionado (só objetivo(s) e/ou arestas, o ramo depois do
   * `if`): a mesma união inflada de `edges` que exige `contarVinculosIgnorados`
   * acima fica ainda mais perigosa aqui, porque este ramo DEVOLVE `edges`
   * como aprovado, e o React Flow completa isso chamando `onEdgesDelete`
   * (que grava no banco via `desligar`/`vincular.mutate`). Sem filtrar,
   * selecionar SÓ um objetivo estratégico (ele não é OKR, `okrs.length` fica
   * zero) e apertar `Delete` devolvia TODAS as arestas ligadas a ele, e cada
   * uma virava uma escrita real desligando o corporativo do objetivo, em
   * silêncio, contradizendo a própria frase que este diálogo mostra dizendo
   * que objetivo não se mexe por aqui. `arestasAutorizadas` restringe a
   * `arestasSelecionadas` (gesto deliberado); uma aresta só agregada por
   * `getConnectedEdges` nunca é devolvida. O caminho "só aresta selecionada,
   * Delete desvincula" continua íntegro: é exatamente o que sobra do filtro
   * quando não há objetivo nem OKR no meio.
   *
   * Mesma guarda de fronteira das demais mutações: o cartão sintético
   * (`ID_DO_NOVO`) nunca entra na lista de exclusão, então nunca chega a
   * `excluirOkr`.
   */
  const aoAntesDeExcluir: OnBeforeDelete<NoFlow, ArestaFlow> = async ({ nodes, edges }) => {
    const okrs = nodes
      .filter((n): n is Extract<NoFlow, { type: 'okr' }> => n.type === 'okr' && n.id !== ID_DO_NOVO)
      .map((n) => n.data.no)
    if (okrs.length > 0) {
      const idsExcluidos = new Set(okrs.map((n) => n.id))
      setParaExcluir(okrs)
      setVinculosIgnorados(contarVinculosIgnorados(arestasSelecionadas, arestasFlow, idsExcluidos))
      setObjetivosIgnorados(nodes.filter((n) => n.type === 'objetivo').length)
      return false
    }
    // Só chega nó aqui se for objetivo (o filtro acima já tirou os OKRs);
    // sem diálogo para isso, um aviso rápido no banner já é suficiente.
    if (nodes.length > 0) {
      setErro(
        nodes.length === 1
          ? 'Objetivo estratégico se exclui pelo mapa estratégico, não por aqui.'
          : 'Objetivos estratégicos se excluem pelo mapa estratégico, não por aqui.',
      )
    }
    return { nodes: [], edges: arestasAutorizadas(edges, arestasSelecionadas) }
  }

  const aoIniciarConexao: OnConnectStart = (_evento, { nodeId }) => setOrigemDaConexao(nodeId)

  /**
   * Soltou no vazio (isValid === null: sem alça embaixo): cria o filho ali.
   * Soltou numa alça inválida (isValid === false): nada, o preview já avisou.
   */
  const aoTerminarConexao: OnConnectEnd = (_evento, estado) => {
    setOrigemDaConexao(null)
    if (!podeEditar || estado.isValid !== null || !estado.fromNode || estado.fromHandle?.type !== 'source') return
    const origem = nos.find((n) => n.id === estado.fromNode?.id)
    if (!origem) return
    if (ehOkr(origem)) {
      if (origem.nivel === 'individual') return
      abrirRascunho({ nivel: nivelDoFilho(origem.nivel), paiId: origem.id, objetivoId: null, areaId: origem.area_id })
    } else {
      abrirRascunho({ nivel: 'corporativo', paiId: null, objetivoId: origem.id, areaId: null })
    }
  }

  const criarSolto = (coluna: Coluna) => {
    if (coluna === 'objetivo') return
    abrirRascunho({ nivel: coluna, paiId: null, objetivoId: null, areaId })
  }

  const conexaoValida: IsValidConnection<ArestaFlow> = (conexao) => {
    // Mesma guarda de fronteira: o React Flow nem chega a desenhar a
    // conexão como válida enquanto a pessoa arrasta até o rascunho.
    if (conexao.source === ID_DO_NOVO || conexao.target === ID_DO_NOVO) return false
    const origem = nos.find((n) => n.id === conexao.source)
    const destino = nos.find((n) => n.id === conexao.target)
    return !!origem && !!destino && podeConectar(origem, destino).ok
  }

  const aoConectar = (conexao: Connection) => {
    if (conexao.source && conexao.target) ligar(conexao.source, conexao.target)
  }

  /** Arrastar a ponta de uma aresta para outro pai. */
  const aoReligar: OnReconnect<ArestaFlow> = (_arestaAntiga, novaConexao) => {
    religou.current = true
    if (!novaConexao.source || !novaConexao.target) return
    // A aresta velha some sozinha: as arestas são derivadas do cache, e o
    // onMutate otimista já troca o pai. Se o banco recusar, o cache volta.
    ligar(novaConexao.source, novaConexao.target)
  }

  /** Soltou a ponta no vazio: desvincula. */
  const aoTerminarReligacao = (_evento: MouseEvent | TouchEvent, aresta: ArestaFlow) => {
    if (!religou.current) desligar(aresta.id)
    religou.current = false
  }

  const aoIniciarReligacao = () => {
    religou.current = false
  }

  const aoExcluirArestas = (arestas: ArestaFlow[]) => {
    for (const a of arestas) desligar(a.id)
  }

  /**
   * O `<ReactFlow>` é controlado (`nodes`/`edges` vêm de fora); sem estes
   * tratadores, TODA mudança que o React Flow emite via `onNodesChange`
   * (seleção por clique, Shift+clique, retângulo de seleção, e também
   * posição/dimensão) é descartada em silêncio, é assim que a lib decide se
   * aplica a mudança sozinha (`hasDefaultNodes`, que só é `true` em modo
   * "não controlado") ou devolve pro dono do estado. `aplicarSelecao` filtra
   * só o que interessa aqui (`type === 'select'`); o resto (posição,
   * dimensão) é ignorado de propósito: posição é derivada do layout
   * (`calcularLayout`) e nunca pode virar estado, regra do projeto.
   */
  const aoMudarNos = useCallback((changes: NodeChange<NoFlow>[]) => {
    setSelecionados((atual) => aplicarSelecao(atual, changes))
  }, [])

  const aoMudarArestas = useCallback((changes: EdgeChange<ArestaFlow>[]) => {
    setArestasSelecionadas((atual) => aplicarSelecao(atual, changes))
  }, [])

  const aoClicarNo = useCallback<NodeMouseHandler<NoFlow>>((_evento, no) => {
    // O cartão em criação não abre painel: ele ainda não existe no banco, e o
    // painel tentaria carregar um OKR com o id sintético.
    if (no.id === ID_DO_NOVO) return
    // Só o painel lateral. A seleção de CANVAS (destaque, quem entra no
    // `Delete`) é toda do React Flow via `aoMudarNos` acima; não duplicar
    // aqui, senão os dois conceitos voltam a ser o mesmo id.
    if (no.type === 'okr' || no.type === 'objetivo') setSelecionadoId(no.id)
  }, [])

  const selecionado = useMemo(() => {
    const no = nos.find((n) => n.id === selecionadoId && n.id !== ID_DO_NOVO)
    return no && ehOkr(no) ? no : null
  }, [nos, selecionadoId])

  // `desvincular` já grava (Task 13); criar, editar, excluir e mover KR
  // entram nas Tasks 14 a 16. Objeto simples, sem useMemo: as funções fecham
  // sobre estado que muda a cada render, e o custo de recriar o objeto é
  // irrelevante aqui.
  const acoes: CanvasAcoes = {
    podeEditar,
    alternarKrs: (id) =>
      setKrsExpandidos((atual) => {
        const proximo = new Set(atual)
        if (proximo.has(id)) proximo.delete(id)
        else proximo.add(id)
        return proximo
      }),
    editarTitulo: async (id, titulo) => {
      await renomear.mutateAsync({ id, titulo })
    },
    salvarNovo: async (titulo) => {
      await criar.mutateAsync(titulo)
    },
    cancelarNovo: () => setRascunho(null),
    criarSolto,
    iniciarArrastoDeKr: () => {},
    terminarArrastoDeKr: () => {},
    soltarKr: () => {},
    desvincular: desligar,
  }

  return (
    <CanvasAcoesContext value={acoes}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-72">
            <SearchableSelect
              options={(areas.data ?? []).map((a) => ({
                value: a.id,
                label: a.nome,
                description: rotulo(rotulos.tipo_area, a.tipo),
              }))}
              value={areaId}
              onChange={aoMudarArea}
              placeholder="Empresa inteira"
              aria-label="Filtrar por área"
            />
          </div>
        </div>

        {erro && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive-subtle px-3 py-2 text-xs text-destructive-subtle-foreground"
          >
            {erro}
          </p>
        )}

        <div
          className={cn(
            'canvas-de-okr h-[calc(100dvh-14rem)] min-h-[520px] overflow-hidden rounded-lg border border-border bg-card [&>*]:h-full',
          )}
        >
          <EstadoDaTela
            carregando={consulta.isLoading}
            erro={consulta.error}
            // Inclui o nó sintético de propósito: com o grafo vazio e um
            // rascunho aberto, a tela não deve piscar para o estado "vazio"
            // por baixo do cartão em criação.
            quantidade={nos.length}
            aoTentarDeNovo={() => void consulta.refetch()}
            vazio={
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium">
                  {areaId ? 'Nenhum OKR nesta área e neste ano' : `Nenhum objetivo nem OKR em ${ano}`}
                </p>
                <p className="pt-1 text-xs text-muted-foreground">
                  Isto é "sem correspondência", não uma falha de consulta. Troque o ano ou a área,
                  ou crie objetivos no mapa estratégico.
                </p>
              </div>
            }
          >
            <ReactFlow<NoFlow, ArestaFlow>
              nodes={nosFlow}
              edges={arestasFlow}
              nodeTypes={TIPOS_DE_NO}
              edgeTypes={TIPOS_DE_ARESTA}
              onNodeClick={aoClicarNo}
              onNodesChange={aoMudarNos}
              onEdgesChange={aoMudarArestas}
              onPaneClick={() => setSelecionadoId(null)}
              nodesDraggable={false}
              nodesConnectable={podeEditar}
              edgesReconnectable={podeEditar}
              onConnectStart={aoIniciarConexao}
              onConnectEnd={aoTerminarConexao}
              onConnect={aoConectar}
              isValidConnection={conexaoValida}
              onReconnectStart={aoIniciarReligacao}
              onReconnect={aoReligar}
              onReconnectEnd={aoTerminarReligacao}
              onEdgesDelete={aoExcluirArestas}
              onBeforeDelete={aoAntesDeExcluir}
              deleteKeyCode={podeEditar ? ['Delete', 'Backspace'] : null}
              selectionKeyCode="Shift"
              multiSelectionKeyCode={['Meta', 'Control']}
              connectionRadius={28}
              elementsSelectable
              fitView
              fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
              minZoom={0.2}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap pannable zoomable position="bottom-right" />
            </ReactFlow>
          </EstadoDaTela>
        </div>
      </div>

      {selecionado && (
        <PainelDoOkr
          no={noDaArvoreDe(selecionado, nos)}
          ano={ano}
          aoFechar={() => setSelecionadoId(null)}
          aoDesdobrar={() => invalidarOkr(queryClient)}
        />
      )}

      {paraExcluir.length > 0 && (
        <Dialog open onOpenChange={(v) => !v && fecharDialogoDeExclusao()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">
                Excluir {paraExcluir.length === 1 ? 'este OKR' : `${paraExcluir.length} OKRs`}?
              </DialogTitle>
              <DialogDescription className="text-xs">
                {paraExcluir.length === 1 ? (
                  <span className="font-medium">{paraExcluir[0]?.titulo}</span>
                ) : (
                  <span>{paraExcluir.map((n) => n.titulo).join(', ')}</span>
                )}
                . Os key results e os check-ins vão junto.
                {filhosQueFicamSoltos > 0 && (
                  <>
                    {' '}
                    {filhosQueFicamSoltos === 1
                      ? '1 OKR filho fica solto'
                      : `${filhosQueFicamSoltos} OKRs filhos ficam soltos`}{' '}
                    e vai aparecer na faixa "Soltos" até ganhar outro pai.
                  </>
                )}
                {vinculosIgnorados > 0 && (
                  <>
                    {' '}
                    {vinculosIgnorados === 1
                      ? 'O vínculo selecionado junto não será alterado'
                      : `Os ${vinculosIgnorados} vínculos selecionados junto não serão alterados`}{' '}
                    por esta exclusão; desvincule-os separadamente se for o caso.
                  </>
                )}
                {objetivosIgnorados > 0 && (
                  <>
                    {' '}
                    {objetivosIgnorados === 1
                      ? '1 objetivo estratégico selecionado não entra nesta exclusão'
                      : `${objetivosIgnorados} objetivos estratégicos selecionados não entram nesta exclusão`}
                    ; objetivo se exclui pelo mapa estratégico, não por aqui.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={fecharDialogoDeExclusao}
                disabled={excluir.isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => excluir.mutate(paraExcluir.map((n) => n.id))}
                disabled={excluir.isPending}
              >
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </CanvasAcoesContext>
  )
}
