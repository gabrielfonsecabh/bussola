import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'

import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
import { Badge } from '@/components/ui/badge'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { carregarPlacar, type LinhaDoPlacar } from '@/features/processos/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { fmt } from '@/lib/formato'
import { cn } from '@/lib/utils'

/** Área com percentual, ou seja, área que tem ao menos um processo. */
type Ranqueada = LinhaDoPlacar & { percentual: number }

/**
 * Posição com empate: duas áreas no mesmo percentual dividem o lugar.
 *
 * Numerar pela ordem da lista faria a segunda parecer atrás por um critério
 * que não existe (o desempate que vem do banco é alfabético, não de mérito).
 * A posição sai de COMPARAÇÃO, não do índice: contar a partir da ordem da
 * lista deixaria o ranking errado e calado no dia em que o `order by` da RPC
 * mudasse. São dezenas de áreas, então comparar todas com todas não pesa.
 */
function posicoes(linhas: Ranqueada[]): number[] {
  return linhas.map((l) => linhas.filter((o) => o.percentual > l.percentual).length + 1)
}

export function PlacarDasAreas({
  areaSelecionada,
  aoEscolherArea,
  processosSemArea,
}: {
  areaSelecionada?: string | null
  /** Clicar na área leva o filtro da página para ela, e clicar de novo limpa. */
  aoEscolherArea?: (areaId: string | null) => void
  /**
   * Processos sem área na empresa inteira, ou `null` quando a página não tem
   * como contá-los (recorte por área aberto, consulta ainda em voo). O placar
   * parte de `app.areas`: quem não tem área não aparece em linha nenhuma, e
   * sem esta nota a coluna Processos soma menos que a empresa sem explicação.
   */
  processosSemArea?: number | null
}) {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null

  const consulta = useQuery({
    queryKey: chaves.placar(empresaId),
    enabled: !!empresaId,
    queryFn: () => carregarPlacar(empresaId!),
  })

  const linhas = consulta.data ?? []
  // Área sem processo tem percentual NULO, e nulo não é zero. Colocá-la em
  // último com 0% pune quem nem foi convidada para a jornada, então ela sai do
  // ranking e ganha uma seção própria, sem posição e sem porcentagem.
  const ranqueadas = linhas.filter((l): l is Ranqueada => l.percentual !== null)
  const foraDoPlacar = linhas.filter((l) => l.percentual === null)
  const lugares = posicoes(ranqueadas)

  return (
    <section>
      <h2 className="flex items-center gap-1.5 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <Trophy className="size-3.5" aria-hidden />
        Placar das áreas
      </h2>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={linhas.length}
          aoTentarDeNovo={() => void consulta.refetch()}
          vazio={
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium">Nenhuma área cadastrada</p>
              <p className="pt-1 text-xs text-muted-foreground">
                O placar compara áreas: cadastre o organograma em Administração, Áreas.
              </p>
            </div>
          }
        >
          <>
            {ranqueadas.length === 0 ? (
              <p className="px-6 py-8 text-center text-xs text-muted-foreground">
                Nenhuma área tem processo cadastrado ainda, então não existe placar para
                mostrar. Isso não é 0%: é a jornada que ainda não começou.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead className="min-w-48">Área</TableHead>
                      <TableHead className="min-w-40">Selos conquistados</TableHead>
                      <TableHead className="text-center">Processos</TableHead>
                      <TableHead className="text-center">Completos</TableHead>
                      <TableHead className="text-center">Sem dono</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranqueadas.map((l, i) => {
                      const selecionada = areaSelecionada === l.area_id
                      return (
                        <TableRow
                          key={l.area_id}
                          className={cn(selecionada && 'bg-muted/60')}
                        >
                          <TableCell className="text-center text-sm font-semibold tabular-nums">
                            {lugares[i]}
                          </TableCell>

                          <TableCell>
                            {aoEscolherArea ? (
                              // Botão, e não linha clicável: a linha inteira não
                              // é alcançável por teclado, e este é o único
                              // caminho da tela para filtrar por área.
                              <button
                                type="button"
                                aria-pressed={selecionada}
                                onClick={() => aoEscolherArea(selecionada ? null : l.area_id)}
                                className="rounded-sm text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              >
                                {l.area_nome}
                              </button>
                            ) : (
                              <span className="text-sm font-medium">{l.area_nome}</span>
                            )}
                            {l.com_pendencia > 0 && (
                              <span className="block pt-0.5 text-xs text-warning-subtle-foreground">
                                {l.com_pendencia} com pendência de mapeamento
                              </span>
                            )}
                          </TableCell>

                          <TableCell>
                            {/* Tom sempre primário: um verde acima de X% seria
                                um corte que ninguém combinou. O número e a
                                posição já dizem quem está na frente. */}
                            <BarraDeProgresso
                              valor={l.percentual}
                              rotulo={`Selos conquistados por ${l.area_nome}`}
                            />
                            <span className="block pt-0.5 text-xs text-muted-foreground tabular-nums">
                              {l.selos_ganhos} de {l.selos_possiveis} selos ·{' '}
                              {fmt.percentual(l.percentual, Number.isInteger(l.percentual) ? 0 : 1)}
                            </span>
                          </TableCell>

                          <TableCell className="text-center text-sm tabular-nums">
                            {l.processos}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            {l.completos}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            {l.sem_dono > 0 ? (
                              <span className="text-warning-subtle-foreground">{l.sem_dono}</span>
                            ) : (
                              l.sem_dono
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {typeof processosSemArea === 'number' && processosSemArea > 0 && (
              <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                Processos sem área: {processosSemArea}. Eles não entram em nenhuma linha deste
                placar, então a coluna Processos soma menos que o total da empresa até alguém
                dar área a eles. Na lista de processos desta página eles aparecem como sem área.
              </p>
            )}

            {foraDoPlacar.length > 0 && (
              <div className="border-t border-border bg-muted/40 px-4 py-3">
                <p className="text-xs font-medium">Ainda não entraram na jornada</p>
                <p className="pt-0.5 text-xs text-muted-foreground">
                  Estas áreas não têm nenhum processo cadastrado. Elas ficam fora do ranking
                  de propósito: 0% diria que estão atrasadas, e o que existe é ausência de
                  dado.
                </p>
                <ul className="flex flex-wrap gap-1.5 pt-2">
                  {foraDoPlacar.map((l) => (
                    <li key={l.area_id}>
                      <Badge variant="outline">{l.area_nome}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        </EstadoDaTela>
      </div>
    </section>
  )
}
