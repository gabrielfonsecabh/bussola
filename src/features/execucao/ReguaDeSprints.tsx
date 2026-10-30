import { ChevronLeft, ChevronRight, Crosshair } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SprintDoQuadro } from '@/features/execucao/api'
import { fmt } from '@/lib/formato'
import { cn } from '@/lib/utils'

const DIA_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })

function periodo(de: string, ate: string): string {
  const a = new Date(`${de}T12:00:00`)
  const b = new Date(`${ate}T12:00:00`)
  return de === ate ? DIA_MES.format(a) : `${DIA_MES.format(a)} a ${DIA_MES.format(b)}`
}

/**
 * A régua de sprints: a linha do tempo das sprints, sempre à vista.
 *
 * O que ela substitui era um dropdown de 256px no canto do cabeçalho, com os
 * nomes cortados no meio ("S6 Onda 2: direto..."), que não dizia nada sobre
 * sprint nenhuma. Para achar a sprint certa era preciso abrir, ler pela metade,
 * escolher, ver o quadro, e voltar se tivesse errado.
 *
 * Aqui cada sprint mostra de uma vez o que responde a pergunta de quem procura:
 * o período, de quais projetos ela é, quanto já está pronto e qual é a de hoje.
 * A escolha vira leitura, não tentativa.
 */
export function ReguaDeSprints({
  sprints,
  sprintId,
  sprintDeHojeId,
  aoEscolher,
}: {
  sprints: SprintDoQuadro[]
  sprintId: string | null
  sprintDeHojeId: string | null
  aoEscolher: (id: string) => void
}) {
  const trilho = useRef<HTMLDivElement>(null)

  /* A régua é cronológica e pode ter dezenas de sprints. Sem isto ela abre no
     começo de 2026 mesmo quando a sprint aberta é a de novembro, e a primeira
     coisa que a pessoa faz é rolar até achar o cartão que já está selecionado. */
  useEffect(() => {
    if (!sprintId) return
    trilho.current
      ?.querySelector(`[data-sprint="${sprintId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [sprintId])

  function rolar(direcao: 1 | -1) {
    trilho.current?.scrollBy({ left: direcao * 320, behavior: 'smooth' })
  }

  const foraDeHoje = !!sprintDeHojeId && sprintId !== sprintDeHojeId

  return (
    <div className="border-b border-border bg-muted/20">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 lg:px-6">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Sprints em ordem
        </h2>
        <div className="flex items-center gap-1">
          {foraDeHoje && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => aoEscolher(sprintDeHojeId)}
              className="mr-1"
            >
              <Crosshair className="size-3" aria-hidden />
              Voltar para hoje
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Sprints anteriores"
            onClick={() => rolar(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Sprints seguintes"
            onClick={() => rolar(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div
        ref={trilho}
        role="tablist"
        aria-label="Sprints"
        className="flex snap-x gap-2 overflow-x-auto px-4 py-3 lg:px-6"
      >
        {sprints.map((s) => {
          const aberta = s.id === sprintId
          const temTrabalho = s.atividades > 0
          const pronto = temTrabalho ? Math.round((s.concluidas / s.atividades) * 100) : null
          const terminada = s.dias_ate_o_fim < 0
          const futura = s.dias_ate_o_inicio > 0

          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={aberta}
              data-sprint={s.id}
              onClick={() => aoEscolher(s.id)}
              className={cn(
                'w-60 shrink-0 snap-start rounded-lg border p-3 text-left transition-colors',
                aberta
                  ? 'border-primary bg-card shadow-sm ring-1 ring-primary'
                  : 'border-border bg-card/50 hover:bg-accent',
                /* Sprint encerrada fica recuada: ela continua clicável, e
                   continua visível, mas não disputa atenção com a semana atual. */
                !aberta && terminada && 'opacity-70',
              )}
            >
              <div className="flex items-center gap-1.5 pb-1.5">
                {s.e_atual ? (
                  <Badge variant="success-subtle" className="text-[10px]">
                    hoje
                  </Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {/* "começa em" e "termina em" são datas diferentes. O rótulo
                        antigo dizia "em N dias" com os dias até o FIM, o que
                        para uma sprint futura anuncia a data errada. */}
                    {terminada
                      ? 'encerrada'
                      : futura
                        ? `começa em ${s.dias_ate_o_inicio} ${s.dias_ate_o_inicio === 1 ? 'dia' : 'dias'}`
                        : `termina em ${s.dias_ate_o_fim} ${s.dias_ate_o_fim === 1 ? 'dia' : 'dias'}`}
                  </span>
                )}
                {s.bloqueadas > 0 && (
                  <Badge variant="destructive-subtle" className="text-[10px]">
                    {s.bloqueadas} travada{s.bloqueadas > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

              {/* O nome inteiro, em duas linhas. Cortar o nome da sprint era
                  justamente o que impedia de reconhecê-la no seletor antigo. */}
              <p className="line-clamp-2 text-xs leading-snug font-medium text-balance">
                {s.nome}
              </p>

              <p className="pt-1 text-[10px] text-muted-foreground">
                {periodo(s.data_inicio, s.data_fim)}
              </p>

              <div className="pt-2">
                {/* Sprint sem atividade não está 0% pronta: ela não foi
                    planejada ainda. São estados diferentes e a barra verde de
                    largura zero mentiria sobre o primeiro. */}
                {temTrabalho ? (
                  <>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-success"
                        style={{ width: `${pronto}%` }}
                      />
                    </div>
                    <p className="pt-1 text-[10px] text-muted-foreground">
                      {s.concluidas} de {s.atividades} pronta
                      {s.atividades > 1 ? 's' : ''} ({pronto}%)
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic">
                    sem atividade planejada
                  </p>
                )}
              </div>

              {s.projeto_nomes.length > 0 && (
                <p
                  className="truncate pt-1.5 text-[10px] text-muted-foreground"
                  title={s.projeto_nomes.join(', ')}
                >
                  {s.projeto_nomes.length === 1
                    ? s.projeto_nomes[0]
                    : `${s.projetos} projetos: ${s.projeto_nomes.join(', ')}`}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** O cabeçalho da sprint aberta, logo acima do quadro. */
export function ResumoDaSprint({ sprint }: { sprint: SprintDoQuadro }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-sm font-semibold">{sprint.nome}</h2>
      <span className="text-xs text-muted-foreground">
        {fmt.data(sprint.data_inicio)} a {fmt.data(sprint.data_fim)}
        {sprint.area_nome ? ` · ${sprint.area_nome}` : ''}
      </span>
      {sprint.objetivo && (
        <span className="w-full text-xs text-muted-foreground">{sprint.objetivo}</span>
      )}
    </div>
  )
}
