import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  TriangleAlert,
  Copy,
  CircleCheck,
  Building2,
  LoaderCircle,
  Lock,
  Network,
  UserRoundPlus,
  UserRoundX,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Page } from '@/components/shell/Page'
import { ActiveFiltersBar } from '@/components/ui/active-filters-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ColumnFilterHeader } from '@/components/ui/column-filter-header'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  atualizarVinculo,
  definirPapel,
  listarAreas,
  listarPessoas,
  type Area,
  type Pessoa,
  cadastrarPessoa,
  type DadosDoCadastro,
  type PessoaCadastrada,
} from '@/features/admin/api'
import { useAuth } from '@/hooks/use-auth'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { definirFiltro, removerFiltro, type Filtros } from '@/lib/filtros'
import { cn } from '@/lib/utils'
import { rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'
import { supabase } from '@/lib/supabase'

const NIVEIS = [
  'diretor',
  'gerente',
  'gerente_regional',
  'coordenador',
  'coordenador_regional',
  'especialista',
  'colaborador',
] as const

const PAPEIS = [
  'company_admin',
  'diretor',
  'gerente',
  'coordenador',
  'especialista',
  'colaborador',
] as const

const ROTULOS_DE_COLUNA = { nome: 'Nome', nivel: 'Nível', papel: 'Papel', ativo: 'Situação' }

/**
 * A lotação de cada pessoa, lida direto da tabela de vínculo.
 *
 * POR QUE ISTO ESTÁ AQUI e não em `admin/api.ts`: `app.pessoas_da_empresa`
 * (migration 0015) não projeta `company_users.area_id`, que só nasceu na 0027.
 * Sem esta leitura, o seletor de lotação gravaria e nunca conseguiria mostrar
 * o que já está gravado, que é pior do que não ter o campo.
 *
 * O lugar definitivo desta informação é a própria RPC de pessoas (uma coluna
 * `area_id`/`area_nome` a mais, sem consulta nova). Enquanto ela não ganha a
 * coluna, esta função fica aqui, isolada e comentada, em vez de a tela mentir.
 *
 * Ordena por chave ÚNICA (`id`) pela mesma razão de sempre: sem ordem estável,
 * paginação futura pula e duplica linha em silêncio.
 */
async function listarLotacoes(
  companyId: string,
): Promise<{ user_id: string; area_id: string | null }[]> {
  const { data, error } = await supabase()
    .from('company_users')
    .select('user_id, area_id')
    .eq('company_id', companyId)
    .order('id')
  if (error) throw error
  return data ?? []
}

/** Uma área pela qual a pessoa responde, já com o tamanho da alçada embaixo. */
type ItemDeAlcada = {
  id: string
  nome: string
  tipo: string
  /** Quantas áreas existem ABAIXO desta. É o que responde "diretor com vários gerentes". */
  abaixo: number
}

/**
 * Monta, por pessoa, a lista de áreas que ela responde e o que existe abaixo
 * de cada uma. Cruzamento no cliente é deliberado: são poucas áreas (dezenas),
 * já vieram para a tela por outro motivo, e uma RPC nova só para contar filhos
 * seria peso sem ganho.
 *
 * Devolve `null` quando a lista de áreas ainda não chegou. `null` não é "essa
 * pessoa não responde por nada": a tela precisa distinguir as duas coisas.
 */
function montarAlcada(areas: Area[] | undefined): Map<string, ItemDeAlcada[]> | null {
  if (!areas) return null

  const filhos = new Map<string, string[]>()
  for (const a of areas) {
    if (!a.parent_area_id) continue
    const irmaos = filhos.get(a.parent_area_id)
    if (irmaos) irmaos.push(a.id)
    else filhos.set(a.parent_area_id, [a.id])
  }

  // Varredura em largura com visitados, e não recursão ingênua: `parent_area_id`
  // não tem trava contra ciclo no banco (a tela de Áreas só impede uma área ser
  // pai de si mesma, então A -> B -> A é cadastrável). É a mesma proteção que
  // as recursivas da migration 0027 declaram com `cycle`. Sem ela, um dado
  // torto trava a tela inteira num laço infinito em vez de mostrar um número
  // estranho.
  function quantasAbaixo(raiz: string): number {
    const vistos = new Set<string>([raiz])
    const fila = [...(filhos.get(raiz) ?? [])]
    let total = 0
    while (fila.length > 0) {
      const atual = fila.pop()
      if (atual === undefined) break
      if (vistos.has(atual)) continue
      vistos.add(atual)
      total += 1
      fila.push(...(filhos.get(atual) ?? []))
    }
    return total
  }

  const porPessoa = new Map<string, ItemDeAlcada[]>()
  for (const a of areas) {
    if (!a.responsavel_user_id) continue
    const item: ItemDeAlcada = {
      id: a.id,
      nome: a.nome,
      tipo: a.tipo,
      abaixo: quantasAbaixo(a.id),
    }
    const lista = porPessoa.get(a.responsavel_user_id)
    if (lista) lista.push(item)
    else porPessoa.set(a.responsavel_user_id, [item])
  }
  return porPessoa
}

export function PessoasPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const { usuario, contexto } = useAuth()
  const queryClient = useQueryClient()
  const empresaId = empresaAtiva?.id ?? null
  const meuUserId = usuario?.id ?? null

  /**
   * DOIS gates, porque o banco tem dois, e eles NÃO são o mesmo.
   *
   * Cadastrar entra por `app.vincular_pessoa`, cujo gate aceita a chave
   * `admin.pessoas`. Editar o vínculo é UPDATE direto em `app.company_users`, e
   * a policy `company_users_update` (migration 0002) aceita SÓ administrador da
   * empresa ou super admin: a chave `admin.pessoas` não aparece nela.
   *
   * Como `admin.pessoas` vive apenas no preset `company_admin`, existe o caso
   * de alguém ter o PAPEL de administrador sem a marca `is_admin` na linha de
   * vínculo. Com um gate só, essa pessoa veria o painel inteiro habilitado e a
   * única resposta possível ao Salvar seria "nada foi gravado". Botão que só
   * sabe falhar é pior do que botão ausente.
   */
  const podeCadastrar = podeFazer('admin.pessoas')

  /**
   * O cadastro chama a Edge Function, que cria o acesso no Auth e devolve a
   * senha temporária UMA vez. Nada disso é guardado: por isso o dialog só fecha
   * por ação de quem cadastrou, e `fecharCadastro` é o único ponto que limpa o
   * resultado da memória.
   */
  const cadastro = useMutation({
    mutationFn: (dados: DadosDoCadastro) => cadastrarPessoa(empresaId!, dados),
    onSuccess: () => {
      // A lista precisa mostrar a pessoa nova, e o prefixo alcança também a
      // consulta de lotação, que é derivada da mesma origem.
      void queryClient.invalidateQueries({ queryKey: ['pessoas'] })
      void queryClient.invalidateQueries({ queryKey: ['perfis'] })
    },
  })

  function fecharCadastro() {
    setConvidando(false)
    cadastro.reset()
  }
  const podeEditarVinculo =
    contexto?.perfil.super_admin === true || empresaAtiva?.is_admin === true

  const [filtros, setFiltros] = useState<Filtros>({})
  const [selecionada, setSelecionada] = useState<Pessoa | null>(null)
  const [convidando, setConvidando] = useState(false)

  const consulta = useQuery({
    queryKey: chaves.pessoas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPessoas(empresaId!),
  })

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  // Chave derivada da de pessoas, e não uma chave solta: invalidar
  // `chaves.pessoas(empresa)` depois de salvar já alcança esta por prefixo, e a
  // lotação nunca fica uma gravação atrás da tabela que a mostra.
  const lotacoes = useQuery({
    queryKey: [...chaves.pessoas(empresaId), 'lotacao'],
    enabled: !!empresaId,
    queryFn: () => listarLotacoes(empresaId!),
  })

  /**
   * Filtro no cliente aqui é DELIBERADO e seguro: a lista de pessoas de uma
   * empresa é pequena por natureza (dezenas), e a RLS já devolveu só o que é
   * desta empresa. Em telas de volume (projetos, atividades) o filtro vai para
   * o banco.
   */
  const pessoas = useMemo(() => {
    const todas = consulta.data ?? []
    return todas.filter((p) => {
      const fNome = filtros.nome
      if (fNome?.tipo === 'texto' && fNome.valor.trim()) {
        const alvo = `${p.nome ?? ''} ${p.email ?? ''} ${p.cargo ?? ''}`.toLowerCase()
        if (!alvo.includes(fNome.valor.toLowerCase())) return false
      }
      const fNivel = filtros.nivel
      if (fNivel?.tipo === 'selecao' && fNivel.valor.length > 0) {
        if (!fNivel.valor.includes(p.nivel)) return false
      }
      const fAtivo = filtros.ativo
      if (fAtivo?.tipo === 'selecao' && fAtivo.valor.length > 0) {
        if (!fAtivo.valor.includes(p.is_active ? 'ativo' : 'inativo')) return false
      }
      return true
    })
  }, [consulta.data, filtros])

  const areaPorId = useMemo(
    () => new Map((areas.data ?? []).map((a) => [a.id, a] as const)),
    [areas.data],
  )

  // `undefined` distingue "ainda não sei" de "sem lotação". A tela nunca pode
  // apresentar as duas do mesmo jeito: uma é fato, a outra é falta de resposta.
  const lotacaoPorPessoa = useMemo(() => {
    if (!lotacoes.data) return null
    return new Map(lotacoes.data.map((l) => [l.user_id, l.area_id] as const))
  }, [lotacoes.data])

  const alcadaPorPessoa = useMemo(() => montarAlcada(areas.data), [areas.data])

  const salvar = useMutation({
    mutationFn: async (dados: {
      user_id: string
      nivel: string
      cargo: string | null
      /** `undefined` = não mexer. Só `null` apaga a lotação. */
      area_id: string | null | undefined
      is_admin: boolean
      is_active: boolean
      papel: string | null
      papelAtual: string | null
    }) => {
      await atualizarVinculo(empresaId!, dados.user_id, {
        nivel: dados.nivel,
        cargo: dados.cargo,
        is_admin: dados.is_admin,
        is_active: dados.is_active,
        // `area_id` fica FORA do patch quando a lotação não pôde ser lida.
        // Mandar `null` ali apagaria a lotação real por causa de uma falha de
        // LEITURA, e ninguém saberia que ela existia para repor.
        ...(dados.area_id === undefined ? {} : { area_id: dados.area_id }),
      })

      // O papel só viaja quando MUDOU. `definir_papel` apaga e regrava a linha
      // de papel numa transação: repetir isso ao salvar só um cargo gastaria a
      // escrita à toa e ainda faria o gate de autorrebaixamento do banco
      // disparar numa edição que nem tocou no papel.
      if (dados.papel && dados.papel !== dados.papelAtual) {
        try {
          await definirPapel(empresaId!, dados.user_id, dados.papel)
        } catch (erro) {
          // As duas escritas NÃO são uma transação só. Dizer apenas "falhou"
          // mandaria o usuário repetir tudo achando que nada passou, quando
          // cargo, nível, lotação e situação já estão gravados. A frase do
          // banco (por exemplo a recusa de rebaixar o próprio acesso de
          // administrador) vai inteira no fim, sem tradução nossa por cima.
          throw new Error(
            'Cargo, nível, lotação e situação foram gravados. O papel NÃO mudou: ' +
              mensagemDeErro(erro),
            // `cause` preserva o erro do PostgREST (código 22023 do gate de
            // autorrebaixamento, 42501 de permissão) para quem for depurar.
            { cause: erro },
          )
        }
      }
    },
    onSuccess: () => setSelecionada(null),
    // Invalida também quando o papel falha: o vínculo já mudou no banco, e a
    // tabela atrás do painel continuaria exibindo o estado anterior à gravação.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chaves.pessoas(empresaId) })
      void queryClient.invalidateQueries({ queryKey: chaves.perfis(empresaId) })
    },
  })

  return (
    <Page
      title="Pessoas"
      description="Vínculos, lotação, níveis e papéis nesta empresa"
      actions={
        podeCadastrar ? (
          <Button size="sm" onClick={() => setConvidando(true)}>
            <UserRoundPlus className="size-4" aria-hidden />
            Cadastrar pessoa
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          O cadastro do usuário (e-mail e senha) vive no Auth do Supabase. Aqui você
          administra o vínculo dele com esta empresa: lotação, nível, cargo, papel e se está
          ativo. Desativar alguém tira o acesso na hora, porque <code>has_permission</code>{' '}
          exige vínculo ativo.
        </p>

        <ActiveFiltersBar
          filters={filtros}
          columnLabels={ROTULOS_DE_COLUNA}
          valueLabels={{ nivel: (v) => rotulo(rotulos.nivel_usuario, v) }}
          onClearFilter={(c) => setFiltros((f) => removerFiltro(f, c))}
          onClearAll={() => setFiltros({})}
        />

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <EstadoDaTela
            carregando={consulta.isLoading}
            erro={consulta.error}
            quantidade={pessoas.length}
            aoTentarDeNovo={() => void consulta.refetch()}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <ColumnFilterHeader
                        columnKey="nome"
                        label="Nome"
                        filterType="texto"
                        sortable={false}
                        value={filtros.nome}
                        onChange={(v) =>
                          setFiltros((f) => (v ? definirFiltro(f, 'nome', v) : removerFiltro(f, 'nome')))
                        }
                      />
                    </TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>
                      <ColumnFilterHeader
                        columnKey="nivel"
                        label="Nível"
                        filterType="selecao"
                        sortable={false}
                        options={NIVEIS.map((n) => ({
                          value: n,
                          label: rotulo(rotulos.nivel_usuario, n),
                        }))}
                        value={filtros.nivel}
                        onChange={(v) =>
                          setFiltros((f) => (v ? definirFiltro(f, 'nivel', v) : removerFiltro(f, 'nivel')))
                        }
                      />
                    </TableHead>
                    <TableHead>Lotação</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Responde por</TableHead>
                    <TableHead>
                      <ColumnFilterHeader
                        columnKey="ativo"
                        label="Situação"
                        filterType="selecao"
                        sortable={false}
                        options={[
                          { value: 'ativo', label: 'Ativo' },
                          { value: 'inativo', label: 'Inativo' },
                        ]}
                        value={filtros.ativo}
                        onChange={(v) =>
                          setFiltros((f) => (v ? definirFiltro(f, 'ativo', v) : removerFiltro(f, 'ativo')))
                        }
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pessoas.map((p) => (
                    <TableRow
                      key={p.user_id}
                      onClick={() => setSelecionada(p)}
                      className="cursor-pointer"
                    >
                      <TableCell>
                        <span className="block font-medium">{p.nome ?? 'Sem nome'}</span>
                        <span className="block text-xs text-muted-foreground">
                          {/* Sem o texto de falta, a linha some e a pessoa fica
                              parecendo um cadastro pela metade da tela, não do
                              dado. */}
                          {p.email ?? 'sem e-mail no perfil'}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">
                        {/* Cargo é frase, não valor curto: o teto de largura vai
                            numa div DENTRO da célula, porque max-width em <td> é
                            ignorado pelo layout automático de tabela. */}
                        <div className="w-40 max-w-full">
                          {p.cargo ?? <span className="text-xs">sem cargo</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{rotulo(rotulos.nivel_usuario, p.nivel)}</Badge>
                      </TableCell>
                      <CelulaDeLotacao
                        carregando={lotacoes.isLoading}
                        erro={lotacoes.error}
                        areaId={lotacaoPorPessoa?.get(p.user_id) ?? null}
                        // `undefined` enquanto a lista de áreas não chegou. Sem
                        // essa distinção, a célula diria "área fora desta
                        // empresa" só porque a outra consulta ainda voava.
                        nomeDaArea={
                          areas.data
                            ? (areaPorId.get(lotacaoPorPessoa?.get(p.user_id) ?? '')?.nome ?? null)
                            : undefined
                        }
                        // E sem isto a célula ficaria em "lendo o nome da área"
                        // para sempre quando a lista de áreas FALHA: leitura
                        // morta anunciada como leitura em andamento.
                        areasFalharam={!!areas.error}
                      />
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          {p.is_admin && <Badge variant="success-subtle">admin</Badge>}
                          {p.papeis.length > 0 ? (
                            p.papeis.map((r) => (
                              <Badge key={r} variant="outline">
                                {r}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">sem papel</span>
                          )}
                        </span>
                      </TableCell>
                      <CelulaDeAlcada
                        alcada={alcadaPorPessoa?.get(p.user_id) ?? null}
                        conhecida={alcadaPorPessoa !== null}
                        nomesDeReserva={p.areas_responsavel}
                      />
                      <TableCell>
                        {p.is_active ? (
                          <Badge variant="success-subtle">ativo</Badge>
                        ) : (
                          <Badge variant="destructive-subtle" className="gap-1">
                            <UserRoundX className="size-3" aria-hidden />
                            inativo
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

      {selecionada && (
        <EdicaoDePessoa
          pessoa={selecionada}
          podeEditar={podeEditarVinculo}
          // Serve só para explicar a leitura: quem tem a chave e não é
          // administrador merece saber POR QUE o painel está travado, já que o
          // botão de convidar, ao lado, continua funcionando para ele.
          temChaveDePessoas={podeCadastrar}
          souEu={meuUserId !== null && meuUserId === selecionada.user_id}
          areas={areas.data ?? []}
          areasCarregando={areas.isLoading}
          areasErro={areas.error}
          alcada={alcadaPorPessoa?.get(selecionada.user_id) ?? null}
          alcadaConhecida={alcadaPorPessoa !== null}
          lotacaoAtual={lotacaoPorPessoa?.get(selecionada.user_id) ?? null}
          lotacaoConhecida={lotacaoPorPessoa !== null}
          salvando={salvar.isPending}
          erro={salvar.error ? mensagemDeErro(salvar.error) : null}
          aoFechar={() => {
            setSelecionada(null)
            salvar.reset()
          }}
          aoSalvar={(dados) =>
            salvar.mutate({
              user_id: selecionada.user_id,
              papelAtual: selecionada.papeis[0] ?? null,
              ...dados,
            })
          }
        />
      )}

      {convidando && (
        <CadastrarPessoaDialog
          areas={areas.data ?? []}
          areasCarregando={areas.isLoading}
          areasErro={areas.error}
          aoFechar={fecharCadastro}
          aoCadastrar={(dados) => cadastro.mutate(dados)}
          cadastrando={cadastro.isPending}
          erro={cadastro.error ? mensagemDeErro(cadastro.error) : null}
          resultado={cadastro.data ?? null}
        />
      )}
    </Page>
  )
}

/**
 * Lotação numa célula.
 *
 * Três estados, nunca dois: "ainda lendo", "a leitura falhou" e "lida".
 * Colapsar o erro em "lotação ainda não definida" faria a tela afirmar, sobre
 * a empresa inteira, uma coisa que ela não sabe.
 */
function CelulaDeLotacao({
  carregando,
  erro,
  areaId,
  nomeDaArea,
  areasFalharam,
}: {
  carregando: boolean
  erro: unknown
  areaId: string | null
  /** `undefined` = a lista de áreas ainda não chegou; `null` = área não encontrada. */
  nomeDaArea: string | null | undefined
  /** A lista de áreas falhou: o nome não vem mais, e dizer "lendo" seria mentira. */
  areasFalharam: boolean
}) {
  if (carregando) {
    return (
      <TableCell className="text-xs text-muted-foreground">
        <span aria-busy="true">lendo...</span>
      </TableCell>
    )
  }
  if (erro) {
    return (
      <TableCell className="text-xs">
        <span className="text-warning-subtle-foreground">não foi possível ler</span>
      </TableCell>
    )
  }
  if (!areaId) {
    // Sem cor de alerta, de propósito: não ter lotação é legítimo (diretoria da
    // holding, pessoa recém-convidada). Pintar de vermelho transformaria um
    // estado normal numa fila de pendências falsa.
    return (
      <TableCell className="text-xs text-muted-foreground">lotação ainda não definida</TableCell>
    )
  }
  return (
    <TableCell className="whitespace-normal">
      <div className="flex w-40 max-w-full items-start gap-1.5">
        <Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm break-words">
          {nomeDaArea !== undefined ? (
            (nomeDaArea ?? 'área fora desta empresa')
          ) : areasFalharam ? (
            // A pessoa TEM lotação: o que faltou foi o nome dela. Dizer
            // "sem lotação" aqui inventaria um fato a partir de uma falha.
            <span className="text-warning-subtle-foreground">
              lotada, mas o nome da área não carregou
            </span>
          ) : (
            'lendo o nome da área...'
          )}
        </span>
      </div>
    </TableCell>
  )
}

/** As áreas que a pessoa responde, com o tamanho da alçada abaixo de cada uma. */
function CelulaDeAlcada({
  alcada,
  conhecida,
  nomesDeReserva,
}: {
  alcada: ItemDeAlcada[] | null
  conhecida: boolean
  /** Nomes que a própria RPC de pessoas já trouxe, usados quando `areas` não chegou. */
  nomesDeReserva: string[]
}) {
  // A lista de áreas não chegou: em vez de dizer "não responde por nada", usa o
  // que a RPC de pessoas já trouxe, só sem o enriquecimento de tipo e de filhos.
  //
  // A lista vazia aqui NÃO é falta de informação: `areas_responsavel` vem da
  // mesma RPC que trouxe a linha e já cobre todas as áreas da empresa. Chamar
  // isso de "sem informação" esconderia um fato que a tela tem na mão.
  if (!conhecida) {
    return (
      <TableCell className="whitespace-normal text-xs text-muted-foreground">
        <div className="w-56 max-w-full">
          {nomesDeReserva.length > 0 ? nomesDeReserva.join(', ') : 'não responde por área'}
        </div>
      </TableCell>
    )
  }

  if (!alcada || alcada.length === 0) {
    return (
      <TableCell className="text-xs text-muted-foreground">não responde por área</TableCell>
    )
  }

  return (
    <TableCell className="whitespace-normal">
      <div className="flex w-56 max-w-full flex-wrap gap-1">
        {alcada.map((a) => (
          <Badge key={a.id} variant="outline" className="gap-1 font-normal whitespace-normal">
            <Network className="size-3 shrink-0" aria-hidden />
            <span>
              {a.nome}
              <span className="text-muted-foreground">
                {' '}
                · {rotulo(rotulos.tipo_area, a.tipo)}
                {a.abaixo > 0 ? ` · +${a.abaixo} abaixo` : ''}
              </span>
            </span>
          </Badge>
        ))}
      </div>
    </TableCell>
  )
}

function EdicaoDePessoa({
  pessoa,
  podeEditar,
  temChaveDePessoas,
  souEu,
  areas,
  areasCarregando,
  areasErro,
  alcada,
  alcadaConhecida,
  lotacaoAtual,
  lotacaoConhecida,
  salvando,
  erro,
  aoFechar,
  aoSalvar,
}: {
  pessoa: Pessoa
  /** Espelha `company_users_update`: administrador desta empresa ou super admin. */
  podeEditar: boolean
  /** Tem `admin.pessoas` (convida), o que não é o mesmo que poder editar o vínculo. */
  temChaveDePessoas: boolean
  /** O alvo da edição sou eu mesmo. Muda o que a tela pode oferecer. */
  souEu: boolean
  areas: Area[]
  areasCarregando: boolean
  areasErro: unknown
  alcada: ItemDeAlcada[] | null
  alcadaConhecida: boolean
  lotacaoAtual: string | null
  /** false enquanto a leitura da lotação não voltou: não confunda com "sem lotação". */
  lotacaoConhecida: boolean
  salvando: boolean
  erro: string | null
  aoFechar: () => void
  aoSalvar: (dados: {
    nivel: string
    cargo: string | null
    /** `undefined` quando a lotação não pôde ser lida: a gravação não a toca. */
    area_id: string | null | undefined
    is_admin: boolean
    is_active: boolean
    papel: string | null
  }) => void
}) {
  const [nivel, setNivel] = useState(pessoa.nivel)
  const [cargo, setCargo] = useState(pessoa.cargo ?? '')
  const [admin, setAdmin] = useState(pessoa.is_admin)
  const [ativo, setAtivo] = useState(pessoa.is_active)
  const [papel, setPapel] = useState(pessoa.papeis[0] ?? '')
  const [areaId, setAreaId] = useState<string | null>(lotacaoAtual)

  /**
   * A lotação pode chegar DEPOIS do painel abrir: ela vem de uma consulta
   * própria, separada da lista de pessoas, e quem clica na linha rápido abre o
   * painel antes dela voltar.
   *
   * `useState` congela o valor inicial. Sem este ajuste, o campo ficaria em
   * "Lotação ainda não definida" para alguém que TEM lotação, e o Salvar
   * gravaria `null` por cima: a tela apagaria a área sem ninguém ter pedido,
   * que é o tipo de perda que só aparece semanas depois.
   *
   * Ajuste de estado durante o render (o padrão do React para "a prop mudou"),
   * e uma vez só: assim que a leitura chega, o campo passa a refletir o banco;
   * daí em diante quem manda é a escolha do usuário.
   */
  const [lotacaoAdotada, setLotacaoAdotada] = useState(lotacaoConhecida)
  if (lotacaoConhecida && !lotacaoAdotada) {
    setLotacaoAdotada(true)
    setAreaId(lotacaoAtual)
  }

  /**
   * Eu mesmo, e administrador: a tela para de oferecer o rebaixamento.
   *
   * O banco já recusa (`app.definir_papel`, migration 0030, com mensagem
   * própria), e essa recusa continua sendo a autoridade. Isto aqui é o outro
   * lado: não adianta o banco proteger o papel se a mesma tela deixa desmarcar
   * "administrador" ou "vínculo ativo", já que `is_company_admin` lê exatamente
   * essas duas colunas. Oferecer um botão cuja única resposta possível é um
   * erro é pior do que não oferecer.
   */
  const travadoPorSerEuAdmin = souEu && pessoa.is_admin

  const opcoesDeArea = areas.map((a) => ({
    value: a.id,
    label: a.nome,
    description: rotulo(rotulos.tipo_area, a.tipo),
  }))

  return (
    <PainelDeDetalhe
      aberto
      aoFechar={aoFechar}
      titulo={pessoa.nome ?? pessoa.email ?? 'Pessoa'}
      origem={`Vínculo com a empresa ativa · ${pessoa.email ?? 'sem e-mail'}`}
      acoes={
        podeEditar && (
          <>
            <Button variant="outline" size="sm" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={salvando}
              onClick={() =>
                aoSalvar({
                  nivel,
                  cargo: vazioVirarNulo(cargo),
                  // Leitura falhou, campo travado, nada a gravar neste campo.
                  area_id: lotacaoConhecida ? areaId : undefined,
                  is_admin: admin,
                  is_active: ativo,
                  papel: papel || null,
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
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
          >
            {erro}
          </p>
        )}

        {!podeEditar && (
          <p className="rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
            {temChaveDePessoas ? (
              <>
                Leitura apenas. Você pode convidar pessoas, mas alterar um vínculo que já
                existe é restrito a administrador desta empresa: a política de{' '}
                <code className="px-1">company_users</code> exige a marca de administrador na
                linha de vínculo, e não a chave{' '}
                <code className="px-1">admin.pessoas</code>. Peça a um administrador da
                empresa.
              </>
            ) : (
              <>
                Leitura apenas. Editar vínculos é restrito a administrador desta empresa ou
                da plataforma.
              </>
            )}
          </p>
        )}

        {travadoPorSerEuAdmin && podeEditar && (
          <div
            role="note"
            className="flex items-start gap-2.5 rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground"
          >
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Este vínculo é o seu, e ele é de administrador.</p>
              <p className="pt-0.5">
                Papel, marca de administrador e situação ficam travados aqui. Os três são o
                que sustenta o seu próprio acesso: mudar qualquer um deles fecharia a porta
                por dentro e poderia deixar a empresa sem quem administre. Peça a outro
                administrador, ou promova alguém antes.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="p-cargo">Cargo</Label>
          <Input
            id="p-cargo"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            disabled={!podeEditar}
            placeholder="Ex.: Gerente de Tesouraria"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-lotacao">Lotação</Label>
          <SearchableSelect
            id="p-lotacao"
            options={opcoesDeArea}
            value={areaId}
            onChange={setAreaId}
            placeholder={
              !lotacaoConhecida
                ? 'Lotação não pôde ser lida'
                : areasCarregando
                  ? 'Carregando áreas...'
                  : areasErro
                    ? // O seletor cai no placeholder quando nenhuma opção casa
                      // com o valor, e com a lista de áreas vazia por falha isso
                      // aconteceria mesmo para quem TEM lotação. "Ainda não
                      // definida" ali seria a tela afirmando o contrário do
                      // banco.
                      areaId
                      ? 'A pessoa tem lotação, mas a lista de áreas não carregou'
                      : 'A lista de áreas não carregou'
                    : 'Lotação ainda não definida'
            }
            // Travado quando a lotação atual não pôde ser lida: não se edita o
            // que não se conseguiu ver, sob pena de apagar por engano. Mesma
            // razão com a lista de áreas falhada: escolher entre zero opções só
            // levaria a trocar uma lotação real por nada.
            disabled={!podeEditar || areasCarregando || !lotacaoConhecida || !!areasErro}
            aria-label="Área de lotação"
          />
          <p className="text-xs text-muted-foreground">
            A área onde a pessoa trabalha. É ela que faz "a sprint da minha área" e "o Kit da
            minha área" existirem para quem não responde por área nenhuma. Deixar em branco é
            legítimo, não é pendência.
          </p>
          {!lotacaoConhecida && (
            <p role="alert" className="text-xs text-warning-subtle-foreground">
              A lotação atual não foi lida. O campo acima está em branco por causa disso, e
              não porque a pessoa esteja sem lotação. Ele fica travado até a leitura voltar,
              e salvar agora preserva o que já está no banco em vez de apagá-lo. Recarregue
              para editar a lotação.
            </p>
          )}
          {!!areasErro && (
            <p role="alert" className="text-xs text-destructive">
              A lista de áreas não carregou, e por isso está vazia. Isto não significa que a
              empresa esteja sem áreas: {mensagemDeErro(areasErro)}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-nivel">Nível</Label>
          <Select value={nivel} onValueChange={setNivel} disabled={!podeEditar}>
            <SelectTrigger id="p-nivel" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NIVEIS.map((n) => (
                <SelectItem key={n} value={n}>
                  {rotulo(rotulos.nivel_usuario, n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            O nível define o multiplicador da régua de bônus.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-papel">Papel (define as permissões)</Label>
          <Select
            value={papel}
            onValueChange={setPapel}
            disabled={!podeEditar || travadoPorSerEuAdmin}
          >
            <SelectTrigger id="p-papel" className="w-full">
              <SelectValue placeholder="Sem papel" />
            </SelectTrigger>
            <SelectContent>
              {PAPEIS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            As permissões de cada papel vêm da função SQL de preset. Veja em Permissões. A
            troca é transacional: o papel anterior sai e o novo entra na mesma gravação, sem
            passar por um instante com os dois.
          </p>
          {/* A tabela mostra um badge por papel, o seletor mostra um valor só.
              Sem esta linha, painel e tabela discordariam na cara do usuário, e
              ele concluiria que a diferença é bug de tela e não dado real. */}
          {pessoa.papeis.length > 1 && (
            <p className="rounded-md border border-warning/40 bg-warning-subtle p-2 text-xs text-warning-subtle-foreground">
              Esta pessoa tem {pessoa.papeis.length} papéis gravados (
              {pessoa.papeis.join(', ')}), e as permissões dela hoje são a soma de todos. O
              seletor acima mostra só o primeiro. Escolher um papel e salvar deixa apenas o
              escolhido; salvar sem mexer no seletor mantém os {pessoa.papeis.length} como
              estão.
            </p>
          )}
        </div>

        <div className="flex items-start gap-2.5 rounded-md border border-border p-3">
          <Checkbox
            id="p-admin"
            checked={admin}
            onCheckedChange={(v) => setAdmin(v === true)}
            disabled={!podeEditar || travadoPorSerEuAdmin}
            className="mt-0.5"
          />
          <Label htmlFor="p-admin" className="block text-sm font-normal">
            Administrador da empresa
            <span className="block text-xs text-muted-foreground">
              Passa por cima das permissões de papel dentro desta empresa.
            </span>
          </Label>
        </div>

        <div className="flex items-start gap-2.5 rounded-md border border-border p-3">
          <Checkbox
            id="p-ativo"
            checked={ativo}
            onCheckedChange={(v) => setAtivo(v === true)}
            disabled={!podeEditar || travadoPorSerEuAdmin}
            className="mt-0.5"
          />
          <Label htmlFor="p-ativo" className="block text-sm font-normal">
            Vínculo ativo
            <span className="block text-xs text-muted-foreground">
              Desmarcar tira o acesso imediatamente, inclusive as permissões de papel.
            </span>
          </Label>
        </div>

        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Network className="size-4 text-muted-foreground" aria-hidden />
            Alçada: áreas que esta pessoa responde
          </p>
          {!alcadaConhecida ? (
            // Os nomes são fato (vieram com a linha da pessoa); o que falta é só
            // o tipo de cada área e quantas ficam abaixo dela.
            <p className="text-xs text-muted-foreground">
              {pessoa.areas_responsavel.length > 0
                ? `${pessoa.areas_responsavel.join(', ')}. O tipo de cada área e o tamanho da alçada abaixo dela não aparecem porque a lista de áreas não carregou.`
                : 'Não responde por nenhuma área.'}
            </p>
          ) : !alcada || alcada.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Não responde por nenhuma área. Quem responde por uma área é definido na tela de
              Áreas, no campo de responsável, e não aqui.
            </p>
          ) : (
            <>
              <ul className="space-y-1">
                {alcada.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-medium">{a.nome}</span>
                    <Badge variant="secondary" className="font-normal">
                      {rotulo(rotulos.tipo_area, a.tipo)}
                    </Badge>
                    {a.abaixo > 0 && (
                      <span className="text-muted-foreground">
                        {a.abaixo === 1
                          ? 'e a área abaixo dela'
                          : `e as ${a.abaixo} áreas abaixo dela`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Alçada não é lotação. Responder por uma área alcança tudo que está abaixo
                dela, e é o que permite a um gerente cuidar de várias áreas e a um diretor
                enxergar as gerências dele num recorte só. Para mudar, vá em Áreas.
              </p>
            </>
          )}
        </div>
      </div>
    </PainelDeDetalhe>
  )
}

/* ==========================================================================
   Convite de pessoa
   ========================================================================== */

const esquemaDeCadastro = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail').email('E-mail inválido'),
  nome: z.string().trim().min(3, 'Informe o nome completo da pessoa'),
  cargo: z.string(),
  nivel: z.enum(NIVEIS),
  area_id: z.string(),
  papel: z.enum(PAPEIS),
})

type CamposDeCadastro = z.infer<typeof esquemaDeCadastro>

function paraCadastro(c: CamposDeCadastro): DadosDoCadastro {
  return {
    // E-mail é chave de identidade: normalizar aqui evita dois vínculos para a
    // mesma pessoa só porque alguém digitou com maiúscula.
    email: c.email.trim().toLowerCase(),
    nome: c.nome.trim(),
    cargo: vazioVirarNulo(c.cargo),
    nivel: c.nivel,
    area_id: vazioVirarNulo(c.area_id),
    papel: c.papel,
  }
}

export interface CadastrarPessoaDialogProps {
  areas: Area[]
  areasCarregando: boolean
  areasErro: unknown
  aoFechar: () => void
  /**
   * Criar o usuário no Auth exige a `service_role`, que não pode existir no
   * frontend em nenhuma hipótese. Quem cria é a Edge Function
   * `cadastrar-pessoa`, e isto aqui é quem a chama.
   */
  aoCadastrar: (dados: DadosDoCadastro) => void
  cadastrando: boolean
  erro?: string | null
  /** Preenchido DEPOIS do cadastro. É o que a tela precisa entregar a quem cadastrou. */
  resultado: PessoaCadastrada | null
}

/**
 * Cadastro de pessoa em DIALOG: é uma decisão focada sobre um registro novo, e
 * a lista atrás não precisa ser comparada campo a campo.
 *
 * O formulário fixa o contrato
 * (`DadosDoCadastro`) que a Edge Function recebe, e deixa visível tudo que
 * precisa ser decidido na hora de dar acesso a alguém.
 */
export function CadastrarPessoaDialog({
  areas,
  areasCarregando,
  areasErro,
  aoFechar,
  aoCadastrar,
  cadastrando,
  erro = null,
  resultado,
}: CadastrarPessoaDialogProps) {
  const form = useForm<CamposDeCadastro>({
    resolver: zodResolver(esquemaDeCadastro),
    defaultValues: {
      email: '',
      nome: '',
      cargo: '',
      nivel: 'colaborador',
      area_id: '',
      papel: 'colaborador',
    },
  })

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Cadastrar pessoa</DialogTitle>
          <DialogDescription className="text-xs">
            Cria o acesso e já vincula a pessoa a esta empresa com nível, cargo, lotação e
            papel. A senha temporária é gerada aqui e aparece uma única vez.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <CredenciaisGeradas resultado={resultado} aoFechar={aoFechar} />
        ) : (
        <form
          id="form-cadastro"
          noValidate
          onSubmit={form.handleSubmit((c) => aoCadastrar(paraCadastro(c)))}
          className="space-y-4"
        >
          {erro && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {erro}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cv-email">E-mail</Label>
              <Input
                id="cv-email"
                type="email"
                autoComplete="off"
                placeholder="nome@empresa.com.br"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cv-nome">Nome</Label>
              <Input
                id="cv-nome"
                autoComplete="off"
                placeholder="Ex.: Maria Souza"
                aria-invalid={!!form.formState.errors.nome}
                {...form.register('nome')}
              />
              {form.formState.errors.nome && (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.nome.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cv-cargo">Cargo</Label>
            <Input
              id="cv-cargo"
              autoComplete="off"
              placeholder="Ex.: Analista de Processos"
              {...form.register('cargo')}
            />
            <p className="text-xs text-muted-foreground">
              Texto livre, é o que aparece ao lado do nome nos seletores de dono e de
              responsável.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cv-nivel">Nível</Label>
              <Controller
                control={form.control}
                name="nivel"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cv-nivel" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NIVEIS.map((n) => (
                        <SelectItem key={n} value={n}>
                          {rotulo(rotulos.nivel_usuario, n)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Define o multiplicador da régua de bônus.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cv-papel">Papel</Label>
              <Controller
                control={form.control}
                name="papel"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cv-papel" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAPEIS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                As permissões saem da função SQL de preset, não de uma cópia na tela.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cv-area">Área de lotação</Label>
            <Controller
              control={form.control}
              name="area_id"
              render={({ field }) => (
                <SearchableSelect
                  id="cv-area"
                  options={areas.map((a) => ({
                    value: a.id,
                    label: a.nome,
                    description: rotulo(rotulos.tipo_area, a.tipo),
                  }))}
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? '')}
                  placeholder={
                    areasCarregando
                      ? 'Carregando áreas...'
                      : areasErro
                        ? 'A lista de áreas não carregou'
                        : 'Lotação ainda não definida'
                  }
                  // Com a lista falhada não há o que escolher: um seletor
                  // aberto e vazio se lê como "esta empresa não tem áreas".
                  disabled={areasCarregando || !!areasErro}
                  aria-label="Área de lotação"
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              Pode ficar em branco e ser definida depois. Sem lotação, a pessoa não aparece
              em "a minha área" de nenhuma tela, mas o acesso dela funciona normalmente.
            </p>
            {!!areasErro && (
              <p role="alert" className="text-xs text-destructive">
                A lista de áreas não carregou, e por isso está vazia. Isto não significa que
                a empresa esteja sem áreas: {mensagemDeErro(areasErro)}
              </p>
            )}
          </div>
        </form>
        )}

        {!resultado && (
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button size="sm" type="submit" form="form-cadastro" disabled={cadastrando}>
              {cadastrando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Cadastrar e gerar senha
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}


/**
 * As credenciais recém-criadas, prontas para repassar.
 *
 * A senha aparece UMA ÚNICA VEZ: o Auth guarda só o hash, então nem o sistema
 * consegue mostrá-la de novo depois. Por isso a tela não esconde a senha atrás
 * de asteriscos (quem cadastrou precisa lê-la) e por isso o aviso é explícito
 * em vez de discreto.
 *
 * O botão principal copia a MENSAGEM INTEIRA, e não só a senha: quem cadastra
 * vai colar isso num WhatsApp ou num e-mail, e montar o texto à mão é onde se
 * erra o endereço do sistema ou se esquece de avisar sobre a troca no primeiro
 * acesso.
 */
function CredenciaisGeradas({
  resultado,
  aoFechar,
}: {
  resultado: PessoaCadastrada
  aoFechar: () => void
}) {
  const [copiado, setCopiado] = useState<string | null>(null)

  const endereco = typeof window === 'undefined' ? '' : window.location.origin

  const mensagem = [
    `Acesso ao Bússola, ${resultado.nome}`,
    '',
    `Endereço: ${endereco}`,
    `Login: ${resultado.email}`,
    resultado.senha_temporaria ? `Senha temporária: ${resultado.senha_temporaria}` : null,
    '',
    resultado.senha_temporaria
      ? 'No primeiro acesso o sistema vai pedir para você criar a sua própria senha. A senha acima deixa de valer nesse momento.'
      : 'Você já tem acesso ao Bússola: entre com a sua senha de sempre.',
  ]
    .filter((l) => l !== null)
    .join('\n')

  async function copiar(texto: string, oque: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(oque)
      window.setTimeout(() => setCopiado((atual) => (atual === oque ? null : atual)), 2200)
    } catch {
      /* Área de transferência bloqueada (permissão negada, contexto inseguro).
         O texto continua selecionável na tela, então o caminho manual existe. */
      setCopiado('falhou')
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="status"
        className="flex items-start gap-2.5 rounded-md border border-success/40 bg-success-subtle p-3 text-xs text-success-subtle-foreground"
      >
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">
            {resultado.ja_existia
              ? `${resultado.nome} já tinha acesso e foi vinculada a esta empresa.`
              : `${resultado.nome} foi cadastrada e já pode entrar.`}
          </p>
          <p className="pt-0.5">{resultado.aviso}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <LinhaDeCredencial
          campo="Endereço"
          valor={endereco}
          aoCopiar={() => copiar(endereco, 'endereco')}
          copiado={copiado === 'endereco'}
        />
        <LinhaDeCredencial
          campo="Login"
          valor={resultado.email}
          aoCopiar={() => copiar(resultado.email, 'login')}
          copiado={copiado === 'login'}
        />
        {resultado.senha_temporaria && (
          <LinhaDeCredencial
            campo="Senha temporária"
            valor={resultado.senha_temporaria}
            aoCopiar={() => copiar(resultado.senha_temporaria ?? '', 'senha')}
            copiado={copiado === 'senha'}
            destaque
          />
        )}
      </div>

      {resultado.senha_temporaria && (
        <p className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Copie antes de fechar. O sistema guarda apenas o resumo criptográfico da senha,
            então ela não pode ser mostrada de novo. Se você perder, o caminho é cadastrar a
            pessoa outra vez, o que gera uma senha nova.
          </span>
        </p>
      )}

      {copiado === 'falhou' && (
        <p role="alert" className="text-xs text-destructive">
          O navegador bloqueou a cópia automática. Selecione o texto acima e copie à mão.
        </p>
      )}

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={aoFechar}>
          Fechar
        </Button>
        <Button size="sm" onClick={() => copiar(mensagem, 'mensagem')}>
          {copiado === 'mensagem' ? (
            <CircleCheck className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copiado === 'mensagem' ? 'Mensagem copiada' : 'Copiar mensagem pronta'}
        </Button>
      </DialogFooter>
    </div>
  )
}

function LinhaDeCredencial({
  campo,
  valor,
  aoCopiar,
  copiado,
  destaque = false,
}: {
  campo: string
  valor: string
  aoCopiar: () => void
  copiado: boolean
  destaque?: boolean
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">{campo}</span>
      {/* `select-all` porque o caminho manual precisa ser fácil quando a área de
          transferência estiver bloqueada. */}
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-mono text-sm select-all',
          destaque && 'font-semibold',
        )}
        title={valor}
      >
        {valor}
      </span>
      <Button
        variant="ghost"
        size="xs"
        onClick={aoCopiar}
        aria-label={copiado ? `${campo} copiado` : `Copiar ${campo.toLowerCase()}`}
      >
        {copiado ? (
          <CircleCheck className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {copiado ? 'Copiado' : 'Copiar'}
      </Button>
    </div>
  )
}
