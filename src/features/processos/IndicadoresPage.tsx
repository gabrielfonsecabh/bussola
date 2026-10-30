import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Pencil, Plus, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { GraficoDeTendencia } from '@/components/dados/GraficoDeTendencia'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EstadoDaTela, ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  atualizarIndicador,
  carregarInventario,
  carregarSerie,
  criarIndicador,
  excluirIndicador,
  listarIndicadores,
  registrarMedicao,
  type DadosDoIndicador,
  type Indicador,
  type PontoDaSerie,
} from '@/features/processos/api'
import { FormularioDeIndicador } from '@/features/processos/FormularioDeIndicador'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { fmt } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

type Grao = 'dia' | 'semana' | 'mes' | 'trimestre'

const GRAOS: { valor: Grao; rotulo: string }[] = [
  { valor: 'dia', rotulo: 'Diário' },
  { valor: 'semana', rotulo: 'Semanal' },
  { valor: 'mes', rotulo: 'Mensal' },
  { valor: 'trimestre', rotulo: 'Trimestral' },
]

function rotuloDoPeriodo(periodo: string, grao: Grao): string {
  const data = new Date(`${periodo}T12:00:00`)
  if (grao === 'trimestre') return `T${Math.ceil((data.getMonth() + 1) / 3)}/${data.getFullYear()}`
  if (grao === 'mes') return fmt.mesAno(periodo.slice(0, 7))
  return fmt.data(periodo) ?? periodo
}

export function IndicadoresPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const [processoId, setProcessoId] = useState<string | null>(null)
  const [grao, setGrao] = useState<Grao>('mes')
  const [de, setDe] = useState<string | null>(null)
  const [ate, setAte] = useState<string | null>(null)
  const [tabela, setTabela] = useState(false)
  const [medindo, setMedindo] = useState<PontoDaSerie | null>(null)
  const [criando, setCriando] = useState(false)
  // Guardamos o ID, não o objeto. Um objeto capturado na hora do clique vira uma
  // FOTO: salvar o cadastro refaz a consulta, e o diálogo continuaria montado em
  // cima da linha velha.
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [ultimoEditado, setUltimoEditado] = useState<Indicador | null>(null)

  const podeEditar = podeFazer('processo.edit')

  const processos = useQuery({
    queryKey: chaves.processos(empresaId, null),
    enabled: !!empresaId,
    queryFn: () => carregarInventario(empresaId!, null),
  })

  const serie = useQuery({
    queryKey: chaves.indicadores(processoId ?? '', de, ate, grao),
    enabled: !!processoId,
    queryFn: () => carregarSerie(processoId!, de, ate, grao),
  })

  // A série vem agregada e não traz fórmula: para EDITAR o cadastro é preciso a
  // linha inteira do indicador, e ela só existe nesta consulta.
  const indicadores = useQuery({
    queryKey: chaves.indicadoresDoProcesso(processoId ?? ''),
    enabled: !!processoId,
    queryFn: () => listarIndicadores(processoId!),
  })

  // Sempre a linha FRESCA da consulta. O último clicado é só a rede de segurança
  // para o instante do refetch, em que a lista fica vazia por um frame: sem ele o
  // diálogo se fecharia sozinho no meio da edição.
  const editando = editandoId
    ? (indicadores.data?.find((i) => i.id === editandoId) ?? ultimoEditado)
    : null

  const salvar = useMutation({
    mutationFn: (dados: DadosDoIndicador) =>
      editando ? atualizarIndicador(editando.id, dados) : criarIndicador(empresaId!, dados),
    onSuccess: () => {
      fecharFormulario()
      invalidar()
    },
  })

  const remover = useMutation({
    mutationFn: (id: string) => excluirIndicador(id),
    onSuccess: () => {
      fecharFormulario()
      invalidar()
    },
  })

  function abrirCriacao() {
    setEditandoId(null)
    setUltimoEditado(null)
    setCriando(true)
  }

  function abrirEdicao(cadastro: Indicador) {
    setCriando(false)
    setEditandoId(cadastro.id)
    setUltimoEditado(cadastro)
  }

  function fecharFormulario() {
    setCriando(false)
    setEditandoId(null)
    setUltimoEditado(null)
    salvar.reset()
    remover.reset()
  }

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ['indicadores'] })
    if (processoId) {
      void queryClient.invalidateQueries({ queryKey: chaves.indicadoresDoProcesso(processoId) })
    }
    // O inventário conta os Y e os X de cada processo, e a chave dele carrega o
    // filtro de área. Invalidar pelo prefixo alcança qualquer recorte aberto.
    void queryClient.invalidateQueries({ queryKey: ['processos'] })
  }

  /** Um indicador por gráfico: eles têm unidades diferentes, e dois eixos y
   *  no mesmo gráfico é a forma mais confiável de induzir leitura errada. */
  const porIndicador = useMemo(() => {
    const mapa = new Map<string, PontoDaSerie[]>()
    for (const p of serie.data ?? []) {
      mapa.set(p.indicador_id, [...(mapa.get(p.indicador_id) ?? []), p])
    }
    return [...mapa.values()]
  }, [serie.data])

  const primeiro = processos.data?.[0]
  if (!processoId && primeiro) setProcessoId(primeiro.id)

  const erroDoFormulario = salvar.error
    ? mensagemDeErro(salvar.error)
    : remover.error
      ? mensagemDeErro(remover.error)
      : null

  return (
    <Page
      title="Indicadores de processo"
      description="Série temporal dos Y e dos X"
      actions={
        <>
          {podeEditar && (
            <Button
              size="sm"
              disabled={!processoId}
              title={processoId ? undefined : 'Selecione um processo antes de cadastrar'}
              onClick={abrirCriacao}
            >
              <Plus className="size-4" aria-hidden />
              Novo indicador
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setTabela((v) => !v)}>
            <Table2 className="size-4" aria-hidden />
            {tabela ? 'Ver gráficos' : 'Ver tabela'}
          </Button>
          <Select value={grao} onValueChange={(v) => setGrao(v as Grao)}>
            <SelectTrigger size="sm" className="w-32" aria-label="Granularidade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRAOS.map((g) => (
                <SelectItem key={g.valor} value={g.valor}>
                  {g.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
    >
      <div className="space-y-4">
        {/* Filtros numa linha só, acima dos gráficos. */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-80 space-y-1.5">
            <Label htmlFor="ind-processo">Processo</Label>
            <SearchableSelect
              id="ind-processo"
              options={(processos.data ?? []).map((p) => ({
                value: p.id,
                label: p.nome,
                description: p.area_nome ?? undefined,
                badge: `${p.indicadores_y + p.indicadores_x} ind.`,
              }))}
              value={processoId}
              onChange={setProcessoId}
              placeholder="Selecionar processo"
              clearable={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ind-de">De</Label>
            <Input
              id="ind-de"
              type="date"
              className="h-9 w-40"
              value={de ?? ''}
              onChange={(e) => setDe(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ind-ate">Até</Label>
            <Input
              id="ind-ate"
              type="date"
              className="h-9 w-40"
              value={ate ?? ''}
              onChange={(e) => setAte(e.target.value || null)}
            />
          </div>
        </div>

        {indicadores.error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
          >
            <span className="min-w-0 flex-1">
              Os gráficos abaixo continuam válidos, mas o cadastro dos indicadores não pôde
              ser carregado e por isso a edição está indisponível. Isto NÃO quer dizer que o
              processo esteja sem indicador: {mensagemDeErro(indicadores.error)}
            </span>
            <Button variant="outline" size="xs" onClick={() => void indicadores.refetch()}>
              Tentar de novo
            </Button>
          </div>
        )}

        <EstadoDaTela
          carregando={serie.isLoading}
          erro={serie.error}
          quantidade={porIndicador.length}
          aoTentarDeNovo={() => void serie.refetch()}
          vazio={
            <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
              <p className="text-sm font-medium">
                {processoId
                  ? 'Este processo não tem indicador cadastrado'
                  : 'Selecione um processo'}
              </p>
              <p className="pt-1 text-xs text-muted-foreground">
                Sem indicador Y não dá para provar melhoria, e o processo não fica pronto para
                DMAIC.
              </p>
              {processoId && podeEditar && (
                <Button size="sm" className="mt-4" onClick={abrirCriacao}>
                  <Plus className="size-4" aria-hidden />
                  Cadastrar o primeiro indicador
                </Button>
              )}
            </div>
          }
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {porIndicador.map((pontos) => {
              const cabeca = pontos[0]
              if (!cabeca) return null
              const medicoes = pontos.filter((p) => p.periodo !== null && p.valor !== null)
              const ultimo = medicoes.at(-1)
              const cadastro =
                indicadores.data?.find((i) => i.id === cabeca.indicador_id) ?? null
              const motivoDeEditar = cadastro
                ? 'Editar indicador'
                : indicadores.error
                  ? 'O cadastro deste indicador não pôde ser carregado'
                  : 'Carregando o cadastro deste indicador'

              return (
                <article
                  key={cabeca.indicador_id}
                  className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                >
                  <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <Badge variant={cabeca.tipo === 'Y' ? 'info-subtle' : 'secondary'}>
                          {cabeca.tipo}
                        </Badge>
                        {cabeca.indicador_nome}
                      </h2>
                      <p className="pt-0.5 text-xs text-muted-foreground">
                        meta:{' '}
                        <ValorOuSemDado valor={cabeca.meta} className="text-foreground" />
                        {cabeca.unidade ? ` ${cabeca.unidade}` : ''} · último:{' '}
                        <ValorOuSemDado valor={ultimo?.valor} className="text-foreground" />
                      </p>
                    </div>
                    {podeEditar && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button size="xs" variant="outline" onClick={() => setMedindo(cabeca)}>
                          <Plus className="size-3" aria-hidden />
                          Medição
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          disabled={!cadastro}
                          title={motivoDeEditar}
                          aria-label={`Editar o indicador ${cabeca.indicador_nome}`}
                          onClick={() => cadastro && abrirEdicao(cadastro)}
                        >
                          <Pencil className="size-3" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </header>

                  <div className="p-4">
                    {tabela ? (
                      <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Período</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                              <TableHead className="text-right">Medições</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {medicoes.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                                  Sem medição no período
                                </TableCell>
                              </TableRow>
                            )}
                            {medicoes.map((p) => (
                              <TableRow key={`${p.indicador_id}-${p.periodo}`}>
                                <TableCell>{rotuloDoPeriodo(p.periodo!, grao)}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {p.valor?.toLocaleString('pt-BR')}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground tabular-nums">
                                  {p.medicoes}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <GraficoDeTendencia
                        titulo={cabeca.indicador_nome}
                        unidade={cabeca.unidade}
                        meta={cabeca.meta}
                        baseline={cabeca.baseline}
                        pontos={medicoes.map((p) => ({
                          rotulo: rotuloDoPeriodo(p.periodo!, grao),
                          valor: p.valor!,
                        }))}
                      />
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </EstadoDaTela>
      </div>

      {medindo && empresaId && (
        <DialogDeMedicao
          indicador={medindo}
          companyId={empresaId}
          aoFechar={() => setMedindo(null)}
        />
      )}

      {(criando || editando) && processoId && (
        <FormularioDeIndicador
          key={editando?.id ?? 'novo'}
          indicador={editando}
          processoId={processoId}
          salvando={salvar.isPending}
          excluindo={remover.isPending}
          erro={erroDoFormulario}
          aoFechar={fecharFormulario}
          aoSalvar={(dados) => salvar.mutate(dados)}
          aoExcluir={editando ? () => remover.mutate(editando.id) : undefined}
        />
      )}
    </Page>
  )
}

function DialogDeMedicao({
  indicador,
  companyId,
  aoFechar,
}: {
  indicador: PontoDaSerie
  companyId: string
  aoFechar: () => void
}) {
  const queryClient = useQueryClient()
  const [valor, setValor] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))

  const salvar = useMutation({
    mutationFn: () =>
      registrarMedicao({
        companyId,
        indicadorId: indicador.indicador_id,
        data,
        valor: Number(valor.replace(',', '.')),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['indicadores'] })
      aoFechar()
    },
  })

  const invalido = valor.trim() === '' || Number.isNaN(Number(valor.replace(',', '.')))

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Nova medição</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {salvar.error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground">
              {mensagemDeErro(salvar.error)}
            </p>
          )}

          <p className="text-sm">{indicador.indicador_nome}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="med-valor">
                Valor {indicador.unidade ? `(${indicador.unidade})` : ''}
              </Label>
              <Input
                id="med-valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="med-data">Data</Label>
              <Input
                id="med-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button size="sm" disabled={invalido || salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
