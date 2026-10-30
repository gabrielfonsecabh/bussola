import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Columns4, LoaderCircle, Pencil, Plus, Star, Target, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Farol } from '@/components/ui/farol'
import { Skeleton } from '@/components/ui/skeleton'
import {
  carregarArvore,
  estadoDoFarol,
  listarObjetivos,
  listarPerspectivas,
  type NoDaArvore,
  type ObjetivoEstrategico,
} from '@/features/okr/api'
import { FormularioDeObjetivo } from '@/features/okr/FormularioDeObjetivo'
import { FormularioDeOkr } from '@/features/okr/FormularioDeOkr'
import { PainelDoOkr } from '@/features/okr/PainelDoOkr'
import { SeletorDeAno } from '@/features/okr/SeletorDeAno'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { anoAtual, fmt, rotulo, rotulos } from '@/lib/formato'
import { exigeLinhaAfetada, mensagemDeErro } from '@/lib/query'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** A cor de cada perspectiva vem do token, nunca de um hex no componente. */
const TOM_DA_PERSPECTIVA: Record<string, string> = {
  financeiro: 'border-l-success',
  clientes: 'border-l-info',
  processos: 'border-l-primary',
  aprendizagem: 'border-l-warning',
}

/**
 * As quatro perspectivas do BSC, na ordem em que o mapa se lê de baixo para
 * cima. Nenhuma tela do sistema cria perspectiva, e empresa sem perspectiva
 * renderiza um mapa sem card nenhum, com TODO objetivo caindo em "fora do
 * mapa". É essa lacuna que o atalho fecha.
 *
 * As chaves são exatamente as que a constraint `perspectivas_chave_check`
 * aceita no banco, e as mesmas que TOM_DA_PERSPECTIVA usa para escolher o
 * token da borda. Inventar outra chave aqui quebra o insert e a cor juntos.
 */
const PERSPECTIVAS_PADRAO = [
  { chave: 'financeiro', nome: 'Financeira', ordem: 1, cor_token: 'success' },
  { chave: 'clientes', nome: 'Clientes', ordem: 2, cor_token: 'info' },
  { chave: 'processos', nome: 'Processos internos', ordem: 3, cor_token: 'primary' },
  { chave: 'aprendizagem', nome: 'Aprendizado e crescimento', ordem: 4, cor_token: 'warning' },
] as const

/** Objetivo sem perspectiva não cabe em nenhum dos quatro cards do BSC. */
const SEM_PERSPECTIVA = 'sem-perspectiva'

/** Estado do formulário de objetivo: editando um, ou criando dentro de uma perspectiva. */
type FormDeObjetivo = {
  objetivo: ObjetivoEstrategico | null
  perspectivaId: string | null
}

export function MapaEstrategicoPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const [ano, setAno] = useState(anoAtual())
  // Guardamos o ID, não o objeto: editar o objetivo refaz a consulta, e um
  // objeto capturado no clique deixaria o painel mostrando o título antigo.
  const [objetivoId, setObjetivoId] = useState<string | null>(null)
  // Mesmo motivo: o OKR aberto é um ID, e o nó sai sempre da árvore fresca.
  // Se ele for excluído dentro do painel, a linha some e o painel fecha junto.
  const [okrId, setOkrId] = useState<string | null>(null)
  const [formDeObjetivo, setFormDeObjetivo] = useState<FormDeObjetivo | null>(null)
  const [criandoOkr, setCriandoOkr] = useState(false)

  const podeEditar = podeFazer('okr.edit')

  const perspectivas = useQuery({
    queryKey: chaves.perspectivas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPerspectivas(empresaId!),
  })

  const objetivos = useQuery({
    queryKey: chaves.mapaEstrategico(empresaId, ano),
    enabled: !!empresaId,
    queryFn: () => listarObjetivos(empresaId!),
  })

  // A árvore serve para ligar objetivo -> OKRs sem uma segunda ida ao banco.
  const arvore = useQuery({
    queryKey: chaves.okrArvore(empresaId, ano, null),
    enabled: !!empresaId,
    queryFn: () => carregarArvore(empresaId!, ano, null),
  })

  const okrsPorObjetivo = useMemo(() => {
    const mapa = new Map<string, NoDaArvore[]>()
    for (const no of arvore.data ?? []) {
      if (!no.objetivo_estrategico_id) continue
      const atual = mapa.get(no.objetivo_estrategico_id) ?? []
      mapa.set(no.objetivo_estrategico_id, [...atual, no])
    }
    return mapa
  }, [arvore.data])

  const porPerspectiva = useMemo(() => {
    const mapa = new Map<string, ObjetivoEstrategico[]>()
    for (const o of objetivos.data ?? []) {
      const chave = o.perspectiva_id ?? SEM_PERSPECTIVA
      mapa.set(chave, [...(mapa.get(chave) ?? []), o])
    }
    return mapa
  }, [objetivos.data])

  const foraDoMapa = porPerspectiva.get(SEM_PERSPECTIVA) ?? []

  const carregando = perspectivas.isLoading || objetivos.isLoading
  const erro = perspectivas.error ?? objetivos.error

  /**
   * "Não tem perspectiva" só pode ser AFIRMADO depois que a leitura voltou.
   * Enquanto ela carrega ou falha, lista vazia não é ausência de cadastro, e
   * oferecer a criação em cima de uma consulta que falhou levaria o usuário a
   * duplicar o que já existe.
   */
  const semPerspectivas = perspectivas.isSuccess && (perspectivas.data?.length ?? 0) === 0

  // Sempre a linha FRESCA da consulta: se o objetivo foi excluído, o painel
  // fecha sozinho em vez de continuar mostrando um registro que não existe.
  const objetivo = (objetivos.data ?? []).find((o) => o.id === objetivoId) ?? null
  const okrsDoObjetivo = objetivo ? (okrsPorObjetivo.get(objetivo.id) ?? []) : []
  const okrSelecionado = (arvore.data ?? []).find((n) => n.id === okrId) ?? null

  /**
   * A contagem de OKRs vem de OUTRA consulta que a dos objetivos. Escrever
   * "sem OKR ligado" enquanto a árvore falhou (ou ainda nem voltou) é inventar
   * um zero em cima de um dado que ninguém leu.
   */
  function resumoDeOkrs(quantidade: number): string {
    if (arvore.isLoading) return 'carregando os OKRs ligados'
    if (arvore.error) return 'os OKRs ligados não carregaram'
    return quantidade === 0 ? `sem OKR ligado em ${ano}` : `${quantidade} OKR(s) em ${ano}`
  }

  function estrelaDoNorteDeOutro(alvo: ObjetivoEstrategico | null): string | null {
    const outra = (objetivos.data ?? []).find(
      (o) => o.is_estrela_do_norte && o.id !== alvo?.id,
    )
    return outra?.titulo ?? null
  }

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chaves.mapaEstrategico(empresaId, ano) })
    void queryClient.invalidateQueries({ queryKey: chaves.objetivos(empresaId) })
    void queryClient.invalidateQueries({ queryKey: chaves.perspectivas(empresaId) })
    void queryClient.invalidateQueries({ queryKey: ['okr-arvore'] })
    void queryClient.invalidateQueries({ queryKey: ['okr-grafo'] })
    // Um OKR novo também muda a árvore de quem é dono dele e os painéis, que
    // contam OKR por área e por comitê.
    void queryClient.invalidateQueries({ queryKey: ['meus-okrs'] })
    void queryClient.invalidateQueries({ queryKey: ['painel-executivo'] })
    void queryClient.invalidateQueries({ queryKey: ['painel-areas'] })
    void queryClient.invalidateQueries({ queryKey: ['painel-comite'] })
  }

  /**
   * Criação das quatro perspectivas em UM insert só, para o mapa nunca existir
   * pela metade: dois cards no ar e dois objetivos órfãos seria pior que o
   * mapa vazio de hoje.
   *
   * Não existe função de escrita de perspectiva em `okr/api.ts`, e a tabela é
   * simples o bastante para não justificar uma. A policy de insert exige
   * `okr.edit` (ou admin da empresa), a mesma coisa que `podeEditar` prevê.
   */
  const criarPerspectivas = useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase()
        .from('perspectivas')
        .insert(PERSPECTIVAS_PADRAO.map((p) => ({ ...p, company_id: companyId })))
        .select()
      // `exigeLinhaAfetada` cobre erro e resultado nulo. O que ele não cobre é
      // o array CURTO: quatro linhas pedidas e menos de quatro gravadas é
      // falha, não sucesso parcial, e sem esta conferência a tela comemoraria
      // um mapa incompleto.
      const criadas = exigeLinhaAfetada({ data, error }, 'conjunto de perspectivas')
      if (criadas.length < PERSPECTIVAS_PADRAO.length) {
        throw new Error(
          `Pedimos ${PERSPECTIVAS_PADRAO.length} perspectivas e o banco gravou ${criadas.length}. ` +
            'Ou alguma já existia nesta empresa, ou você não tem permissão para criá-las. ' +
            'Recarregue a tela antes de tentar de novo.',
        )
      }
      return criadas
    },
    onSuccess: () => {
      criarPerspectivas.reset()
      invalidar()
    },
  })

  return (
    <Page
      title="Mapa estratégico"
      description="As quatro perspectivas do BSC e seus objetivos"
      actions={
        <>
          {podeEditar && (
            <Button
              size="sm"
              onClick={() => setFormDeObjetivo({ objetivo: null, perspectivaId: null })}
            >
              <Plus className="size-4" aria-hidden />
              Novo objetivo
            </Button>
          )}
          <SeletorDeAno ano={ano} aoMudar={setAno} />
        </>
      }
    >
      <EstadoDaTela
        carregando={carregando}
        erro={erro}
        quantidade={objetivos.data?.length}
        aoTentarDeNovo={() => {
          void perspectivas.refetch()
          void objetivos.refetch()
        }}
        carregandoNode={
          <div className="grid gap-4 lg:grid-cols-2">
            {Object.keys(TOM_DA_PERSPECTIVA).map((chave) => (
              <Skeleton key={chave} className="h-56 w-full rounded-lg" />
            ))}
          </div>
        }
        vazio={
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <p className="text-sm font-medium">Nenhum objetivo estratégico cadastrado</p>
            <p className="max-w-md pt-1 text-xs text-muted-foreground">
              O mapa é a raiz de tudo: sem ele, nenhum OKR tem de onde nascer.
              {semPerspectivas &&
                ' E antes do objetivo vêm as perspectivas: sem elas não existe card onde' +
                  ' pendurar o que for cadastrado.'}
            </p>
            <div className="flex flex-col items-center gap-2 pt-3">
              {podeEditar && semPerspectivas && (
                <CriarPerspectivasPadrao
                  salvando={criarPerspectivas.isPending}
                  erro={criarPerspectivas.error}
                  aoCriar={() => empresaId && criarPerspectivas.mutate(empresaId)}
                />
              )}
              {podeEditar && (
                <Button
                  size="sm"
                  onClick={() => setFormDeObjetivo({ objetivo: null, perspectivaId: null })}
                >
                  <Plus className="size-4" aria-hidden />
                  Criar o primeiro objetivo
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Há objetivo cadastrado, mas nenhuma perspectiva: o grid abaixo sai
              sem um único card e a lista "fora do mapa" engole o mapa inteiro.
              Sem este aviso a tela parece quebrada, e não incompleta. */}
          {semPerspectivas && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-subtle p-4 text-xs text-warning-subtle-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="space-y-1.5">
                <p className="font-semibold">
                  Esta empresa não tem nenhuma perspectiva do BSC cadastrada.
                </p>
                <p>
                  Perspectiva é a prateleira do mapa. Sem ela nenhum card aparece, todos os
                  objetivos caem em "fora do mapa" aqui embaixo, e o OKR que nasce deles não
                  tem perspectiva para herdar.
                </p>
                {podeEditar ? (
                  <CriarPerspectivasPadrao
                    salvando={criarPerspectivas.isPending}
                    erro={criarPerspectivas.error}
                    aoCriar={() => empresaId && criarPerspectivas.mutate(empresaId)}
                  />
                ) : (
                  <p>
                    Criar perspectiva depende da permissão "okr.edit", que você não tem nesta
                    empresa. Peça a quem administra a Bússola aqui.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {(perspectivas.data ?? []).map((p) => {
              const lista = porPerspectiva.get(p.id) ?? []
              return (
                <section
                  key={p.id}
                  className={cn(
                    'rounded-lg border border-l-4 border-border bg-card shadow-sm',
                    TOM_DA_PERSPECTIVA[p.chave] ?? 'border-l-primary',
                  )}
                >
                  <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold">{p.nome}</h2>
                    <Badge variant="secondary">
                      {lista.length} {lista.length === 1 ? 'objetivo' : 'objetivos'}
                    </Badge>
                  </header>

                  <ul className="divide-y divide-border">
                    {lista.length === 0 && (
                      <li className="px-4 py-6 text-center">
                        <p className="text-xs text-muted-foreground">
                          Nenhum objetivo nesta perspectiva
                        </p>
                        {podeEditar && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() =>
                              setFormDeObjetivo({ objetivo: null, perspectivaId: p.id })
                            }
                          >
                            <Plus className="size-4" aria-hidden />
                            Criar objetivo em {p.nome}
                          </Button>
                        )}
                      </li>
                    )}
                    {lista.map((o) => (
                      <li key={o.id}>
                        <ItemDoObjetivo
                          objetivo={o}
                          resumo={resumoDeOkrs((okrsPorObjetivo.get(o.id) ?? []).length)}
                          aoAbrir={() => setObjetivoId(o.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>

          {/* Objetivo sem perspectiva existe no banco e não cabe em card do BSC.
              Sem esta lista ele ficaria invisível na única tela que o edita. */}
          {foraDoMapa.length > 0 && (
            <section
              className={cn(
                'rounded-lg border border-l-4 border-border bg-card shadow-sm',
                'border-l-warning',
              )}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Fora do mapa</h2>
                <Badge variant="warning-subtle">
                  {foraDoMapa.length} {foraDoMapa.length === 1 ? 'objetivo' : 'objetivos'}
                </Badge>
              </header>
              <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                Estes objetivos estão cadastrados, mas sem perspectiva do BSC, e por isso
                não entram em card nenhum acima.{' '}
                {semPerspectivas
                  ? 'Como a empresa ainda não tem perspectiva nenhuma, não há o que escolher: crie as quatro acima primeiro.'
                  : 'Abra cada um para escolher a perspectiva.'}
              </p>
              <ul className="divide-y divide-border">
                {foraDoMapa.map((o) => (
                  <li key={o.id}>
                    <ItemDoObjetivo
                      objetivo={o}
                      resumo={resumoDeOkrs((okrsPorObjetivo.get(o.id) ?? []).length)}
                      aoAbrir={() => setObjetivoId(o.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </EstadoDaTela>

      {objetivo && (
        <PainelDeDetalhe
          /* O formulário de OKR e o painel do OKR também são sheet. Três
             camadas abertas ao mesmo tempo disputam foco e trap de teclado,
             então esta se esconde enquanto qualquer uma delas está por cima.
             Fechar a de cima devolve este painel no mesmo lugar. */
          aberto={!criandoOkr && !okrSelecionado}
          aoFechar={() => setObjetivoId(null)}
          titulo={objetivo.titulo}
          /* "sem perspectiva" é uma afirmação sobre o cadastro, e ela só
             pode ser feita com a lista de perspectivas em mãos: se a leitura
             falhou, o objetivo pode muito bem ter perspectiva. */
          origem={`Mapa estratégico · ${
            perspectivas.error
              ? 'perspectiva não carregada'
              : (perspectivas.data?.find((p) => p.id === objetivo.perspectiva_id)?.nome ??
                'sem perspectiva')
          } · ciclo ${objetivo.ciclo}`}
          acoes={
            podeEditar && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFormDeObjetivo({
                      objetivo,
                      perspectivaId: objetivo.perspectiva_id,
                    })
                  }
                >
                  <Pencil className="size-4" aria-hidden />
                  Editar objetivo
                </Button>
                <Button size="sm" onClick={() => setCriandoOkr(true)}>
                  <Plus className="size-4" aria-hidden />
                  Criar OKR corporativo
                </Button>
              </>
            )
          }
        >
          <div className="space-y-4">
            {objetivo.descricao && (
              <p className="text-sm text-muted-foreground">{objetivo.descricao}</p>
            )}

            <div>
              <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                OKRs ligados em {ano}
              </h3>
              <div className="overflow-hidden rounded-lg border border-border">
                <EstadoDaTela
                  carregando={arvore.isLoading}
                  erro={arvore.error}
                  quantidade={okrsDoObjetivo.length}
                  aoTentarDeNovo={() => void arvore.refetch()}
                  vazio={
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                      Nenhum OKR nasceu deste objetivo em {ano}. Um objetivo sem OKR é uma
                      intenção sem dono.
                    </p>
                  }
                >
                  {/* O vínculo objetivo -> OKR precisa ter volta: daqui se abre
                      o mesmo painel da árvore, com key results, check-in,
                      edição e desdobramento. Sem isso o mapa é um beco. */}
                  <ul className="divide-y divide-border">
                    {okrsDoObjetivo.map((no) => (
                      <li key={no.id}>
                        <button
                          type="button"
                          onClick={() => setOkrId(no.id)}
                          className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm">{no.titulo}</span>
                            <span className="block text-xs text-muted-foreground">
                              {rotulo(rotulos.nivel_okr, no.nivel)} ·{' '}
                              {no.area_nome ?? 'sem área'} · {no.owner_nome ?? 'sem dono'} ·{' '}
                              {no.total_krs} KR(s)
                            </span>
                          </span>
                          {/* O percentual vai AO LADO do farol, não no lugar
                              do rótulo dele: trocado, o badge passaria a
                              separar "no ritmo" de "risco" só pela cor, e o
                              OKR sem medição viraria um badge mudo em vez de
                              dizer "sem dado". Mesmo par usado na árvore. */}
                          <span className="flex shrink-0 items-center gap-2">
                            <ValorOuSemDado
                              valor={fmt.atingimento(no.atingimento)}
                              formatar={(v) => `${v}%`}
                              className="text-xs"
                            />
                            <Farol estado={estadoDoFarol(no.farol)} suave />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </EstadoDaTela>
              </div>
            </div>
          </div>
        </PainelDeDetalhe>
      )}

      {formDeObjetivo && (
        <FormularioDeObjetivo
          objetivo={formDeObjetivo.objetivo}
          perspectivaId={formDeObjetivo.perspectivaId}
          estrelaDoNorteAtual={estrelaDoNorteDeOutro(formDeObjetivo.objetivo)}
          aoFechar={() => setFormDeObjetivo(null)}
          aoConcluir={(salvo) => {
            setFormDeObjetivo(null)
            if (!salvo) setObjetivoId(null)
            invalidar()
          }}
        />
      )}

      {okrSelecionado && (
        <PainelDoOkr
          no={okrSelecionado}
          ano={ano}
          aoFechar={() => setOkrId(null)}
          aoDesdobrar={invalidar}
        />
      )}

      {criandoOkr && objetivo && (
        <FormularioDeOkr
          okr={null}
          objetivoEstrategicoId={objetivo.id}
          perspectivaId={objetivo.perspectiva_id}
          nivel="corporativo"
          ano={ano}
          origem={`Mapa estratégico · nasce do objetivo "${objetivo.titulo}"`}
          aoFechar={() => setCriandoOkr(false)}
          aoConcluir={() => {
            setCriandoOkr(false)
            invalidar()
          }}
        />
      )}
    </Page>
  )
}

/**
 * O atalho que dá as prateleiras ao mapa. Fica fora do componente da página
 * porque aparece em dois lugares: no estado vazio (empresa sem objetivo nenhum)
 * e no aviso acima do grid (empresa com objetivo e sem perspectiva), e um
 * botão só, com o mesmo texto e o mesmo tratamento de erro, evita duas versões
 * da mesma ação divergindo com o tempo.
 */
function CriarPerspectivasPadrao({
  salvando,
  erro,
  aoCriar,
}: {
  salvando: boolean
  erro: unknown
  aoCriar: () => void
}) {
  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" disabled={salvando} onClick={aoCriar}>
        {salvando ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Columns4 className="size-4" aria-hidden />
        )}
        Criar as 4 perspectivas padrão do BSC
      </Button>
      {!!erro && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
        >
          As perspectivas não foram criadas. {mensagemDeErro(erro)}
        </p>
      )}
    </div>
  )
}

function ItemDoObjetivo({
  objetivo,
  resumo,
  aoAbrir,
}: {
  objetivo: ObjetivoEstrategico
  resumo: string
  aoAbrir: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {objetivo.is_estrela_do_norte && (
            <Star
              className="size-3.5 shrink-0 fill-warning text-warning"
              /* `role="img"` porque a estrela é a única marca do objetivo que
                 puxa a empresa inteira: sem ele o leitor de tela ignora o
                 <svg> e a identidade fica só na cor. */
              role="img"
              aria-label="Estrela do Norte"
            />
          )}
          {objetivo.titulo}
        </span>
        <span className="block pt-0.5 text-xs text-muted-foreground">
          {objetivo.ciclo} · {resumo}
        </span>
      </span>
      <Target className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}
