import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Download, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { Page } from '@/components/shell/Page'
import { ActiveFiltersBar } from '@/components/ui/active-filters-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ColumnFilterHeader } from '@/components/ui/column-filter-header'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TablePagination } from '@/components/ui/table-pagination'
import { listarAreas, listarPerfisDaEmpresa } from '@/features/admin/api'
import {
  criarProjeto,
  listarProjetos,
  resumoDoPortfolio,
  FILTROS_VAZIOS,
  type DadosDoProjeto,
  type FiltrosDePortfolio,
  type ProjetoComContexto,
} from '@/features/execucao/api'
import { FormularioDeProjeto } from '@/features/execucao/FormularioDeProjeto'
import { PainelDoProjeto } from '@/features/execucao/PainelDoProjeto'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { baixarCsv } from '@/lib/exportar'
import { definirFiltro, removerFiltro, type Filtros } from '@/lib/filtros'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

const CATEGORIAS = Object.keys(rotulos.categoria_projeto)
const STATUS = Object.keys(rotulos.status_projeto)

const ROTULOS_DE_COLUNA = {
  nome: 'Projeto',
  area: 'Área',
  categoria: 'Categoria',
  status: 'Status',
  prazo: 'Prazo',
  responsavel: 'Responsável',
}

/** Traduz o objeto de filtros da UI para o formato que a API espera. */
function paraApi(filtros: Filtros, areaId: string | null): FiltrosDePortfolio {
  return {
    ...FILTROS_VAZIOS,
    areaId,
    categorias: filtros.categoria?.tipo === 'selecao' ? filtros.categoria.valor : [],
    status: filtros.status?.tipo === 'selecao' ? filtros.status.valor : [],
    responsavelId:
      filtros.responsavel?.tipo === 'selecao' ? (filtros.responsavel.valor[0] ?? null) : null,
    de: filtros.prazo?.tipo === 'intervalo' ? (filtros.prazo.valor.de ?? null) : null,
    ate: filtros.prazo?.tipo === 'intervalo' ? (filtros.prazo.valor.ate ?? null) : null,
    busca: filtros.nome?.tipo === 'texto' ? filtros.nome.valor : '',
  }
}

export function PortfolioPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()

  const [filtros, setFiltros] = useState<Filtros>({})
  const [pagina, setPagina] = useState(1)
  const [tamanho, setTamanho] = useState(25)
  // Guardamos o ID, não o objeto. Um objeto capturado na hora do clique vira
  // uma FOTO: concluir uma atividade recalcula o progresso no banco, a lista
  // refaz a consulta, e o painel continuaria mostrando o número velho.
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [ultimoSelecionado, setUltimoSelecionado] = useState<ProjetoComContexto | null>(null)
  const [criando, setCriando] = useState(false)

  const podeEditar = podeFazer('projeto.edit')

  const criar = useMutation({
    mutationFn: (dados: DadosDoProjeto) => criarProjeto(empresaId!, dados),
    onSuccess: () => {
      setCriando(false)
      criar.reset()
      void queryClient.invalidateQueries({ queryKey: ['projetos'] })
      void queryClient.invalidateQueries({ queryKey: ['portfolio-resumo'] })
      void queryClient.invalidateQueries({ queryKey: ['cronograma'] })
      void queryClient.invalidateQueries({ queryKey: ['painel-executivo'] })
    },
  })

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  const pessoas = useQuery({
    queryKey: chaves.perfis(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPerfisDaEmpresa(empresaId!),
  })

  const areaId = filtros.area?.tipo === 'selecao' ? (filtros.area.valor[0] ?? null) : null
  const filtrosApi = useMemo(() => paraApi(filtros, areaId), [filtros, areaId])

  const consulta = useQuery({
    queryKey: chaves.projetos(empresaId, filtrosApi, pagina, tamanho),
    enabled: !!empresaId,
    queryFn: () => listarProjetos(empresaId!, filtrosApi, { pagina, tamanho }),
  })

  // O rodapé vem de uma RPC agregada, com os MESMOS filtros da listagem.
  // Se ele viesse da página carregada, contradiria a tabela na página 2.
  const resumo = useQuery({
    queryKey: chaves.portfolioResumo(empresaId, filtrosApi),
    enabled: !!empresaId,
    queryFn: () => resumoDoPortfolio(empresaId!, filtrosApi),
  })

  function mudarFiltro(chave: string, valor: Parameters<typeof definirFiltro>[2] | undefined) {
    setPagina(1)
    setFiltros((f) => (valor ? definirFiltro(f, chave, valor) : removerFiltro(f, chave)))
  }

  const linhas = useMemo(() => consulta.data?.linhas ?? [], [consulta.data])
  const total = consulta.data?.total ?? 0
  const r = resumo.data

  // Sempre a linha FRESCA da consulta. O último selecionado é só a rede de
  // segurança para o instante do refetch, em que a lista fica vazia por um
  // frame: sem ele, o painel piscaria fechado e voltaria.
  const selecionado = linhas.find((p) => p.id === selecionadoId) ?? ultimoSelecionado

  function abrir(projeto: ProjetoComContexto) {
    setSelecionadoId(projeto.id)
    setUltimoSelecionado(projeto)
  }

  function fechar() {
    setSelecionadoId(null)
    setUltimoSelecionado(null)
  }

  return (
    <Page
      title="Portfólio de projetos"
      description="Projetos e iniciativas de IA da empresa ativa"
      actions={
        <>
        {podeEditar && (
          <Button size="sm" onClick={() => setCriando(true)}>
            <Plus className="size-4" aria-hidden />
            Novo projeto
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={linhas.length === 0}
          onClick={() =>
            baixarCsv(
              `portfolio-${empresaAtiva?.nome_fantasia ?? 'empresa'}`,
              linhas.map((p) => ({
                projeto: p.nome,
                area: p.areas?.nome ?? '',
                categoria: rotulo(rotulos.categoria_projeto, p.categoria),
                status: rotulo(rotulos.status_projeto, p.status),
                prioridade: rotulo(rotulos.prioridade, p.prioridade),
                inicio_previsto: p.inicio_previsto ?? '',
                termino_previsto: p.termino_previsto ?? '',
                progresso_pct: p.progresso_pct,
                okr: p.okrs?.titulo ?? '',
              })),
            )
          }
          title="Exporta exatamente o que está filtrado na tela, não a tabela inteira."
        >
          <Download className="size-4" aria-hidden />
          Exportar filtrado
        </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CartaoDeMetrica
            rotulo="Projetos no filtro"
            valor={r?.total}
            carregando={resumo.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Progresso médio"
            valor={r?.progresso_medio}
            formatar={(v) => `${v}%`}
            carregando={resumo.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Atrasados"
            valor={r?.atrasados}
            tom={r && r.atrasados > 0 ? 'destructive' : 'success'}
            carregando={resumo.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Sem responsável"
            valor={r?.sem_responsavel}
            tom={r && r.sem_responsavel > 0 ? 'warning' : 'success'}
            detalhe="projeto órfão não deveria existir"
            carregando={resumo.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Sem prazo"
            valor={r?.sem_prazo}
            tom={r && r.sem_prazo > 0 ? 'warning' : 'success'}
            carregando={resumo.isLoading}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-64"
            placeholder="Buscar por nome do projeto"
            value={filtros.nome?.tipo === 'texto' ? filtros.nome.valor : ''}
            onChange={(e) => mudarFiltro('nome', { tipo: 'texto', valor: e.target.value })}
            aria-label="Buscar projeto"
          />
          <ActiveFiltersBar
            filters={filtros}
            columnLabels={ROTULOS_DE_COLUNA}
            valueLabels={{
              categoria: (v) => rotulo(rotulos.categoria_projeto, v),
              status: (v) => rotulo(rotulos.status_projeto, v),
              area: (v) => areas.data?.find((a) => a.id === v)?.nome ?? v,
              responsavel: (v) => pessoas.data?.find((p) => p.value === v)?.label ?? v,
            }}
            onClearFilter={(c) => mudarFiltro(c, undefined)}
            onClearAll={() => {
              setFiltros({})
              setPagina(1)
            }}
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <EstadoDaTela
            carregando={consulta.isLoading}
            erro={consulta.error}
            quantidade={linhas.length}
            aoTentarDeNovo={() => void consulta.refetch()}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-64">Projeto</TableHead>
                    <TableHead>
                      <ColumnFilterHeader
                        columnKey="area"
                        label="Área"
                        filterType="selecao"
                        sortable={false}
                        options={(areas.data ?? []).map((a) => ({ value: a.id, label: a.nome }))}
                        value={filtros.area}
                        onChange={(v) => mudarFiltro('area', v)}
                      />
                    </TableHead>
                    <TableHead>
                      <ColumnFilterHeader
                        columnKey="categoria"
                        label="Categoria"
                        filterType="selecao"
                        sortable={false}
                        options={CATEGORIAS.map((c) => ({
                          value: c,
                          label: rotulo(rotulos.categoria_projeto, c),
                        }))}
                        value={filtros.categoria}
                        onChange={(v) => mudarFiltro('categoria', v)}
                      />
                    </TableHead>
                    <TableHead>
                      <ColumnFilterHeader
                        columnKey="status"
                        label="Status"
                        filterType="selecao"
                        sortable={false}
                        options={STATUS.map((s) => ({
                          value: s,
                          label: rotulo(rotulos.status_projeto, s),
                        }))}
                        value={filtros.status}
                        onChange={(v) => mudarFiltro('status', v)}
                      />
                    </TableHead>
                    <TableHead>
                      <ColumnFilterHeader
                        columnKey="prazo"
                        label="Prazo"
                        filterType="intervalo"
                        sortable={false}
                        value={filtros.prazo}
                        onChange={(v) => mudarFiltro('prazo', v)}
                      />
                    </TableHead>
                    <TableHead className="min-w-40">Progresso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((p) => {
                    const atrasado =
                      !!p.termino_previsto &&
                      p.termino_previsto < new Date().toISOString().slice(0, 10) &&
                      !['concluido', 'cancelado'].includes(p.status)
                    return (
                      <TableRow
                        key={p.id}
                        onClick={() => abrir(p)}
                        className="cursor-pointer"
                      >
                        <TableCell>
                          <span className="block font-medium">{p.nome}</span>
                          <span className="block text-xs text-muted-foreground">
                            {p.okrs?.titulo ? `OKR: ${p.okrs.titulo}` : 'sem OKR ligado'}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.areas?.nome ?? <span className="text-xs">sem área</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.categoria === 'ia' ? 'info-subtle' : 'secondary'}>
                            {rotulo(rotulos.categoria_projeto, p.categoria)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              p.status === 'concluido'
                                ? 'success-subtle'
                                : p.status === 'cancelado'
                                  ? 'destructive-subtle'
                                  : 'outline'
                            }
                          >
                            {rotulo(rotulos.status_projeto, p.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {p.termino_previsto ? (
                            <span
                              className={
                                atrasado ? 'flex items-center gap-1 text-destructive' : undefined
                              }
                            >
                              {atrasado && <AlertTriangle className="size-3.5" aria-hidden />}
                              {fmt.data(p.termino_previsto)}
                            </span>
                          ) : (
                            <span className="text-xs text-warning-subtle-foreground">
                              sem prazo
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <BarraDeProgresso
                            valor={p.progresso_pct}
                            tom={p.status === 'concluido' ? 'success' : 'primary'}
                            rotulo={`Progresso de ${p.nome}`}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </EstadoDaTela>

          <TablePagination
            page={pagina}
            pageSize={tamanho}
            totalCount={total}
            loading={consulta.isLoading}
            onPageChange={setPagina}
            onPageSizeChange={(t) => {
              setTamanho(t)
              setPagina(1)
            }}
          />
        </div>
      </div>

      {selecionadoId && selecionado && (
        <PainelDoProjeto projeto={selecionado} aoFechar={fechar} />
      )}

      {criando && (
        <FormularioDeProjeto
          projeto={null}
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
