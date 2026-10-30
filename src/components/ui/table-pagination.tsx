import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TAMANHOS_DE_PAGINA } from '@/lib/filtros'
import { cn } from '@/lib/utils'

export interface TablePaginationProps {
  page: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: readonly number[]
  /** True enquanto a contagem ainda não voltou do banco. */
  loading?: boolean
  className?: string
}

const formatador = new Intl.NumberFormat('pt-BR')

/**
 * Paginação server-side como UM contrato: página, tamanho, total e o seletor
 * de tamanho. Sem isto, cada tela inventa a sua e nenhuma é testada.
 *
 * Lembrete que anda junto: quem chama precisa ordenar por chave ÚNICA
 * (`.order('id')`) antes do `.range()`. Sem isso a paginação pula e duplica
 * linha sem erro nenhum.
 */
export function TablePagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = TAMANHOS_DE_PAGINA,
  loading,
  className,
}: TablePaginationProps) {
  const totalPaginas = Math.max(1, Math.ceil(totalCount / pageSize))
  const paginaAtual = Math.min(Math.max(1, page), totalPaginas)
  const primeiraLinha = totalCount === 0 ? 0 : (paginaAtual - 1) * pageSize + 1
  const ultimaLinha = Math.min(paginaAtual * pageSize, totalCount)

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {loading ? (
          'Contando registros...'
        ) : totalCount === 0 ? (
          'Nenhum registro'
        ) : (
          <>
            <span className="font-medium text-foreground">
              {formatador.format(primeiraLinha)}
            </span>
            {' a '}
            <span className="font-medium text-foreground">
              {formatador.format(ultimaLinha)}
            </span>
            {' de '}
            <span className="font-medium text-foreground">
              {formatador.format(totalCount)}
            </span>
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Por página</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger size="sm" className="h-8 w-20" aria-label="Linhas por página">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(1)}
            disabled={paginaAtual <= 1 || loading}
            aria-label="Primeira página"
          >
            <ChevronsLeft className="size-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(paginaAtual - 1)}
            disabled={paginaAtual <= 1 || loading}
            aria-label="Página anterior"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>

          <span className="px-2 text-xs whitespace-nowrap text-muted-foreground">
            {formatador.format(paginaAtual)} / {formatador.format(totalPaginas)}
          </span>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(paginaAtual + 1)}
            disabled={paginaAtual >= totalPaginas || loading}
            aria-label="Próxima página"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(totalPaginas)}
            disabled={paginaAtual >= totalPaginas || loading}
            aria-label="Última página"
          >
            <ChevronsRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}
