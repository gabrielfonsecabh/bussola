import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, CalendarRange, KanbanSquare } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import { atividadesDoProjeto, type LinhaDoCronograma } from '@/features/execucao/api'
import { chaves } from '@/lib/chaves'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { cn } from '@/lib/utils'

const DIA_MES_ANO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
})
const MES_ANO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

function data(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

/** Os dias em comum entre dois projetos, e a janela em que isso acontece. */
function cruzamento(a: LinhaDoCronograma, b: LinhaDoCronograma) {
  if (a.sem_prazo || b.sem_prazo) return null
  const inicio = Math.max(data(a.inicio!).getTime(), data(b.inicio!).getTime())
  const fim = Math.min(data(a.termino!).getTime(), data(b.termino!).getTime())
  if (inicio > fim) return null
  const dias = Math.round((fim - inicio) / 86_400_000) + 1
  return { inicio: new Date(inicio), fim: new Date(fim), dias }
}

/**
 * O detalhe do projeto SEM sair do cronograma.
 *
 * Por que existe: clicar numa barra levava para o portfólio, e a pessoa perdia
 * a linha do tempo que estava lendo. Todas as outras telas do produto abrem
 * painel por cima (inventário, jornada, POP, fluxo); o cronograma era o único
 * que jogava o usuário para fora, e isso não escala quando se está comparando
 * um projeto com os vizinhos.
 *
 * E ele responde o que SÓ o cronograma sabe: a linha diz "divide o calendário
 * com 4", e é aqui que se vê COM QUAIS, em que janela e por quantos dias. Esse
 * cálculo é feito sobre as linhas já carregadas, sem ida nova ao banco.
 */
export function PainelDoProjetoNoCronograma({
  linha,
  todas,
  aoFechar,
}: {
  linha: LinhaDoCronograma
  todas: LinhaDoCronograma[]
  aoFechar: () => void
}) {
  const navegar = useNavigate()

  const atividades = useQuery({
    queryKey: chaves.atividadesDoProjeto(linha.projeto_id),
    queryFn: () => atividadesDoProjeto(linha.projeto_id),
  })

  const vizinhos = useMemo(
    () =>
      todas
        .filter((o) => o.projeto_id !== linha.projeto_id)
        .map((o) => ({ projeto: o, janela: cruzamento(linha, o) }))
        .filter((v): v is { projeto: LinhaDoCronograma; janela: NonNullable<ReturnType<typeof cruzamento>> } =>
          v.janela !== null,
        )
        .toSorted((a, b) => b.janela.dias - a.janela.dias),
    [linha, todas],
  )

  const lista = atividades.data ?? []
  const abertas = lista.filter((a) => a.status !== 'concluido')

  return (
    <PainelDeDetalhe
      aberto
      largura="larga"
      aoFechar={aoFechar}
      titulo={linha.nome}
      origem={`Cronograma · ${linha.area_nome ?? 'sem área'} · ${
        linha.responsavel_nome ?? 'sem responsável'
      }`}
      acoes={
        <>
          <Button
            size="sm"
            variant="outline"
            className="mr-auto"
            onClick={() => navegar(`/execucao/projetos?projeto=${linha.projeto_id}`)}
          >
            <ArrowUpRight className="size-4" aria-hidden />
            Abrir no portfólio
          </Button>
          {lista.some((a) => a.sprint_id) && (
            <Button size="sm" variant="outline" onClick={() => navegar('/execucao/sprints')}>
              <KanbanSquare className="size-4" aria-hidden />
              Ver no quadro
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{rotulo(rotulos.categoria_projeto, linha.categoria)}</Badge>
          <Badge variant="outline">{rotulo(rotulos.status_projeto, linha.status)}</Badge>
          <Badge variant="outline">{rotulo(rotulos.prioridade, linha.prioridade)}</Badge>
          {linha.atrasado && (
            <Badge variant="destructive-subtle">o prazo já passou</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CartaoDeMetrica
            rotulo="Duração"
            valor={linha.dias}
            formatar={(v) => `${v} dias`}
            detalhe={
              linha.sem_prazo
                ? 'prazo ainda não definido'
                : `${DIA_MES_ANO.format(data(linha.inicio!))} a ${DIA_MES_ANO.format(data(linha.termino!))}`
            }
          />
          <CartaoDeMetrica
            rotulo="Progresso"
            valor={linha.progresso_pct}
            formatar={(v) => fmt.percentual(v)}
            /* Progresso é NOT NULL com default 0 no banco, então 0% aqui pode
               ser "ninguém atualizou" tanto quanto "não começou". O detalhe
               diz isso em vez de deixar o número afirmar sozinho. */
            detalhe={linha.progresso_pct === 0 ? 'ainda não atualizado' : undefined}
          />
          <CartaoDeMetrica
            rotulo="Atividades abertas"
            valor={atividades.isSuccess ? abertas.length : null}
            detalhe={atividades.isSuccess ? `de ${lista.length} no total` : undefined}
            carregando={atividades.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Divide o calendário"
            valor={linha.sem_prazo ? null : vizinhos.length}
            detalhe={linha.sem_prazo ? 'sem prazo, não dá para comparar' : 'outros projetos'}
            tom={vizinhos.length >= 4 ? 'warning' : 'neutro'}
          />
        </div>

        {linha.progresso_pct > 0 && (
          <BarraDeProgresso valor={linha.progresso_pct} rotulo="Progresso informado" />
        )}

        {/* ----------------------------------------------------------------
            A sobreposição, que é a razão de existir desta tela.
        ---------------------------------------------------------------- */}
        <section>
          <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Roda ao mesmo tempo que
          </h3>
          {linha.sem_prazo ? (
            <p className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              Este projeto ainda não tem prazo, então não há como saber com o que ele concorre.
              Defina início e término no portfólio para ele entrar na linha do tempo.
            </p>
          ) : vizinhos.length === 0 ? (
            <p className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
              Nenhum outro projeto deste recorte ocupa os mesmos dias. Este é o único na janela.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-border">
              {vizinhos.map(({ projeto, janela }) => (
                <li
                  key={projeto.projeto_id}
                  className="flex items-start justify-between gap-4 border-b border-border bg-card px-3.5 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-medium">{projeto.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {rotulo(rotulos.categoria_projeto, projeto.categoria)} ·{' '}
                      {projeto.responsavel_nome ?? 'sem responsável'}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={cn(
                        'block text-sm font-medium tabular-nums',
                        janela.dias >= 60 && 'text-warning',
                      )}
                    >
                      {janela.dias} dias juntos
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {MES_ANO.format(janela.inicio)}
                      {MES_ANO.format(janela.inicio) !== MES_ANO.format(janela.fim) &&
                        ` a ${MES_ANO.format(janela.fim)}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Atividades
          </h3>
          <EstadoDaTela
            carregando={atividades.isLoading}
            erro={atividades.error}
            quantidade={lista.length}
            aoTentarDeNovo={() => void atividades.refetch()}
            vazio={
              <div className="rounded-lg border border-border bg-card px-4 py-6 text-center">
                <p className="text-sm font-medium">Este projeto ainda não tem atividade</p>
                <p className="pt-1 text-xs text-muted-foreground">
                  Sem atividade, o progresso do projeto só avança por digitação. As atividades
                  são criadas no portfólio ou no quadro da sprint.
                </p>
              </div>
            }
          >
            <ul className="overflow-hidden rounded-lg border border-border">
              {lista.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-4 border-b border-border bg-card px-3.5 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <span
                      className={cn(
                        'block text-sm',
                        a.status === 'concluido' && 'text-muted-foreground line-through',
                      )}
                    >
                      {a.titulo}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {rotulo(rotulos.status_atividade, a.status)}
                      {a.sprint_id ? ' · em sprint' : ' · fora de sprint'}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {a.data_prazo ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarRange className="size-3.5" aria-hidden />
                        {DIA_MES_ANO.format(data(a.data_prazo))}
                      </span>
                    ) : (
                      'sem prazo'
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </EstadoDaTela>
        </section>
      </div>
    </PainelDeDetalhe>
  )
}
