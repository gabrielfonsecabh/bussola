import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  Download,
  FileText,
  Pencil,
  Plus,
  Route,
  ShieldAlert,
  Workflow,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CarregandoTabela, EstadoDaTela, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listarAreas } from '@/features/admin/api'
import { listarCategoriasDeProcesso } from '@/features/processos/api'
import { PainelDoPop } from '@/features/processos/PainelDoPop'
import { TrilhaDeMapeamento } from '@/features/processos/TrilhaDeMapeamento'
import {
  atualizarProcesso,
  carregarInventario,
  carregarProcesso,
  carregarSipoc,
  criarProcesso,
  excluirProcesso,
  listarIndicadores,
  salvarSipoc,
  type DadosDoProcesso,
  type LinhaDoInventario,
} from '@/features/processos/api'
import { FormularioDeProcesso } from '@/features/processos/FormularioDeProcesso'
import { FormularioDeSipoc, type DadosDoSipoc } from '@/features/processos/FormularioDeSipoc'
import { PainelDoFluxo } from '@/features/processos/PainelDoFluxo'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { baixarCsv } from '@/lib/exportar'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

export function InventarioPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const [areaId, setAreaId] = useState<string | null>(null)
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  // Guardamos o ID, não o objeto capturado no clique. Editar o processo muda a
  // linha no banco: com a foto do clique, o painel continuaria mostrando o dado
  // velho depois de salvar.
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [ultimoSelecionado, setUltimoSelecionado] = useState<LinhaDoInventario | null>(null)
  const [criando, setCriando] = useState(false)

  const podeEditar = podeFazer('processo.edit')

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  const categorias = useQuery({
    queryKey: chaves.categoriasDeProcesso(empresaId, areaId),
    enabled: !!empresaId,
    queryFn: () => listarCategoriasDeProcesso(empresaId!, areaId),
  })

  const consulta = useQuery({
    queryKey: chaves.processos(empresaId, areaId, categoriaId),
    enabled: !!empresaId,
    /* A categoria viaja até o banco. Filtrar no navegador funcionaria com
       poucas linhas e deixaria de funcionar exatamente quando o inventário
       crescesse a ponto de o filtro importar. */
    queryFn: () => carregarInventario(empresaId!, areaId, categoriaId),
  })

  const linhas = useMemo(() => consulta.data ?? [], [consulta.data])

  const criar = useMutation({
    mutationFn: (dados: DadosDoProcesso) => criarProcesso(empresaId!, dados),
    onSuccess: (processo) => {
      setCriando(false)
      criar.reset()
      // Prefixo, e não a chave exata: o inventário fica em cache por recorte de
      // área, e invalidar só o recorte aberto deixaria os outros mostrando a
      // lista de antes da gravação quando o usuário trocasse o filtro.
      void queryClient.invalidateQueries({ queryKey: ['processos'] })
      // Abre o painel do que acabou de ser criado: o processo nasce sem SIPOC,
      // e é lá que ele deixa de ser um cadastro incompleto. Só faz sentido
      // quando ele cabe no recorte aberto, senão o painel nunca acha a linha.
      if (!areaId || processo.area_id === areaId) {
        setSelecionadoId(processo.id)
        setUltimoSelecionado(null)
      }
    },
  })

  // Os cartões saem de `consulta.data`, e não de `linhas`. Quando a consulta
  // falha, `linhas` cai para lista vazia e os cinco números virariam zero: a
  // tabela avisaria do erro enquanto a capa afirmava "nenhum processo".
  const resumo = useMemo(() => {
    const dados = consulta.data
    if (!dados) {
      return {
        total: null,
        comSipoc: null,
        sipocPelaMetade: null,
        prontos: null,
        semDono: null,
        maturidade: null,
      }
    }
    return {
      total: dados.length,
      comSipoc: dados.filter((l) => l.tem_sipoc).length,
      sipocPelaMetade: dados.filter((l) => l.sipoc_iniciado && !l.tem_sipoc).length,
      prontos: dados.filter((l) => l.pronto_para_dmaic).length,
      semDono: dados.filter((l) => !l.dono_user_id).length,
      maturidade:
        dados.length === 0
          ? null
          : dados.reduce((s, l) => s + l.nivel_maturidade, 0) / dados.length,
    }
  }, [consulta.data])

  // Sempre a linha FRESCA da consulta. O último selecionado é só a rede de
  // segurança do instante do refetch, em que a lista fica vazia por um frame.
  const selecionado = linhas.find((l) => l.id === selecionadoId) ?? ultimoSelecionado

  function abrir(linha: LinhaDoInventario) {
    setSelecionadoId(linha.id)
    setUltimoSelecionado(linha)
  }

  function fechar() {
    setSelecionadoId(null)
    setUltimoSelecionado(null)
  }

  return (
    <Page
      title="Inventário de processos"
      description="Dono, SIPOC, maturidade e prontidão para melhoria"
      actions={
        <>
          {podeEditar && (
            <Button size="sm" onClick={() => setCriando(true)}>
              <Plus className="size-4" aria-hidden />
              Novo processo
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={linhas.length === 0}
            onClick={() =>
              baixarCsv(
                `processos-${empresaAtiva?.nome_fantasia ?? 'empresa'}`,
                linhas.map((l) => ({
                  processo: l.nome,
                  area: l.area_nome ?? '',
                  dono: l.dono_nome ?? '',
                  tipo: rotulo(rotulos.tipo_processo, l.tipo),
                  maturidade: l.nivel_maturidade,
                  tem_sipoc: l.tem_sipoc ? 'sim' : 'não',
                  indicadores_y: l.indicadores_y,
                  indicadores_x: l.indicadores_x,
                  melhorias_ativas: l.melhorias_ativas,
                  pronto_para_dmaic: l.pronto_para_dmaic ? 'sim' : 'não',
                })),
              )
            }
          >
            <Download className="size-4" aria-hidden />
            Exportar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CartaoDeMetrica rotulo="Processos" valor={resumo.total} carregando={consulta.isLoading} />
          <CartaoDeMetrica
            rotulo="Com SIPOC completo"
            valor={resumo.comSipoc}
            /* "Completo" é a mesma régua do selo da jornada: as quatro pontas
               preenchidas. Contar a linha existente deixaria o cartão verde num
               SIPOC que não diz o que entra nem o que sai, e as duas telas
               passariam a afirmar coisas opostas sobre o mesmo processo. */
            detalhe={
              resumo.total === null
                ? undefined
                : resumo.sipocPelaMetade
                  ? `de ${resumo.total} · ${resumo.sipocPelaMetade} começado(s) pela metade`
                  : `de ${resumo.total}`
            }
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Prontos para DMAIC"
            valor={resumo.prontos}
            tom="success"
            detalhe="SIPOC + ao menos um Y"
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Sem dono"
            valor={resumo.semDono}
            tom={resumo.semDono !== null && resumo.semDono > 0 ? 'warning' : 'success'}
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Maturidade média"
            valor={resumo.maturidade}
            formatar={(v) => v.toFixed(1)}
            detalhe="escala de 1 a 5"
            carregando={consulta.isLoading}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="w-72">
            <SearchableSelect
              options={(areas.data ?? []).map((a) => ({
                value: a.id,
                label: a.nome,
                description: rotulo(rotulos.tipo_area, a.tipo),
              }))}
              value={areaId}
              onChange={(v) => {
                setAreaId(v)
                /* A categoria da área anterior quase nunca existe na nova, e
                   manter o filtro mostraria "nenhum processo" sem dizer por quê. */
                setCategoriaId(null)
              }}
              placeholder="Todas as áreas"
              aria-label="Filtrar por área"
            />
          </div>

          {/* O filtro só aparece quando a empresa realmente usa categoria.
              Um seletor permanentemente vazio ensina que o campo não serve. */}
          {(categorias.data ?? []).length > 0 && (
            <div className="w-64">
              <SearchableSelect
                options={(categorias.data ?? []).map((c) => ({
                  value: c.categoria,
                  label: c.categoria,
                  description: `${c.processos} processo(s)`,
                }))}
                value={categoriaId}
                onChange={setCategoriaId}
                placeholder="Todas as categorias"
                aria-label="Filtrar por categoria"
              />
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <EstadoDaTela
            carregando={consulta.isLoading}
            erro={consulta.error}
            quantidade={linhas.length}
            aoTentarDeNovo={() => void consulta.refetch()}
            vazio={
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium">Nenhum processo cadastrado neste recorte</p>
                <p className="pt-1 text-xs text-muted-foreground">
                  O inventário é o que alimenta o item "processos e procedimentos" do Kit de
                  gestão da área.
                </p>
                {podeEditar && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setCriando(true)}
                  >
                    <Plus className="size-4" aria-hidden />
                    Cadastrar o primeiro
                  </Button>
                )}
              </div>
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Processo</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Dono</TableHead>
                    <TableHead className="text-center">Maturidade</TableHead>
                    <TableHead className="text-center">Indicadores</TableHead>
                    <TableHead>Prontidão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={l.id} onClick={() => abrir(l)} className="cursor-pointer">
                      <TableCell className="whitespace-normal">
                        <div className="w-[28rem] max-w-full">
                        <span className="block font-medium break-words">{l.nome}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[
                            l.categoria,
                            rotulo(rotulos.tipo_processo, l.tipo),
                            /* Cadência não classificada aparece por extenso: em
                               branco, a linha se lê como "roda quando dá", que é
                               afirmação que ninguém fez. */
                            l.periodicidade
                              ? rotulo(rotulos.periodicidade, l.periodicidade)
                              : l.periodicidade_origem
                                ? `cadência não classificada ("${l.periodicidade_origem}")`
                                : null,
                            l.prazo_referencia,
                            l.melhorias_ativas > 0
                              ? `${l.melhorias_ativas} melhoria(s) em andamento`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {l.pendencia_de_mapeamento && (
                          <span className="mt-1 inline-block rounded-md border border-warning/40 bg-warning-subtle px-1.5 py-0.5 text-xs text-warning-subtle-foreground">
                            Pendência: {l.pendencia_de_mapeamento}
                          </span>
                        )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {l.area_nome ?? <span className="text-xs">sem área</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {l.dono_nome ?? (
                          <span className="text-xs text-warning-subtle-foreground">sem dono</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {/* `role="img"` porque as barrinhas são a única pista do nível
                            nesta célula: sem ele o aria-label num span é ignorado e o
                            leitor de tela não recebe nada. */}
                        <span
                          role="img"
                          className="inline-flex gap-0.5"
                          aria-label={`Maturidade ${l.nivel_maturidade} de 5`}
                        >
                          {Array.from({ length: 5 }, (_, i) => (
                            <span
                              key={`${l.id}-nivel-${i + 1}`}
                              aria-hidden
                              className={
                                i < l.nivel_maturidade
                                  ? 'h-3 w-1.5 rounded-sm bg-primary'
                                  : 'h-3 w-1.5 rounded-sm bg-muted'
                              }
                            />
                          ))}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        <span className="text-foreground">{l.indicadores_y} Y</span>
                        <span className="text-muted-foreground"> · {l.indicadores_x} X</span>
                      </TableCell>
                      <TableCell>
                        {l.pronto_para_dmaic ? (
                          <Badge variant="success-subtle">pronto para DMAIC</Badge>
                        ) : (
                          <Badge variant="warning-subtle" className="gap-1">
                            <ShieldAlert className="size-3" aria-hidden />
                            {!l.tem_sipoc ? 'falta SIPOC' : 'falta indicador Y'}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </EstadoDaTela>
        </div>
      </div>

      {selecionadoId && selecionado && (
        <DetalheDoProcesso processo={selecionado} aoFechar={fechar} />
      )}

      {criando && (
        <FormularioDeProcesso
          processo={null}
          salvando={criar.isPending}
          erro={criar.error ? mensagemDeErro(criar.error) : null}
          aoFechar={() => {
            setCriando(false)
            criar.reset()
          }}
          aoSalvar={(dados) => criar.mutate(dados)}
        />
      )}
    </Page>
  )
}

/**
 * Detalhe do processo com a AÇÃO dentro dele: cadastro e SIPOC se resolvem
 * aqui, no mesmo lugar em que o usuário descobriu que faltavam.
 */
function DetalheDoProcesso({
  processo,
  aoFechar,
}: {
  processo: LinhaDoInventario
  aoFechar: () => void
}) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const podeEditar = podeFazer('processo.edit')

  const [editando, setEditando] = useState(false)
  const [editandoSipoc, setEditandoSipoc] = useState(false)
  const [vendoFluxo, setVendoFluxo] = useState(false)
  const [vendoPop, setVendoPop] = useState(false)
  const [naTrilha, setNaTrilha] = useState(false)

  // A linha do inventário é agregada e não traz a descrição nem o registro
  // completo, que é o que o formulário de edição precisa preencher.
  const cadastro = useQuery({
    queryKey: chaves.processo(processo.id),
    queryFn: () => carregarProcesso(processo.id),
  })

  const sipoc = useQuery({
    queryKey: chaves.sipoc(processo.id),
    queryFn: () => carregarSipoc(processo.id),
  })

  const indicadores = useQuery({
    queryKey: chaves.indicadoresDoProcesso(processo.id),
    queryFn: () => listarIndicadores(processo.id),
  })

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ['processos'] })
    void queryClient.invalidateQueries({ queryKey: chaves.processo(processo.id) })
    void queryClient.invalidateQueries({ queryKey: chaves.sipoc(processo.id) })
    void queryClient.invalidateQueries({ queryKey: chaves.indicadoresDoProcesso(processo.id) })
    // Processo com SIPOC é o que fecha o item "processos e procedimentos" do
    // Kit da área: sem isto o Kit continua dizendo "pendente" depois da gravação.
    void queryClient.invalidateQueries({ queryKey: ['kit'] })
  }

  const salvar = useMutation({
    mutationFn: (dados: DadosDoProcesso) => atualizarProcesso(processo.id, dados),
    onSuccess: () => {
      setEditando(false)
      salvar.reset()
      invalidar()
    },
  })

  const remover = useMutation({
    mutationFn: () => excluirProcesso(processo.id),
    onSuccess: () => {
      invalidar()
      aoFechar()
    },
  })

  const gravarSipoc = useMutation({
    mutationFn: (dados: DadosDoSipoc) =>
      salvarSipoc({ companyId: empresaId!, processoId: processo.id, ...dados }),
    onSuccess: () => {
      setEditandoSipoc(false)
      gravarSipoc.reset()
      invalidar()
    },
  })

  const s = sipoc.data
  // Abrir o formulário antes de saber se já existe SIPOC gravaria os campos
  // vazios por cima do que está no banco: o upsert não pergunta.
  const sipocIndisponivel = sipoc.isLoading || !!sipoc.error
  const emEdicao = editando && !!cadastro.data
  // O fluxo abre como camada por cima: fechar devolve o processo como estava.
  const painelDoProcessoAberto = !emEdicao && !vendoFluxo && !vendoPop && !naTrilha
  /* Sem dono ou sem SIPOC, o processo ainda não passou do cadastro: é para ele
     que a trilha existe. Note que isto usa `tem_sipoc` da LINHA, e não a
     consulta do SIPOC, porque a linha já veio com o inventário e não depende de
     mais uma leitura terminar. */
  const malMapeado = !processo.dono_user_id || !processo.tem_sipoc
  const erroDoFormulario = salvar.error ?? remover.error

  return (
    <>
      <PainelDeDetalhe
        aberto={painelDoProcessoAberto}
        largura="larga"
        aoFechar={aoFechar}
        titulo={processo.nome}
        origem={`Inventário de processos · ${processo.area_nome ?? 'sem área'} · dono ${
          processo.dono_nome ?? 'não definido'
        }`}
        acoes={
          podeEditar ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="mr-auto"
                disabled={cadastro.isLoading || !!cadastro.error}
                onClick={() => setEditando(true)}
              >
                <Pencil className="size-4" aria-hidden />
                Editar processo
              </Button>
              <Button size="sm" variant="outline" onClick={() => setVendoFluxo(true)}>
                <Workflow className="size-4" aria-hidden />
                Mapear fluxo
              </Button>
              <Button size="sm" variant="outline" onClick={() => setVendoPop(true)}>
                <FileText className="size-4" aria-hidden />
                POP
              </Button>
              {/* Processo mal mapeado ganha a TRILHA no lugar do botão de
                  SIPOC, e não além dele: a trilha já pergunta o SIPOC, e quatro
                  botões numa barra que cabe três é como se perde o principal.
                  Quem já tem dono e SIPOC não precisa de assistente, precisa do
                  atalho direto. */}
              {malMapeado ? (
                <Button size="sm" disabled={sipocIndisponivel} onClick={() => setNaTrilha(true)}>
                  <Route className="size-4" aria-hidden />
                  Mapear com a trilha
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={sipocIndisponivel}
                  onClick={() => setEditandoSipoc(true)}
                >
                  <ClipboardList className="size-4" aria-hidden />
                  Editar SIPOC
                </Button>
              )}
            </>
          ) : (
            // Sem permissão de edição o fluxo continua VISÍVEL: ele é
            // documentação do processo, e ler não muda nada.
            <>
              <Button size="sm" variant="outline" onClick={() => setVendoFluxo(true)}>
                <Workflow className="size-4" aria-hidden />
                Ver fluxo
              </Button>
              <Button size="sm" variant="outline" onClick={() => setVendoPop(true)}>
                <FileText className="size-4" aria-hidden />
                Ver POP
              </Button>
            </>
          )
        }
      >
        <div className="space-y-5">
          {cadastro.error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              O cadastro completo deste processo não pôde ser lido, então a edição fica
              indisponível: {mensagemDeErro(cadastro.error)}
            </p>
          )}

          {cadastro.data?.descricao && (
            <p className="text-sm text-muted-foreground">{cadastro.data.descricao}</p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Item rotulo="Tipo">
              <Badge variant="secondary">{rotulo(rotulos.tipo_processo, processo.tipo)}</Badge>
            </Item>
            <Item rotulo="Status">
              <Badge variant={processo.status === 'ativo' ? 'success-subtle' : 'outline'}>
                {rotulo(rotulos.status_processo, processo.status)}
              </Badge>
            </Item>
            <Item rotulo="Maturidade">
              <span className="text-sm">{processo.nivel_maturidade} de 5</span>
            </Item>
            <Item rotulo="Dono">
              <span className="text-sm">
                {processo.dono_nome ?? (
                  <span className="text-xs text-warning-subtle-foreground">sem dono</span>
                )}
              </span>
            </Item>
          </div>

          <div>
            <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              SIPOC
            </h3>
            <EstadoDaTela
              carregando={sipoc.isLoading}
              erro={sipoc.error}
              quantidade={s ? 1 : 0}
              aoTentarDeNovo={() => void sipoc.refetch()}
              carregandoNode={<CarregandoTabela linhas={2} />}
              vazio={
                <div className="space-y-2 rounded-md border border-warning/40 bg-warning-subtle p-3">
                  <p className="text-xs text-warning-subtle-foreground">
                    Este processo não tem SIPOC. Sem SIPOC não dá para abrir um projeto
                    DMAIC, e o item "processos e procedimentos" do Kit da área fica
                    incompleto.
                  </p>
                  {podeEditar && (
                    <Button size="sm" variant="outline" onClick={() => setEditandoSipoc(true)}>
                      <ClipboardList className="size-4" aria-hidden />
                      Preencher SIPOC agora
                    </Button>
                  )}
                </div>
              }
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <CampoSipoc rotulo="Suppliers" valor={s?.suppliers ?? null} />
                <CampoSipoc rotulo="Inputs" valor={s?.inputs ?? null} />
                <CampoSipoc rotulo="Outputs" valor={s?.outputs ?? null} />
                <CampoSipoc rotulo="Customers" valor={s?.customers ?? null} />
              </div>
            </EstadoDaTela>
          </div>

          <div>
            <h3 className="pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Indicadores
            </h3>
            <div className="overflow-hidden rounded-lg border border-border">
              <EstadoDaTela
                carregando={indicadores.isLoading}
                erro={indicadores.error}
                quantidade={indicadores.data?.length}
                aoTentarDeNovo={() => void indicadores.refetch()}
                vazio={
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Nenhum indicador. Um processo sem Y não tem como provar melhoria.
                  </p>
                }
              >
                <ul className="divide-y divide-border">
                  {(indicadores.data ?? []).map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-3 py-2.5">
                      <Badge variant={i.tipo === 'Y' ? 'info-subtle' : 'secondary'}>{i.tipo}</Badge>
                      <span className="min-w-0 flex-1 truncate text-sm">{i.nome}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        meta: <ValorOuSemDado valor={i.meta} className="text-foreground" />
                        {i.unidade ? ` ${i.unidade}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </EstadoDaTela>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-[11px] text-muted-foreground">Melhorias em andamento</p>
              <p className="pt-1 text-lg font-semibold">{processo.melhorias_ativas}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-[11px] text-muted-foreground">Ganho realizado acumulado</p>
              <p className="pt-1 text-lg font-semibold">
                <ValorOuSemDado valor={processo.ganho_realizado} formatar={fmt.moeda} />
              </p>
            </div>
          </div>
        </div>
      </PainelDeDetalhe>

      {emEdicao && cadastro.data && (
        <FormularioDeProcesso
          processo={cadastro.data}
          salvando={salvar.isPending}
          excluindo={remover.isPending}
          erro={erroDoFormulario ? mensagemDeErro(erroDoFormulario) : null}
          aoFechar={() => {
            setEditando(false)
            salvar.reset()
            remover.reset()
          }}
          aoSalvar={(dados) => salvar.mutate(dados)}
          aoExcluir={() => remover.mutate()}
        />
      )}

      {editandoSipoc && !sipocIndisponivel && (
        <FormularioDeSipoc
          processoNome={processo.nome}
          sipoc={s ?? null}
          salvando={gravarSipoc.isPending}
          erro={gravarSipoc.error ? mensagemDeErro(gravarSipoc.error) : null}
          aoFechar={() => {
            setEditandoSipoc(false)
            gravarSipoc.reset()
          }}
          aoSalvar={(dados) => gravarSipoc.mutate(dados)}
        />
      )}

      {vendoPop && (
        <PainelDoPop
          processoId={processo.id}
          processoNome={processo.nome}
          aoFechar={() => setVendoPop(false)}
        />
      )}

      {naTrilha && (
        <TrilhaDeMapeamento
          processoId={processo.id}
          processoNome={processo.nome}
          aoFechar={() => setNaTrilha(false)}
        />
      )}

      {vendoFluxo && (
        <PainelDoFluxo
          processoId={processo.id}
          processoNome={processo.nome}
          areaNome={processo.area_nome}
          aoFechar={() => setVendoFluxo(false)}
        />
      )}
    </>
  )
}

function Item({ rotulo: r, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <p className="pb-1 text-[11px] text-muted-foreground">{r}</p>
      {children}
    </div>
  )
}

function CampoSipoc({ rotulo: r, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="pb-1 text-[11px] font-medium text-muted-foreground">{r}</p>
      <p className="text-xs whitespace-pre-line">
        {valor ?? <span className="text-muted-foreground">não preenchido</span>}
      </p>
    </div>
  )
}
