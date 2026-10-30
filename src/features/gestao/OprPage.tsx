import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, LoaderCircle, Printer, Save } from 'lucide-react'
import { useState } from 'react'

import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Farol } from '@/components/ui/farol'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { listarAreas } from '@/features/admin/api'
import {
  carregarOpr,
  montarOpr,
  publicarOpr,
  salvarOpr,
} from '@/features/gestao/api'
import { estadoDoFarol } from '@/features/okr/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { fmt, periodoAtual, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

/**
 * O OPR monta sozinho o que já existe nos módulos (OKR, indicadores, projetos,
 * melhorias) e deixa para o autor escrever só o que é julgamento dele:
 * destaques, riscos e próximos passos. Assim o relatório é auditável até o
 * lançamento, e não uma redação sobre números soltos.
 *
 * Exportação em PDF: `window.print()` com folha de estilo de impressão. Uma
 * página, sem dependência extra, e o PDF sai igual ao que está na tela.
 */
export function OprPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()

  const [areaId, setAreaId] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState(periodoAtual())
  const [destaques, setDestaques] = useState('')
  const [riscos, setRiscos] = useState('')
  const [proximos, setProximos] = useState('')
  const [chaveCarregada, setChaveCarregada] = useState('')

  const podeEditar = podeFazer('opr.edit')
  const podePublicar = podeFazer('opr.publish')

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  const snapshot = useQuery({
    queryKey: chaves.oprSnapshot(areaId, periodo),
    enabled: !!areaId,
    queryFn: () => montarOpr(areaId!, periodo),
  })

  const salvo = useQuery({
    queryKey: chaves.opr(empresaId, areaId, periodo),
    enabled: !!empresaId && !!areaId,
    queryFn: () => carregarOpr(empresaId!, areaId!, periodo),
  })

  // Carrega os campos livres quando muda a área ou o período, sem useEffect.
  const chaveAtual = `${areaId}-${periodo}-${salvo.dataUpdatedAt}`
  if (salvo.isFetched && chaveAtual !== chaveCarregada) {
    setChaveCarregada(chaveAtual)
    setDestaques(salvo.data?.destaques ?? '')
    setRiscos(salvo.data?.riscos ?? '')
    setProximos(salvo.data?.proximos_passos ?? '')
  }

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chaves.opr(empresaId, areaId, periodo) })
    void queryClient.invalidateQueries({ queryKey: ['kit'] })
  }

  const salvar = useMutation({
    mutationFn: () =>
      salvarOpr({
        companyId: empresaId!,
        areaId: areaId!,
        periodo,
        destaques: destaques.trim() || null,
        riscos: riscos.trim() || null,
        proximos_passos: proximos.trim() || null,
        snapshot: snapshot.data ?? null,
      }),
    onSuccess: invalidar,
  })

  const publicar = useMutation({
    mutationFn: async () => {
      const registro = salvo.data ?? (await salvar.mutateAsync())
      return publicarOpr(registro.id)
    },
    onSuccess: invalidar,
  })

  const s = snapshot.data
  const publicado = salvo.data?.status === 'publicado'
  const areaNome = areas.data?.find((a) => a.id === areaId)?.nome

  return (
    <Page
      title="One Page Report"
      description="Relatório mensal da área"
      actions={
        <>
          <Input
            type="month"
            className="h-8 w-36"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            aria-label="Período do OPR"
          />
          <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!s}>
            <Printer className="size-4" aria-hidden />
            PDF
          </Button>
          {podeEditar && (
            <Button
              size="sm"
              variant="outline"
              disabled={!areaId || salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Salvar rascunho
            </Button>
          )}
          {podePublicar && (
            <Button
              size="sm"
              disabled={!areaId || publicar.isPending || publicado}
              onClick={() => publicar.mutate()}
            >
              {publicar.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {publicado ? 'Publicado' : 'Publicar'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="w-80 space-y-1.5">
            <Label htmlFor="opr-area">Área</Label>
            <SearchableSelect
              id="opr-area"
              options={(areas.data ?? []).map((a) => ({
                value: a.id,
                label: a.nome,
                description: rotulo(rotulos.tipo_area, a.tipo),
              }))}
              value={areaId}
              onChange={setAreaId}
              placeholder="Selecionar área"
              clearable={false}
            />
          </div>
          {salvo.data && (
            <Badge variant={publicado ? 'success-subtle' : 'warning-subtle'} className="mb-2 gap-1">
              {publicado && <CircleCheck className="size-3" aria-hidden />}
              {publicado
                ? `publicado em ${fmt.data(salvo.data.publicado_em?.slice(0, 10) ?? null)}`
                : 'rascunho'}
            </Badge>
          )}
        </div>

        {(salvar.error || publicar.error) && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground print:hidden">
            {mensagemDeErro(salvar.error ?? publicar.error)}
          </p>
        )}

        {!areaId && (
          <p className="rounded-lg border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Escolha a área para montar o relatório do mês.
          </p>
        )}

        {areaId && (
          <EstadoDaTela
            carregando={snapshot.isLoading}
            erro={snapshot.error}
            quantidade={1}
            aoTentarDeNovo={() => void snapshot.refetch()}
          >
            {/* A folha do relatório. `print:` deixa o PDF sair em uma página. */}
            <article className="rounded-lg border border-border bg-card p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    One Page Report · {areaNome}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {empresaAtiva?.nome_fantasia} · {fmt.mesAno(periodo)}
                  </p>
                </div>
                {s?.gerado_em && (
                  <p className="text-[11px] text-muted-foreground">
                    gerado em {new Date(s.gerado_em).toLocaleString('pt-BR')}
                  </p>
                )}
              </header>

              <div className="grid gap-5 pt-4 lg:grid-cols-2">
                <Secao titulo="OKRs da área">
                  {(s?.okr_resumo ?? []).length === 0 ? (
                    <Vazio>Nenhum OKR da área no ano deste período.</Vazio>
                  ) : (
                    <ul className="space-y-1.5">
                      {s?.okr_resumo.map((o) => (
                        <li key={o.okr_id} className="flex items-start gap-2 text-xs">
                          <Farol estado={estadoDoFarol(o.farol)} suave className="shrink-0" />
                          <span className="min-w-0 flex-1">{o.titulo}</span>
                          <span className="shrink-0 tabular-nums">
                            <ValorOuSemDado
                              valor={fmt.atingimento(o.atingimento)}
                              formatar={(v) => `${v}%`}
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Secao>

                <Secao titulo="Indicadores">
                  {(s?.indicadores ?? []).length === 0 ? (
                    <Vazio>Nenhum indicador nos processos desta área.</Vazio>
                  ) : (
                    <ul className="space-y-1.5">
                      {s?.indicadores.map((i) => (
                        <li key={i.indicador_id} className="flex items-start gap-2 text-xs">
                          <Badge
                            variant={i.tipo === 'Y' ? 'info-subtle' : 'secondary'}
                            className="shrink-0 text-[10px]"
                          >
                            {i.tipo}
                          </Badge>
                          <span className="min-w-0 flex-1">{i.nome}</span>
                          <span className="shrink-0 tabular-nums">
                            <ValorOuSemDado valor={i.ultimo_valor} />
                            {i.meta !== null && (
                              <span className="text-muted-foreground"> / {i.meta}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Secao>

                <Secao titulo="Projetos">
                  {(s?.projetos ?? []).length === 0 ? (
                    <Vazio>Nenhum projeto ativo na área.</Vazio>
                  ) : (
                    <ul className="space-y-1.5">
                      {s?.projetos.map((p) => (
                        <li key={p.projeto_id} className="flex items-start gap-2 text-xs">
                          <span className="min-w-0 flex-1">
                            {p.nome}
                            {p.atrasado && (
                              <span className="pl-1.5 text-destructive">atrasado</span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums">{p.progresso_pct}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Secao>

                <Secao titulo="Melhorias">
                  {(s?.melhorias ?? []).length === 0 ? (
                    <Vazio>Nenhuma melhoria em curso.</Vazio>
                  ) : (
                    <ul className="space-y-1.5">
                      {s?.melhorias.map((m) => (
                        <li key={m.melhoria_id} className="flex items-start gap-2 text-xs">
                          <span className="min-w-0 flex-1">{m.nome}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {rotulo(rotulos.fase_dmaic, m.fase_atual)}
                          </Badge>
                          <span className="shrink-0 tabular-nums">
                            <ValorOuSemDado valor={m.ganho_realizado} formatar={fmt.moeda} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Secao>
              </div>

              <div className="grid gap-4 pt-5 lg:grid-cols-3">
                <CampoLivre
                  id="opr-destaques"
                  titulo="Destaques do mês"
                  valor={destaques}
                  aoMudar={setDestaques}
                  editavel={podeEditar && !publicado}
                />
                <CampoLivre
                  id="opr-riscos"
                  titulo="Riscos"
                  valor={riscos}
                  aoMudar={setRiscos}
                  editavel={podeEditar && !publicado}
                />
                <CampoLivre
                  id="opr-proximos"
                  titulo="Próximos passos"
                  valor={proximos}
                  aoMudar={setProximos}
                  editavel={podeEditar && !publicado}
                />
              </div>
            </article>
          </EstadoDaTela>
        )}
      </div>
    </Page>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

function CampoLivre({
  id,
  titulo,
  valor,
  aoMudar,
  editavel,
}: {
  id: string
  titulo: string
  valor: string
  aoMudar: (v: string) => void
  editavel: boolean
}) {
  return (
    <div>
      <Label htmlFor={id} className="pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {titulo}
      </Label>
      {editavel ? (
        <textarea
          id={id}
          rows={5}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder="Escreva aqui"
        />
      ) : (
        <p className="text-xs whitespace-pre-wrap">
          {valor || <span className="text-muted-foreground">não preenchido</span>}
        </p>
      )}
    </div>
  )
}
