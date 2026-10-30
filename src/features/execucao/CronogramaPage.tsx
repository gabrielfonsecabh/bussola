import { useQuery } from '@tanstack/react-query'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { listarAreas } from '@/features/admin/api'
import {
  carregarCargaDoCronograma,
  carregarCronograma,
  type LinhaDoCronograma,
} from '@/features/execucao/api'
import { PainelDoProjetoNoCronograma } from '@/features/execucao/PainelDoProjetoNoCronograma'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { rotulo, rotulos } from '@/lib/formato'
import { cn } from '@/lib/utils'

const MES_CURTO = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const DIA_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

/** Data do banco (YYYY-MM-DD) para Date local, sem o deslocamento de fuso. */
function data(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

function mesesEntre(de: Date, ate: Date): Date[] {
  const quantos =
    (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth()) + 1
  return Array.from(
    { length: Math.max(quantos, 1) },
    (_, i) => new Date(de.getFullYear(), de.getMonth() + i, 1),
  )
}

const TOM_DA_CATEGORIA: Record<string, string> = {
  estrutural: 'bg-primary',
  melhoria: 'bg-success',
  ia: 'bg-info',
  gestao_projetos: 'bg-warning',
}

export function CronogramaPage() {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const [areaId, setAreaId] = useState<string | null>(null)
  /* O id, e não a linha capturada no clique. A linha vem sempre fresca da
     consulta: guardar o objeto congelaria os dados do instante do clique, e o
     painel continuaria mostrando o valor antigo depois de uma atualização. */
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [destacado, setDestacado] = useState<string | null>(null)
  /* O instante é lido UMA vez, na montagem. Ler o relógio durante a
     renderização torna o resultado instável entre um render e outro, e a linha
     de "hoje" passaria a se mexer sozinha. */
  const [agora] = useState(() => Date.now())

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  const consulta = useQuery({
    queryKey: chaves.cronograma(empresaId, areaId),
    enabled: !!empresaId,
    queryFn: () => carregarCronograma(empresaId!, areaId),
  })

  const carga = useQuery({
    queryKey: chaves.cronogramaCarga(empresaId, areaId),
    enabled: !!empresaId,
    queryFn: () => carregarCargaDoCronograma(empresaId!, areaId),
  })

  const linhas = useMemo(() => consulta.data ?? [], [consulta.data])
  const comPrazo = useMemo(() => linhas.filter((l) => !l.sem_prazo), [linhas])
  const semPrazo = useMemo(() => linhas.filter((l) => l.sem_prazo), [linhas])

  /**
   * A janela é a que os projetos ocupam, e não um ano de calendário.
   *
   * Trabalho de gerência atravessa o réveillon com frequência: um cronograma
   * preso a um ano corta o projeto ao meio e esconde metade dele.
   */
  const janela = useMemo(() => {
    if (comPrazo.length === 0) return null
    const inicios = comPrazo.map((l) => data(l.inicio!).getTime())
    const fins = comPrazo.map((l) => data(l.termino!).getTime())
    const de = new Date(Math.min(...inicios))
    const ate = new Date(Math.max(...fins))
    const meses = mesesEntre(de, ate)
    const primeiroDia = meses[0]!.getTime()
    const ultimo = meses[meses.length - 1]!
    const ultimoDia = new Date(ultimo.getFullYear(), ultimo.getMonth() + 1, 0).getTime()
    return { meses, primeiroDia, total: ultimoDia - primeiroDia }
  }, [comPrazo])

  /** Posição da barra em porcentagem da janela inteira. */
  function faixa(l: LinhaDoCronograma) {
    if (!janela || l.sem_prazo) return null
    const ini = data(l.inicio!).getTime()
    const fim = data(l.termino!).getTime()
    const esquerda = ((ini - janela.primeiroDia) / janela.total) * 100
    const largura = ((fim - ini) / janela.total) * 100
    return { esquerda, largura: Math.max(largura, 1.2) }
  }

  const hoje = useMemo(() => {
    if (!janela) return null
    if (agora < janela.primeiroDia || agora > janela.primeiroDia + janela.total) return null
    return ((agora - janela.primeiroDia) / janela.total) * 100
  }, [janela, agora])

  /* Derivada da consulta a cada render, nunca capturada no clique: é o mesmo
     padrão do inventário, e é o que faz o painel refletir uma atualização em
     vez de mostrar o retrato do instante em que foi aberto. */
  const linhaSelecionada = linhas.find((l) => l.projeto_id === selecionado) ?? null

  const cargaPorMes = carga.data ?? []
  const pico = cargaPorMes.reduce(
    (maior, m) => (m.projetos > maior.projetos ? m : maior),
    { mes: '', projetos: 0, nomes: [] as string[] },
  )

  return (
    <Page
      title="Cronograma"
      description="Gestão à vista dos projetos: quando cada um roda e onde eles se sobrepõem"
    >
      <div className="space-y-5">
        <div className="w-80">
          <SearchableSelect
            options={(areas.data ?? []).map((a) => ({
              value: a.id,
              label: a.nome,
              description: rotulo(rotulos.tipo_area, a.tipo),
            }))}
            value={areaId}
            onChange={setAreaId}
            placeholder="Todas as áreas"
            aria-label="Filtrar por área"
          />
          <p className="pt-1.5 text-xs text-muted-foreground">
            Escolher uma diretoria traz também os projetos das gerências abaixo dela.
          </p>
        </div>

        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={linhas.length}
          aoTentarDeNovo={() => void consulta.refetch()}
          vazio={
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium">Nenhum projeto neste recorte</p>
              <p className="pt-1 text-xs text-muted-foreground">
                Isto é ausência de correspondência, não falha de consulta. Projetos aparecem
                aqui assim que forem cadastrados no portfólio, com ou sem prazo definido.
              </p>
            </div>
          }
        >
          <div className="space-y-5">
            {semPrazo.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning-subtle p-4">
                <div className="flex items-start gap-2.5 text-xs text-warning-subtle-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {semPrazo.length} projeto(s) ainda sem prazo, e por isso fora da linha do
                      tempo abaixo.
                    </p>
                    <p className="pt-0.5">
                      Eles existem e alguém responde por eles. Sem data, não há como saber se
                      cabem na agenda nem se atropelam outro trabalho.
                    </p>
                    <ul className="flex flex-wrap gap-2 pt-2.5">
                      {semPrazo.map((l) => (
                        <li key={l.projeto_id}>
                          <button
                            type="button"
                            onClick={() => setSelecionado(l.projeto_id)}
                            className="rounded-md border border-warning/40 bg-card px-2 py-1 text-xs font-medium hover:bg-accent"
                          >
                            {l.nome}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {janela && (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {/* --------------------------------------------------------
                    A régua de meses. Uma coluna por mês, e a mesma grade
                    serve para as barras e para a carga, para os dois se
                    lerem na mesma vertical.
                -------------------------------------------------------- */}
                <div className="flex border-b border-border bg-muted/40 text-xs">
                  <div className="w-72 shrink-0 px-4 py-2 font-medium text-muted-foreground">
                    Projeto
                  </div>
                  <div className="relative flex flex-1">
                    {janela.meses.map((m) => (
                      <div
                        key={m.toISOString()}
                        className="flex-1 border-l border-border px-1.5 py-2 text-center text-[11px] text-muted-foreground"
                      >
                        <span className="block leading-tight">
                          {MES_CURTO.format(m).replace('.', '')}
                        </span>
                        {m.getMonth() === 0 || m === janela.meses[0] ? (
                          <span className="block font-medium text-foreground/70 tabular-nums">
                            {m.getFullYear()}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                {comPrazo.map((l) => {
                  const f = faixa(l)
                  const realce = destacado === l.projeto_id
                  return (
                    <button
                      key={l.projeto_id}
                      type="button"
                      onClick={() => setSelecionado(l.projeto_id)}
                      onMouseEnter={() => setDestacado(l.projeto_id)}
                      onMouseLeave={() => setDestacado(null)}
                      onFocus={() => setDestacado(l.projeto_id)}
                      onBlur={() => setDestacado(null)}
                      className={cn(
                        'flex w-full items-stretch border-b border-border text-left last:border-b-0 hover:bg-accent/40',
                        realce && 'bg-accent/40',
                      )}
                    >
                      <div className="w-72 shrink-0 px-4 py-2.5">
                        <span className="block text-sm leading-snug font-medium">{l.nome}</span>
                        <span className="flex flex-wrap items-center gap-1.5 pt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {rotulo(rotulos.categoria_projeto, l.categoria)}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {DIA_MES.format(data(l.inicio!))} a {DIA_MES.format(data(l.termino!))}
                          </span>
                          {l.sobrepoe > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              · divide o calendário com {l.sobrepoe}
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="relative flex-1">
                        {/* a grade de fundo, para a barra ser lida contra os meses */}
                        <div className="absolute inset-0 flex">
                          {janela.meses.map((m) => (
                            <div key={m.toISOString()} className="flex-1 border-l border-border" />
                          ))}
                        </div>
                        {hoje !== null && (
                          <div
                            aria-hidden
                            className="absolute top-0 bottom-0 w-px bg-destructive/60"
                            style={{ left: `${hoje}%` }}
                          />
                        )}
                        {f && (
                          <div
                            className={cn(
                              'absolute top-1/2 h-5 -translate-y-1/2 rounded-md',
                              TOM_DA_CATEGORIA[l.categoria] ?? 'bg-primary',
                              l.status === 'planejado' && 'opacity-55',
                              l.atrasado && 'ring-2 ring-destructive',
                            )}
                            style={{ left: `${f.esquerda}%`, width: `${f.largura}%` }}
                          >
                            {/* o preenchido dentro da barra é o progresso */}
                            {l.progresso_pct > 0 && (
                              <div
                                className="h-full rounded-md bg-foreground/25"
                                style={{ width: `${Math.min(100, l.progresso_pct)}%` }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}

                {/* --------------------------------------------------------
                    A carga. É o que transforma o desenho em gestão à vista:
                    uma barra bonita não responde "cabe mais um em maio?".
                -------------------------------------------------------- */}
                {cargaPorMes.length > 0 && (
                  <div className="flex items-stretch border-t-2 border-border bg-muted/30">
                    <div className="w-72 shrink-0 px-4 py-3">
                      <span className="block text-xs font-semibold">Projetos ao mesmo tempo</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {pico.projetos > 0
                          ? `pico de ${pico.projetos} em ${MES_CURTO.format(data(pico.mes))}/${data(pico.mes).getFullYear()}`
                          : 'sem projeto com prazo'}
                      </span>
                    </div>
                    <div className="flex flex-1 items-end">
                      {janela.meses.map((m) => {
                        const chave = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
                        const doMes = cargaPorMes.find((c) => c.mes.startsWith(chave))
                        const qtd = doMes?.projetos ?? 0
                        const altura = pico.projetos > 0 ? (qtd / pico.projetos) * 100 : 0
                        return (
                          <div
                            key={m.toISOString()}
                            className="flex flex-1 flex-col items-center justify-end border-l border-border px-1 py-2"
                            title={
                              doMes && doMes.nomes.length > 0
                                ? doMes.nomes.join('\n')
                                : 'nenhum projeto aberto neste mês'
                            }
                          >
                            <span className="pb-1 text-[11px] font-medium tabular-nums">
                              {qtd}
                            </span>
                            <div
                              className={cn(
                                'w-full rounded-t-sm',
                                qtd >= 4 ? 'bg-destructive' : qtd === 3 ? 'bg-warning' : 'bg-primary/50',
                              )}
                              style={{ height: `${Math.max(altura * 0.34, qtd > 0 ? 4 : 0)}px` }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-5 rounded-sm bg-primary" aria-hidden /> Estrutural
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-5 rounded-sm bg-success" aria-hidden /> Melhoria
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-5 rounded-sm bg-info" aria-hidden /> IA
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-5 rounded-sm bg-warning" aria-hidden /> Gestão de projetos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-5 rounded-sm bg-primary opacity-55" aria-hidden /> Ainda
                planejado
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3.5 w-px bg-destructive/60" aria-hidden /> Hoje
              </span>
            </div>

            <p className="flex items-start gap-2.5 rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                A barra clara é a duração e a parte escura dentro dela é o progresso informado.
                A linha de contagem no rodapé mostra quantos projetos estão abertos em cada mês:
                é onde se vê que aceitar mais um trabalho em determinado mês vai custar caro.
                Clique numa linha para ver o detalhe sem sair daqui, inclusive com quais
                projetos ela divide o calendário.
              </span>
            </p>
          </div>
        </EstadoDaTela>
      </div>

      {linhaSelecionada && (
        <PainelDoProjetoNoCronograma
          linha={linhaSelecionada}
          todas={linhas}
          aoFechar={() => setSelecionado(null)}
        />
      )}
    </Page>
  )
}
