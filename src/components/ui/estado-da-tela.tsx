import { CircleAlert, Inbox, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { mensagemDeErro } from '@/lib/query'
import { cn } from '@/lib/utils'

/**
 * A regra mais importante deste projeto na camada de UI:
 *
 *   NUNCA renderize resultado vazio como zero.
 *
 * "Nenhum registro corresponde ao filtro" e "a consulta falhou" são coisas
 * diferentes, e o usuário precisa saber qual das duas aconteceu. Um zero
 * silencioso destrói a confiança na tela de forma permanente, porque a pessoa
 * age em cima de um número que não existe.
 *
 * Use <EstadoDaTela> em toda tela que parte de um agregado.
 */

export function CarregandoTabela({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}

export function SemCorrespondencia({
  titulo = 'Nenhum registro corresponde aos filtros',
  descricao = 'Os dados podem existir fora do recorte atual. Limpe ou amplie os filtros.',
  acao,
  className,
}: {
  titulo?: string
  descricao?: string
  acao?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{titulo}</p>
      <p className="max-w-md text-xs text-muted-foreground">{descricao}</p>
      {acao}
    </div>
  )
}

export function ConsultaFalhou({
  erro,
  aoTentarDeNovo,
  className,
}: {
  erro: unknown
  aoTentarDeNovo?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      <TriangleAlert className="size-8 text-destructive" aria-hidden />
      <p className="text-sm font-medium">A consulta falhou. Este NÃO é um resultado zero.</p>
      <p className="max-w-md text-xs text-muted-foreground">{mensagemDeErro(erro)}</p>
      {aoTentarDeNovo && (
        <Button variant="outline" size="sm" onClick={aoTentarDeNovo} className="mt-1">
          Tentar de novo
        </Button>
      )}
    </div>
  )
}

export interface EstadoDaTelaProps {
  carregando: boolean
  erro: unknown
  /** Quantidade de linhas que voltaram. 0 ou null significa "sem correspondência". */
  quantidade: number | null | undefined
  children: React.ReactNode
  aoTentarDeNovo?: () => void
  vazio?: React.ReactNode
  carregandoNode?: React.ReactNode
}

export function EstadoDaTela({
  carregando,
  erro,
  quantidade,
  children,
  aoTentarDeNovo,
  vazio,
  carregandoNode,
}: EstadoDaTelaProps) {
  if (carregando) return <>{carregandoNode ?? <CarregandoTabela />}</>
  if (erro) return <ConsultaFalhou erro={erro} aoTentarDeNovo={aoTentarDeNovo} />
  if (!quantidade) return <>{vazio ?? <SemCorrespondencia />}</>
  return <>{children}</>
}

const formatarPadrao = (v: number) => v.toLocaleString('pt-BR')

/**
 * Valor numérico que sabe a diferença entre "zero de verdade" e "sem dado".
 * Use em card de KPI, rodapé de total e célula de indicador.
 */
export function ValorOuSemDado({
  valor,
  formatar = formatarPadrao,
  className,
}: {
  valor: number | null | undefined
  formatar?: (v: number) => string
  className?: string
}) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 text-muted-foreground', className)}
        title="Sem dado registrado. Não é zero."
      >
        <CircleAlert className="size-3.5" aria-hidden />
        sem dado
      </span>
    )
  }
  return <span className={cn('tabular-nums', className)}>{formatar(valor)}</span>
}
