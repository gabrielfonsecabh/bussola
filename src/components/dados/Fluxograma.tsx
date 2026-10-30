import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { formatarDuracao, type EtapaDoFluxo } from '@/features/processos/api'
import { rotulo, rotulos } from '@/lib/formato'
import { cn } from '@/lib/utils'

export interface FluxogramaProps {
  etapas: EtapaDoFluxo[]
  etapaSelecionada?: string | null
  aoSelecionarEtapa?: (id: string) => void
  className?: string
}

/**
 * O layout é calculado, nunca arrastado.
 *
 * Fluxo desenhado à mão fica bonito no dia em que foi feito e desatualizado no
 * dia seguinte, porque ninguém reposiciona caixa depois de mudar o processo.
 * Aqui a posição sai da ordem das etapas: mudou a ordem, o desenho acompanha.
 */

const MARGEM_LATERAL = 12
const MARGEM_BASE = 20
/** Faixa à direita reservada para a curva do ramo "não". */
const CANAL_DESVIO = 56
const ESPACO_ENTRE = 52
const LARGURA_MAXIMA = 380
const LARGURA_MINIMA = 176
const ALTURA_LINHA = 15
const ALTURA_SECUNDARIA = 14
const ALTURA_CHIP = 18
const LARGURA_CHIP = 104
const RESPIRO_VERTICAL = 12
const RAIO_CURVA = 10
const FONTE_TITULO = 13
const FONTE_SECUNDARIA = 11
const MAX_LINHAS = 3
const MAX_LINHAS_DECISAO = 2
const SEM_TITULO = 'sem título'
/** Início e fim marcam o instante, não o trabalho: cobrar tempo deles é ruído. */
const TIPOS_SEM_DURACAO = new Set(['inicio', 'fim'])

type LinhaDeTexto = { texto: string; y: number }

type Caixa = {
  etapa: EtapaDoFluxo
  x: number
  y: number
  largura: number
  altura: number
  centroX: number
  centroY: number
  titulo: LinhaDeTexto[]
  secundaria: LinhaDeTexto | null
  chip: { x: number; y: number } | null
}

type Layout = {
  caixas: Caixa[]
  porId: Map<string, Caixa>
  canalX: number
  larguraTotal: number
  alturaTotal: number
}

/** Largura útil de texto dentro da forma: o losango e a pílula comem as bordas. */
function larguraDoTexto(tipo: string, larguraCaixa: number): number {
  if (tipo === 'decisao') return larguraCaixa * 0.56
  if (tipo === 'espera' || tipo === 'inicio' || tipo === 'fim') return larguraCaixa - 44
  return larguraCaixa - 26
}

/** Estimativa de caracteres por linha. Inter tem largura média perto de 0,56em. */
function maxCaracteres(larguraTexto: number, fonte: number): number {
  return Math.max(8, Math.floor(larguraTexto / (fonte * 0.56)))
}

function truncar(texto: string, maxChars: number): string {
  if (texto.length <= maxChars) return texto
  const cortado = texto.slice(0, Math.max(1, maxChars - 1)).replace(/[\s·,;:]+$/, '')
  return `${cortado}…`
}

function quebrarTexto(texto: string, maxChars: number, maxLinhas: number): string[] {
  const palavras = texto.trim().split(/\s+/).filter((p) => p.length > 0)
  if (palavras.length === 0) return [SEM_TITULO]

  const linhas: string[] = []
  let atual = ''
  let i = 0

  while (i < palavras.length && linhas.length < maxLinhas) {
    const palavra = palavras[i] ?? ''
    if (atual === '' && palavra.length > maxChars) {
      linhas.push(truncar(palavra, maxChars))
      i += 1
      continue
    }
    const tentativa = atual === '' ? palavra : `${atual} ${palavra}`
    if (tentativa.length <= maxChars) {
      atual = tentativa
      i += 1
    } else {
      linhas.push(atual)
      atual = ''
    }
  }

  if (atual !== '' && linhas.length < maxLinhas) {
    linhas.push(atual)
    atual = ''
  }

  if ((i < palavras.length || atual !== '') && linhas.length > 0) {
    const ultima = linhas[linhas.length - 1] ?? ''
    linhas[linhas.length - 1] = truncar(`${ultima} ${palavras[i] ?? ''}`.trim(), maxChars)
  }

  return linhas
}

function rotuloDoRamo(valor: string | null, padrao: string): string {
  const limpo = valor?.trim() ?? ''
  return limpo === '' ? padrao : limpo
}

function tituloLegivel(titulo: string): string {
  const limpo = titulo.trim()
  return limpo === '' ? SEM_TITULO : limpo
}

/**
 * Tempo da etapa, com a ausência dita por extenso.
 *
 * Campo de tempo que simplesmente some da caixa se confunde com "essa etapa não
 * custa nada", e é justamente a etapa não medida que faz o total do fluxo
 * mentir. Início e fim ficam de fora: eles marcam o instante, não o trabalho.
 */
function textoDaDuracao(etapa: EtapaDoFluxo): string | null {
  const duracao = formatarDuracao(etapa.tempo_estimado_min)
  if (duracao) return duracao
  return TIPOS_SEM_DURACAO.has(etapa.tipo) ? null : 'sem tempo estimado'
}

/** Linha de apoio da caixa. Campo ausente some, não vira "0" nem string vazia. */
function montarSecundaria(etapa: EtapaDoFluxo, maxChars: number): string | null {
  const partes: string[] = []
  if (etapa.responsavel_nome) partes.push(etapa.responsavel_nome)
  if (etapa.sistema) partes.push(etapa.sistema)
  const duracao = textoDaDuracao(etapa)
  if (duracao) partes.push(duracao)
  if (partes.length === 0) return null
  return truncar(partes.join(' · '), maxChars)
}

function montarLayout(etapas: EtapaDoFluxo[], larguraDisponivel: number): Layout {
  const larguraCaixa = Math.max(
    LARGURA_MINIMA,
    Math.min(LARGURA_MAXIMA, larguraDisponivel - CANAL_DESVIO - MARGEM_LATERAL * 2),
  )
  const larguraTotal = Math.max(
    larguraDisponivel,
    larguraCaixa + CANAL_DESVIO + MARGEM_LATERAL * 2,
  )
  const sobra = larguraTotal - CANAL_DESVIO - MARGEM_LATERAL * 2 - larguraCaixa
  const x = MARGEM_LATERAL + Math.max(0, sobra / 2)
  const canalX = x + larguraCaixa + 24

  const primeira = etapas[0]
  // Um laço "não" que volta para a própria etapa precisa de espaço acima dela.
  const lacoNaPrimeira = Boolean(
    primeira && primeira.tipo === 'decisao' && primeira.desvio_para_etapa_id === primeira.id,
  )

  let y = lacoNaPrimeira ? 48 : 20
  const caixas: Caixa[] = []

  for (const etapa of etapas) {
    const decisao = etapa.tipo === 'decisao'
    const larguraUtil = larguraDoTexto(etapa.tipo, larguraCaixa)
    const titulo = quebrarTexto(
      etapa.titulo,
      maxCaracteres(larguraUtil, FONTE_TITULO),
      decisao ? MAX_LINHAS_DECISAO : MAX_LINHAS,
    )
    const secundaria = montarSecundaria(etapa, maxCaracteres(larguraUtil, FONTE_SECUNDARIA))
    const semResponsavel = !etapa.responsavel_nome

    const alturaConteudo =
      titulo.length * ALTURA_LINHA +
      (secundaria ? ALTURA_SECUNDARIA : 0) +
      (semResponsavel ? ALTURA_CHIP : 0)

    let altura = alturaConteudo + RESPIRO_VERTICAL * 2
    // O losango afunila: o conteúdo só cabe na faixa central, e cada linha a
    // mais exige altura desproporcional para não vazar pelas laterais.
    if (decisao) altura = Math.max(108, alturaConteudo * (semResponsavel ? 2.35 : 1.9))
    else if (etapa.tipo === 'inicio' || etapa.tipo === 'fim') altura = Math.max(46, altura)
    else altura = Math.max(60, altura)

    const centroX = x + larguraCaixa / 2
    const topoConteudo = y + (altura - alturaConteudo) / 2

    const linhasTitulo = titulo.map((texto, indice) => ({
      texto,
      y: topoConteudo + indice * ALTURA_LINHA + 11,
    }))
    const baseDoTitulo = topoConteudo + titulo.length * ALTURA_LINHA

    caixas.push({
      etapa,
      x,
      y,
      largura: larguraCaixa,
      altura,
      centroX,
      centroY: y + altura / 2,
      titulo: linhasTitulo,
      secundaria: secundaria ? { texto: secundaria, y: baseDoTitulo + 10 } : null,
      chip: semResponsavel
        ? {
            x: centroX - LARGURA_CHIP / 2,
            y: baseDoTitulo + (secundaria ? ALTURA_SECUNDARIA : 0) + 1,
          }
        : null,
    })

    y += altura + ESPACO_ENTRE
  }

  const ultima = caixas[caixas.length - 1]
  return {
    caixas,
    porId: new Map(caixas.map((c) => [c.etapa.id, c])),
    canalX,
    larguraTotal,
    alturaTotal: ultima ? ultima.y + ultima.altura + MARGEM_BASE : 0,
  }
}

/** Altura da onda do documento: a base dele não é reta. */
const ONDA_DO_DOCUMENTO = 8

/** Onde a seta de saída encosta: o documento fecha acima da borda inferior. */
function saidaInferior(caixa: Caixa): number {
  return caixa.y + caixa.altura - (caixa.etapa.tipo === 'documento' ? ONDA_DO_DOCUMENTO : 0)
}

/** Retângulo de base ondulada: o símbolo de documento. */
function caminhoDoDocumento(x: number, y: number, largura: number, altura: number): string {
  const onda = ONDA_DO_DOCUMENTO
  const base = y + altura - onda
  return `M ${x} ${y} H ${x + largura} V ${base} q ${-largura / 4} ${onda * 1.7} ${-largura / 2} 0 t ${-largura / 2} 0 Z`
}

/** Retângulo com um lado arredondado: o símbolo de espera. */
function caminhoDaEspera(x: number, y: number, largura: number, altura: number): string {
  const raio = altura / 2
  return `M ${x} ${y} H ${x + largura - raio} A ${raio} ${raio} 0 0 1 ${x + largura - raio} ${y + altura} H ${x} Z`
}

function caminhoDoDesvio(origem: Caixa, destino: Caixa, canalX: number): string {
  const saidaX = origem.x + origem.largura
  const saidaY = origem.centroY

  if (destino.etapa.id === origem.etapa.id) {
    // Laço de repetição: sobe pela lateral e volta a entrar pelo topo.
    const topo = origem.y - 28
    return [
      `M ${saidaX} ${saidaY}`,
      `H ${canalX - RAIO_CURVA}`,
      `Q ${canalX} ${saidaY} ${canalX} ${saidaY - RAIO_CURVA}`,
      `V ${topo + RAIO_CURVA}`,
      `Q ${canalX} ${topo} ${canalX - RAIO_CURVA} ${topo}`,
      `H ${origem.centroX + RAIO_CURVA}`,
      `Q ${origem.centroX} ${topo} ${origem.centroX} ${topo + RAIO_CURVA}`,
      `V ${origem.y - 3}`,
    ].join(' ')
  }

  const entradaX = destino.x + destino.largura + 5
  const entradaY = destino.centroY
  const sentido = entradaY > saidaY ? 1 : -1
  return [
    `M ${saidaX} ${saidaY}`,
    `H ${canalX - RAIO_CURVA}`,
    `Q ${canalX} ${saidaY} ${canalX} ${saidaY + sentido * RAIO_CURVA}`,
    `V ${entradaY - sentido * RAIO_CURVA}`,
    `Q ${canalX} ${entradaY} ${canalX - RAIO_CURVA} ${entradaY}`,
    `H ${entradaX}`,
  ].join(' ')
}

function descreverEtapa(
  caixa: Caixa,
  indice: number,
  total: number,
  proxima: Caixa | undefined,
  destino: Caixa | undefined,
): string {
  const etapa = caixa.etapa
  const detalhes: string[] = []
  detalhes.push(
    etapa.responsavel_nome ? `responsável ${etapa.responsavel_nome}` : 'sem responsável definido',
  )
  if (etapa.area_nome) detalhes.push(`área ${etapa.area_nome}`)
  if (etapa.sistema) detalhes.push(`sistema ${etapa.sistema}`)
  const duracao = formatarDuracao(etapa.tempo_estimado_min)
  if (duracao) detalhes.push(`tempo estimado ${duracao}`)
  else if (!TIPOS_SEM_DURACAO.has(etapa.tipo)) detalhes.push('sem tempo estimado')
  if (etapa.eh_gargalo) detalhes.push('marcada como gargalo')

  if (etapa.tipo === 'decisao') {
    const sim = rotuloDoRamo(etapa.rotulo_sim, 'sim')
    const nao = rotuloDoRamo(etapa.rotulo_nao, 'não')
    detalhes.push(
      proxima
        ? `se ${sim}, segue para ${tituloLegivel(proxima.etapa.titulo)}`
        : `se ${sim}, encerra o fluxo`,
    )
    if (destino) detalhes.push(`se ${nao}, vai para ${tituloLegivel(destino.etapa.titulo)}`)
    else if (etapa.desvio_para_etapa_id)
      detalhes.push(`se ${nao}, o destino do desvio não foi encontrado`)
    else detalhes.push(`se ${nao}, segue pelo mesmo caminho`)
  }

  return `Etapa ${indice + 1} de ${total}, ${rotulo(rotulos.tipo_etapa, etapa.tipo)}: ${tituloLegivel(
    etapa.titulo,
  )}. ${detalhes.join(', ')}.`
}

type FormaProps = {
  tipo: string
  x: number
  y: number
  largura: number
  altura: number
  className: string
  strokeWidth?: number
  strokeDasharray?: string | undefined
  opacity?: number
}

/**
 * A forma diz o tipo da etapa antes de qualquer texto: é o vocabulário de
 * fluxograma que todo mundo já leu em algum lugar. Uma função só, porque o
 * realce de hover e o anel de seleção precisam repetir exatamente o contorno.
 */
function FormaDaEtapa({ tipo, x, y, largura, altura, ...resto }: FormaProps) {
  if (tipo === 'inicio' || tipo === 'fim') {
    return <rect x={x} y={y} width={largura} height={altura} rx={altura / 2} {...resto} />
  }
  if (tipo === 'decisao') {
    const centroX = x + largura / 2
    const centroY = y + altura / 2
    return (
      <polygon
        points={[
          `${centroX},${y}`,
          `${x + largura},${centroY}`,
          `${centroX},${y + altura}`,
          `${x},${centroY}`,
        ].join(' ')}
        {...resto}
      />
    )
  }
  if (tipo === 'documento') {
    return <path d={caminhoDoDocumento(x, y, largura, altura)} {...resto} />
  }
  if (tipo === 'espera') {
    return <path d={caminhoDaEspera(x, y, largura, altura)} {...resto} />
  }
  // Tipo novo no banco ainda precisa aparecer: cai no retângulo de atividade.
  return <rect x={x} y={y} width={largura} height={altura} rx={8} {...resto} />
}

function SeloDeGargalo({ x, y }: { x: number; y: number }) {
  return (
    <g aria-hidden>
      <rect
        x={x}
        y={y}
        width={64}
        height={18}
        rx={9}
        className="fill-destructive-subtle stroke-destructive"
        strokeWidth={1}
      />
      <path
        d={`M ${x + 11} ${y + 4.5} L ${x + 15.5} ${y + 13} L ${x + 6.5} ${y + 13} Z`}
        className="fill-none stroke-destructive"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <line
        x1={x + 11}
        x2={x + 11}
        y1={y + 8}
        y2={y + 10.5}
        className="stroke-destructive"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <text x={x + 21} y={y + 13} className="fill-destructive-subtle-foreground text-[9.5px] font-medium">
        gargalo
      </text>
    </g>
  )
}

/**
 * Desenho do fluxo de um processo: apresentação pura, sem busca nem gravação.
 *
 * Duas leituras que o desenho precisa entregar de longe, porque são os defeitos
 * mais comuns de um processo mapeado: etapa sem dono (borda tracejada e selo em
 * warning) e etapa gargalo (traço em destructive e selo). O resto é vocabulário
 * padrão de fluxograma, para ninguém precisar de legenda.
 */
export function Fluxograma({
  etapas,
  etapaSelecionada,
  aoSelecionarEtapa,
  className,
}: FluxogramaProps) {
  const container = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(640)
  const [emHover, setEmHover] = useState<string | null>(null)
  const [emFoco, setEmFoco] = useState<string | null>(null)
  // Um marcador por instância: dois fluxogramas na mesma tela não podem
  // disputar o mesmo id de <marker>.
  const marcador = `seta-fluxo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    const alvo = container.current
    if (!alvo) return
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(Math.max(280, entrada.contentRect.width))
    })
    observador.observe(alvo)
    return () => observador.disconnect()
  }, [])

  const layout = useMemo(() => montarLayout(etapas, largura), [etapas, largura])

  const vazio = etapas.length === 0
  const primeira = etapas[0]
  const ultima = etapas[etapas.length - 1]
  const resumo = `Fluxo com ${etapas.length} ${
    etapas.length === 1 ? 'etapa' : 'etapas'
  }, de ${tituloLegivel(primeira?.titulo ?? '')} a ${tituloLegivel(ultima?.titulo ?? '')}.`
  const interativo = Boolean(aoSelecionarEtapa)

  // Os dois retornos abrem com a MESMA moldura, de propósito: assim o React
  // reaproveita o nó e o ResizeObserver continua medindo quando o fluxo sai do
  // estado vazio. Trocar o elemento raiz congelaria a largura no padrão.
  if (vazio) {
    return (
      <div ref={container} className={cn('w-full', className)}>
        <div className="grid place-items-center gap-1 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium">O fluxo ainda não foi mapeado</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Sem as etapas, o SIPOC fica sem o P: dá para listar fornecedor, entrada, saída e
            cliente, mas não dá para dizer como o trabalho acontece nem onde ele trava.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={container} className={cn('w-full overflow-x-auto', className)}>
      <svg
        width={layout.larguraTotal}
        height={layout.alturaTotal}
        // `img` declara "isto é uma figura" e o leitor de tela para de expor os
        // filhos. Com caixa focável dentro, isso deixa o tab caindo num nó sem
        // nome nem papel, então o desenho interativo vira `group`.
        role={interativo ? 'group' : 'img'}
        aria-label={resumo}
        className="block"
      >
        <defs>
          <marker
            id={marcador}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 Z" className="fill-muted-foreground" />
          </marker>
        </defs>

        {/* Ligações primeiro: elas passam por baixo das caixas. */}
        {layout.caixas.map((caixa, indice) => {
          const etapa = caixa.etapa
          const proxima = layout.caixas[indice + 1]
          const destino = etapa.desvio_para_etapa_id
            ? layout.porId.get(etapa.desvio_para_etapa_id)
            : undefined
          const decisao = etapa.tipo === 'decisao'
          const sim = truncar(rotuloDoRamo(etapa.rotulo_sim, 'sim'), 14)
          const espacoDoRamo = layout.larguraTotal - (caixa.x + caixa.largura) - 10
          const nao = truncar(
            rotuloDoRamo(etapa.rotulo_nao, 'não'),
            Math.min(14, maxCaracteres(espacoDoRamo, 10.5)),
          )
          const desvioPerdido = Boolean(etapa.desvio_para_etapa_id) && !destino

          return (
            <g key={`ligacao-${etapa.id}`} aria-hidden>
              {proxima && (
                <line
                  x1={caixa.centroX}
                  x2={caixa.centroX}
                  y1={saidaInferior(caixa)}
                  y2={proxima.y - 3}
                  className="stroke-muted-foreground"
                  strokeWidth={1.5}
                  markerEnd={`url(#${marcador})`}
                />
              )}

              {/* O rótulo do caminho de baixo só junta os dois ramos quando NÃO
                  existe desvio. Com ponteiro quebrado o ramo "não" não desce, e
                  quem conta isso é o aviso de destino perdido, logo abaixo. */}
              {decisao && proxima && (
                <text
                  x={caixa.centroX + 7}
                  y={(saidaInferior(caixa) + proxima.y) / 2}
                  dy="0.32em"
                  className="fill-foreground text-[10.5px] font-medium"
                >
                  {etapa.desvio_para_etapa_id
                    ? sim
                    : truncar(
                        `${sim} e ${nao}`,
                        maxCaracteres(layout.larguraTotal - caixa.centroX - 13, 10.5),
                      )}
                </text>
              )}

              {decisao && destino && (
                <>
                  <path
                    d={caminhoDoDesvio(caixa, destino, layout.canalX)}
                    className="fill-none stroke-muted-foreground"
                    strokeWidth={1.5}
                    markerEnd={`url(#${marcador})`}
                  />
                  <text
                    x={caixa.x + caixa.largura + 5}
                    y={caixa.centroY - 6}
                    className="fill-foreground text-[10.5px] font-medium"
                  >
                    {nao}
                  </text>
                </>
              )}

              {/* Ponteiro de desvio apontando para etapa que não existe mais:
                  isso é defeito de dado, e some se o desenho apenas ignorar. */}
              {decisao && desvioPerdido && (
                <text
                  x={caixa.centroX - 7}
                  y={caixa.y + caixa.altura + 14}
                  textAnchor="end"
                  className="fill-warning-subtle-foreground text-[10px] font-medium"
                >
                  {nao}: sem destino
                </text>
              )}
            </g>
          )
        })}

        {layout.caixas.map((caixa, indice) => {
          const etapa = caixa.etapa
          const pilula = etapa.tipo === 'inicio' || etapa.tipo === 'fim'
          const decisao = etapa.tipo === 'decisao'
          const selecionada = etapaSelecionada === etapa.id
          const focada = emFoco === etapa.id
          const destacada = emHover === etapa.id || focada
          const semResponsavel = !etapa.responsavel_nome

          const preenchimento = pilula ? 'fill-primary' : decisao ? 'fill-info-subtle' : 'fill-card'
          const traco = etapa.eh_gargalo
            ? 'stroke-destructive'
            : destacada
              ? 'stroke-foreground'
              : decisao
                ? 'stroke-info'
                : pilula
                  ? 'stroke-primary'
                  : 'stroke-border'
          const espessura = etapa.eh_gargalo ? 2.5 : destacada ? 2 : 1.25
          const tracejado = semResponsavel ? '6 4' : undefined
          const tintaTitulo = pilula
            ? 'fill-primary-foreground'
            : decisao
              ? 'fill-info-subtle-foreground'
              : 'fill-foreground'
          const tintaSecundaria = pilula ? 'fill-primary-foreground' : 'fill-muted-foreground'

          return (
            <g
              key={etapa.id}
              role={interativo ? 'button' : undefined}
              tabIndex={interativo ? 0 : undefined}
              aria-label={
                interativo
                  ? descreverEtapa(
                      caixa,
                      indice,
                      layout.caixas.length,
                      layout.caixas[indice + 1],
                      etapa.desvio_para_etapa_id
                        ? layout.porId.get(etapa.desvio_para_etapa_id)
                        : undefined,
                    )
                  : undefined
              }
              aria-pressed={interativo && etapaSelecionada !== undefined ? selecionada : undefined}
              className={cn(interativo && 'cursor-pointer focus-visible:outline-none')}
              onClick={() => aoSelecionarEtapa?.(etapa.id)}
              onKeyDown={(evento) => {
                if (!interativo) return
                if (evento.key === 'Enter' || evento.key === ' ') {
                  evento.preventDefault()
                  aoSelecionarEtapa?.(etapa.id)
                }
              }}
              onMouseEnter={() => setEmHover(etapa.id)}
              onMouseLeave={() => setEmHover((atual) => (atual === etapa.id ? null : atual))}
              onFocus={() => setEmFoco(etapa.id)}
              onBlur={() => setEmFoco((atual) => (atual === etapa.id ? null : atual))}
            >
              {destacada && (
                <FormaDaEtapa
                  tipo={etapa.tipo}
                  x={caixa.x - 4}
                  y={caixa.y - 4}
                  largura={caixa.largura + 8}
                  altura={caixa.altura + 8}
                  className="fill-accent stroke-none"
                  opacity={0.55}
                />
              )}

              <FormaDaEtapa
                tipo={etapa.tipo}
                x={caixa.x}
                y={caixa.y}
                largura={caixa.largura}
                altura={caixa.altura}
                className={cn(preenchimento, traco)}
                strokeWidth={espessura}
                strokeDasharray={tracejado}
              />

              {caixa.titulo.map((linha) => (
                <text
                  key={`${etapa.id}-${linha.y}`}
                  x={caixa.centroX}
                  y={linha.y}
                  textAnchor="middle"
                  className={cn('text-[13px] font-medium', tintaTitulo)}
                >
                  {linha.texto}
                </text>
              ))}

              {caixa.secundaria && (
                <text
                  x={caixa.centroX}
                  y={caixa.secundaria.y}
                  textAnchor="middle"
                  className={cn('text-[11px]', tintaSecundaria)}
                  opacity={pilula ? 0.85 : 1}
                >
                  {caixa.secundaria.texto}
                </text>
              )}

              {caixa.chip && (
                <g aria-hidden>
                  <rect
                    x={caixa.chip.x}
                    y={caixa.chip.y}
                    width={LARGURA_CHIP}
                    height={16}
                    rx={8}
                    className="fill-warning-subtle"
                  />
                  <text
                    x={caixa.centroX}
                    y={caixa.chip.y + 11.5}
                    textAnchor="middle"
                    className="fill-warning-subtle-foreground text-[10px] font-medium"
                  >
                    sem responsável
                  </text>
                </g>
              )}

              {etapa.eh_gargalo && (
                <SeloDeGargalo x={caixa.x + caixa.largura - 66} y={caixa.y - 9} />
              )}

              {(selecionada || focada) && (
                <FormaDaEtapa
                  tipo={etapa.tipo}
                  x={caixa.x - 5}
                  y={caixa.y - 5}
                  largura={caixa.largura + 10}
                  altura={caixa.altura + 10}
                  className="fill-none stroke-ring"
                  strokeWidth={2}
                />
              )}
            </g>
          )
        })}
      </svg>

      {/* Leitor de tela não navega dentro de um desenho: sem esta lista, o fluxo
          inteiro é invisível para quem usa um. */}
      <ol className="sr-only">
        {layout.caixas.map((caixa, indice) => (
          <li key={`descricao-${caixa.etapa.id}`}>
            {descreverEtapa(
              caixa,
              indice,
              layout.caixas.length,
              layout.caixas[indice + 1],
              caixa.etapa.desvio_para_etapa_id
                ? layout.porId.get(caixa.etapa.desvio_para_etapa_id)
                : undefined,
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
