import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Farol } from '@/components/ui/farol'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { listarAreas } from '@/features/admin/api'
import { carregarArvore, estadoDoFarol, type NoDaArvore } from '@/features/okr/api'
import { invalidarOkr } from '@/features/okr/grafo/invalidar'
import { PainelDoOkr } from '@/features/okr/PainelDoOkr'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { baixarCsv } from '@/lib/exportar'
import { fmt, rotulo, rotulos } from '@/lib/formato'

/**
 * A árvore em lista indentada. Continua existindo ao lado do canvas porque
 * é ela que exporta CSV, cabe em tela pequena e lê bem para quem prefere
 * texto. O comportamento é o que a página tinha antes do canvas.
 */
export function ListaDeOkr({
  ano,
  areaId,
  aoMudarArea,
}: {
  ano: number
  areaId: string | null
  aoMudarArea: (areaId: string | null) => void
}) {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()

  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set())
  const [selecionado, setSelecionado] = useState<NoDaArvore | null>(null)

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  const consulta = useQuery({
    queryKey: chaves.okrArvore(empresaId, ano, areaId),
    enabled: !!empresaId,
    queryFn: () => carregarArvore(empresaId!, ano, areaId),
  })

  const todos = useMemo(() => consulta.data ?? [], [consulta.data])

  /**
   * Recolher um nó esconde a subárvore inteira. A visibilidade é derivada do
   * `caminho` que o banco já devolveu, então não há um segundo passeio pela
   * árvore no cliente.
   */
  const visiveis = useMemo(
    () =>
      todos.filter((no) =>
        no.caminho.slice(0, -1).every((ancestral) => !recolhidos.has(ancestral)),
      ),
    [todos, recolhidos],
  )

  const resumo = useMemo(() => {
    const conta = { verde: 0, amarelo: 0, vermelho: 0, cinza: 0 }
    for (const no of todos) conta[no.farol as keyof typeof conta] += 1
    const medidos = todos.filter((n) => n.atingimento !== null)
    const media =
      medidos.length === 0
        ? null
        : medidos.reduce((s, n) => s + (n.atingimento ?? 0), 0) / medidos.length
    return { ...conta, total: todos.length, media }
  }, [todos])

  function alternar(id: string) {
    setRecolhidos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CartaoDeMetrica rotulo="OKRs no ciclo" valor={resumo.total} carregando={consulta.isLoading} />
        <CartaoDeMetrica rotulo="No ritmo" valor={resumo.verde} tom="success" carregando={consulta.isLoading} />
        <CartaoDeMetrica rotulo="Atenção" valor={resumo.amarelo} tom="warning" carregando={consulta.isLoading} />
        <CartaoDeMetrica rotulo="Risco" valor={resumo.vermelho} tom="destructive" carregando={consulta.isLoading} />
        <CartaoDeMetrica
          rotulo="Atingimento médio"
          valor={fmt.atingimento(resumo.media)}
          formatar={(v) => `${v}%`}
          detalhe={`${resumo.cinza} sem medição`}
          carregando={consulta.isLoading}
        />
      </div>

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
            placeholder="Empresa inteira (raiz nos corporativos)"
            aria-label="Filtrar por área"
          />
        </div>
        {todos.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setRecolhidos((atual) =>
                atual.size > 0
                  ? new Set()
                  : new Set(todos.filter((n) => n.total_filhos > 0).map((n) => n.id)),
              )
            }
          >
            {recolhidos.size > 0 ? 'Expandir tudo' : 'Recolher tudo'}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={visiveis.length === 0}
          onClick={() =>
            baixarCsv(
              `okr-${empresaAtiva?.nome_fantasia ?? 'empresa'}-${ano}`,
              visiveis.map((no) => ({
                nivel: rotulo(rotulos.nivel_okr, no.nivel),
                titulo: no.titulo,
                area: no.area_nome ?? '',
                dono: no.owner_nome ?? '',
                objetivo_estrategico: no.objetivo_titulo ?? '',
                key_results: no.total_krs,
                atingimento_pct: fmt.atingimento(no.atingimento) ?? '',
                farol: no.farol,
                status: no.status,
              })),
            )
          }
        >
          <Download className="size-4" aria-hidden />
          Exportar
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={visiveis.length}
          aoTentarDeNovo={() => void consulta.refetch()}
          vazio={
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium">
                {areaId ? 'Nenhum OKR nesta área e neste ano' : `Nenhum OKR corporativo em ${ano}`}
              </p>
              <p className="pt-1 text-xs text-muted-foreground">
                Isto é "sem correspondência", não uma falha de consulta. Troque o ano ou a
                área, ou crie o OKR a partir do mapa estratégico.
              </p>
            </div>
          }
        >
          <ul className="divide-y divide-border">
            {visiveis.map((no) => {
              const temFilhos = no.total_filhos > 0
              const recolhido = recolhidos.has(no.id)
              return (
                <li key={no.id} className="flex items-stretch">
                  {temFilhos ? (
                    <button
                      type="button"
                      onClick={() => alternar(no.id)}
                      aria-label={recolhido ? `Expandir ${no.titulo}` : `Recolher ${no.titulo}`}
                      aria-expanded={!recolhido}
                      className="flex shrink-0 items-center px-2 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      style={{ paddingLeft: `${0.5 + no.profundidade * 1.25}rem` }}
                    >
                      {recolhido ? (
                        <ChevronRight className="size-4" aria-hidden />
                      ) : (
                        <ChevronDown className="size-4" aria-hidden />
                      )}
                    </button>
                  ) : (
                    <span className="shrink-0" style={{ paddingLeft: `${1.5 + no.profundidade * 1.25}rem` }} />
                  )}

                  {/* A LINHA INTEIRA abre o detalhe, não um chevron minúsculo. */}
                  <button
                    type="button"
                    onClick={() => setSelecionado(no)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{no.titulo}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {rotulo(rotulos.nivel_okr, no.nivel)}
                        {no.area_nome ? ` · ${no.area_nome}` : ''}
                        {no.owner_nome ? ` · ${no.owner_nome}` : ' · sem dono'}
                      </span>
                    </span>

                    <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
                      {no.total_krs} KR
                    </Badge>

                    <span className="hidden w-24 shrink-0 text-right text-sm whitespace-nowrap md:block">
                      <ValorOuSemDado valor={fmt.atingimento(no.atingimento)} formatar={(v) => `${v}%`} />
                    </span>

                    <Farol estado={estadoDoFarol(no.farol)} suave className="shrink-0" />
                  </button>
                </li>
              )
            })}
          </ul>
        </EstadoDaTela>
      </div>

      {selecionado && (
        <PainelDoOkr
          no={selecionado}
          ano={ano}
          aoFechar={() => setSelecionado(null)}
          aoDesdobrar={() => invalidarOkr(queryClient)}
        />
      )}
    </div>
  )
}
