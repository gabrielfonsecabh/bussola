import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calculator, Download, LoaderCircle, Lock, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  apurarBonus,
  carregarApuracao,
  carregarConfigDeBonus,
  salvarConfigDeBonus,
  type Faixa,
} from '@/features/gestao/api'
import {
  FormularioDeConfigDeBonus,
  type DadosDoModeloDeBonus,
} from '@/features/gestao/FormularioDeConfigDeBonus'
import { SeletorDeAno } from '@/features/okr/SeletorDeAno'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { baixarCsv } from '@/lib/exportar'
import { anoAtual, fmt, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

/**
 * O banco guarda fração e a tela mostra porcentagem. O arredondamento é o que
 * impede a volta em ponto flutuante de virar "7.000000000000001%" no cartão.
 */
function pesoEmPorcentagem(v: number | undefined): number | null {
  return v === undefined ? null : Math.round(v * 10000) / 100
}

const porcentagem = (v: number) => `${fmt.numero(v)}%`

/**
 * Campo em branco é `null`: "não houve medição". Texto que não é número devolve
 * NaN, que vira `null` no JSON e seria gravado como se o campo estivesse em
 * branco, então a tela bloqueia a apuração em vez de apurar sem o indicador.
 */
function pctDigitado(texto: string): number | null {
  if (texto.trim() === '') return null
  return Number(texto.replace(',', '.'))
}

export function BonusPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()

  const [ano, setAno] = useState(anoAtual())
  const [periodo, setPeriodo] = useState(String(anoAtual()))
  const [ebitda, setEbitda] = useState('')
  const [faturamento, setFaturamento] = useState('')
  const [configurando, setConfigurando] = useState(false)

  const podeVer = podeFazer('bonus.view')
  const podeConfigurar = podeFazer('bonus.config')

  const config = useQuery({
    queryKey: chaves.bonusConfig(empresaId, ano),
    enabled: !!empresaId && podeVer,
    queryFn: () => carregarConfigDeBonus(empresaId!, ano),
  })

  const apuracao = useQuery({
    queryKey: chaves.bonusApuracao(empresaId, periodo),
    enabled: !!empresaId && podeVer,
    queryFn: () => carregarApuracao(empresaId!, periodo),
  })

  const salvarModelo = useMutation({
    mutationFn: (dados: DadosDoModeloDeBonus) =>
      salvarConfigDeBonus({
        companyId: empresaId!,
        ano,
        pesos: dados.pesos,
        reguas: dados.reguas,
      }),
    onSuccess: () => {
      setConfigurando(false)
      salvarModelo.reset()
      void queryClient.invalidateQueries({ queryKey: chaves.bonusConfig(empresaId, ano) })
      // A apuração gravada foi calculada com o modelo ANTIGO. Invalidar aqui faz
      // a tela reler a apuração, mas ela só volta a bater depois de refeita.
      void queryClient.invalidateQueries({ queryKey: chaves.bonusApuracao(empresaId, periodo) })
    },
  })

  const ebitdaPct = pctDigitado(ebitda)
  const faturamentoPct = pctDigitado(faturamento)
  const indicadorInvalido = Number.isNaN(ebitdaPct) || Number.isNaN(faturamentoPct)

  const apurar = useMutation({
    mutationFn: () =>
      apurarBonus({
        companyId: empresaId!,
        periodo,
        ebitdaPct,
        faturamentoPct,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: chaves.bonusApuracao(empresaId, periodo) }),
  })

  const pesos = (config.data?.pesos ?? {}) as Record<string, number>
  const reguas = (config.data?.reguas ?? {}) as Record<string, Faixa[] | Record<string, number>>

  const linhas = useMemo(() => apuracao.data ?? [], [apuracao.data])
  // Consulta que falhou devolve lista vazia, e contagem de lista vazia é zero.
  // Os cartões de contagem precisam dizer "sem dado" nesse caso, senão a tela
  // afirma que o período não tem nenhuma linha apurada.
  const apuracaoFalhou = !!apuracao.error

  const totais = useMemo(() => {
    const global = linhas.filter((l) => l.escopo === 'global')
    const area = linhas.filter((l) => l.escopo === 'area')
    const comResultado = linhas.filter((l) => l.resultado_pct !== null)
    return {
      global: global.some((l) => l.resultado_pct !== null)
        ? global.reduce((s, l) => s + (l.resultado_pct ?? 0), 0)
        : null,
      setorial: area.some((l) => l.resultado_pct !== null)
        ? area.reduce((s, l) => s + (l.resultado_pct ?? 0), 0) / Math.max(1, area.length)
        : null,
      total: comResultado.length === 0 ? null : comResultado.reduce((s, l) => s + (l.resultado_pct ?? 0), 0),
      semDado: linhas.filter((l) => l.resultado_pct === null).length,
    }
  }, [linhas])

  if (!podeVer) {
    return (
      <Page title="Bônus" description="Modelo e apuração">
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="pt-2 text-sm font-medium">Você não tem acesso ao painel de bônus</p>
          <p className="pt-1 text-xs text-muted-foreground">
            Esta tela exige a permissão <code>bonus.view</code>. Isto é apenas a UI escondendo o
            que você não pode ver: o banco recusaria a consulta de qualquer forma.
          </p>
        </div>
      </Page>
    )
  }

  return (
    <Page
      title="Bônus"
      description="Modelo, réguas e apuração do atingimento"
      actions={
        <>
          {podeConfigurar && (
            <Button
              size="sm"
              variant="outline"
              disabled={config.isLoading || !!config.error}
              onClick={() => setConfigurando(true)}
              title={
                config.error
                  ? 'A leitura do modelo falhou. Editar agora poderia sobrescrever uma configuração que existe.'
                  : 'Pesos, réguas e multiplicadores do ano'
              }
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              Configurar modelo
            </Button>
          )}
          <SeletorDeAno ano={ano} aoMudar={setAno} />
        </>
      }
    >
      <div className="space-y-5">
        <p className="max-w-3xl text-sm text-muted-foreground">
          A Bússola mede o atingimento. O pagamento em dinheiro continua fora do sistema neste
          v1. Cada linha da apuração fica gravada com autor e data, e refazer o mesmo período
          substitui em vez de acumular.
        </p>

        {/* --- Modelo --- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Modelo de {ano}</h2>

          {config.isLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}

          {!config.isLoading && config.error && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              <p className="font-semibold">
                A leitura do modelo de {ano} falhou. Isto NÃO quer dizer que ele não existe.
              </p>
              <p>{mensagemDeErro(config.error)}</p>
              <Button size="sm" variant="outline" onClick={() => void config.refetch()}>
                Tentar de novo
              </Button>
            </div>
          )}

          {!config.isLoading && !config.error && !config.data && (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <p>
                Não existe configuração de bônus para {ano} nesta empresa. A apuração vai recusar
                o cálculo enquanto ela não existir, em vez de inventar pesos padrão.
              </p>
              {podeConfigurar && (
                <Button size="sm" variant="outline" onClick={() => setConfigurando(true)}>
                  <SlidersHorizontal className="size-4" aria-hidden />
                  Criar a configuração de {ano}
                </Button>
              )}
            </div>
          )}

          {config.data && (
            <>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <CartaoDeMetrica
                  rotulo="Peso global"
                  valor={pesoEmPorcentagem(pesos.global)}
                  formatar={porcentagem}
                  detalhe="EBITDA e faturamento"
                />
                <CartaoDeMetrica
                  rotulo="Peso setorial"
                  valor={pesoEmPorcentagem(pesos.setorial)}
                  formatar={porcentagem}
                  detalhe="Kit mínimo de gestão"
                />
                <CartaoDeMetrica
                  rotulo="Peso individual"
                  valor={pesoEmPorcentagem(pesos.individual)}
                  formatar={porcentagem}
                  detalhe="assiduidade"
                />
                <CartaoDeMetrica
                  rotulo="EBITDA dentro do global"
                  valor={pesoEmPorcentagem(pesos.ebitda)}
                  formatar={porcentagem}
                />
                <CartaoDeMetrica
                  rotulo="Faturamento dentro do global"
                  valor={pesoEmPorcentagem(pesos.faturamento)}
                  formatar={porcentagem}
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {(['ebitda', 'faturamento'] as const).map((chave) => {
                  const faixas = reguas[chave]
                  if (!Array.isArray(faixas)) return null
                  return (
                    <div key={chave} className="overflow-hidden rounded-lg border border-border bg-card">
                      <header className="border-b border-border px-4 py-2.5">
                        <h3 className="text-xs font-semibold tracking-wider uppercase">
                          Régua de {chave}
                        </h3>
                      </header>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Atingimento de</TableHead>
                            <TableHead>até</TableHead>
                            <TableHead className="text-right">Paga</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {faixas.map((f) => (
                            <TableRow key={`${chave}-${f.min}`}>
                              <TableCell>
                                <ValorOuSemDado valor={f.min} formatar={porcentagem} />
                              </TableCell>
                              <TableCell>
                                {/* Faixa de topo: sem teto, vale daqui para cima. */}
                                {f.max === null ? (
                                  <span className="text-muted-foreground">em diante</span>
                                ) : (
                                  <ValorOuSemDado valor={f.max} formatar={porcentagem} />
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <ValorOuSemDado valor={f.paga} formatar={porcentagem} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                })}
              </div>

              {reguas.multiplicador_nivel &&
                !Array.isArray(reguas.multiplicador_nivel) && (
                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <header className="border-b border-border px-4 py-2.5">
                      <h3 className="text-xs font-semibold tracking-wider uppercase">
                        Multiplicador por nível (em salários)
                      </h3>
                    </header>
                    <div className="flex flex-wrap gap-2 p-4">
                      {Object.entries(reguas.multiplicador_nivel).map(([nivel, mult]) => (
                        <Badge key={nivel} variant="secondary">
                          {rotulo(rotulos.nivel_usuario, nivel)}: {fmt.numero(mult)}x
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
            </>
          )}
        </section>

        {/* --- Apuração --- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Apuração</h2>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bon-periodo">Período</Label>
              <Input
                id="bon-periodo"
                className="h-9 w-32"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                placeholder="2026 ou 2026-09"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bon-ebitda">EBITDA atingido (%)</Label>
              <Input
                id="bon-ebitda"
                className="h-9 w-36"
                inputMode="decimal"
                value={ebitda}
                onChange={(e) => setEbitda(e.target.value)}
                placeholder="vem do fechamento"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bon-fat">Faturamento atingido (%)</Label>
              <Input
                id="bon-fat"
                className="h-9 w-36"
                inputMode="decimal"
                value={faturamento}
                onChange={(e) => setFaturamento(e.target.value)}
                placeholder="vem do fechamento"
              />
            </div>

            {podeConfigurar && (
              <Button
                size="sm"
                className="mb-0.5"
                disabled={apurar.isPending || !config.data || indicadorInvalido}
                onClick={() => apurar.mutate()}
              >
                {apurar.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Calculator className="size-4" aria-hidden />
                )}
                Apurar
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              className="mb-0.5"
              disabled={linhas.length === 0}
              onClick={() =>
                baixarCsv(
                  `bonus-${empresaAtiva?.nome_fantasia ?? 'empresa'}-${periodo}`,
                  linhas.map((l) => ({
                    escopo: l.escopo,
                    referencia: l.referencia,
                    componente: l.componente,
                    atingimento_pct: l.atingimento_pct ?? '',
                    peso: l.peso ?? '',
                    resultado_pct: l.resultado_pct ?? '',
                  })),
                )
              }
            >
              <Download className="size-4" aria-hidden />
              Exportar
            </Button>
          </div>

          {indicadorInvalido && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              O EBITDA e o faturamento atingidos precisam ser número (use só dígitos e vírgula,
              sem o sinal de %). Campo em branco diz que não houve medição, e apurar com um
              texto que não é número gravaria a linha como se o indicador estivesse em branco.
            </p>
          )}

          {apurar.error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground">
              {mensagemDeErro(apurar.error)}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CartaoDeMetrica
              rotulo="Resultado global"
              valor={totais.global !== null ? totais.global * 100 : null}
              formatar={(v) => fmt.percentual(v, 1)}
              carregando={apuracao.isLoading}
            />
            <CartaoDeMetrica
              rotulo="Média setorial (Kit)"
              valor={totais.setorial !== null ? totais.setorial * 100 : null}
              formatar={(v) => fmt.percentual(v, 1)}
              carregando={apuracao.isLoading}
            />
            <CartaoDeMetrica
              rotulo="Componentes sem dado"
              valor={apuracaoFalhou ? null : totais.semDado}
              tom={apuracaoFalhou || totais.semDado > 0 ? 'warning' : 'success'}
              detalhe={apuracaoFalhou ? 'a consulta falhou' : 'não são zero'}
              carregando={apuracao.isLoading}
            />
            <CartaoDeMetrica
              rotulo="Linhas apuradas"
              valor={apuracaoFalhou ? null : linhas.length}
              detalhe={apuracaoFalhou ? 'a consulta falhou' : undefined}
              carregando={apuracao.isLoading}
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <EstadoDaTela
              carregando={apuracao.isLoading}
              erro={apuracao.error}
              quantidade={linhas.length}
              aoTentarDeNovo={() => void apuracao.refetch()}
              vazio={
                <div className="px-6 py-12 text-center">
                  <p className="text-sm font-medium">Nenhuma apuração para {periodo}</p>
                  <p className="pt-1 text-xs text-muted-foreground">
                    Sem correspondência, não falha de consulta. Rode a apuração informando os
                    indicadores globais do fechamento.
                  </p>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Escopo</TableHead>
                      <TableHead>Referência</TableHead>
                      <TableHead>Componente</TableHead>
                      <TableHead className="text-right">Atingimento</TableHead>
                      <TableHead className="text-right">Peso</TableHead>
                      <TableHead className="text-right">Resultado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l) => (
                      <TableRow key={`${l.escopo}-${l.referencia}-${l.componente}`}>
                        <TableCell>
                          <Badge
                            variant={
                              l.escopo === 'global'
                                ? 'info-subtle'
                                : l.escopo === 'area'
                                  ? 'secondary'
                                  : 'outline'
                            }
                          >
                            {l.escopo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{l.referencia}</TableCell>
                        <TableCell>{l.componente}</TableCell>
                        <TableCell className="text-right">
                          <ValorOuSemDado
                            valor={l.atingimento_pct}
                            formatar={(v) => fmt.percentual(v, 1)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <ValorOuSemDado
                            valor={l.peso !== null ? l.peso * 100 : null}
                            formatar={(v) => fmt.percentual(v, 0)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <ValorOuSemDado
                            valor={l.resultado_pct !== null ? l.resultado_pct * 100 : null}
                            formatar={(v) => fmt.percentual(v, 2)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </EstadoDaTela>
          </div>
        </section>
      </div>

      {configurando && (
        <FormularioDeConfigDeBonus
          ano={ano}
          config={config.data ?? null}
          salvando={salvarModelo.isPending}
          erro={salvarModelo.error ? mensagemDeErro(salvarModelo.error) : null}
          aoFechar={() => {
            setConfigurando(false)
            salvarModelo.reset()
          }}
          aoSalvar={(dados) => salvarModelo.mutate(dados)}
        />
      )}
    </Page>
  )
}
