import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleDashed, ListFilter, Target } from 'lucide-react'

import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
import { Badge } from '@/components/ui/badge'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import { Skeleton } from '@/components/ui/skeleton'
import { carregarMissoes, type Missao } from '@/features/processos/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { cn } from '@/lib/utils'

/** Chaves fixas dos cartões de carregamento: índice de array não é key. */
const ESQUELETOS = ['primeira', 'segunda', 'terceira']

/**
 * A meta curta da semana, por área.
 *
 * O ponto desta seção é o CONTRASTE entre dois números que parecem o mesmo:
 * o alvo da semana e a lacuna inteira da área. Uma missão de alvo 5 numa
 * lacuna de 40 tem que deixar claro que faltam 40, senão a barra cheia vira
 * uma mentira confortável e a planilha de mapeamento morre do mesmo jeito.
 *
 * A missão também é o FILTRO da lista de processos logo abaixo. Dizer "faltam
 * 40 sem dono" e deixar a pessoa procurar quais são os 40 numa lista de 41
 * linhas é o defeito que esta tela existia para não ter.
 */
export function MissoesDaSemana({
  areaId,
  areaNome,
  processosDaArea,
  lacunaAtiva = null,
  aoAlternarLacuna,
}: {
  areaId: string | null
  areaNome: string | null
  /**
   * Quantos processos a área tem no recorte da jornada, ou `null` enquanto a
   * jornada não respondeu. Sem esse número, "nenhuma missão" é uma frase que
   * não dá para completar: ver `MissoesVazias`.
   */
  processosDaArea: number | null
  /** Código da missão que está recortando a lista de processos agora. */
  lacunaAtiva?: string | null
  /** Liga e desliga o recorte da lista pela lacuna da missão clicada. */
  aoAlternarLacuna?: (codigo: string) => void
}) {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null

  const consulta = useQuery({
    queryKey: chaves.missoes(empresaId, areaId),
    // Missão é da área: a função do banco recusa `p_area` nulo com 22023, e
    // disparar a chamada sem área só produziria um erro vermelho inútil.
    enabled: !!empresaId && !!areaId,
    queryFn: () => carregarMissoes(empresaId!, areaId!),
  })

  return (
    <section>
      <h2 className="flex items-center gap-1.5 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <Target className="size-3.5" aria-hidden />
        Missões da semana
        {areaNome && <span className="normal-case">· {areaNome}</span>}
      </h2>

      {!areaId ? (
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
          A missão é sempre de uma área: ela mede o que aquele time tem para fechar nesta
          semana. Escolha uma área no filtro acima para ver as metas dela.
        </p>
      ) : (
        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={consulta.data?.length}
          aoTentarDeNovo={() => void consulta.refetch()}
          carregandoNode={
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ESQUELETOS.map((id) => (
                <Skeleton key={id} className="h-28 rounded-lg" />
              ))}
            </div>
          }
          vazio={<MissoesVazias processosDaArea={processosDaArea} />}
        >
          <>
            {aoAlternarLacuna && (
              <p className="pb-2 text-xs text-muted-foreground">
                Clique numa missão para ver, na lista abaixo, exatamente quais processos têm
                aquela lacuna.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(consulta.data ?? []).map((m) => (
                <CartaoDeMissao
                  key={m.codigo}
                  missao={m}
                  ativa={m.codigo === lacunaAtiva}
                  aoAlternar={aoAlternarLacuna}
                />
              ))}
            </div>
          </>
        </EstadoDaTela>
      )}
    </section>
  )
}

/**
 * Zero missão tem DUAS causas, e elas não se parecem em nada.
 *
 * O banco só cria missão onde existe lacuna, então lista vazia numa área que
 * tem processo quer dizer área em dia. Numa área SEM processo nenhum as seis
 * lacunas também dão zero, e comemorar isso seria o mesmo erro de mostrar 0%
 * para quem nem foi convidada: não falta nada porque ainda não existe nada.
 *
 * A frase do caso bom também nomeia o que a missão cobra. As missões cobrem
 * dono, SIPOC, fluxo, POP, indicador e pendência; o selo de melhoria não vira
 * missão. Dizer "não tem lacuna de mapeamento" faria a seção contradizer o
 * placar logo abaixo, que pode mostrar a mesma área com 83%.
 */
function MissoesVazias({ processosDaArea }: { processosDaArea: number | null }) {
  if (processosDaArea === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
        Esta área ainda não tem processo no inventário. Sem processo não existe lacuna para
        medir, então a semana não tem missão: isto não é área em dia, é jornada que ainda não
        começou.
      </p>
    )
  }

  if (processosDaArea === null) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
        Nenhuma missão em aberto nesta semana. Não deu para conferir quantos processos esta
        área tem, então ainda não dá para dizer se ela está em dia ou se não começou.
      </p>
    )
  }

  return (
    <p className="rounded-lg border border-success/40 bg-success-subtle px-4 py-6 text-center text-xs text-success-subtle-foreground">
      Nenhuma missão em aberto nesta semana: nenhum processo desta área está sem dono, SIPOC,
      fluxo, POP ou indicador, e nenhum tem pendência aberta. O selo de melhoria não vira
      missão, então o placar pode ficar abaixo de 100% mesmo assim.
    </p>
  )
}

function CartaoDeMissao({
  missao,
  ativa,
  aoAlternar,
}: {
  missao: Missao
  ativa: boolean
  aoAlternar?: (codigo: string) => void
}) {
  // Alvo zero não deveria existir (o banco tem check `alvo > 0`), mas dividir
  // por ele produziria NaN, que a barra mostraria como "sem dado" sem explicar.
  const percentual = missao.alvo > 0 ? (missao.feito / missao.alvo) * 100 : null

  return (
    <article
      className={cn(
        'relative rounded-lg border bg-card p-3.5 shadow-sm',
        ativa ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug font-medium">
          {aoAlternar ? (
            /* O botão é só o título, esticado por cima do cartão com um
               pseudoelemento. Envolver o cartão inteiro num <button> engoliria
               a barra de progresso: conteúdo de botão é achatado em texto, e o
               role="progressbar" some junto com o percentual. */
            <button
              type="button"
              aria-pressed={ativa}
              /* O nome acessível começa pelo texto visível (o leitor de tela e
                 o comando de voz precisam bater com o que está na tela) e
                 continua dizendo o que o clique FAZ: "Dar dono a processos
                 órfãos, botão" sozinho não deixa ninguém adivinhar que aquilo
                 recorta a lista lá embaixo. O nome NÃO muda com o estado: quem
                 anuncia ligado ou desligado é o `aria-pressed`, e dizer a mesma
                 coisa duas vezes é o jeito de ninguém entender nenhuma. */
              aria-label={`${missao.titulo}: recortar a lista de processos por esta lacuna`}
              onClick={() => aoAlternar(missao.codigo)}
              className="cursor-pointer text-left after:absolute after:inset-0 after:rounded-lg after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {missao.titulo}
            </button>
          ) : (
            missao.titulo
          )}
        </p>
        {/* Identidade nunca só por cor: o ícone e a palavra vêm junto. */}
        {missao.concluida ? (
          <Badge variant="success-subtle" className="shrink-0 gap-1">
            <CircleCheck className="size-3" aria-hidden />
            concluída
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0 gap-1">
            <CircleDashed className="size-3" aria-hidden />
            em aberto
          </Badge>
        )}
      </div>

      <div className="pt-3">
        <BarraDeProgresso
          valor={percentual}
          tom={missao.concluida ? 'success' : 'primary'}
          rotulo={`Progresso da missão: ${missao.titulo}`}
        />
      </div>

      <p className="pt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">
          {missao.feito} de {missao.alvo}
        </span>{' '}
        nesta semana
      </p>

      {/* A linha que impede a leitura errada: a missão é um RECORTE. Sem ela,
          barra cheia parece "acabou o mapeamento desta área". */}
      <p className="pt-1 text-xs text-muted-foreground">
        {missao.restante === 0 ? (
          <>Lacuna fechada: não falta nenhum caso na área.</>
        ) : (
          <>
            Ainda faltam{' '}
            <span className="font-medium text-foreground tabular-nums">{missao.restante}</span> no
            total da área (eram {missao.base} quando esta missão nasceu). A semana começa na
            segunda.
          </>
        )}
      </p>

      {/* O cartão ligado precisa dizer que ligou. A borda sozinha é cor, e cor
          sozinha não é identidade. */}
      {ativa && (
        <p className="flex items-center gap-1 pt-2 text-xs font-medium text-foreground">
          <ListFilter className="size-3.5" aria-hidden />
          Filtrando a lista por esta lacuna
        </p>
      )}
    </article>
  )
}
