import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Farol } from '@/components/ui/farol'
import { Input } from '@/components/ui/input'
import { estadoDoFarol } from '@/features/okr/api'
import { useCanvasAcoes, type NoOkrFlow } from '@/features/okr/grafo/contexto'
import { MAX_KRS_VISIVEIS } from '@/features/okr/grafo/layout'
import type { KrDoGrafo } from '@/features/okr/grafo/tipos'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { cn } from '@/lib/utils'

export const TIPO_DE_ARRASTO_DE_KR = 'application/x-bussola-kr'

/**
 * Cartão do OKR. A LINHA do KR é arrastável (HTML5 drag) e o cartão inteiro
 * é alvo de soltura. `nodrag`/`nopan` são classes do React Flow: sem elas o
 * arrasto do KR viraria pan do canvas.
 *
 * O cartão em criação tem id fixo (`ID_DO_NOVO`, ver `contexto.ts`), então um
 * SEGUNDO rascunho reconciliaria com a MESMA instância em vez de montar de
 * novo, e o título digitado no primeiro sobreviveria e migraria para o
 * segundo, agora pendurado noutro pai. `versaoDoRascunho` dá a cada abertura
 * uma identidade nova; usá-la como `key` força o React a desmontar e remontar
 * o cartão (em vez de reconciliar), o que reseta `titulo`/`editando` pela
 * própria inicialização do `useState`, sem precisar de um efeito para isso.
 */
export function NoDeOkr(props: NodeProps<NoOkrFlow>) {
  return <CartaoDeOkr key={props.data.versaoDoRascunho} {...props} />
}

function CartaoDeOkr({ id, data, selected }: NodeProps<NoOkrFlow>) {
  const { no, pendencias, solto, esmaecido, expandido, novo, arrastandoKrDe } = data
  const acoes = useCanvasAcoes()
  const [editando, setEditando] = useState(novo)
  const [titulo, setTitulo] = useState(no.titulo)
  const [salvando, setSalvando] = useState(false)
  const [sobre, setSobre] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editando) inputRef.current?.focus()
  }, [editando])

  async function confirmar() {
    const limpo = titulo.trim()
    if (limpo === '') {
      if (novo) acoes.cancelarNovo()
      else setEditando(false)
      return
    }
    setSalvando(true)
    try {
      if (novo) await acoes.salvarNovo(limpo)
      else if (limpo !== no.titulo) await acoes.editarTitulo(no.id, limpo)
      setEditando(false)
    } catch {
      // O aviso já vem do onError da mutação (banner de erro do canvas); o
      // catch aqui só evita "unhandled promise rejection" no console, já
      // que os chamadores usam `void confirmar()`.
    } finally {
      setSalvando(false)
    }
  }

  function cancelar() {
    if (novo) acoes.cancelarNovo()
    else {
      setTitulo(no.titulo)
      setEditando(false)
    }
  }

  const aceitaKr = arrastandoKrDe !== null && arrastandoKrDe !== no.id && !novo

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col rounded-xl border bg-card text-card-foreground shadow-sm transition-opacity',
        solto ? 'border-dashed border-warning/70' : 'border-border',
        selected && 'ring-2 ring-ring',
        esmaecido && 'opacity-30',
        aceitaKr && sobre && 'ring-2 ring-primary',
      )}
      onDragOver={(e) => {
        if (!aceitaKr) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setSobre(true)
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        setSobre(false)
        if (!aceitaKr) return
        e.preventDefault()
        const bruto = e.dataTransfer.getData(TIPO_DE_ARRASTO_DE_KR)
        if (!bruto) return
        const { krId, okrId } = JSON.parse(bruto) as { krId: string; okrId: string }
        acoes.soltarKr(krId, okrId, no.id)
      }}
    >
      <Handle type="target" position={Position.Left} id="pai" />

      <div className="flex min-w-0 items-start gap-2 p-3 pb-2">
        <div className="min-w-0 flex-1">
          {editando ? (
            <Input
              ref={inputRef}
              value={titulo}
              disabled={salvando}
              onChange={(e) => setTitulo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmar()
                if (e.key === 'Escape') cancelar()
                e.stopPropagation()
              }}
              onBlur={() => void confirmar()}
              placeholder={novo ? 'Objetivo do OKR (Enter salva, Esc descarta)' : undefined}
              aria-label="Título do OKR"
              className="nodrag nopan h-7 text-sm"
            />
          ) : (
            // Duplo clique é o gatilho de edição inline aqui; a alternativa por teclado vive
            // no painel lateral (PainelDoOkr -> FormularioDeOkr), que abre ao selecionar o nó
            // e tem campo de título acessível por teclado.
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <p
              className="line-clamp-2 text-sm leading-tight font-medium"
              onDoubleClick={(e) => {
                if (!acoes.podeEditar) return
                e.stopPropagation()
                setEditando(true)
              }}
              title={acoes.podeEditar ? 'Duplo clique para editar' : undefined}
            >
              {no.titulo}
            </p>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {rotulo(rotulos.nivel_okr, no.nivel)}
            {no.area_nome ? ` · ${no.area_nome}` : ''}
            {no.owner_nome ? (
              ` · ${no.owner_nome}`
            ) : (
              <span className="text-warning-subtle-foreground"> · sem dono</span>
            )}
          </p>
        </div>
      </div>

      {!novo && no.krs.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            acoes.alternarKrs(id)
          }}
          aria-expanded={expandido}
          className="nodrag nopan flex items-center gap-1 px-3 pb-1 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          {expandido ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
          {no.krs.length} key result{no.krs.length === 1 ? '' : 's'}
        </button>
      )}

      {!novo && expandido && (
        <ul className="divide-y divide-border border-t border-border">
          {no.krs.slice(0, MAX_KRS_VISIVEIS).map((kr) => (
            <LinhaDeKr key={kr.id} kr={kr} okrId={no.id} />
          ))}
          {no.krs.length > MAX_KRS_VISIVEIS && (
            <li className="px-3 py-1 text-[11px] text-muted-foreground">
              +{no.krs.length - MAX_KRS_VISIVEIS} no painel
            </li>
          )}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <Badge variant="outline">{no.total_krs} KR</Badge>
        <span className="text-xs text-muted-foreground">
          {fmt.atingimento(no.atingimento) === null ? 'sem dado' : `${fmt.atingimento(no.atingimento)}%`}
        </span>
        <Farol estado={estadoDoFarol(no.farol)} suave />
      </div>

      {pendencias > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-warning text-[10px] font-semibold text-warning-foreground"
          title={`${pendencias} pendência(s)`}
        >
          {pendencias}
        </span>
      )}

      {no.nivel !== 'individual' && !novo && <Handle type="source" position={Position.Right} id="filhos" />}
    </div>
  )
}

function LinhaDeKr({ kr, okrId }: { kr: KrDoGrafo; okrId: string }) {
  const acoes = useCanvasAcoes()
  return (
    // Arrastar um KR é drag nativo de HTML5, e não existe elemento semântico melhor para a
    // linha. LACUNA CONHECIDA: hoje não há caminho por teclado para mover um KR entre OKRs,
    // nem aqui nem no painel lateral (FormularioDeKeyResult recebe okrId fixo, sem campo
    // para reatribuir). Registrado para decisão de produto.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <li
      draggable={acoes.podeEditar}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.setData(TIPO_DE_ARRASTO_DE_KR, JSON.stringify({ krId: kr.id, okrId }))
        e.dataTransfer.effectAllowed = 'move'
        acoes.iniciarArrastoDeKr(kr.id, okrId)
      }}
      onDragEnd={() => acoes.terminarArrastoDeKr()}
      className={cn(
        'nodrag nopan flex items-center gap-1.5 px-2 py-1 text-xs',
        acoes.podeEditar && 'cursor-grab active:cursor-grabbing',
      )}
      title={kr.descricao}
    >
      {acoes.podeEditar && <GripVertical className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{kr.descricao}</span>
      {kr.pendencias.length > 0 && (
        <span className="size-1.5 shrink-0 rounded-full bg-warning" title={`${kr.pendencias.length} pendência(s)`} />
      )}
      <span className="w-9 shrink-0 text-right text-muted-foreground">
        {fmt.atingimento(kr.atingimento) === null ? '·' : `${fmt.atingimento(kr.atingimento)}%`}
      </span>
      <span
        aria-label={`Farol ${kr.farol}`}
        className={cn(
          'size-2 shrink-0 rounded-full',
          kr.farol === 'verde' && 'bg-success',
          kr.farol === 'amarelo' && 'bg-warning',
          kr.farol === 'vermelho' && 'bg-destructive',
          (kr.farol === 'cinza' || !kr.farol) && 'bg-muted-foreground/40',
        )}
      />
    </li>
  )
}
