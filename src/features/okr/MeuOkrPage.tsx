import { useQuery } from '@tanstack/react-query'
import { Target } from 'lucide-react'
import { useMemo, useState } from 'react'

import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Farol } from '@/components/ui/farol'
import { carregarArvore, estadoDoFarol, meusOkrs, type NoDaArvore } from '@/features/okr/api'
import { PainelDoOkr } from '@/features/okr/PainelDoOkr'
import { SeletorDeAno } from '@/features/okr/SeletorDeAno'
import { useAuth } from '@/hooks/use-auth'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { anoAtual, fmt, rotulo, rotulos } from '@/lib/formato'

export function MeuOkrPage() {
  const { empresaAtiva } = useEmpresa()
  const { usuario } = useAuth()
  const empresaId = empresaAtiva?.id ?? null
  const userId = usuario?.id ?? null
  const [ano, setAno] = useState(anoAtual())
  const [selecionado, setSelecionado] = useState<NoDaArvore | null>(null)

  const consulta = useQuery({
    queryKey: chaves.meusOkrs(empresaId, ano),
    enabled: !!empresaId && !!userId,
    queryFn: () => meusOkrs(empresaId!, ano, userId!),
  })

  // A árvore dá o farol e o atingimento já calculados pelo banco, para o
  // detalhe abrir com os mesmos números da tela de árvore.
  const arvore = useQuery({
    queryKey: chaves.okrArvore(empresaId, ano, null),
    enabled: !!empresaId,
    queryFn: () => carregarArvore(empresaId!, ano, null),
  })

  const porId = useMemo(
    () => new Map((arvore.data ?? []).map((n) => [n.id, n])),
    [arvore.data],
  )

  const okrs = useMemo(() => consulta.data ?? [], [consulta.data])

  const resumo = useMemo(() => {
    const krs = okrs.flatMap((o) => o.key_results)
    const semMedicao = krs.filter((k) => k.atual === null).length
    return {
      okrs: okrs.length,
      krs: krs.length,
      semMedicao,
      emRisco: krs.filter((k) => k.farol === 'vermelho').length,
    }
  }, [okrs])

  return (
    <Page
      title="Meu OKR"
      description="Os objetivos de que você é dono"
      actions={<SeletorDeAno ano={ano} aoMudar={setAno} />}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoDeMetrica rotulo="Meus OKRs" valor={resumo.okrs} carregando={consulta.isLoading} />
          <CartaoDeMetrica rotulo="Key results" valor={resumo.krs} carregando={consulta.isLoading} />
          <CartaoDeMetrica
            rotulo="Sem medição"
            valor={resumo.semMedicao}
            tom={resumo.semMedicao > 0 ? 'warning' : 'neutro'}
            detalhe="KR sem check-in não tem farol"
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Em risco"
            valor={resumo.emRisco}
            tom={resumo.emRisco > 0 ? 'destructive' : 'success'}
            carregando={consulta.isLoading}
          />
        </div>

        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={okrs.length}
          aoTentarDeNovo={() => void consulta.refetch()}
          vazio={
            <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
              <Target className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="pt-2 text-sm font-medium">Você não é dono de nenhum OKR em {ano}</p>
              <p className="pt-1 text-xs text-muted-foreground">
                Isto significa "sem correspondência", não falha de consulta. Peça ao seu gestor
                para desdobrar um OKR da área para você na Árvore de OKR.
              </p>
            </div>
          }
        >
          <div className="space-y-3">
            {okrs.map((okr) => {
              const no = porId.get(okr.id)
              return (
                <article
                  key={okr.id}
                  className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                >
                  <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold">{okr.titulo}</h2>
                      <p className="pt-0.5 text-xs text-muted-foreground">
                        {rotulo(rotulos.nivel_okr, okr.nivel)}
                        {okr.areas?.nome ? ` · ${okr.areas.nome}` : ''}
                        {okr.trimestre ? ` · T${okr.trimestre}` : ' · anual'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {no && (
                        <Farol
                          estado={estadoDoFarol(no.farol)}
                          rotulo={
                            no.atingimento === null
                              ? undefined
                              : `${fmt.atingimento(no.atingimento)}% da meta`
                          }
                        />
                      )}
                      {no && (
                        <Button size="xs" variant="outline" onClick={() => setSelecionado(no)}>
                          Abrir
                        </Button>
                      )}
                    </div>
                  </header>

                  <ul className="divide-y divide-border">
                    {okr.key_results.length === 0 && (
                      <li className="px-4 py-6 text-center text-xs text-muted-foreground">
                        Este OKR ainda não tem key result.
                      </li>
                    )}
                    {okr.key_results.map((kr) => (
                      <li key={kr.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <span className="min-w-48 flex-1 text-sm">{kr.descricao}</span>

                        <span className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            atual: <ValorOuSemDado valor={kr.atual} className="text-foreground" />
                          </span>
                          <span>
                            meta: <ValorOuSemDado valor={kr.meta} className="text-foreground" />
                          </span>
                          {kr.unidade && <Badge variant="outline">{kr.unidade}</Badge>}
                        </span>

                        <BarraDeProgresso
                          className="w-40"
                          valor={
                            kr.tipo === 'marco' ||
                            kr.meta === null ||
                            kr.baseline === null ||
                            kr.atual === null
                              ? null
                              : Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    ((kr.atual - kr.baseline) / (kr.meta - kr.baseline)) * 100,
                                  ),
                                )
                          }
                          tom={
                            kr.farol === 'verde'
                              ? 'success'
                              : kr.farol === 'amarelo'
                                ? 'warning'
                                : kr.farol === 'vermelho'
                                  ? 'destructive'
                                  : 'info'
                          }
                          rotulo={`Progresso de ${kr.descricao}`}
                        />

                        <Farol estado={estadoDoFarol(kr.farol)} suave />
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        </EstadoDaTela>
      </div>

      {selecionado && (
        <PainelDoOkr
          no={selecionado}
          ano={ano}
          aoFechar={() => setSelecionado(null)}
          aoDesdobrar={() => void consulta.refetch()}
        />
      )}
    </Page>
  )
}
