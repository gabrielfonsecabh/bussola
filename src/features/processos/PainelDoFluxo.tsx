import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, Download, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { Fluxograma } from '@/components/dados/Fluxograma'
import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Button } from '@/components/ui/button'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import {
  atualizarEtapa,
  carregarFluxo,
  carregarResumoDoFluxo,
  criarEtapa,
  excluirEtapa,
  formatarDuracao,
  reordenarEtapas,
  type DadosDaEtapa,
  type EtapaDoFluxo,
} from '@/features/processos/api'
import { FormularioDeEtapa } from '@/features/processos/FormularioDeEtapa'
import { ListaDeEtapas } from '@/features/processos/ListaDeEtapas'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { baixarCsv } from '@/lib/exportar'
import { rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

/**
 * O fluxo do processo, desenhado e editável no mesmo lugar.
 *
 * Ele abre como uma camada sobre o detalhe do processo, e não numa rota nova:
 * fechar precisa devolver o processo exatamente como estava. O formulário de
 * etapa vem por cima, em dialog, que é a decisão focada sobre um registro.
 */
export function PainelDoFluxo({
  processoId,
  processoNome,
  areaNome,
  aoFechar,
}: {
  processoId: string
  processoNome: string
  areaNome: string | null
  aoFechar: () => void
}) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const podeEditar = podeFazer('processo.edit')

  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [emEdicao, setEmEdicao] = useState<EtapaDoFluxo | null>(null)
  const [criando, setCriando] = useState(false)

  const fluxo = useQuery({
    queryKey: chaves.fluxo(processoId),
    queryFn: () => carregarFluxo(processoId),
  })

  const resumo = useQuery({
    queryKey: chaves.fluxoResumo(processoId),
    queryFn: () => carregarResumoDoFluxo(processoId),
  })

  const etapas = useMemo(() => fluxo.data ?? [], [fluxo.data])

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chaves.fluxo(processoId) })
    void queryClient.invalidateQueries({ queryKey: chaves.fluxoResumo(processoId) })
    void queryClient.invalidateQueries({ queryKey: ['processos'] })
    /* O selo de fluxo é derivado das etapas, então desenhar o fluxo aqui muda
       a jornada, o placar e a missão "mapear_fluxo". Sem estas três, quem
       desenha pelo Inventário continua sendo cobrado na Jornada pelo trabalho
       que acabou de fazer. */
    void queryClient.invalidateQueries({ queryKey: ['jornada'] })
    void queryClient.invalidateQueries({ queryKey: ['jornada-placar'] })
    void queryClient.invalidateQueries({ queryKey: ['missoes'] })
  }

  const salvar = useMutation({
    mutationFn: (dados: DadosDaEtapa) =>
      emEdicao ? atualizarEtapa(emEdicao.id, dados) : criarEtapa(empresaId!, dados),
    onSuccess: () => {
      setEmEdicao(null)
      setCriando(false)
      salvar.reset()
      invalidar()
    },
  })

  const remover = useMutation({
    mutationFn: (id: string) => excluirEtapa(id),
    onSuccess: () => {
      setEmEdicao(null)
      remover.reset()
      invalidar()
    },
  })

  const mover = useMutation({
    mutationFn: (ids: string[]) => reordenarEtapas(processoId, ids),
    onSuccess: invalidar,
  })

  const r = resumo.data
  const erroDeEtapa = salvar.error ?? remover.error

  /**
   * Fluxo sem etapa nenhuma não tem zero gargalo nem zero etapa órfã: ele não
   * tem resposta. Um "0" verde em "Sem responsável" afirma que está tudo com
   * dono num processo que ninguém mapeou, que é a leitura mais errada possível
   * justamente para quem abriu a tela para descobrir o que falta.
   */
  const mapeado = !!r && r.total_etapas > 0

  /**
   * Fluxo sem início ou sem fim não é um fluxo: é um pedaço. Vale avisar
   * porque o desenho de um trecho parece completo, e quem lê depois não tem
   * como saber que falta o começo.
   */
  const avisos: string[] = []
  if (r && r.total_etapas > 0) {
    if (!r.tem_inicio) avisos.push('Falta a etapa de início.')
    if (!r.tem_fim) avisos.push('Falta a etapa de fim.')
    if (r.sem_responsavel > 0) {
      avisos.push(
        `${r.sem_responsavel} etapa(s) sem responsável: ninguém responde por elas.`,
      )
    }
  }

  return (
    <>
      <PainelDeDetalhe
        aberto={!criando && !emEdicao}
        largura="larga"
        aoFechar={aoFechar}
        titulo={`Fluxo de ${processoNome}`}
        origem={`Processo · ${areaNome ?? 'sem área'} · o "P" do SIPOC`}
        acoes={
          <>
            <Button
              size="sm"
              variant="outline"
              className="mr-auto"
              disabled={etapas.length === 0}
              onClick={() =>
                baixarCsv(
                  `fluxo-${processoNome}`,
                  etapas.map((e) => ({
                    ordem: e.ordem,
                    tipo: rotulo(rotulos.tipo_etapa, e.tipo),
                    etapa: e.titulo,
                    responsavel: e.responsavel_nome ?? '',
                    area: e.area_nome ?? '',
                    sistema: e.sistema ?? '',
                    tempo_min: e.tempo_estimado_min ?? '',
                    gargalo: e.eh_gargalo ? 'sim' : 'não',
                    descricao: e.descricao ?? '',
                  })),
                )
              }
            >
              <Download className="size-4" aria-hidden />
              Exportar
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {erroDeEtapa && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {mensagemDeErro(erroDeEtapa)}
            </p>
          )}
          {mover.error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {mensagemDeErro(mover.error)}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CartaoDeMetrica
              rotulo="Etapas"
              valor={r?.total_etapas}
              carregando={resumo.isLoading}
            />
            <CartaoDeMetrica
              rotulo="Sem responsável"
              valor={mapeado ? r.sem_responsavel : null}
              tom={!mapeado ? 'neutro' : r.sem_responsavel > 0 ? 'warning' : 'success'}
              carregando={resumo.isLoading}
            />
            <CartaoDeMetrica
              rotulo="Gargalos"
              valor={mapeado ? r.gargalos : null}
              tom={mapeado && r.gargalos > 0 ? 'destructive' : 'neutro'}
              carregando={resumo.isLoading}
            />
            <CartaoDeMetrica
              rotulo="Tempo do fluxo"
              valor={r?.tempo_total_min}
              formatar={(v) => formatarDuracao(v) ?? '-'}
              detalhe={
                r && r.etapas_sem_tempo > 0
                  ? `${r.etapas_sem_tempo} etapa(s) sem tempo`
                  : undefined
              }
              carregando={resumo.isLoading}
            />
          </div>

          {avisos.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <ul className="space-y-0.5">
                {avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {r && r.sistemas > 1 && (
            <p className="flex items-start gap-2.5 rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Este fluxo atravessa {r.sistemas} sistemas. Cada travessia costuma esconder
                digitação manual, que é onde a automação paga mais rápido.
              </span>
            </p>
          )}

          <EstadoDaTela
            carregando={fluxo.isLoading}
            erro={fluxo.error}
            /* O fluxo vazio é um estado legítimo: os componentes abaixo
               explicam o que falta e oferecem a ação. */
            quantidade={1}
            aoTentarDeNovo={() => void fluxo.refetch()}
          >
            <div className="space-y-5">
              <section>
                <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Desenho
                </h3>
                <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
                  <Fluxograma
                    etapas={etapas}
                    etapaSelecionada={selecionada}
                    aoSelecionarEtapa={setSelecionada}
                  />
                </div>
              </section>

              <section>
                <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Etapas
                </h3>
                <ListaDeEtapas
                  etapas={etapas}
                  etapaSelecionada={selecionada}
                  aoSelecionar={setSelecionada}
                  aoEditar={(e) => setEmEdicao(e)}
                  aoMover={(ids) => mover.mutate(ids)}
                  aoAdicionar={() => setCriando(true)}
                  podeEditar={podeEditar}
                  reordenando={mover.isPending}
                />
              </section>
            </div>
          </EstadoDaTela>
        </div>
      </PainelDeDetalhe>

      {(criando || emEdicao) && (
        <FormularioDeEtapa
          etapa={emEdicao}
          processoId={processoId}
          outrasEtapas={etapas.filter((e) => e.id !== emEdicao?.id)}
          proximaOrdem={etapas.length + 1}
          salvando={salvar.isPending}
          excluindo={remover.isPending}
          erro={erroDeEtapa ? mensagemDeErro(erroDeEtapa) : null}
          aoFechar={() => {
            setCriando(false)
            setEmEdicao(null)
            salvar.reset()
            remover.reset()
          }}
          aoSalvar={(dados) => salvar.mutate(dados)}
          aoExcluir={emEdicao ? () => remover.mutate(emEdicao.id) : undefined}
        />
      )}
    </>
  )
}
