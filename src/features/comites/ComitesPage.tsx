import { useQuery } from '@tanstack/react-query'
import { Plus, Route, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listarComites, type Comite } from '@/features/comites/api'
import { FormularioDeComite } from '@/features/comites/FormularioDeComite'
import { useEmpresa } from '@/hooks/use-empresa'
import { rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'
import { supabase } from '@/lib/supabase'

/**
 * FORA DE LUGAR, de propósito e temporariamente: isto pertence a
 * `src/features/comites/api.ts`, como `carregarComite(id)`, ao lado de
 * `listarComites`. Aquele arquivo é de outra frente nesta rodada, e a RPC
 * `comites_da_empresa` devolve só o agregado da lista (sem `descricao` nem
 * `coordenador_user_id`), que é justamente o que o formulário precisa para não
 * gravar campo em branco por cima do que está no banco.
 *
 * Devolve `null` em vez de levantar quando não acha: com RLS, comitê de outro
 * tenant não dá erro, vem zero linha. Quem chama precisa poder dizer "não
 * encontrado ou sem permissão" sem confundir isso com "a consulta falhou".
 */
async function carregarComite(id: string): Promise<Comite | null> {
  const { data, error } = await supabase().from('comites').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/**
 * Verde só quando existe alguma coisa para estar em dia.
 *
 * Zero comitê faria os dois cartões de alerta marcarem "0" em verde, e verde
 * aqui se lê como "nenhum fórum com problema", que é afirmação diferente de
 * "não há fórum nenhum". Sem comitê, o número é real mas não é boa notícia.
 */
function tomDoAlerta(valor: number | null, total: number | null): 'neutro' | 'warning' | 'success' {
  if (valor === null || total === null || total === 0) return 'neutro'
  return valor > 0 ? 'warning' : 'success'
}

/** "1 OKR" e "3 OKRs", em vez de "1 OKR(s)" em toda linha da tabela. */
function contagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * Cadastro dos fóruns transversais da empresa.
 *
 * O que esta tela NÃO faz, e é o ponto do modelo novo: ela não vincula item
 * nenhum ao comitê. O vínculo (comite_okrs, comite_projetos, comite_processos)
 * nasce na tela do PRÓPRIO item, porque quem sabe que um processo entra na
 * pauta é quem cuida do processo. Aqui se desenha o fórum: nome, quem conduz,
 * de quanto em quanto tempo ele acontece e quem senta na mesa.
 */
export function ComitesPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const podeGerir = podeFazer('comite.manage')

  // Guardamos o ID, e não o objeto capturado no clique: salvar muda a linha no
  // banco, e a foto do clique deixaria o painel mostrando o dado velho.
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  const consulta = useQuery({
    // `chaves.comites` ainda não existe em src/lib/chaves.ts, e aquele arquivo
    // não é desta frente. As duas chaves abaixo estão escritas na forma exata
    // que elas terão lá (['comites', empresa] e ['comite', id]), para que a
    // invalidação continue casando quando forem movidas para o lugar certo.
    queryKey: ['comites', empresaId] as const,
    enabled: !!empresaId,
    queryFn: () => listarComites(empresaId!),
  })

  const cadastro = useQuery({
    queryKey: ['comite', selecionadoId] as const,
    enabled: !!selecionadoId,
    queryFn: () => carregarComite(selecionadoId!),
  })

  const linhas = useMemo(() => consulta.data ?? [], [consulta.data])

  /* Os cartões saem de `consulta.data`, e não de `linhas`. Quando a consulta
     falha, `linhas` cai para lista vazia e os quatro números virariam zero: a
     tabela avisaria do erro enquanto a capa afirmava "nenhum comitê". */
  const resumo = useMemo(() => {
    const dados = consulta.data
    if (!dados) return { total: null, semItens: null, semMembros: null, itens: null }
    return {
      total: dados.length,
      semItens: dados.filter((c) => c.okrs + c.projetos + c.processos === 0).length,
      semMembros: dados.filter((c) => c.membros === 0).length,
      itens: dados.reduce((s, c) => s + c.okrs + c.projetos + c.processos, 0),
    }
  }, [consulta.data])

  const nomeSelecionado = linhas.find((c) => c.id === selecionadoId)?.nome ?? 'Comitê'

  function fechar() {
    setSelecionadoId(null)
    setCriando(false)
  }

  // Abrir o cadastro novo fecha o que estiver aberto. Sem isto, clicar em "Novo
  // comitê" com uma linha selecionada monta DOIS <Sheet> abertos ao mesmo tempo,
  // e o de baixo continua disputando o foco enquanto o de cima cobre a tela.
  function abrirNovo() {
    setSelecionadoId(null)
    setCriando(true)
  }

  return (
    <Page
      title="Comitês"
      description="Os fóruns transversais da empresa ativa"
      actions={
        podeGerir ? (
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="size-4" aria-hidden />
            Novo comitê
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoDeMetrica
            rotulo="Comitês ativos"
            valor={resumo.total}
            icone={Route}
            carregando={consulta.isLoading}
          />
          {/* "Vínculos" e não "itens": o mesmo projeto acompanhado por dois
              comitês entra duas vezes nesta soma, porque cada comitê o conta.
              Chamar isso de "itens acompanhados" faria a capa afirmar um número
              de itens distintos que ela não tem como calcular daqui. */}
          <CartaoDeMetrica
            rotulo="Vínculos de acompanhamento"
            valor={resumo.itens}
            detalhe="OKRs, projetos e processos somados comitê a comitê"
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Sem nenhum item"
            valor={resumo.semItens}
            tom={tomDoAlerta(resumo.semItens, resumo.total)}
            detalhe="fórum que ainda não tem pauta"
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Sem membros"
            valor={resumo.semMembros}
            icone={Users}
            tom={tomDoAlerta(resumo.semMembros, resumo.total)}
            detalhe="fórum sem lista de presença"
            carregando={consulta.isLoading}
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <EstadoDaTela
            carregando={consulta.isLoading}
            erro={consulta.error}
            quantidade={linhas.length}
            aoTentarDeNovo={() => void consulta.refetch()}
            vazio={
              /* Sem empresa ativa a consulta nem roda (`enabled`), e a lista
                 fica vazia por não ter sido feita. Afirmar "nenhum comitê
                 cadastrado NESTA EMPRESA" aí é dizer algo que a tela não
                 apurou, a respeito de uma empresa que não existe. */
              !empresaId ? (
                <p className="px-6 py-12 text-center text-xs text-muted-foreground">
                  Nenhuma empresa ativa. Comitê pertence a uma empresa, e sem ela não há
                  cadastro para listar.
                </p>
              ) : (
                <div className="mx-auto max-w-xl px-6 py-12 text-center">
                  <Route className="mx-auto size-8 text-muted-foreground" aria-hidden />
                  <p className="pt-2 text-sm font-medium">Nenhum comitê cadastrado nesta empresa</p>
                  <p className="pt-2 text-xs text-muted-foreground">
                    Comitê é um fórum TRANSVERSAL: ele acompanha OKRs, projetos e processos de
                    várias áreas ao mesmo tempo, sem ser dono de nenhum deles. O processo
                    continua na gerência que o executa, e o comitê apenas o traz para a pauta.
                  </p>
                  <p className="pt-2 text-xs text-muted-foreground">
                    Por isso o comitê não aparece no organograma: área é hierarquia (diretoria,
                    gerência, especialista) e comitê é recorte.
                  </p>
                  {podeGerir && (
                    <Button size="sm" variant="outline" className="mt-3" onClick={abrirNovo}>
                      <Plus className="size-4" aria-hidden />
                      Criar o primeiro comitê
                    </Button>
                  )}
                </div>
              )
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Comitê</TableHead>
                    <TableHead>Cadência</TableHead>
                    <TableHead>Coordenador</TableHead>
                    <TableHead className="min-w-56">Acompanha</TableHead>
                    <TableHead className="text-center">Membros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((c) => {
                    const semItens = c.okrs + c.projetos + c.processos === 0
                    return (
                      <TableRow
                        key={c.id}
                        onClick={() => setSelecionadoId(c.id)}
                        className="cursor-pointer"
                      >
                        {/* TableCell aplica whitespace-nowrap em toda célula. O nome
                            é frase, não valor curto: precisa quebrar, e o teto de
                            largura vai na div de dentro porque max-width em <td> é
                            ignorado no layout automático da tabela. */}
                        <TableCell className="whitespace-normal">
                          <div className="w-[22rem] max-w-full">
                            <span className="block font-medium break-words">{c.nome}</span>
                          </div>
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {c.cadencia ? (
                            rotulo(rotulos.periodicidade, c.cadencia)
                          ) : (
                            <span className="text-xs text-warning-subtle-foreground">
                              sem cadência definida
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {c.coordenador_nome ?? (
                            <span className="text-xs text-warning-subtle-foreground">
                              sem coordenador
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="whitespace-normal">
                          <div className="flex w-72 max-w-full flex-wrap items-center gap-1.5">
                            {/* Zero aqui é contagem REAL: a lista de vínculos foi
                                consultada e voltou vazia. O que a linha precisa dizer
                                é o que fazer a respeito, não esconder o número. */}
                            <Badge variant="outline">{contagem(c.okrs, 'OKR', 'OKRs')}</Badge>
                            <Badge variant="outline">
                              {contagem(c.projetos, 'projeto', 'projetos')}
                            </Badge>
                            <Badge variant="outline">
                              {contagem(c.processos, 'processo', 'processos')}
                            </Badge>
                            {semItens && (
                              <span className="block w-full text-xs text-warning-subtle-foreground">
                                Nada na pauta ainda. O vínculo se cria na tela do próprio
                                OKR, projeto ou processo, não aqui.
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-center">
                          {c.membros > 0 ? (
                            <span className="text-sm tabular-nums">{c.membros}</span>
                          ) : (
                            <Badge variant="warning-subtle">sem ninguém</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </EstadoDaTela>
        </div>

        <p className="text-xs text-muted-foreground">
          Um item pode ser acompanhado por mais de um comitê, e continua contando para a área
          dele no Kit, no OPR e no bônus. Para ver o comitê atravessando as áreas, use{' '}
          <Link to="/paineis/comites" className="font-medium text-primary underline-offset-4 hover:underline">
            Painéis {'>'} Comitês
          </Link>
          .
        </p>
      </div>

      {criando && (
        <FormularioDeComite comite={null} aoFechar={fechar} aoConcluir={() => setCriando(false)} />
      )}

      {selecionadoId && cadastro.data && (
        <FormularioDeComite comite={cadastro.data} aoFechar={fechar} aoConcluir={fechar} />
      )}

      {/* O painel abre mesmo enquanto o cadastro completo não chegou: fechar a
          tela inteira porque uma leitura falhou esconderia o motivo da falha. */}
      {selecionadoId && !cadastro.data && (
        <PainelDeDetalhe
          aberto
          aoFechar={fechar}
          titulo={nomeSelecionado}
          origem={`Comitês de ${empresaAtiva?.nome_fantasia ?? 'empresa'}`}
        >
          <EstadoDaTela
            carregando={cadastro.isLoading}
            erro={cadastro.error}
            quantidade={0}
            aoTentarDeNovo={() => void cadastro.refetch()}
            vazio={
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                Este comitê não foi lido. Ou ele foi excluído por outra pessoa depois que
                esta lista carregou, ou você não tem permissão para vê-lo nesta empresa.
                {cadastro.error ? ` Detalhe: ${mensagemDeErro(cadastro.error)}` : ''}
              </p>
            }
          >
            {null}
          </EstadoDaTela>
        </PainelDeDetalhe>
      )}
    </Page>
  )
}
