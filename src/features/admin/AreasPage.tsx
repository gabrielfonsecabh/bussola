import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Page } from '@/components/shell/Page'
import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
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
  atualizarArea,
  criarArea,
  excluirArea,
  listarAreas,
  listarPerfisDaEmpresa,
  type Area,
} from '@/features/admin/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { mensagemDeErro } from '@/lib/query'
import { rotulo, rotulos } from '@/lib/formato'
import { cn } from '@/lib/utils'

type NoDaArvore = Area & { filhos: NoDaArvore[]; profundidade: number }

/** Monta a árvore do organograma a partir da lista plana. */
function montarArvore(areas: Area[]): NoDaArvore[] {
  const porId = new Map<string, NoDaArvore>(
    areas.map((a) => [a.id, { ...a, filhos: [], profundidade: 0 }]),
  )
  const raizes: NoDaArvore[] = []

  for (const area of areas) {
    const no = porId.get(area.id)
    if (!no) continue
    const pai = area.parent_area_id ? porId.get(area.parent_area_id) : null
    if (pai) {
      no.profundidade = pai.profundidade + 1
      pai.filhos.push(no)
    } else {
      raizes.push(no)
    }
  }

  // A lista plana pode vir fora de ordem, então a profundidade é reaplicada
  // em cascata depois de montar a árvore.
  aprofundar(raizes, 0)
  return raizes
}

function aprofundar(nos: NoDaArvore[], nivel: number) {
  for (const no of nos) {
    no.profundidade = nivel
    aprofundar(no.filhos, nivel + 1)
  }
}

function achatar(nos: NoDaArvore[]): NoDaArvore[] {
  return nos.flatMap((no) => [no, ...achatar(no.filhos)])
}

const TIPOS = ['diretoria', 'gerencia', 'especialista', 'comite'] as const

export function AreasPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const queryClient = useQueryClient()
  const [selecionada, setSelecionada] = useState<NoDaArvore | null>(null)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const empresaId = empresaAtiva?.id ?? null
  const podeEditar = podeFazer('admin.areas')

  const consulta = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  const pessoas = useQuery({
    queryKey: chaves.perfis(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPerfisDaEmpresa(empresaId!),
  })

  const areas = useMemo(() => consulta.data ?? [], [consulta.data])
  const arvore = useMemo(() => achatar(montarArvore(areas)), [areas])

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chaves.areas(empresaId) })
  }

  const salvar = useMutation({
    mutationFn: async (dados: {
      id?: string
      nome: string
      tipo: string
      parent_area_id: string | null
      responsavel_user_id: string | null
    }) => {
      if (dados.id) {
        return atualizarArea(dados.id, {
          nome: dados.nome,
          tipo: dados.tipo,
          parent_area_id: dados.parent_area_id,
          responsavel_user_id: dados.responsavel_user_id,
        })
      }
      return criarArea({ ...dados, company_id: empresaId! })
    },
    onSuccess: () => {
      setErro(null)
      setSelecionada(null)
      setCriando(false)
      invalidar()
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  })

  const remover = useMutation({
    mutationFn: (id: string) => excluirArea(id),
    onSuccess: () => {
      setSelecionada(null)
      invalidar()
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  })

  const opcoesDePai = areas
    .filter((a) => a.id !== selecionada?.id)
    .map((a) => ({ value: a.id, label: a.nome, description: rotulo(rotulos.tipo_area, a.tipo) }))

  return (
    <Page
      title="Áreas"
      description="Organograma: diretorias, gerências, especialistas e comitês"
      actions={
        podeEditar && (
          <Button size="sm" onClick={() => { setSelecionada(null); setCriando(true) }}>
            <Plus className="size-4" aria-hidden />
            Nova área
          </Button>
        )
      }
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={arvore.length}
          aoTentarDeNovo={() => void consulta.refetch()}
          vazio={
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium">Nenhuma área cadastrada nesta empresa</p>
              <p className="pt-1 text-xs text-muted-foreground">
                O organograma é a base do desdobramento de OKR e do Kit de gestão.
              </p>
            </div>
          }
        >
          <ul className="divide-y divide-border">
            {arvore.map((area) => (
              <li key={area.id}>
                <button
                  type="button"
                  onClick={() => { setCriando(false); setSelecionada(area) }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  style={{ paddingLeft: `${1 + area.profundidade * 1.5}rem` }}
                >
                  {area.profundidade > 0 && (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{area.nome}</span>
                  <Badge
                    variant={
                      area.tipo === 'diretoria'
                        ? 'info-subtle'
                        : area.tipo === 'comite'
                          ? 'warning-subtle'
                          : 'secondary'
                    }
                  >
                    {rotulo(rotulos.tipo_area, area.tipo)}
                  </Badge>
                  <span
                    className={cn(
                      'w-40 shrink-0 truncate text-right text-xs',
                      area.responsavel_user_id ? 'text-muted-foreground' : 'text-warning-subtle-foreground',
                    )}
                  >
                    {area.responsavel_user_id
                      ? (pessoas.data?.find((p) => p.value === area.responsavel_user_id)?.label ??
                         'responsável cadastrado')
                      : 'sem responsável'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </EstadoDaTela>
      </div>

      <FormularioDeArea
        aberto={criando || !!selecionada}
        area={selecionada}
        opcoesDePai={opcoesDePai}
        pessoas={pessoas.data ?? []}
        podeEditar={podeEditar}
        erro={erro}
        salvando={salvar.isPending}
        removendo={remover.isPending}
        aoFechar={() => { setSelecionada(null); setCriando(false); setErro(null) }}
        aoSalvar={(dados) => salvar.mutate({ id: selecionada?.id, ...dados })}
        aoRemover={() => selecionada && remover.mutate(selecionada.id)}
      />
    </Page>
  )
}

function FormularioDeArea({
  aberto,
  area,
  opcoesDePai,
  pessoas,
  podeEditar,
  erro,
  salvando,
  removendo,
  aoFechar,
  aoSalvar,
  aoRemover,
}: {
  aberto: boolean
  area: Area | null
  opcoesDePai: { value: string; label: string; description?: string }[]
  pessoas: { value: string; label: string; description?: string }[]
  podeEditar: boolean
  erro: string | null
  salvando: boolean
  removendo: boolean
  aoFechar: () => void
  aoSalvar: (dados: {
    nome: string
    tipo: string
    parent_area_id: string | null
    responsavel_user_id: string | null
  }) => void
  aoRemover: () => void
}) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<string>('gerencia')
  const [pai, setPai] = useState<string | null>(null)
  const [responsavel, setResponsavel] = useState<string | null>(null)
  const [chaveDoForm, setChaveDoForm] = useState('')

  // Reinicia os campos quando o painel abre em outra área, sem useEffect.
  const chaveAtual = `${aberto}-${area?.id ?? 'novo'}`
  if (chaveAtual !== chaveDoForm) {
    setChaveDoForm(chaveAtual)
    setNome(area?.nome ?? '')
    setTipo(area?.tipo ?? 'gerencia')
    setPai(area?.parent_area_id ?? null)
    setResponsavel(area?.responsavel_user_id ?? null)
  }

  return (
    <PainelDeDetalhe
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={area ? area.nome : 'Nova área'}
      origem={area ? 'Organograma da empresa ativa' : 'Cadastro no organograma da empresa ativa'}
      acoes={
        podeEditar && (
          <>
            {area && (
              <Button
                variant="ghost"
                size="sm"
                onClick={aoRemover}
                disabled={removendo}
                className="mr-auto text-destructive hover:text-destructive"
              >
                {removendo ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
                Excluir
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={salvando || nome.trim() === ''}
              onClick={() =>
                aoSalvar({
                  nome: nome.trim(),
                  tipo,
                  parent_area_id: pai,
                  responsavel_user_id: responsavel,
                })
              }
            >
              {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Salvar
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {erro && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground">
            {erro}
          </p>
        )}

        {!podeEditar && (
          <p className="rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
            Você tem acesso de leitura a esta tela. Editar o organograma exige a permissão
            <code className="px-1">admin.areas</code>.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="area-nome">Nome</Label>
          <Input
            id="area-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={!podeEditar}
            placeholder="Ex.: Tesouraria"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="area-tipo">Tipo</Label>
          <Select value={tipo} onValueChange={setTipo} disabled={!podeEditar}>
            <SelectTrigger id="area-tipo" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {rotulo(rotulos.tipo_area, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="area-pai">Área superior</Label>
          <SearchableSelect
            id="area-pai"
            options={opcoesDePai}
            value={pai}
            onChange={setPai}
            disabled={!podeEditar}
            placeholder="Nenhuma (fica na raiz)"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="area-resp">Responsável</Label>
          <SearchableSelect
            id="area-resp"
            options={pessoas}
            value={responsavel}
            onChange={setResponsavel}
            disabled={!podeEditar}
            placeholder="Sem responsável"
          />
          <p className="text-xs text-muted-foreground">
            Só aparecem pessoas com vínculo ativo nesta empresa.
          </p>
        </div>
      </div>
    </PainelDeDetalhe>
  )
}
