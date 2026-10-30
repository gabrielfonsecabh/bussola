import { CircleCheck, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { formatarDuracao, type PopCompleto } from '@/features/processos/api'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { cn } from '@/lib/utils'

/**
 * O POP nas 13 seções do modelo, em leitura.
 *
 * Duas decisões mandam neste arquivo:
 *
 * 1. Seção vazia aparece NOMEADA como pendente, nunca sumida. Um documento com
 *    buraco escondido é pior que um documento declaradamente incompleto: quem
 *    lê um POP com a seção 8 ausente conclui que não há controle interno a
 *    observar, e não que ninguém escreveu essa parte ainda.
 * 2. Oito das treze seções NÃO são digitadas aqui: elas já vivem no sistema
 *    (etapas, sistemas, indicadores, dono, área). Quando uma delas está vazia,
 *    o aviso diz onde ela se preenche, porque o caminho não é este formulário.
 *
 * `lacunas` vem pronto do banco (`processo_pop_completo`), com o número da
 * seção na frente. A tela não recalcula o que falta: duas contas do mesmo fato
 * divergem no primeiro campo novo.
 */
/**
 * Quantas seções o banco realmente verifica ao montar `lacunas`: da 1 à 11.
 *
 * As seções 12 (histórico) e 13 (aprovações) NÃO entram nessa checagem, porque
 * não são redigidas: elas nascem da aprovação. Contá-las como preenchidas para
 * chegar a 13 inventa duas seções prontas num documento em que ninguém escreveu
 * nada, que é exatamente o vazio virando número que este projeto proíbe.
 */
export const SECOES_VERIFICADAS = 11

export function DocumentoDoPop({ pop, className }: { pop: PopCompleto; className?: string }) {
  const id = pop.identificacao
  const lacunas = pop.lacunas ?? []

  /** O prefixo "10." não casa com "1.", então a comparação por número é segura. */
  const pendente = (numero: number) => lacunas.some((l) => l.startsWith(`${numero}.`))

  return (
    <article
      className={cn(
        'space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm',
        'print:space-y-4 print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none',
        className,
      )}
    >
      <header className="space-y-1.5 border-b border-border pb-3">
        <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Procedimento operacional padrão
        </p>
        <h2 className="text-lg leading-snug font-semibold tracking-tight">{id.titulo}</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span>{id.codigo ?? 'sem código de documento'}</span>
          <span className="flex items-center gap-1">
            versão <ValorOuSemDado valor={id.versao} />
          </span>
          <Badge variant={seloDoStatus(id.status)} className="print:border print:bg-transparent">
            {rotulo(rotulos.status_pop, id.status)}
          </Badge>
        </div>
      </header>

      {lacunas.length === 0 ? (
        <p className="flex items-start gap-2.5 rounded-md border border-success/40 bg-success-subtle p-3 text-xs text-success-subtle-foreground print:bg-transparent">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Nenhuma seção pendente. O histórico (12) e as aprovações (13) se preenchem
            sozinhos quando alguém aprova o documento.
          </span>
        </p>
      ) : (
        <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground print:bg-transparent">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold">
              {lacunas.length === 1
                ? `Uma das ${SECOES_VERIFICADAS} seções verificadas ainda está vazia.`
                : `${lacunas.length} das ${SECOES_VERIFICADAS} seções verificadas ainda estão vazias.`}
            </p>
            <ul className="list-inside list-disc space-y-0.5">
              {lacunas.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p>
              Cada uma delas aparece marcada como pendente no corpo do documento, com a
              indicação de onde ela se preenche. O histórico (12) e as aprovações (13) ficam
              fora desta conta: eles não se redigem, nascem da aprovação.
            </p>
          </div>
        </div>
      )}

      {pop.pendencia_de_mapeamento && (
        <p className="flex items-start gap-2.5 rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground print:bg-transparent">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Pendência de mapeamento registrada na origem: {pop.pendencia_de_mapeamento}
          </span>
        </p>
      )}

      <Secao
        numero={1}
        titulo="Identificação"
        pendente={pendente(1)}
        orientacao="Este processo não tem dono. A identificação sai do cadastro do processo: defina o dono em Processos, porque documento sem dono não tem a quem cobrar revisão."
      >
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Campo rotulo="Processo">{id.titulo}</Campo>
          <Campo rotulo="Código">{id.codigo ?? <SemInformacao />}</Campo>
          <Campo rotulo="Área">{id.area ?? <SemInformacao />}</Campo>
          <Campo rotulo="Dono do processo">{id.dono ?? <SemInformacao />}</Campo>
          <Campo rotulo="Categoria">{id.categoria ?? <SemInformacao />}</Campo>
          <Campo rotulo="Periodicidade">
            {id.periodicidade ? (
              rotulo(rotulos.periodicidade, id.periodicidade)
            ) : (
              <SemInformacao />
            )}
            {/* O que a área escreveu fica visível mesmo quando não deu para
                classificar: "Conforme demanda" não é sinônimo de sob demanda. */}
            {id.periodicidade_origem && (
              <span className="block text-[11px] text-muted-foreground">
                na origem: {id.periodicidade_origem}
              </span>
            )}
          </Campo>
          <Campo rotulo="Prazo de referência">
            {id.prazo_referencia ?? <SemInformacao />}
          </Campo>
          <Campo rotulo="Versão">
            <ValorOuSemDado valor={id.versao} />
          </Campo>
          <Campo rotulo="Data de emissão">{fmt.data(id.data_emissao) ?? <SemInformacao />}</Campo>
        </dl>
      </Secao>

      <Secao
        numero={2}
        titulo="Objetivo"
        pendente={pendente(2)}
        orientacao='Seção não preenchida. Escreva em "Editar POP": é o que o procedimento se propõe a garantir.'
      >
        <Paragrafo valor={pop.objetivo} />
      </Secao>

      <Secao
        numero={3}
        titulo="Abrangência"
        pendente={pendente(3)}
        orientacao='Seção não preenchida. Escreva em "Editar POP": onde este procedimento vale e onde ele não vale.'
      >
        <Paragrafo valor={pop.abrangencia} />
      </Secao>

      <Secao
        numero={4}
        titulo="Definições e siglas"
        pendente={pendente(4)}
        orientacao='Seção não preenchida. Cadastre em "Editar POP": sigla que só o time conhece trava quem chega depois.'
      >
        <dl className="space-y-1.5">
          {pop.definicoes.map((d) => (
            <div key={`${d.sigla}|${d.significado}`} className="flex flex-wrap gap-x-2 text-sm">
              <dt className="font-medium">{d.sigla}</dt>
              <dd className="min-w-0 flex-1 text-muted-foreground">{d.significado}</dd>
            </div>
          ))}
        </dl>
      </Secao>

      <Secao
        numero={5}
        titulo="Responsabilidades"
        pendente={pendente(5)}
        orientacao='Seção não preenchida. Cadastre em "Editar POP". O papel é função, não pessoa: trocar o ocupante não deveria obrigar a revisar o documento.'
      >
        <dl className="space-y-2">
          {pop.responsabilidades.map((r) => (
            <div key={`${r.papel}|${r.responsabilidade}`} className="text-sm">
              <dt className="font-medium">{r.papel}</dt>
              <dd className="text-muted-foreground">{r.responsabilidade}</dd>
            </div>
          ))}
        </dl>
      </Secao>

      <Secao
        numero={6}
        titulo="Sistemas utilizados"
        pendente={pendente(6)}
        orientacao='Seção não preenchida. Esta lista sai do campo "sistema" das etapas do fluxo. Preencha o sistema de cada etapa em "Mapear fluxo": lista digitada à parte diverge do fluxo em um mês.'
      >
        <ul className="flex flex-wrap gap-1.5">
          {pop.sistemas.map((s) => (
            <li key={s}>
              <Badge variant="outline">{s}</Badge>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao
        numero={7}
        titulo="Descrição do processo"
        pendente={pendente(7)}
        orientacao='Seção não preenchida. A descrição do processo é o fluxo de etapas, não um texto paralelo. Desenhe em "Mapear fluxo".'
      >
        <ol className="space-y-2">
          {pop.etapas.map((e) => (
            <li
              key={`${e.ordem}|${e.titulo}`}
              className="rounded-md border border-border p-3 break-inside-avoid print:rounded-none print:border-0 print:border-b print:p-2"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {e.ordem}
                </span>
                <span className="text-sm font-medium">{e.titulo}</span>
                <Badge variant="outline" className="text-[10px]">
                  {rotulo(rotulos.tipo_etapa, e.tipo)}
                </Badge>
                {e.eh_gargalo && (
                  <Badge
                    variant="warning-subtle"
                    className="gap-1 text-[10px] print:border print:bg-transparent"
                  >
                    <TriangleAlert className="size-3" aria-hidden />
                    gargalo
                  </Badge>
                )}
              </div>
              {e.descricao && (
                <p className="pt-1 text-xs whitespace-pre-line text-muted-foreground">
                  {e.descricao}
                </p>
              )}
              <dl className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5 text-xs">
                <ItemDaEtapa rotulo="Responsável">
                  {e.responsavel ?? 'sem responsável'}
                </ItemDaEtapa>
                <ItemDaEtapa rotulo="Sistema">{e.sistema ?? 'sem sistema'}</ItemDaEtapa>
                {/* Tempo nulo é ausência de medição, e ausência de medição não
                    é "leva zero minuto". */}
                <ItemDaEtapa rotulo="Tempo">
                  {formatarDuracao(e.tempo_estimado_min) ?? 'sem tempo estimado'}
                </ItemDaEtapa>
              </dl>
            </li>
          ))}
        </ol>
      </Secao>

      <Secao
        numero={8}
        titulo="Controles internos"
        pendente={pendente(8)}
        orientacao='Seção não preenchida. Cadastre em "Editar POP": é aqui que mora a segregação de funções, a conferência e a evidência que o procedimento exige.'
      >
        <ul className="list-inside list-disc space-y-1 text-sm">
          {pop.controles_internos.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Secao>

      <Secao
        numero={9}
        titulo="Indicadores de desempenho"
        pendente={pendente(9)}
        orientacao="Seção não preenchida. Os indicadores são os que já estão cadastrados no processo. Cadastre em Indicadores, e eles entram aqui sozinhos."
      >
        <ul className="space-y-2">
          {pop.indicadores.map((i) => (
            <li key={`${i.tipo}|${i.nome}`} className="text-sm break-inside-avoid">
              <div className="flex flex-wrap items-baseline gap-2">
                <Badge
                  variant={i.tipo === 'Y' ? 'info-subtle' : 'secondary'}
                  className="text-[10px] print:border print:bg-transparent"
                >
                  {rotulo(rotulos.tipo_indicador, i.tipo)}
                </Badge>
                <span className="font-medium">{i.nome}</span>
                {i.unidade && <span className="text-xs text-muted-foreground">({i.unidade})</span>}
              </div>
              {i.formula && (
                <p className="pt-0.5 text-xs text-muted-foreground">Fórmula: {i.formula}</p>
              )}
              <p className="flex flex-wrap gap-x-4 pt-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  Meta: <ValorOuSemDado valor={i.meta} />
                </span>
                <span className="flex items-center gap-1">
                  Baseline: <ValorOuSemDado valor={i.baseline} />
                </span>
              </p>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao
        numero={10}
        titulo="Riscos e mitigações"
        pendente={pendente(10)}
        orientacao='Seção não preenchida. Cadastre em "Editar POP": risco sem mitigação escrita vira improviso no dia em que ele acontece.'
      >
        <dl className="space-y-2">
          {pop.riscos.map((r) => (
            <div key={`${r.risco}|${r.mitigacao}`} className="text-sm break-inside-avoid">
              <dt className="font-medium">{r.risco}</dt>
              <dd className="text-muted-foreground">Mitigação: {r.mitigacao}</dd>
            </div>
          ))}
        </dl>
      </Secao>

      <Secao
        numero={11}
        titulo="Registros"
        pendente={pendente(11)}
        orientacao='Seção não preenchida. Cadastre em "Editar POP": quais evidências o processo deixa, e onde elas ficam guardadas.'
      >
        <ul className="list-inside list-disc space-y-1 text-sm">
          {pop.registros.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Secao>

      {/* A seção 12 não entra em `lacunas` de propósito: histórico vazio não é
          seção mal preenchida, é documento que ainda não teve aprovação. */}
      <Secao numero={12} titulo="Histórico de revisões" pendente={false}>
        {pop.historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma revisão registrada. O histórico começa na primeira aprovação, que é o que
            carimba versão, data e responsável.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {pop.historico.map((h) => (
              <li
                key={`${h.versao}|${h.data}|${h.alteracao}`}
                className="flex flex-wrap items-baseline gap-2 text-sm break-inside-avoid"
              >
                <Badge variant="outline" className="tabular-nums">
                  v{h.versao}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmt.data(h.data) ?? 'sem data'}
                </span>
                <span className="min-w-0 flex-1">{h.alteracao}</span>
                <span className="text-xs text-muted-foreground">
                  {h.responsavel ?? 'responsável não registrado'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* Seção 13 do modelo: as assinaturas. Os três papéis ficam em campos
          separados porque a seção 8 pede segregação de funções, e quem elabora
          não pode ser o mesmo que aprova. */}
      <Secao numero={13} titulo="Aprovações" pendente={false}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Campo rotulo="Elaborado por">{id.elaborado_por ?? <NaoRegistrado />}</Campo>
          <Campo rotulo="Revisado por">{id.revisado_por ?? <NaoRegistrado />}</Campo>
          <Campo rotulo="Aprovado por">{id.aprovado_por ?? <NaoRegistrado />}</Campo>
        </dl>
        {id.status !== 'vigente' && (
          <p className="flex items-start gap-2.5 pt-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Documento sem aprovação vigente: ele descreve uma intenção, não o procedimento em
              vigor.
            </span>
          </p>
        )}
      </Secao>
    </article>
  )
}

function seloDoStatus(
  status: string,
): 'success-subtle' | 'warning-subtle' | 'destructive-subtle' | 'outline' {
  if (status === 'vigente') return 'success-subtle'
  if (status === 'obsoleto') return 'destructive-subtle'
  if (status === 'inexistente') return 'outline'
  return 'warning-subtle'
}

/**
 * O cabeçalho numerado é o que faz o documento impresso continuar navegável:
 * a estrutura sai do número e do rótulo, nunca da cor, que a impressora não
 * reproduz.
 */
function Secao({
  numero,
  titulo,
  pendente,
  orientacao,
  children,
}: {
  numero: number
  titulo: string
  pendente: boolean
  /** Onde aquela seção se preenche. Oito das treze não se digitam no POP. */
  orientacao?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2 break-inside-avoid print:break-inside-avoid">
      <h3 className="flex flex-wrap items-baseline gap-2 border-b border-border pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <span className="tabular-nums">{numero}.</span>
        <span>{titulo}</span>
        {pendente && (
          <Badge
            variant="warning-subtle"
            className="gap-1 normal-case print:border print:bg-transparent"
          >
            <TriangleAlert className="size-3" aria-hidden />
            pendente
          </Badge>
        )}
      </h3>
      {/* O aviso vem ANTES do conteúdo, e não no lugar dele: a seção 1 pode
          estar pendente por falta de dono e ainda assim ter o resto para
          mostrar. */}
      {pendente && (
        <p className="text-xs text-muted-foreground">{orientacao}</p>
      )}
      {children}
    </section>
  )
}

function Campo({ rotulo: r, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] text-muted-foreground">{r}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function ItemDaEtapa({ rotulo: r, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1">
      <dt className="text-muted-foreground">{r}:</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Paragrafo({ valor }: { valor: string | null }) {
  if (!valor) return null
  return <p className="text-sm whitespace-pre-line">{valor}</p>
}

function SemInformacao() {
  return <span className="text-muted-foreground">não informado</span>
}

function NaoRegistrado() {
  return <span className="text-muted-foreground">não registrado</span>
}
