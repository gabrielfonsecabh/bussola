import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export interface PainelDeDetalheProps {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  /**
   * PROVENIÊNCIA: de qual linha este painel veio, repetido no cabeçalho.
   * O usuário já esqueceu quando o painel termina de abrir.
   */
  origem: string
  children: React.ReactNode
  /** Ação corretiva do que o painel diagnostica. Um painel só de leitura
   *  manda o usuário resolver o problema fora do sistema. */
  acoes?: React.ReactNode
  largura?: 'media' | 'larga'
}

/**
 * Camada de detalhe sobre a tabela, não navegação.
 *
 * Sheet (e não dialog) porque o usuário precisa COMPARAR o detalhe com a linha
 * que ficou atrás. Fechar devolve exatamente o estado anterior: a tabela não
 * remonta, os filtros e o scroll continuam onde estavam.
 */
export function PainelDeDetalhe({
  aberto,
  aoFechar,
  titulo,
  origem,
  children,
  acoes,
  largura = 'media',
}: PainelDeDetalheProps) {
  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <SheetContent
        side="right"
        className={
          largura === 'larga'
            ? 'flex w-full flex-col gap-0 p-0 sm:max-w-3xl'
            : 'flex w-full flex-col gap-0 p-0 sm:max-w-xl'
        }
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base leading-snug">{titulo}</SheetTitle>
          <SheetDescription className="text-xs">{origem}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {acoes && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
            {acoes}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
