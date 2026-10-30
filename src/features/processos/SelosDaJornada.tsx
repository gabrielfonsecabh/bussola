import { Check, Minus, Plus } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SELOS, type LinhaDaJornada, type Selo } from '@/features/processos/api'
import { rotulos } from '@/lib/formato'
import { cn } from '@/lib/utils'

/**
 * Os seis selos de um processo, desenhados e (quando há para onde levar)
 * acionáveis.
 *
 * Componente sem consulta própria: ele recebe a linha que a jornada já trouxe.
 * Os selos são DERIVADOS no banco (`processos_jornada`), então não existe aqui
 * nenhum caminho para marcá-los à mão: o selo apagado não vira um "marcar como
 * feito", ele vira o atalho para a tela que produz o dado que falta.
 *
 * Quem decide o que abrir é a página, não este componente: `aoAcionar` diz qual
 * selo foi pedido e `selosAcionaveis` diz quais têm destino. Selo sem destino
 * continua informativo, porque botão que não leva a lugar nenhum ensina que
 * clicar não adianta.
 */

/** Campo booleano da linha que corresponde a cada selo. */
const CAMPO = {
  dono: 'selo_dono',
  sipoc: 'selo_sipoc',
  fluxo: 'selo_fluxo',
  pop: 'selo_pop',
  indicador: 'selo_indicador',
  melhoria: 'selo_melhoria',
} as const satisfies Record<Selo, keyof LinhaDaJornada>

/**
 * O que cada selo quer dizer, nas duas direções.
 *
 * A frase do `falta` é o que transforma um selo apagado em trabalho: "sem
 * fluxo" não é instrução, "falta desenhar as etapas com início e fim" é. Os
 * critérios são exatamente os da função do banco, não uma leitura da tela: se
 * um deles mudar lá, esta frase muda junto.
 */
const EXPLICACAO: Record<Selo, { ganho: string; falta: string }> = {
  dono: {
    ganho: 'Dono definido: existe uma pessoa que responde por este processo.',
    falta: 'Falta definir o dono: hoje ninguém responde por este processo.',
  },
  sipoc: {
    ganho: 'SIPOC completo: fornecedores, entradas, saídas e clientes preenchidos.',
    falta:
      'Falta fechar o SIPOC: as quatro pontas (fornecedores, entradas, saídas e clientes) precisam estar preenchidas.',
  },
  fluxo: {
    ganho: 'Fluxo desenhado: as etapas têm início e fim.',
    falta:
      'Falta desenhar as etapas com início e fim. Uma etapa solta ainda não é um fluxo que alguém consiga ler.',
  },
  pop: {
    ganho: 'POP vigente: o procedimento está aprovado e publicado.',
    falta: 'Falta publicar o POP aprovado. Rascunho e em revisão ainda não valem o selo.',
  },
  indicador: {
    ganho: 'Indicador com meta registrado: dá para medir e dizer se está bom.',
    falta:
      'Falta um indicador com meta. Indicador sem meta mede o processo mas não diz se ele está bom.',
  },
  melhoria: {
    ganho: 'Existe projeto de melhoria ligado a este processo.',
    falta: 'Falta abrir um projeto de melhoria (DMAIC, Kaizen ou just do it) para este processo.',
  },
}

/**
 * O VERBO de cada selo, que vira o nome acessível do botão.
 *
 * "Dono: falta definir o dono" descreve um estado; "Dar dono ao processo X" é
 * o que o botão faz. Quem navega por lista de botões do leitor de tela ouve a
 * ação e o processo, que é exatamente a decisão que está tomando.
 */
const ACAO: Record<Selo, string> = {
  dono: 'Dar dono ao processo',
  sipoc: 'Fechar o SIPOC do processo',
  fluxo: 'Desenhar o fluxo do processo',
  pop: 'Publicar o POP do processo',
  indicador: 'Registrar indicador do processo',
  melhoria: 'Abrir projeto de melhoria do processo',
}

/** Resumo textual, para leitor de tela e para rótulo de gráfico: "3 de 6 selos". */
export function resumoDeSelos(linha: LinhaDaJornada): string {
  return `${linha.selos} de ${SELOS.length} selos`
}

export interface SelosDaJornadaProps {
  linha: LinhaDaJornada
  /** Mostra o contador "3/6" ao lado das pastilhas. */
  mostrarContagem?: boolean
  className?: string
  /**
   * Chamado quando um selo APAGADO e acionável é clicado. Sem ele, as
   * pastilhas continuam sendo só a leitura do estado.
   */
  aoAcionar?: (selo: Selo, linha: LinhaDaJornada) => void
  /**
   * Quais selos têm para onde levar. O que fica de fora continua informativo,
   * mesmo apagado: melhor não oferecer a ação do que oferecer e não cumprir.
   */
  selosAcionaveis?: readonly Selo[]
}

export function SelosDaJornada({
  linha,
  mostrarContagem = true,
  className,
  aoAcionar,
  selosAcionaveis = SELOS,
}: SelosDaJornadaProps) {
  const resumo = resumoDeSelos(linha)

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {/* A lista inteira tem rótulo próprio: seis pastilhas lidas uma a uma não
          dizem em que pé o processo está, e é essa a pergunta da tela. */}
      <ul aria-label={resumo} className="flex flex-wrap items-center gap-1">
        {SELOS.map((selo) => {
          const ganho = linha[CAMPO[selo]] === true
          const texto = ganho ? EXPLICACAO[selo].ganho : EXPLICACAO[selo].falta
          // Só o selo apagado que tem destino vira ação. O ganho continua
          // informativo: um botão "Dar dono" num processo que já tem dono
          // promete um trabalho que não existe.
          const acionavel = !ganho && !!aoAcionar && selosAcionaveis.includes(selo)
          // Ganho e não ganho se separam por PREENCHIMENTO, BORDA e ÍCONE, não
          // por cor: no tema escuro, impresso em cinza ou para quem não
          // distingue verde, a pastilha vazada e tracejada continua legível. O
          // "+" acrescenta a terceira distinção, entre o que dá para resolver
          // daqui e o que só está sendo informado.
          const Icone = ganho ? Check : acionavel ? Plus : Minus

          return (
            <li key={selo}>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-label={
                    acionavel ? `${ACAO[selo]} ${linha.nome}` : `${rotulos.selo[selo]}: ${texto}`
                  }
                  onClick={
                    acionavel
                      ? (evento) => {
                          // A linha inteira também é clicável: sem isto o
                          // clique no selo abriria o painel E a camada, e o
                          // usuário não saberia qual dos dois pediu.
                          evento.stopPropagation()
                          aoAcionar(selo, linha)
                        }
                      : undefined
                  }
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    ganho
                      ? 'border-success/40 bg-success-subtle text-success-subtle-foreground'
                      : 'border-dashed border-border bg-muted text-muted-foreground',
                    acionavel &&
                      'cursor-pointer hover:border-solid hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icone className="size-3" aria-hidden />
                  {rotulos.selo[selo]}
                </TooltipTrigger>
                <TooltipContent className="max-w-72">
                  {texto}
                  {acionavel && (
                    <span className="block pt-1 font-medium">Clique para resolver agora.</span>
                  )}
                </TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ul>

      {mostrarContagem && (
        // aria-hidden porque o <ul> acima já anunciou "3 de 6 selos": repetir
        // faria o leitor de tela dizer a mesma coisa duas vezes.
        <span aria-hidden className="pl-0.5 text-xs tabular-nums text-muted-foreground">
          {linha.selos}/{SELOS.length}
        </span>
      )}
    </div>
  )
}
