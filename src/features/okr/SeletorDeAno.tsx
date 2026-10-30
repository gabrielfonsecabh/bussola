import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { anoAtual } from '@/lib/formato'

/**
 * O ciclo é anual. O seletor fica nas AÇÕES do header, não dentro da tela,
 * para o recorte de tempo ficar sempre no mesmo lugar em todos os módulos.
 */
export function SeletorDeAno({
  ano,
  aoMudar,
  janela = 3,
}: {
  ano: number
  aoMudar: (ano: number) => void
  janela?: number
}) {
  const base = anoAtual()
  const anos = Array.from({ length: janela * 2 + 1 }, (_, i) => base - janela + i)

  return (
    <Select value={String(ano)} onValueChange={(v) => aoMudar(Number(v))}>
      <SelectTrigger size="sm" className="h-8 w-24" aria-label="Ano do ciclo">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {anos.map((a) => (
          <SelectItem key={a} value={String(a)}>
            {a}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
