import { ChevronDown, ChevronUp, LoaderCircle, Pencil, Plus } from 'lucide-react'
import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarDuracao, type EtapaDoFluxo } from '@/features/processos/api'
import { rotulo, rotulos } from '@/lib/formato'
import { cn } from '@/lib/utils'

export interface ListaDeEtapasProps {
  etapas: EtapaDoFluxo[]
  etapaSelecionada?: string | null
  aoSelecionar?: (id: string) => void
  aoEditar: (etapa: EtapaDoFluxo) => void
  aoMover: (idsNaNovaOrdem: string[]) => void
  aoAdicionar: () => void
  podeEditar: boolean
  reordenando?: boolean
}

/**
 * A sequência das etapas, em lista.
 *
 * Reordenar é por BOTÃO, não por arrastar. Arrastar é gesto de mouse, e esta
 * lista precisa funcionar inteira no teclado. Além disso a ordem aqui não é
 * preferência de exibição: é a estrutura do processo. Um arraste acidental
 * mudaria o fluxo sem a pessoa perceber que mudou.
 *
 * O estado vazio desta lista significa sempre "ainda não tem etapa": quem
 * carrega o fluxo é a tela de cima, e é lá que "sem correspondência" se separa
 * de "a consulta falhou" (EstadoDaTela).
 */
export function ListaDeEtapas({
  etapas,
  etapaSelecionada,
  aoSelecionar,
  aoEditar,
  aoMover,
  aoAdicionar,
  podeEditar,
  reordenando,
}: ListaDeEtapasProps) {
  // O mapa guarda a POSIÇÃO na sequência, não a coluna `ordem`. `ordem` fica
  // com buracos depois de uma exclusão (1, 2, 4), e aí "desvia para a etapa 4"
  // mandaria o leitor procurar um número que a lista não mostra em lugar nenhum.
  const porId = useMemo(
    () =>
      new Map(etapas.map((e, i) => [e.id, { titulo: e.titulo, posicao: i + 1 }] as const)),
    [etapas],
  )

  function trocar(indice: number, direcao: -1 | 1) {
    // Enquanto a ordem anterior ainda está gravando, `etapas` é a lista antiga:
    // um segundo clique calcularia a troca em cima de dado vencido.
    if (reordenando) return
    const destino = indice + direcao
    if (destino < 0 || destino >= etapas.length) return
    const ids = etapas.map((e) => e.id)
    const atual = ids[indice]
    const vizinho = ids[destino]
    if (atual === undefined || vizinho === undefined) return
    ids[indice] = vizinho
    ids[destino] = atual
    // O contrato é a sequência COMPLETA: quem grava reescreve a ordem de todas
    // as etapas numa transação só, e nunca fica com dois números repetidos.
    aoMover(ids)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Fluxo do processo
          {/* A região viva fica montada sempre: leitor de tela só anuncia o que
              MUDA dentro de um role="status" que já existia antes da mudança. */}
          <span className="flex items-center gap-1 normal-case" role="status">
            {reordenando && (
              <>
                <LoaderCircle className="size-3 animate-spin" aria-hidden />
                salvando a ordem
              </>
            )}
          </span>
        </h3>
        {podeEditar && etapas.length > 0 && (
          <Button size="xs" variant="outline" onClick={aoAdicionar}>
            <Plus className="size-3" aria-hidden />
            Nova etapa
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {etapas.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">Este processo ainda não tem fluxo</p>
            <p className="mx-auto max-w-md pt-1 text-xs text-muted-foreground">
              O fluxo é o "P" do SIPOC, o Process que fica entre as entradas e as saídas.
              Sem ele o processo fica descrito pela metade: dá para dizer o que entra e o
              que sai, mas não como o trabalho acontece no meio, nem onde ele trava.
            </p>
            {podeEditar && (
              <Button size="sm" variant="outline" className="mt-3" onClick={aoAdicionar}>
                <Plus className="size-4" aria-hidden />
                Adicionar a primeira etapa
              </Button>
            )}
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {etapas.map((etapa, indice) => {
              const selecionada = etapaSelecionada === etapa.id
              const duracao = formatarDuracao(etapa.tempo_estimado_min)
              const desvio = etapa.desvio_para_etapa_id
                ? porId.get(etapa.desvio_para_etapa_id)
                : undefined

              // Início e fim são marcos, não trabalho: o resumo do fluxo não os
              // conta em `sem_responsavel` nem em `etapas_sem_tempo`. Se a lista
              // cobrasse dono, área e tempo deles, o cartão do topo diria 0 e a
              // linha aqui embaixo diria o contrário sobre o mesmo processo.
              const ehMarco = etapa.tipo === 'inicio' || etapa.tipo === 'fim'

              const detalhes = [
                // Responsável apontado mas sem perfil com nome: dizer nada faria a
                // etapa parecer sem dono, e ela tem dono.
                etapa.responsavel_nome ??
                  (etapa.responsavel_user_id ? 'responsável sem nome cadastrado' : null),
                etapa.area_nome ?? (ehMarco ? null : 'sem área'),
                etapa.sistema ?? (ehMarco ? null : 'sem sistema registrado'),
                duracao ?? (ehMarco ? null : 'sem tempo estimado'),
              ].filter((p): p is string => !!p)

              const identificacao = `etapa ${indice + 1}, ${etapa.titulo}`

              const conteudo = (
                <>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="shrink-0">
                      {rotulo(rotulos.tipo_etapa, etapa.tipo)}
                    </Badge>
                    <span className="text-sm font-medium">{etapa.titulo}</span>
                  </span>

                  {detalhes.length > 0 && (
                    <span className="block truncate pt-0.5 text-xs text-muted-foreground">
                      {detalhes.join(' · ')}
                    </span>
                  )}

                  {etapa.tipo === 'decisao' && (
                    <span className="block pt-0.5 text-xs text-muted-foreground">
                      {!etapa.desvio_para_etapa_id
                        ? 'Os dois ramos seguem para a próxima etapa: nenhum desvio definido.'
                        : desvio
                          ? `Ramo "${etapa.rotulo_nao ?? 'não'}" desvia para a etapa ${desvio.posicao}, ${desvio.titulo}.`
                          : 'O ramo "não" desvia para uma etapa que não está nesta lista.'}
                    </span>
                  )}

                  {((!ehMarco && !etapa.responsavel_user_id) || etapa.eh_gargalo) && (
                    <span className="flex flex-wrap gap-1.5 pt-1.5">
                      {!ehMarco && !etapa.responsavel_user_id && (
                        <Badge variant="warning-subtle">sem responsável</Badge>
                      )}
                      {etapa.eh_gargalo && <Badge variant="destructive-subtle">gargalo</Badge>}
                    </span>
                  )}
                </>
              )

              return (
                <li
                  key={etapa.id}
                  className={cn(
                    'flex items-start gap-3 px-3 py-2.5',
                    selecionada && 'bg-accent',
                  )}
                >
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">
                    {indice + 1}
                  </span>

                  {aoSelecionar ? (
                    <button
                      type="button"
                      onClick={() => aoSelecionar(etapa.id)}
                      aria-pressed={selecionada}
                      aria-label={`Destacar ${identificacao} no desenho`}
                      className="min-w-0 flex-1 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {conteudo}
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1">{conteudo}</span>
                  )}

                  {podeEditar && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      {/* Durante a gravação da ordem o botão fica aria-disabled, não
                          `disabled`: desabilitar de verdade joga o foco para fora, e
                          quem move uma etapa três posições teria que tabular de novo
                          a cada clique. O clique repetido é barrado em `trocar`. */}
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={indice === 0}
                        aria-disabled={reordenando}
                        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                        aria-label={`Mover ${identificacao} para cima, para a posição ${indice}`}
                        onClick={() => trocar(indice, -1)}
                      >
                        <ChevronUp className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={indice === etapas.length - 1}
                        aria-disabled={reordenando}
                        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                        aria-label={`Mover ${identificacao} para baixo, para a posição ${indice + 2}`}
                        onClick={() => trocar(indice, 1)}
                      >
                        <ChevronDown className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Editar ${identificacao}`}
                        onClick={() => aoEditar(etapa)}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
