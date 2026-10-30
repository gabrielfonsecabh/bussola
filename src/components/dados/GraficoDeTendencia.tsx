import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

export type PontoDoGrafico = { rotulo: string; valor: number }

export interface GraficoDeTendenciaProps {
  pontos: PontoDoGrafico[]
  /** Linha de referência da meta. Anotação, não série. */
  meta?: number | null
  /** Linha de referência do ponto de partida. Anotação, não série. */
  baseline?: number | null
  unidade?: string | null
  /** Nome do indicador. O título nomeia a série, então não existe legenda. */
  titulo: string
  altura?: number
  className?: string
}

const MARGEM = { topo: 16, direita: 56, base: 28, esquerda: 48 }

/**
 * Tendência de UM indicador. Um indicador por gráfico, de propósito:
 * dois indicadores de unidades diferentes no mesmo eixo exigiriam duas escalas
 * de y, que é a forma mais confiável de fazer alguém ler a relação errada.
 *
 * Cor: UMA série colorida (o hue de marca). Meta e baseline são ANOTAÇÃO, em
 * tinta neutra tracejada com rótulo direto, e não uma segunda e terceira cor.
 * Isso não é economia de paleta: com verde e azul juntos no tema escuro o par
 * fica com ΔE 13,3 para visão normal, abaixo do piso de 15, e as duas linhas
 * viram uma só para muita gente.
 */
export function GraficoDeTendencia({
  pontos,
  meta,
  baseline,
  unidade,
  titulo,
  altura = 220,
  className,
}: GraficoDeTendenciaProps) {
  const container = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(640)
  const [ativo, setAtivo] = useState<number | null>(null)

  useEffect(() => {
    const alvo = container.current
    if (!alvo) return
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(Math.max(320, entrada.contentRect.width))
    })
    observador.observe(alvo)
    return () => observador.disconnect()
  }, [])

  if (pontos.length === 0) {
    return (
      <div
        className={cn(
          'grid place-items-center rounded-lg border border-dashed border-border px-4 text-center',
          className,
        )}
        style={{ height: altura }}
      >
        <p className="text-xs text-muted-foreground">
          Sem medição no período. Isto não é zero: é ausência de dado.
        </p>
      </div>
    )
  }

  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita
  const alturaPlot = altura - MARGEM.topo - MARGEM.base

  const valores = [
    ...pontos.map((p) => p.valor),
    ...(meta !== null && meta !== undefined ? [meta] : []),
    ...(baseline !== null && baseline !== undefined ? [baseline] : []),
  ]
  const bruto = { min: Math.min(...valores), max: Math.max(...valores) }
  const folga = (bruto.max - bruto.min || Math.abs(bruto.max) || 1) * 0.12
  const min = bruto.min - folga
  const max = bruto.max + folga

  const x = (i: number) =>
    MARGEM.esquerda +
    (pontos.length === 1 ? larguraPlot / 2 : (i / (pontos.length - 1)) * larguraPlot)
  const y = (v: number) => MARGEM.topo + alturaPlot - ((v - min) / (max - min || 1)) * alturaPlot

  const caminho = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.valor)}`).join(' ')
  const area = `${caminho} L ${x(pontos.length - 1)} ${MARGEM.topo + alturaPlot} L ${x(0)} ${
    MARGEM.topo + alturaPlot
  } Z`

  const ticks = 4
  const marcasY = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks)

  const ponto = ativo !== null ? pontos[ativo] : null
  const ultimo = pontos.at(-1)

  const formatar = (v: number) =>
    `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${unidade ? ` ${unidade}` : ''}`

  return (
    <div
      ref={container}
      className={cn('relative w-full', className)}
      onMouseLeave={() => setAtivo(null)}
      onMouseMove={(e) => {
        // Um handler na moldura inteira, em vez de um alvo invisível por ponto.
        // Fica no <div> e não no <svg> porque `role="img"` é não interativo.
        const caixa = e.currentTarget.getBoundingClientRect()
        const relativo = e.clientX - caixa.left - MARGEM.esquerda
        const passo = larguraPlot / Math.max(1, pontos.length - 1)
        const indice = Math.round(relativo / (passo || larguraPlot))
        setAtivo(Math.max(0, Math.min(pontos.length - 1, indice)))
      }}
    >
      <svg
        width={largura}
        height={altura}
        role="img"
        aria-label={`Tendência de ${titulo}. ${pontos.length} medições, de ${formatar(
          pontos[0]?.valor ?? 0,
        )} a ${formatar(ultimo?.valor ?? 0)}.`}
        className="overflow-visible"
      >
        {/* Grade recessiva: ela orienta, não compete com o dado. */}
        {marcasY.map((v) => (
          <g key={`grade-${v}`}>
            <line
              x1={MARGEM.esquerda}
              x2={MARGEM.esquerda + larguraPlot}
              y1={y(v)}
              y2={y(v)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={MARGEM.esquerda - 8}
              y={y(v)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
            </text>
          </g>
        ))}

        {/* Anotações: tinta neutra, tracejado próprio e RÓTULO DIRETO. */}
        {baseline !== null && baseline !== undefined && (
          <g>
            <line
              x1={MARGEM.esquerda}
              x2={MARGEM.esquerda + larguraPlot}
              y1={y(baseline)}
              y2={y(baseline)}
              className="stroke-muted-foreground"
              strokeWidth={1.5}
              strokeDasharray="2 4"
              opacity={0.7}
            />
            <text
              x={MARGEM.esquerda + larguraPlot + 6}
              y={y(baseline)}
              dy="0.32em"
              className="fill-muted-foreground text-[10px]"
            >
              base
            </text>
          </g>
        )}

        {meta !== null && meta !== undefined && (
          <g>
            <line
              x1={MARGEM.esquerda}
              x2={MARGEM.esquerda + larguraPlot}
              y1={y(meta)}
              y2={y(meta)}
              className="stroke-foreground"
              strokeWidth={1.5}
              strokeDasharray="8 4"
              opacity={0.55}
            />
            <text
              x={MARGEM.esquerda + larguraPlot + 6}
              y={y(meta)}
              dy="0.32em"
              className="fill-foreground text-[10px] font-medium"
            >
              meta
            </text>
          </g>
        )}

        {/* A série. Uma cor só. */}
        <path d={area} className="fill-primary" opacity={0.08} />
        <path
          d={caminho}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {pontos.map((p, i) => (
          <circle
            key={`ponto-${p.rotulo}`}
            cx={x(i)}
            cy={y(p.valor)}
            r={ativo === i ? 5 : 4}
            className="fill-primary stroke-card"
            strokeWidth={2}
          />
        ))}

        {/* Crosshair do ponto sob o cursor. */}
        {ativo !== null && ponto && (
          <line
            x1={x(ativo)}
            x2={x(ativo)}
            y1={MARGEM.topo}
            y2={MARGEM.topo + alturaPlot}
            className="stroke-foreground"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.35}
          />
        )}

        {/* Eixo x: só o primeiro, o do meio e o último, para não colidir. */}
        {pontos.map((p, i) => {
          const mostrar =
            i === 0 || i === pontos.length - 1 || i === Math.floor((pontos.length - 1) / 2)
          if (!mostrar) return null
          return (
            <text
              key={`x-${p.rotulo}`}
              x={x(i)}
              y={altura - 8}
              textAnchor={i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle'}
              className="fill-muted-foreground text-[10px]"
            >
              {p.rotulo}
            </text>
          )
        })}

      </svg>

      {ponto && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(x(ativo ?? 0) - 60, 0), largura - 130),
            top: Math.max(y(ponto.valor) - 52, 0),
          }}
        >
          <p className="text-muted-foreground">{ponto.rotulo}</p>
          <p className="font-medium tabular-nums">{formatar(ponto.valor)}</p>
        </div>
      )}
    </div>
  )
}
