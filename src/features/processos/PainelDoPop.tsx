import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, LoaderCircle, Pencil, Sparkles, Stamp, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EstadoDaTela, SemCorrespondencia } from '@/components/ui/estado-da-tela'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  aplicarModeloDePop,
  aprovarPop,
  carregarPop,
  carregarPopCompleto,
  listarRevisoesDoPop,
} from '@/features/processos/api'
import { DocumentoDoPop, SECOES_VERIFICADAS } from '@/features/processos/DocumentoDoPop'
import { FormularioDePop } from '@/features/processos/FormularioDePop'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'
import { cn } from '@/lib/utils'

/**
 * O POP do processo: documento remontado, edição das cinco seções que se
 * escrevem à mão, e a aprovação.
 *
 * Ele abre como camada sobre o processo, e não numa rota nova: fechar devolve a
 * tabela exatamente como estava. O formulário e a aprovação vêm por cima, e o
 * painel se esconde enquanto isso (`aberto`), porque duas camadas empilhadas
 * disputam o mesmo foco.
 */
export function PainelDoPop({
  processoId,
  processoNome,
  aoFechar,
}: {
  processoId: string
  processoNome: string
  aoFechar: () => void
}) {
  const { podeFazer } = useEmpresa()
  const queryClient = useQueryClient()

  /**
   * Aprovar é permissão PRÓPRIA, separada de editar. A seção 8 do modelo pede
   * segregação de funções: um POP em que quem escreve também aprova não tem
   * controle nenhum. Quem só edita não vê o botão, e a tela diz por quê.
   */
  const podeEditar = podeFazer('processo.edit')
  const podeAprovar = podeFazer('pop.aprovar')

  const [editando, setEditando] = useState(false)
  const [aprovando, setAprovando] = useState(false)

  /**
   * As duas leituras vivem na MESMA chave de propósito. O documento remontado e
   * a linha do POP são dois recortes do mesmo fato: em caches separados, uma
   * gravação invalida um e deixa o outro velho, e a tela mostraria o texto novo
   * ao lado do status antigo.
   */
  const pop = useQuery({
    queryKey: chaves.pop(processoId),
    queryFn: async () => {
      const [documento, registro] = await Promise.all([
        carregarPopCompleto(processoId),
        carregarPop(processoId),
      ])
      return { documento, registro }
    },
  })

  const doc = pop.data?.documento ?? null
  const popId = pop.data?.registro?.id ?? null
  /**
   * Enquanto a leitura não terminou (ou falhou), não se sabe se existe POP
   * gravado. Tudo que afirma ausência ("Criar POP", "não há POP para aprovar",
   * "o histórico começa quando o POP existe") depende deste sabido.
   */
  const sabido = pop.isSuccess
  const status = doc?.identificacao.status ?? null
  const vigente = status === 'vigente'
  const lacunas = doc?.lacunas ?? []

  const revisoes = useQuery({
    queryKey: chaves.popRevisoes(popId),
    queryFn: () => listarRevisoesDoPop(popId ?? ''),
    enabled: !!popId,
  })

  /**
   * O modelo da empresa preenche só as seções VAZIAS. As sete seções de texto
   * padrão (objetivo, abrangência, siglas, responsabilidades, controles,
   * riscos, registros) costumam ser iguais em todos os processos de uma área,
   * e redigitá-las em cada um é o trabalho que ninguém faz.
   */
  const aplicarModelo = useMutation({
    mutationFn: () => aplicarModeloDePop(processoId),
    onSuccess: () => {
      aplicarModelo.reset()
      void queryClient.invalidateQueries({ queryKey: chaves.pop(processoId) })
    },
  })

  const aprovar = useMutation({
    mutationFn: async (alteracao: string) => {
      if (!popId) throw new Error('Não existe POP gravado para aprovar.')
      return aprovarPop(popId, alteracao)
    },
    onSuccess: () => {
      setAprovando(false)
      aprovar.reset()
      void queryClient.invalidateQueries({ queryKey: chaves.pop(processoId) })
      void queryClient.invalidateQueries({ queryKey: chaves.popRevisoes(popId) })
      // `selo_pop` é `status = 'vigente'`, e nada mais. Aprovar acende o selo e
      // muda todo mundo que conta processo sem POP: o estágio da jornada, o
      // placar das áreas e a missão "publicar_pop". Faltando qualquer uma
      // destas chaves, a tela ao lado continua cobrando o POP recém-publicado.
      void queryClient.invalidateQueries({ queryKey: ['processos'] })
      void queryClient.invalidateQueries({ queryKey: ['jornada'] })
      void queryClient.invalidateQueries({ queryKey: ['jornada-placar'] })
      void queryClient.invalidateQueries({ queryKey: ['missoes'] })
    },
  })

  return (
    <>
      <PainelDeDetalhe
        aberto={!editando && !aprovando}
        largura="larga"
        aoFechar={aoFechar}
        titulo={`POP de ${processoNome}`}
        origem={`Processo · ${doc?.identificacao.area ?? 'sem área'} · documento remontado do que já está mapeado`}
        acoes={
          <>
            {podeEditar && (
              <Button
                variant="outline"
                size="sm"
                /* A gravação é upsert de TODAS as seções de uma vez. Abrir o
                   formulário em branco sem saber se já existe POP apagaria o
                   texto gravado na primeira gravação. */
                disabled={!sabido}
                title={
                  sabido
                    ? undefined
                    : pop.error
                      ? 'A leitura do POP falhou: editar agora poderia sobrescrever o que está gravado'
                      : 'Carregando o POP'
                }
                onClick={() => setEditando(true)}
              >
                <Pencil className="size-4" aria-hidden />
                {sabido && !popId ? 'Criar POP' : 'Editar POP'}
              </Button>
            )}
            {podeEditar && !vigente && (
              <Button
                variant="outline"
                size="sm"
                disabled={!sabido || aplicarModelo.isPending}
                title={
                  sabido
                    ? 'Preenche apenas as seções ainda vazias. Nada do que você escreveu é sobrescrito.'
                    : 'O POP ainda não foi lido'
                }
                onClick={() => aplicarModelo.mutate()}
              >
                <Sparkles className="size-4" aria-hidden />
                {aplicarModelo.isPending ? 'Aplicando...' : 'Aplicar modelo'}
              </Button>
            )}
            {podeAprovar && (
              <Button
                size="sm"
                disabled={!sabido || !popId || vigente}
                title={
                  !sabido
                    ? 'O POP ainda não foi lido'
                    : !popId
                      ? 'Não há POP gravado para aprovar'
                      : vigente
                        ? 'Este POP já está vigente'
                        : undefined
                }
                onClick={() => setAprovando(true)}
              >
                <Stamp className="size-4" aria-hidden />
                Aprovar POP
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          {aprovar.error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {mensagemDeErro(aprovar.error)}
            </p>
          )}

          {/* O aviso de vigência vem antes de tudo: quem executa a rotina não
              pode se apoiar num texto que ninguém aprovou, e essa informação
              não pode depender de rolar até a seção 13. */}
          {doc && !vigente && (
            <div
              className={cn(
                'flex items-start gap-2.5 rounded-md border p-3 text-xs',
                status === 'obsoleto'
                  ? 'border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground'
                  : 'border-warning/40 bg-warning-subtle text-warning-subtle-foreground',
              )}
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="space-y-0.5">
                <p className="font-semibold">
                  {rotulo(rotulos.status_pop, status)}: este documento não vale como
                  procedimento.
                </p>
                <p>
                  Ele só passa a valer quando alguém com permissão de aprovar publica a versão.
                  Até lá, o que está escrito aqui é intenção, não a regra que a área precisa
                  seguir.
                </p>
              </div>
            </div>
          )}

          {doc && vigente && (
            <p className="flex items-start gap-2.5 rounded-md border border-success/40 bg-success-subtle p-3 text-xs text-success-subtle-foreground">
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Vigente na versão {doc.identificacao.versao ?? 'não informada'}
                {doc.identificacao.data_emissao
                  ? `, emitida em ${fmt.data(doc.identificacao.data_emissao)}`
                  : ''}
                . Aprovado por {doc.identificacao.aprovado_por ?? 'responsável não registrado'}.
              </span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CartaoDeMetrica
              rotulo="Seções pendentes"
              valor={doc ? lacunas.length : null}
              detalhe={`de ${SECOES_VERIFICADAS} seções verificadas`}
              /* Sem documento carregado não há zero pendência: há ausência de
                 resposta, e um verde aqui afirmaria POP completo. */
              tom={!doc ? 'neutro' : lacunas.length > 0 ? 'warning' : 'success'}
              carregando={pop.isLoading}
            />
            <CartaoDeMetrica
              rotulo="Seções preenchidas"
              /* O banco só verifica as seções 1 a 11. Fechar a conta em 13
                 daria duas seções prontas (12 e 13) num documento em que
                 ninguém escreveu nada: 12 e 13 nascem da aprovação. */
              valor={doc ? SECOES_VERIFICADAS - lacunas.length : null}
              detalhe="as seções 1, 6, 7 e 9 saem do que já está mapeado"
              carregando={pop.isLoading}
            />
            <CartaoDeMetrica
              rotulo="Versão"
              valor={doc?.identificacao.versao}
              detalhe={doc ? rotulo(rotulos.status_pop, doc.identificacao.status) : undefined}
              carregando={pop.isLoading}
            />
          </div>

          {aplicarModelo.error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              O modelo não pôde ser aplicado: {mensagemDeErro(aplicarModelo.error)}
            </p>
          )}

          {/* O risco de um modelo bom: quarenta POPs com o mesmo objetivo
              genérico, copiado e nunca adaptado. O vazio se vê; o texto padrão
              se disfarça de preenchido. Por isso as seções herdadas têm aviso
              próprio, separado das lacunas, e o tom é informativo e não de
              alarme: herdar é um começo legítimo, parar aí é que não é. */}
          {doc && doc.vindas_do_modelo.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
              <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">
                  {doc.vindas_do_modelo.length} seção(ões) ainda estão com o texto de
                  "{doc.modelo_nome ?? 'modelo'}", palavra por palavra.
                </p>
                <ul className="list-inside list-disc pt-1">
                  {doc.vindas_do_modelo.map((sec) => (
                    <li key={sec}>{sec}</li>
                  ))}
                </ul>
                <p className="pt-1">
                  Isso não é erro: o modelo existe para dar o ponto de partida. Só vale
                  lembrar que um texto padrão que serve para qualquer processo não descreve
                  nenhum, e é aqui que a adaptação a este processo faz diferença.
                </p>
              </div>
            </div>
          )}

          {!podeAprovar && !vigente && (
            <p className="flex items-start gap-2.5 rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Você não vê o botão de aprovar porque aprovar POP depende da permissão
                "pop.aprovar", que é separada da permissão de editar processo. É a segregação
                de funções que a seção 8 do próprio modelo pede: quem escreve o procedimento
                não pode ser quem o aprova. Peça a aprovação a quem tem essa permissão na
                empresa.
              </span>
            </p>
          )}

          <EstadoDaTela
            carregando={pop.isLoading}
            erro={pop.error}
            /* O documento nunca é "vazio": quando nada foi preenchido, ele é a
               lista nomeada do que falta. */
            quantidade={1}
            aoTentarDeNovo={() => void pop.refetch()}
          >
            {doc && <DocumentoDoPop pop={doc} />}
          </EstadoDaTela>

          {/* A seção 12 aparece duas vezes de propósito: dentro do documento ela
              é o registro impresso, e aqui ela é o rastro vivo, com estado de
              carregamento e de falha próprios, que atualiza assim que alguém
              aprova. Lista vazia por falha de consulta seria lida como "nunca
              houve revisão". */}
          <section>
            <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Histórico de revisões (seção 12)
            </h3>
            {pop.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : pop.error ? (
              <p className="text-xs text-muted-foreground">
                A leitura do POP falhou, então nada pode ser afirmado sobre o histórico. Isto
                não é "nenhuma revisão registrada": use "Tentar de novo" acima.
              </p>
            ) : popId ? (
              <EstadoDaTela
                carregando={revisoes.isLoading}
                erro={revisoes.error}
                quantidade={revisoes.data?.length}
                aoTentarDeNovo={() => void revisoes.refetch()}
                vazio={
                  <SemCorrespondencia
                    titulo="Nenhuma revisão registrada"
                    descricao="O histórico começa na primeira aprovação: é ela que carimba versão, data e responsável."
                  />
                }
              >
                <ul className="space-y-1.5">
                  {(revisoes.data ?? []).map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-baseline gap-2 rounded-md border border-border bg-card p-2.5 text-xs"
                    >
                      <Badge variant="outline" className="tabular-nums">
                        v{r.versao}
                      </Badge>
                      <span className="text-muted-foreground tabular-nums">
                        {fmt.data(r.data) ?? 'sem data'}
                      </span>
                      <span className="min-w-0 flex-1">{r.alteracao}</span>
                    </li>
                  ))}
                </ul>
              </EstadoDaTela>
            ) : (
              <p className="text-xs text-muted-foreground">
                O histórico começa quando o POP existe e recebe a primeira aprovação.
              </p>
            )}
          </section>
        </div>
      </PainelDeDetalhe>

      {editando && (
        <FormularioDePop
          processoId={processoId}
          processoNome={processoNome}
          pop={pop.data?.registro ?? null}
          aoFechar={() => setEditando(false)}
        />
      )}

      {aprovando && (
        <DialogDeAprovacao
          processoNome={processoNome}
          versao={doc?.identificacao.versao ?? null}
          lacunas={lacunas}
          salvando={aprovar.isPending}
          erro={aprovar.error ? mensagemDeErro(aprovar.error) : null}
          aoFechar={() => {
            setAprovando(false)
            aprovar.reset()
          }}
          aoConfirmar={(alteracao) => aprovar.mutate(alteracao)}
        />
      )}
    </>
  )
}

/**
 * Aprovar pede a descrição da alteração porque é ela que vira a linha da seção
 * 12. Um histórico de "Aprovação da versão 3" repetido cinco vezes não diz o
 * que mudou, e é justamente isso que se pergunta seis meses depois.
 */
function DialogDeAprovacao({
  processoNome,
  versao,
  lacunas,
  salvando,
  erro,
  aoFechar,
  aoConfirmar,
}: {
  processoNome: string
  versao: number | null
  lacunas: string[]
  salvando: boolean
  erro: string | null
  aoFechar: () => void
  aoConfirmar: (alteracao: string) => void
}) {
  const [alteracao, setAlteracao] = useState('')
  const [tentou, setTentou] = useState(false)

  const curto = alteracao.trim().length < 5
  const mostrarErro = tentou && curto

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setTentou(true)
    if (curto) return
    aoConfirmar(alteracao.trim())
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Aprovar o POP de {processoNome}</DialogTitle>
          <DialogDescription className="text-xs">
            A aprovação publica a versão {versao ?? 'atual'}, carimba quem aprovou e grava a
            linha do histórico de revisões, tudo na mesma transação. A partir daí o documento
            vale como procedimento para quem executa a rotina.
          </DialogDescription>
        </DialogHeader>

        <form id="form-aprovar-pop" onSubmit={enviar} className="space-y-4" noValidate>
          {erro && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {erro}
            </p>
          )}

          {lacunas.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="space-y-1">
                <p className="font-semibold">
                  {lacunas.length} seção(ões) continuam vazias nesta versão.
                </p>
                <ul className="list-inside list-disc space-y-0.5">
                  {lacunas.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p>
                  Aprovar assim é legítimo, desde que seja decisão consciente: o documento sai
                  vigente declarando essas lacunas em vez de escondê-las.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pop-alteracao">O que mudou nesta versão</Label>
            <textarea
              id="pop-alteracao"
              rows={3}
              value={alteracao}
              onChange={(e) => setAlteracao(e.target.value)}
              placeholder="Ex.: Incluída a conferência dupla do lançamento e o prazo do dia 5"
              aria-invalid={mostrarErro}
              className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none aria-invalid:border-destructive focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {mostrarErro ? (
              <p role="alert" className="text-xs text-destructive">
                Descreva a alteração em uma frase. É esse texto que vai para o histórico de
                revisões.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Uma frase basta. Ela fica no histórico junto da versão, da data e do seu nome.
              </p>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button size="sm" type="submit" form="form-aprovar-pop" disabled={salvando}>
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Aprovar e publicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
