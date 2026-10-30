import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, GitBranch, LoaderCircle, Pencil, Plus, SquarePen } from 'lucide-react'
import { useState } from 'react'

import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
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
import { EstadoDaTela, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Farol } from '@/components/ui/farol'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { listarAreas, listarPerfisDaEmpresa } from '@/features/admin/api'
import {
  atualizarKeyResult,
  carregarOkr,
  criarKeyResult,
  desdobrarOkr,
  estadoDoFarol,
  excluirKeyResult,
  listarCheckins,
  listarKrsDoOkr,
  registrarCheckin,
  type DadosDoKeyResult,
  type KeyResult,
  type NoDaArvore,
} from '@/features/okr/api'
import { FormularioDeKeyResult } from '@/features/okr/FormularioDeKeyResult'
import { FormularioDeOkr } from '@/features/okr/FormularioDeOkr'
import { useAuth } from '@/hooks/use-auth'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

/**
 * Hoje no calendário LOCAL. Função, e não constante de módulo: a aba fica
 * aberta virando o dia, e uma constante congelaria ontem como "hoje".
 */
function dataDeHoje(): string {
  const hoje = new Date()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${hoje.getFullYear()}-${mes}-${dia}`
}

/**
 * Progresso de UM key result, em percentual, pela MESMA regra de
 * `app.kr_atingimento` (a função que o banco usa para o atingimento do OKR e
 * para o farol). Duas contas diferentes para a mesma grandeza fazem a barra
 * contradizer o farol que está ao lado dela.
 *
 * A conta ingênua ((atual - baseline) / (meta - baseline)) erra em dois casos
 * que existem no cadastro real:
 *  - meta igual à baseline divide por zero e vira Infinity, que a barra
 *    aparava em 100%: barra cheia anunciando meta batida onde o banco não
 *    tem atingimento nenhum;
 *  - baseline nula tem regra própria no banco (atual / meta, subindo), e
 *    virava "sem dado" na tela ao lado de um farol verde.
 */
function progressoDoKr(kr: KeyResult): number | null {
  if (kr.meta === null || kr.atual === null) return null
  if (kr.baseline !== null && kr.meta !== kr.baseline) {
    return ((kr.atual - kr.baseline) / (kr.meta - kr.baseline)) * 100
  }
  if (kr.baseline === null && kr.meta !== 0 && kr.direcao === 'subir') {
    return (kr.atual / kr.meta) * 100
  }
  // Meta zero com direção "descer" (multas = 0, autuações = 0): só é 100%
  // quando o atual também zerou. É zero medido, não ausência de dado.
  if (kr.meta === 0 && kr.direcao === 'descer') return kr.atual <= 0 ? 100 : 0
  return null
}

/**
 * Detalhe do OKR em SHEET, não em rota nova.
 *
 * O usuário precisa comparar o OKR com a árvore que ficou atrás, e fechar tem
 * que devolver a árvore exatamente como estava (expandida, filtrada, no mesmo
 * scroll). Um `navigate()` aqui perderia isso e faria o botão voltar virar
 * aposta.
 */
export function PainelDoOkr({
  no,
  ano,
  aoFechar,
  aoDesdobrar,
}: {
  no: NoDaArvore
  ano: number
  aoFechar: () => void
  aoDesdobrar: () => void
}) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const { usuario } = useAuth()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const [krEmCheckin, setKrEmCheckin] = useState<KeyResult | null>(null)
  const [krEmEdicao, setKrEmEdicao] = useState<KeyResult | null>(null)
  const [criandoKr, setCriandoKr] = useState(false)
  const [editandoOkr, setEditandoOkr] = useState(false)
  const [abrindoDesdobramento, setAbrindoDesdobramento] = useState(false)

  /**
   * A linha do OKR e os key results dele vivem na MESMA chave de propósito,
   * como o POP faz com documento e registro. São dois recortes do mesmo fato:
   * em caches separados, salvar a edição invalidaria um e deixaria o outro
   * velho, e o painel mostraria o título novo em cima da lista antiga.
   *
   * A linha crua é o que o formulário de edição precisa: a árvore entrega o
   * nó já agregado (com nomes de área e de objetivo), não as colunas que se
   * gravam de volta.
   */
  const okr = useQuery({
    queryKey: chaves.okr(no.id),
    queryFn: async () => {
      const [registro, keyResults] = await Promise.all([
        carregarOkr(no.id),
        listarKrsDoOkr(no.id),
      ])
      return { registro, keyResults }
    },
  })

  const registro = okr.data?.registro ?? null
  const krs = okr.data?.keyResults
  /**
   * Enquanto a leitura não terminou (ou falhou) não se sabe o que está gravado
   * neste OKR. O formulário grava TODOS os campos de uma vez, então abri-lo em
   * branco apagaria dono, objetivo estratégico e perspectiva na primeira
   * gravação. Mesmo cuidado do PainelDoPop.
   */
  const sabido = okr.isSuccess

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId && abrindoDesdobramento,
    queryFn: () => listarAreas(empresaId!),
  })

  const pessoas = useQuery({
    queryKey: chaves.perfis(empresaId),
    enabled: !!empresaId && abrindoDesdobramento,
    queryFn: () => listarPerfisDaEmpresa(empresaId!),
  })

  const podeCheckin = podeFazer('okr.checkin')
  const podeEditar = podeFazer('okr.edit')
  // Sem empresa ativa não há company_id para gravar o key result. Esconder o
  // botão evita oferecer uma ação que só falharia no insert.
  const podeCriarKr = podeEditar && !!empresaId

  /**
   * Dono e nível saem da linha RECÉM-LIDA sempre que ela existe. O nó é a foto
   * que a árvore tirou no clique: quem acabou de assumir o OKR (ou de mudar o
   * nível dele) no formulário aqui do lado continuaria com o gate do estado
   * antigo até a tela de trás remontar.
   */
  const donoAtual = registro ? registro.owner_user_id : no.owner_user_id
  const nivelAtual = registro ? registro.nivel : no.nivel

  /**
   * Desdobrar segue o gate da RPC `app.okr_desdobrar`, que aceita super admin,
   * admin da empresa, quem tem `okr.edit` OU o DONO do OKR pai. A tela pedia só
   * `okr.edit`, então o dono não conseguia desdobrar o próprio OKR por aqui
   * embora o banco deixasse. Quando a tela é mais restritiva que o banco, quem
   * está errado é a tela.
   *
   * `podeFazer` já devolve true para super admin e para admin da empresa, então
   * os quatro caminhos do gate estão cobertos.
   *
   * Nível individual continua sem desdobrar: a RPC criaria outro individual, e
   * o que desce de um OKR individual é atividade, não OKR.
   */
  const souDonoDoOkr = !!usuario?.id && donoAtual === usuario.id
  const podeDesdobrar = (podeEditar || souDonoDoOkr) && nivelAtual !== 'individual'

  /**
   * O vínculo com o objetivo estratégico também vem da linha lida, não do nó:
   * o snapshot mente nos dois sentidos depois de uma edição (mostra o objetivo
   * que acabou de sair, esconde o que acabou de entrar). O TÍTULO do objetivo
   * só existe no nó, então ele só é exibido enquanto os dois concordarem sobre
   * qual objetivo é.
   */
  const objetivoLigadoId = registro ? registro.objetivo_estrategico_id : no.objetivo_estrategico_id
  const tituloDoObjetivo =
    objetivoLigadoId && objetivoLigadoId === no.objetivo_estrategico_id
      ? no.objetivo_titulo
      : null
  // Só se afirma falta depois que a leitura voltou: sem `registro`, "sem dono"
  // seria uma acusação em cima de dado que ninguém leu.
  const semObjetivo = !!registro && registro.objetivo_estrategico_id === null
  const semDono = !!registro && registro.owner_user_id === null

  /**
   * Mexer em key result (ou no próprio OKR) muda o atingimento e o farol, e
   * esses números também aparecem na árvore e em "Meu OKR". Invalidar só o
   * painel deixaria as outras telas mostrando o número velho.
   */
  function invalidarOkr() {
    void queryClient.invalidateQueries({ queryKey: chaves.okr(no.id) })
    void queryClient.invalidateQueries({ queryKey: chaves.okrArvore(empresaId, ano, null) })
    void queryClient.invalidateQueries({ queryKey: ['okr-arvore'] })
    void queryClient.invalidateQueries({ queryKey: ['okr-grafo'] })
    void queryClient.invalidateQueries({ queryKey: ['meus-okrs'] })
    // A estrela do norte do painel executivo mostra baseline, meta e atual
    // vindos direto de um key result, e o painel de áreas conta os KRs por
    // área. Mexer no KR sem invalidar os dois deixa aquele número mentindo
    // por 30 segundos de staleTime.
    void queryClient.invalidateQueries({ queryKey: ['painel-executivo'] })
    void queryClient.invalidateQueries({ queryKey: ['painel-areas'] })
    // O painel de comitê lista os OKRs acompanhados por ele com farol e
    // atingimento. Sem esta chave, o comitê continua discutindo o número que a
    // tela ao lado já corrigiu.
    void queryClient.invalidateQueries({ queryKey: ['painel-comite'] })
  }

  const salvarKr = useMutation({
    mutationFn: (dados: DadosDoKeyResult) =>
      krEmEdicao ? atualizarKeyResult(krEmEdicao.id, dados) : criarKeyResult(empresaId!, dados),
    onSuccess: () => {
      setKrEmEdicao(null)
      setCriandoKr(false)
      salvarKr.reset()
      invalidarOkr()
    },
  })

  const removerKr = useMutation({
    mutationFn: (id: string) => excluirKeyResult(id),
    onSuccess: () => {
      setKrEmEdicao(null)
      removerKr.reset()
      invalidarOkr()
    },
  })

  const erroDeKr = salvarKr.error ?? removerKr.error

  function fecharFormularioDeKr() {
    setCriandoKr(false)
    setKrEmEdicao(null)
    salvarKr.reset()
    removerKr.reset()
  }

  return (
    <>
      <PainelDeDetalhe
        /* O formulário de OKR também é sheet. Duas camadas abertas disputam o
           mesmo foco, então esta se esconde enquanto a de cima está aberta. */
        aberto={!editandoOkr}
        largura="larga"
        aoFechar={aoFechar}
        /* O título vem da linha recém-lida, não do nó capturado no clique:
           depois de renomear o OKR, a árvore atrás ainda guarda o texto antigo
           e o cabeçalho ficaria mentindo até a tela remontar. */
        titulo={registro?.titulo ?? no.titulo}
        origem={`${rotulo(rotulos.nivel_okr, nivelAtual)} · ${
          no.area_nome ?? 'sem área'
        } · ciclo ${no.trimestre ? `T${no.trimestre}/${no.ano}` : no.ano}`}
        acoes={
          podeEditar || podeDesdobrar ? (
            <>
              {podeEditar && (
                <Button
                  size="sm"
                  variant="outline"
                  /* O formulário grava todas as colunas do OKR de uma vez.
                     Abrir antes de saber o que está gravado sobrescreveria
                     dono, objetivo estratégico e perspectiva com vazio. */
                  disabled={!sabido || !registro}
                  title={
                    !sabido
                      ? okr.error
                        ? 'A leitura do OKR falhou: editar agora sobrescreveria o que está gravado'
                        : 'Carregando o OKR'
                      : !registro
                        ? 'Este OKR não existe mais. Feche o painel e recarregue a árvore.'
                        : undefined
                  }
                  onClick={() => setEditandoOkr(true)}
                >
                  <SquarePen className="size-4" aria-hidden />
                  Editar OKR
                </Button>
              )}
              {podeDesdobrar && (
                <Button size="sm" variant="outline" onClick={() => setAbrindoDesdobramento(true)}>
                  <GitBranch className="size-4" aria-hidden />
                  Desdobrar
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        <div className="space-y-5">
          {/* `carregarOkr` usa maybeSingle: com RLS, linha inexistente e linha
              sem acesso voltam idênticas (null, sem erro). Sem este aviso o
              painel seguiria exibindo os números do nó como se o OKR estivesse
              lá, e a lista vazia de key results pareceria cadastro incompleto
              em vez de registro que sumiu. */}
          {sabido && !registro && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              Este OKR não foi encontrado agora: ou ele foi excluído, ou você perdeu o acesso a
              ele. O que aparece abaixo é a última leitura da árvore, não o estado atual do
              banco. Feche o painel e recarregue a tela.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Resumo rotulo="Farol">
              <Farol estado={estadoDoFarol(no.farol)} />
            </Resumo>
            <Resumo rotulo="Atingimento">
              <ValorOuSemDado
                valor={fmt.atingimento(no.atingimento)}
                formatar={(v) => `${v}%`}
                className="text-sm font-medium"
              />
            </Resumo>
            <Resumo rotulo="Key results">
              {/* Contagem da MESMA consulta que alimenta a lista abaixo. O
                  `no.total_krs` é a foto que a árvore tirou no clique: depois
                  de criar o terceiro KR ele continuaria dizendo 2, contra uma
                  lista de três linhas logo abaixo. E se a consulta falhar,
                  "sem dado" é a resposta honesta, não zero. */}
              <ValorOuSemDado valor={krs?.length} className="text-sm font-medium" />
            </Resumo>
            <Resumo rotulo="Desdobramentos">
              <span className="text-sm font-medium">{no.total_filhos}</span>
            </Resumo>
          </div>

          {objetivoLigadoId && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {tituloDoObjetivo ? (
                <>
                  Nasce do objetivo estratégico{' '}
                  <span className="font-medium text-foreground">{tituloDoObjetivo}</span>
                  {no.perspectiva_nome && ` (perspectiva ${no.perspectiva_nome})`}.
                </>
              ) : (
                'Este OKR está ligado a um objetivo estratégico. O nome dele vem da árvore, que ainda não recarregou desde a última edição.'
              )}
            </p>
          )}

          {/* Os dois campos que mais ficam vazios num OKR novo. Enquanto
              faltarem, o OKR não aparece no mapa e não aparece em "Meu OKR" de
              ninguém, e é exatamente isso que o aviso precisa dizer, com a
              ação de correção a um clique daqui. */}
          {(semObjetivo || semDono) && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Este OKR está incompleto.</p>
                <p className="pt-0.5">
                  {semObjetivo &&
                    'Sem objetivo estratégico de origem, ele não aparece em nenhum card do mapa. '}
                  {semDono &&
                    'Sem dono, ninguém é cobrado no check-in e ele não entra em "Meu OKR". '}
                  {podeEditar
                    ? 'Use "Editar OKR" para completar.'
                    : 'Peça a quem edita OKR nesta empresa para completar.'}
                </p>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2 pb-2">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Key results
              </h3>
              {podeCriarKr && (
                <Button size="xs" variant="outline" onClick={() => setCriandoKr(true)}>
                  <Plus className="size-3" aria-hidden />
                  Novo key result
                </Button>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <EstadoDaTela
                carregando={okr.isLoading}
                erro={okr.error}
                quantidade={krs?.length}
                aoTentarDeNovo={() => void okr.refetch()}
                vazio={
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-medium">Este OKR não tem key result</p>
                    <p className="pt-1 text-xs text-muted-foreground">
                      Objetivo sem resultado-chave não é mensurável, e o farol fica cinza
                      para sempre.
                    </p>
                    {podeCriarKr && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => setCriandoKr(true)}
                      >
                        <Plus className="size-4" aria-hidden />
                        Criar o primeiro key result
                      </Button>
                    )}
                  </div>
                }
              >
                <ul className="divide-y divide-border">
                  {(krs ?? []).map((kr) => (
                    <li key={kr.id} className="space-y-2 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-sm">{kr.descricao}</p>
                        <Farol estado={estadoDoFarol(kr.farol)} suave />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {/* Marco não tem alvo numérico: mostrar "baseline: sem dado"
                            aqui sugeriria um cadastro incompleto que não existe. */}
                        {kr.tipo === 'marco' ? (
                          <span>alvo descrito no texto, sem número para comparar</span>
                        ) : (
                          <>
                            <span>
                              baseline:{' '}
                              <ValorOuSemDado valor={kr.baseline} className="text-foreground" />
                            </span>
                            <span>
                              meta: <ValorOuSemDado valor={kr.meta} className="text-foreground" />
                            </span>
                          </>
                        )}
                        <span>
                          atual: <ValorOuSemDado valor={kr.atual} className="text-foreground" />
                        </span>
                        {kr.unidade && <span>{kr.unidade}</span>}
                        <Badge variant="outline" className="text-[10px]">
                          {rotulo(rotulos.tipo_kr, kr.tipo)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {rotulo(rotulos.direcao_kr, kr.direcao)}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3">
                        <BarraDeProgresso
                          /* Marco não tem alvo numérico: barra aqui seria um
                             número inventado. A BarraDeProgresso já apara o
                             valor em 0..100 e já trata null como "sem dado". */
                          className="flex-1"
                          valor={kr.tipo === 'marco' ? null : progressoDoKr(kr)}
                          tom={
                            kr.farol === 'verde'
                              ? 'success'
                              : kr.farol === 'amarelo'
                                ? 'warning'
                                : kr.farol === 'vermelho'
                                  ? 'destructive'
                                  : 'info'
                          }
                          rotulo={`Progresso de ${kr.descricao}`}
                        />
                        {podeCheckin && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => setKrEmCheckin(kr)}
                          >
                            <Plus className="size-3" aria-hidden />
                            Check-in
                          </Button>
                        )}
                        {podeEditar && (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Editar key result ${kr.descricao}`}
                            onClick={() => setKrEmEdicao(kr)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </EstadoDaTela>
            </div>
          </div>
        </div>
      </PainelDeDetalhe>

      {krEmCheckin && (
        <DialogDeCheckin
          kr={krEmCheckin}
          aoFechar={() => setKrEmCheckin(null)}
          aoConcluir={() => {
            // O histórico do próprio KR é o único cache que `invalidarOkr` não
            // alcança. Sem esta linha, reabrir o check-in logo em seguida
            // mostra a lista sem a medição que a pessoa acabou de registrar,
            // pelos 30s de staleTime, e ela registra de novo.
            void queryClient.invalidateQueries({ queryKey: chaves.krCheckins(krEmCheckin.id) })
            setKrEmCheckin(null)
            invalidarOkr()
          }}
        />
      )}

      {/* Só monta com a linha em mãos. `registro` só existe depois que a
          leitura terminou, e é ele que impede o formulário de abrir em branco
          e gravar vazio por cima do que está no banco. Excluir vem de graça:
          o próprio formulário oferece o botão quando recebe um OKR, gateado lá
          por `okr.delete`. */}
      {editandoOkr && registro && (
        <FormularioDeOkr
          okr={registro}
          origem={`${rotulo(rotulos.nivel_okr, nivelAtual)} · ${
            no.area_nome ?? 'sem área'
          } · editando`}
          aoFechar={() => setEditandoOkr(false)}
          aoConcluir={(salvo) => {
            setEditandoOkr(false)
            invalidarOkr()
            // Excluído: o painel continuaria exibindo um OKR que não existe
            // mais, e a árvore atrás dele já perdeu essa linha.
            if (!salvo) aoFechar()
          }}
        />
      )}

      {(criandoKr || krEmEdicao) && (
        <FormularioDeKeyResult
          keyResult={krEmEdicao}
          okrId={no.id}
          tituloDoOkr={no.titulo}
          salvando={salvarKr.isPending}
          excluindo={removerKr.isPending}
          erro={erroDeKr ? mensagemDeErro(erroDeKr) : null}
          aoFechar={fecharFormularioDeKr}
          aoSalvar={(dados) => salvarKr.mutate(dados)}
          aoExcluir={krEmEdicao ? () => removerKr.mutate(krEmEdicao.id) : undefined}
        />
      )}

      {abrindoDesdobramento && (
        <DialogDeDesdobramento
          no={no}
          areas={(areas.data ?? []).map((a) => ({
            value: a.id,
            label: a.nome,
            description: rotulo(rotulos.tipo_area, a.tipo),
          }))}
          pessoas={pessoas.data ?? []}
          erroDeAreas={areas.error}
          erroDePessoas={pessoas.error}
          carregandoAreas={areas.isLoading}
          carregandoPessoas={pessoas.isLoading}
          aoFechar={() => setAbrindoDesdobramento(false)}
          aoConcluir={() => {
            setAbrindoDesdobramento(false)
            aoDesdobrar()
          }}
        />
      )}
    </>
  )
}

function Resumo({ rotulo: r, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <p className="pb-1 text-[11px] text-muted-foreground">{r}</p>
      {children}
    </div>
  )
}

/**
 * Check-in em DIALOG: é uma decisão focada sobre um registro, e a resposta é
 * uma ação só. Sheet aqui seria exagero.
 */
function DialogDeCheckin({
  kr,
  aoFechar,
  aoConcluir,
}: {
  kr: KeyResult
  aoFechar: () => void
  aoConcluir: () => void
}) {
  const [valor, setValor] = useState(kr.atual !== null ? String(kr.atual) : '')
  // `toISOString()` devolve a data em UTC: das 21h em diante, no Brasil, o
  // check-in de hoje já nasceria datado de amanhã. O resto do sistema
  // (periodoAtual) também usa o calendário local.
  const [data, setData] = useState(dataDeHoje)
  const [comentario, setComentario] = useState('')

  const historico = useQuery({
    queryKey: chaves.krCheckins(kr.id),
    queryFn: () => listarCheckins(kr.id),
  })

  const salvar = useMutation({
    mutationFn: () =>
      registrarCheckin({
        krId: kr.id,
        valor: Number(valor.replace(',', '.')),
        data,
        comentario: comentario.trim() || null,
      }),
    onSuccess: aoConcluir,
  })

  const valorInvalido = valor.trim() === '' || Number.isNaN(Number(valor.replace(',', '.')))

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Check-in de key result</DialogTitle>
          <DialogDescription className="text-xs">{kr.descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {salvar.error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground">
              {mensagemDeErro(salvar.error)}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ck-valor">Valor atual {kr.unidade ? `(${kr.unidade})` : ''}</Label>
              <Input
                id="ck-valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={kr.meta !== null ? `meta ${kr.meta}` : 'valor medido'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ck-data">Data da medição</Label>
              <Input
                id="ck-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ck-comentario">Comentário</Label>
            <Input
              id="ck-comentario"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="O que explica este número?"
            />
          </div>

          <div>
            <p className="pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Últimos check-ins
            </p>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              {/* Histórico que falhou não é histórico vazio: dizer "nenhum
                  check-in registrado" quando a leitura caiu convida a pessoa a
                  recontar uma medição que já existe. */}
              <EstadoDaTela
                carregando={historico.isLoading}
                erro={historico.error}
                quantidade={historico.data?.length}
                aoTentarDeNovo={() => void historico.refetch()}
                carregandoNode={
                  <p className="px-3 py-3 text-xs text-muted-foreground">Carregando...</p>
                }
                vazio={
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    Nenhum check-in registrado ainda.
                  </p>
                }
              >
                <ul className="divide-y divide-border">
                  {(historico.data ?? []).map((c) => (
                    <li key={c.id} className="flex items-start gap-3 px-3 py-2 text-xs">
                      <span className="w-20 shrink-0 text-muted-foreground">
                        {fmt.data(c.data)}
                      </span>
                      <span className="w-16 shrink-0 font-medium tabular-nums">{c.valor}</span>
                      <span className="min-w-0 flex-1 text-muted-foreground">
                        {c.comentario ?? 'sem comentário'}
                      </span>
                    </li>
                  ))}
                </ul>
              </EstadoDaTela>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={valorInvalido || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Registrar check-in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogDeDesdobramento({
  no,
  areas,
  pessoas,
  erroDeAreas,
  erroDePessoas,
  carregandoAreas,
  carregandoPessoas,
  aoFechar,
  aoConcluir,
}: {
  no: NoDaArvore
  areas: { value: string; label: string; description?: string }[]
  pessoas: { value: string; label: string; description?: string }[]
  erroDeAreas: unknown
  erroDePessoas: unknown
  carregandoAreas: boolean
  carregandoPessoas: boolean
  aoFechar: () => void
  aoConcluir: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [area, setArea] = useState<string | null>(no.area_id)
  const [owner, setOwner] = useState<string | null>(null)

  const proximoNivel =
    no.nivel === 'corporativo' ? 'diretoria' : no.nivel === 'diretoria' ? 'gerencia' : 'individual'

  const salvar = useMutation({
    mutationFn: () =>
      desdobrarOkr({
        okrId: no.id,
        titulo: titulo.trim(),
        areaId: area,
        ownerUserId: owner,
        trimestre: null,
      }),
    onSuccess: aoConcluir,
  })

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Desdobrar OKR</DialogTitle>
          <DialogDescription className="text-xs">
            O filho herda objetivo estratégico, perspectiva e ciclo de{' '}
            <span className="font-medium">{no.titulo}</span>, e nasce no nível{' '}
            <span className="font-medium">{rotulo(rotulos.nivel_okr, proximoNivel)}</span> como
            rascunho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {salvar.error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground">
              {mensagemDeErro(salvar.error)}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="dd-titulo">Objetivo do OKR filho</Label>
            <Input
              id="dd-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Zerar autuações fiscais na operação"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dd-area">Área</Label>
            <SearchableSelect
              id="dd-area"
              options={areas}
              value={area}
              onChange={setArea}
              placeholder="Herda a área do pai"
            />
            <AvisoDaLista
              erro={erroDeAreas}
              carregando={carregandoAreas}
              vazia={areas.length === 0}
              oQue="as áreas"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dd-owner">Dono</Label>
            <SearchableSelect
              id="dd-owner"
              options={pessoas}
              value={owner}
              onChange={setOwner}
              placeholder="Definir depois"
            />
            <AvisoDaLista
              erro={erroDePessoas}
              carregando={carregandoPessoas}
              vazia={pessoas.length === 0}
              oQue="as pessoas da empresa"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={titulo.trim() === '' || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Criar desdobramento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Um select vazio tem três causas diferentes, e elas pedem reações opostas:
 * a leitura falhou, a leitura ainda não voltou, ou não há cadastro mesmo. Sem
 * separar as três, quem desdobra conclui que a empresa não tem área (nem
 * pessoa) e cria o OKR filho sem dono, que é exatamente o buraco que esta tela
 * existe para fechar.
 */
function AvisoDaLista({
  erro,
  carregando,
  vazia,
  oQue,
}: {
  erro: unknown
  carregando: boolean
  vazia: boolean
  oQue: string
}) {
  if (erro) {
    return (
      <p role="alert" className="text-xs text-destructive">
        Não foi possível carregar {oQue}, então esta lista está vazia por falha, não por
        ausência de cadastro. {mensagemDeErro(erro)}
      </p>
    )
  }
  if (carregando) return <p className="text-xs text-muted-foreground">Carregando {oQue}...</p>
  if (vazia) {
    return (
      <p className="text-xs text-muted-foreground">
        A lista está vazia porque {oQue} ainda não foram cadastradas nesta empresa.
      </p>
    )
  }
  return null
}
