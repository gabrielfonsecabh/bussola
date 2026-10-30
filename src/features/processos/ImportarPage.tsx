import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, FileSpreadsheet, Lock, TriangleAlert, Upload } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'

import { BarraDeProgresso } from '@/components/dados/BarraDeProgresso'
import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { carregarInventario, criarProcesso, salvarSipoc } from '@/features/processos/api'
import {
  lerPlanilhaDeProcessos,
  normalizar,
  type LinhaImportada,
  type ResultadoDaLeitura,
} from '@/features/processos/planilha'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'
import { cn } from '@/lib/utils'

/**
 * O que a tela decide sobre cada linha ANTES de importar.
 *
 * 'indefinida' não é um detalhe defensivo: enquanto a lista de processos já
 * cadastrados não puder ser lida, dizer "nova" é apostar que não existe
 * duplicata. A aposta errada cria um inventário com o mesmo processo duas
 * vezes, e ninguém volta para limpar.
 *
 * 'importada' é o que esta sessão gravou agora. Ele existe para a tabela não
 * continuar dizendo "vai entrar" sobre uma linha que ACABOU de entrar, no
 * intervalo entre a gravação e o refetch dos existentes.
 */
type EstadoDaLinha = 'nova' | 'importada' | 'ja_existe' | 'repetida' | 'indefinida'

type LinhaAnalisada = { dados: LinhaImportada; estado: EstadoDaLinha }

type DesfechoDaLinha = {
  linha: number
  nome: string
  desfecho: 'ok' | 'parcial' | 'falhou'
  /** Se o SIPOC foi mesmo gravado. `false` num desfecho 'ok' quer dizer que a
   *  planilha não trouxe origem, entrega nem destino: não havia o que gravar. */
  sipoc: boolean
  detalhe: string | null
}

/**
 * O resumo da revisão. Todo contador é `number | null` de propósito: enquanto
 * a tela não puder CONTAR, o cartão mostra "sem dado", não zero.
 */
type Analise = {
  itens: LinhaAnalisada[]
  novas: number | null
  jaExistem: number | null
  repetidas: number | null
  semCadencia: number | null
  comPendencia: number | null
  semResponsavel: number | null
}

const ESTADO: Record<
  EstadoDaLinha,
  { rotulo: string; variante: 'success-subtle' | 'info-subtle' | 'warning-subtle' | 'outline' }
> = {
  nova: { rotulo: 'vai entrar', variante: 'success-subtle' },
  importada: { rotulo: 'importada agora', variante: 'success-subtle' },
  ja_existe: { rotulo: 'já existe, não será importada', variante: 'info-subtle' },
  repetida: { rotulo: 'repetida no arquivo, não será importada', variante: 'warning-subtle' },
  indefinida: { rotulo: 'não dá para decidir', variante: 'outline' },
}

/** Plural por frase inteira, para a tela não escrever "1 processos". */
function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`
}

/**
 * Âmbar só para o que EXISTE e é maior que zero. Sem dado continua neutro:
 * uma lacuna não é um alerta, e pintar "sem dado" de âmbar transforma a falta
 * de leitura num problema do arquivo.
 */
function tomDeAlerta(valor: number | null): 'warning' | 'neutro' {
  return valor !== null && valor > 0 ? 'warning' : 'neutro'
}

export function ImportarPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const podeEditar = podeFazer('processo.edit')
  const idDoArquivo = useId()
  const idDaArea = useId()

  const [areaId, setAreaId] = useState<string | null>(null)
  const [nomeDoArquivo, setNomeDoArquivo] = useState<string | null>(null)
  const [leitura, setLeitura] = useState<ResultadoDaLeitura | null>(null)
  const [lendo, setLendo] = useState(false)
  const [erroDeLeitura, setErroDeLeitura] = useState<unknown>(null)
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null)
  const [relato, setRelato] = useState<DesfechoDaLinha[] | null>(null)
  // Trava SÍNCRONA contra clique duplo. `isPending` só desabilita o botão no
  // próximo render, e dois cliques rápidos cabem antes dele: o segundo criaria
  // o mesmo processo de novo, porque a tabela ainda diria "vai entrar".
  const gravando = useRef(false)

  const areas = useQuery({
    queryKey: chaves.areas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarAreas(empresaId!),
  })

  // Os processos que a área JÁ tem. Reaproveita a chave do inventário: é a
  // mesma pergunta, e duas chaves para o mesmo dado divergem na primeira
  // gravação.
  const existentes = useQuery({
    queryKey: chaves.processos(empresaId, areaId),
    enabled: !!empresaId && !!areaId,
    queryFn: () => carregarInventario(empresaId!, areaId),
  })

  const errosDeCabecalho = useMemo(
    () => (leitura?.erros ?? []).filter((e) => e.tipo !== 'linha'),
    [leitura],
  )
  const errosDeLinha = useMemo(
    () => (leitura?.erros ?? []).filter((e) => e.tipo === 'linha'),
    [leitura],
  )
  const cabecalhoInvalido = errosDeCabecalho.length > 0

  // As linhas que ESTA sessão já gravou, por número de linha da planilha.
  // 'parcial' entra aqui junto com 'ok': o processo foi criado, e reimportar
  // essa linha criaria um segundo processo com o mesmo nome.
  const jaGravadas = useMemo(
    () => new Set((relato ?? []).filter((d) => d.desfecho !== 'falhou').map((d) => d.linha)),
    [relato],
  )

  const analise = useMemo<Analise | null>(() => {
    // Cabeçalho que não bate = a tela não sabe de qual coluna veio o quê.
    // Qualquer prévia aqui seria chute: uma coluna existente com outro nome
    // apareceria como campo vazio em TODA linha, e a tela estaria acusando o
    // arquivo de uma falta que é dela. Sem interpretação e sem contadores.
    if (!leitura || cabecalhoInvalido) return null

    // Sem a lista de existentes (carregando ou falhou), nenhuma linha pode ser
    // classificada. Os contadores viram NULOS, não zeros.
    const jaCadastrados =
      existentes.data === undefined
        ? null
        : new Set(existentes.data.map((p) => normalizar(p.nome)))

    const vistos = new Set<string>()
    const itens: LinhaAnalisada[] = leitura.linhas.map((dados) => {
      const chave = normalizar(dados.nome)
      let estado: EstadoDaLinha
      // O que esta sessão gravou vem ANTES de tudo: a linha não volta a ser
      // "nova" nem por um instante enquanto o refetch dos existentes não chega.
      if (jaGravadas.has(dados.linha)) estado = 'importada'
      else if (jaCadastrados === null) estado = 'indefinida'
      else if (jaCadastrados.has(chave)) estado = 'ja_existe'
      // Duas linhas com o mesmo nome no mesmo arquivo: a segunda é repetição.
      // Este caso é real, e é exatamente o que apareceria se o nome fosse
      // cortado no hífen.
      else if (vistos.has(chave)) estado = 'repetida'
      else estado = 'nova'
      vistos.add(chave)
      return { dados, estado }
    })

    // Contagem sobre conjunto vazio não conta nada. Com zero linhas lidas,
    // "0 sem cadência" descreveria um arquivo que a tela não chegou a ler, e é
    // exatamente esse zero que faz alguém concluir que está tudo certo.
    if (itens.length === 0) {
      return {
        itens,
        novas: null,
        jaExistem: null,
        repetidas: null,
        semCadencia: null,
        comPendencia: null,
        semResponsavel: null,
      }
    }

    const conta = (filtro: (i: LinhaAnalisada) => boolean) => itens.filter(filtro).length

    return {
      itens,
      novas: jaCadastrados === null ? null : conta((i) => i.estado === 'nova'),
      jaExistem: jaCadastrados === null ? null : conta((i) => i.estado === 'ja_existe'),
      repetidas: jaCadastrados === null ? null : conta((i) => i.estado === 'repetida'),
      semCadencia: conta((i) => i.dados.periodicidade === null),
      comPendencia: conta((i) => i.dados.pendencia_de_mapeamento !== null),
      semResponsavel: conta((i) => !i.dados.suppliers || !i.dados.customers),
    }
  }, [leitura, cabecalhoInvalido, existentes.data, jaGravadas])

  const aImportar = analise?.itens.filter((i) => i.estado === 'nova').map((i) => i.dados) ?? []

  const importar = useMutation({
    mutationFn: async (linhas: LinhaImportada[]) => {
      const desfechos: DesfechoDaLinha[] = []

      // UMA LINHA POR VEZ, de propósito. Disparar as trinta e poucas em
      // paralelo satura o pool de conexões do PostgREST e devolve timeout em
      // parte delas: metade importada, sem saber qual metade.
      for (const [indice, l] of linhas.entries()) {
        setProgresso({ feitas: indice, total: linhas.length })
        try {
          // oxlint-disable-next-line no-await-in-loop -- sequencial é o requisito
          const processo = await criarProcesso(empresaId!, {
            nome: l.nome,
            descricao: l.descricao,
            area_id: areaId,
            dono_user_id: null,
            tipo: 'apoio',
            nivel_maturidade: 1,
            status: 'ativo',
            categoria: l.categoria,
            periodicidade: l.periodicidade,
            periodicidade_origem: l.periodicidade_origem,
            prazo_referencia: l.prazo_referencia,
            pendencia_de_mapeamento: l.pendencia_de_mapeamento,
          })

          // SIPOC só quando a planilha trouxe algo. Gravar um SIPOC com os
          // quatro campos nulos marcaria o processo como "tem SIPOC" no
          // inventário sem ter nada dentro.
          const temConteudoDeSipoc = !!(l.suppliers || l.outputs || l.customers)
          if (temConteudoDeSipoc) {
            try {
              // oxlint-disable-next-line no-await-in-loop -- sequencial é o requisito
              await salvarSipoc({
                companyId: empresaId!,
                processoId: processo.id,
                suppliers: l.suppliers,
                // A planilha não tem coluna de entrada. Null é a resposta
                // honesta: o campo continua pedindo para ser preenchido.
                inputs: null,
                outputs: l.outputs,
                customers: l.customers,
              })
            } catch (erro) {
              desfechos.push({
                linha: l.linha,
                nome: l.nome,
                desfecho: 'parcial',
                sipoc: false,
                detalhe: `Processo criado, mas o SIPOC não foi gravado: ${mensagemDeErro(erro)}`,
              })
              continue
            }
          }

          desfechos.push({
            linha: l.linha,
            nome: l.nome,
            desfecho: 'ok',
            sipoc: temConteudoDeSipoc,
            // Quando não havia origem, entrega nem destino, não houve SIPOC
            // para gravar. O relato precisa dizer isso linha a linha: contar
            // essa linha como "processo e SIPOC gravados" inventaria um
            // mapeamento que ninguém fez.
            detalhe: temConteudoDeSipoc
              ? null
              : 'Processo criado sem SIPOC: a planilha não trouxe origem, entrega nem destino nesta linha.',
          })
        } catch (erro) {
          // Uma linha que falha não derruba as outras, mas também não
          // desaparece: ela aparece no relato com o motivo.
          desfechos.push({
            linha: l.linha,
            nome: l.nome,
            desfecho: 'falhou',
            sipoc: false,
            detalhe: mensagemDeErro(erro),
          })
        }
      }

      setProgresso({ feitas: linhas.length, total: linhas.length })
      return desfechos
    },
    onSuccess: (desfechos) => {
      // Acumula POR LINHA. Uma segunda passada (para repetir só o que falhou)
      // não pode apagar do relato o que já tinha entrado na primeira.
      setRelato((anterior) => {
        const porLinha = new Map((anterior ?? []).map((d) => [d.linha, d]))
        for (const d of desfechos) porLinha.set(d.linha, d)
        return [...porLinha.values()].toSorted((a, b) => a.linha - b.linha)
      })
      // Prefixo, e não a chave exata: o inventário fica em cache por recorte de
      // área. A jornada e o Kit leem os mesmos processos e mentiriam até o
      // próximo refetch.
      void queryClient.invalidateQueries({ queryKey: ['processos'] })
      void queryClient.invalidateQueries({ queryKey: ['jornada'] })
      void queryClient.invalidateQueries({ queryKey: ['jornada-placar'] })
      // As missões da semana contam sobre os processos da área: sem isto, o
      // "faltam 3" continuaria valendo depois de entrarem trinta processos.
      void queryClient.invalidateQueries({ queryKey: ['missoes'] })
      void queryClient.invalidateQueries({ queryKey: ['kit'] })
    },
  })

  async function lerArquivo(entrada: HTMLInputElement) {
    const arquivo = entrada.files?.[0]
    if (!arquivo) return
    // Libera o input para que escolher o MESMO arquivo de novo dispare outra
    // leitura, que é o que a pessoa faz depois de corrigir a planilha.
    entrada.value = ''

    setNomeDoArquivo(arquivo.name)
    setLeitura(null)
    setErroDeLeitura(null)
    setRelato(null)
    setProgresso(null)
    importar.reset()
    setLendo(true)
    try {
      setLeitura(await lerPlanilhaDeProcessos(arquivo))
    } catch (erro) {
      setErroDeLeitura(erro)
    } finally {
      setLendo(false)
    }
  }

  if (!podeEditar) {
    return (
      <Page title="Importar planilha" description="Mapeamento de processos da área">
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="pt-2 text-sm font-medium">Você não pode importar processos</p>
          <p className="mx-auto max-w-md pt-1 text-xs text-muted-foreground">
            A importação exige a permissão <code>processo.edit</code> nesta empresa. Isto é
            apenas a tela escondendo o que você não pode fazer: o banco recusaria a gravação de
            qualquer forma. Peça a permissão a quem administra as pessoas da empresa.
          </p>
        </div>
      </Page>
    )
  }

  const importando = importar.isPending
  const areaEscolhida = !!areaId
  const quantosVaoEntrar = analise?.novas ?? null
  // Linhas lidas só é um número quando houve leitura interpretável. Com o
  // cabeçalho fora do esperado, "0 linhas" seria uma afirmação sobre o arquivo
  // que a tela não tem como fazer.
  const linhasLidas = leitura && !cabecalhoInvalido ? leitura.linhas.length : null
  // Enquanto os existentes carregam, "vai entrar" e "já existe" não têm valor:
  // o cartão mostra esqueleto em vez de um número que ainda vai mudar.
  const carregandoDuplicatas = !!analise && areaEscolhida && existentes.isLoading
  const podeImportar =
    areaEscolhida &&
    !cabecalhoInvalido &&
    !importando &&
    quantosVaoEntrar !== null &&
    quantosVaoEntrar > 0

  return (
    <Page
      title="Importar planilha"
      description="Da planilha de mapeamento da área para o inventário de processos"
    >
      <div className="space-y-5">
        {/* Passo 1: destino */}
        <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <Cabecalho
            passo={1}
            titulo="Para onde vai"
            descricao="Os processos entram na empresa ativa e na área escolhida aqui."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${idDaArea}-empresa`}>Empresa</Label>
              <Input
                id={`${idDaArea}-empresa`}
                readOnly
                value={empresaAtiva?.nome_fantasia ?? ''}
                aria-describedby={`${idDaArea}-empresa-ajuda`}
              />
              <p id={`${idDaArea}-empresa-ajuda`} className="text-xs text-muted-foreground">
                A empresa é a do seletor no topo da tela, o mesmo de todos os relatórios.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={idDaArea}>Área de destino</Label>
              <SearchableSelect
                id={idDaArea}
                options={(areas.data ?? []).map((a) => ({
                  value: a.id,
                  label: a.nome,
                  description: rotulo(rotulos.tipo_area, a.tipo),
                }))}
                value={areaId}
                onChange={(v) => {
                  setAreaId(v)
                  // Trocar de área muda quem é duplicata. Manter o relato da
                  // importação anterior na tela sugeriria que ele vale para a
                  // área nova.
                  setRelato(null)
                  setProgresso(null)
                  importar.reset()
                }}
                placeholder="Escolher a área"
                disabled={areas.isLoading || importando}
              />
              {areas.error && (
                <p role="alert" className="text-xs text-destructive-subtle-foreground">
                  A lista de áreas não pôde ser lida: {mensagemDeErro(areas.error)}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Passo 2: arquivo */}
        <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <Cabecalho
            passo={2}
            titulo="O arquivo"
            descricao="Planilha .xlsx com a primeira linha de cabeçalho: Atividade, Tempo estimado de execução, Categoria, Responsável de origem, Responsável de destino, Periodicidade, Prazo, Entrega / Resultado."
          />
          <div className="space-y-1.5">
            <Label htmlFor={idDoArquivo}>Planilha de mapeamento</Label>
            <Input
              id={idDoArquivo}
              type="file"
              accept=".xlsx"
              disabled={!areaEscolhida || importando}
              onChange={(e) => void lerArquivo(e.currentTarget)}
            />
            {!areaEscolhida && (
              <p className="text-xs text-muted-foreground">
                Escolha a área antes: é ela que diz quais processos já existem e, portanto,
                quais linhas seriam duplicata.
              </p>
            )}
            {nomeDoArquivo && (
              <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <FileSpreadsheet className="size-3.5" aria-hidden />
                {nomeDoArquivo}
                {lendo && <span>, lendo...</span>}
              </p>
            )}
          </div>

          {erroDeLeitura !== null && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              Este arquivo não pôde ser lido, então nada foi interpretado:{' '}
              {mensagemDeErro(erroDeLeitura)}
            </p>
          )}

          {cabecalhoInvalido && (
            <div
              role="alert"
              className="space-y-1 rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              <p className="font-medium">
                O cabeçalho não bate com o esperado. Nada será importado enquanto isso não for
                resolvido.
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                {errosDeCabecalho.map((e) => (
                  <li key={e.mensagem}>{e.mensagem}</li>
                ))}
              </ul>
              <p>
                Renomeie a coluna na planilha, ou confirme que a primeira linha do arquivo é
                mesmo o cabeçalho.
              </p>
            </div>
          )}

          {errosDeLinha.length > 0 && (
            <div className="space-y-1 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <p className="font-medium">
                {errosDeLinha.length === 1
                  ? '1 linha foi descartada na leitura'
                  : `${errosDeLinha.length} linhas foram descartadas na leitura`}
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                {errosDeLinha.map((e) => (
                  <li key={e.mensagem}>{e.mensagem}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Passo 3: revisão */}
        <section className="space-y-3">
          <Cabecalho
            passo={3}
            titulo="Revisão"
            descricao="O que a tela entendeu de cada linha do arquivo, e o que ficou incompleto. Os três últimos números contam TODAS as linhas lidas, inclusive as que não vão entrar."
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <CartaoDeMetrica rotulo="Linhas lidas" valor={linhasLidas} carregando={lendo} />
            <CartaoDeMetrica
              rotulo="Vão entrar"
              valor={quantosVaoEntrar}
              tom="success"
              detalhe="nome ainda não usado na área"
              carregando={lendo || carregandoDuplicatas}
            />
            <CartaoDeMetrica
              rotulo="Já existem"
              valor={analise?.jaExistem ?? null}
              tom="info"
              detalhe="não serão importadas"
              carregando={lendo || carregandoDuplicatas}
            />
            <CartaoDeMetrica
              rotulo="Sem cadência"
              valor={analise?.semCadencia ?? null}
              tom={tomDeAlerta(analise?.semCadencia ?? null)}
              detalhe="texto original preservado"
              carregando={lendo}
            />
            <CartaoDeMetrica
              rotulo="Com pendência"
              valor={analise?.comPendencia ?? null}
              tom={tomDeAlerta(analise?.comPendencia ?? null)}
              detalhe="pergunta colada no nome"
              carregando={lendo}
            />
            <CartaoDeMetrica
              rotulo="Sem responsável"
              valor={analise?.semResponsavel ?? null}
              tom={tomDeAlerta(analise?.semResponsavel ?? null)}
              detalhe="falta origem ou destino"
              carregando={lendo}
            />
          </div>

          {existentes.error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              <p>
                A lista de processos já cadastrados nesta área não pôde ser lida, então não dá
                para saber o que seria duplicata. A importação fica bloqueada de propósito:
                importar agora criaria o mesmo processo duas vezes. Detalhe:{' '}
                {mensagemDeErro(existentes.error)}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void existentes.refetch()}
              >
                Tentar de novo
              </Button>
            </div>
          )}

          {analise && analise.repetidas !== null && analise.repetidas > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              {analise.repetidas === 1
                ? '1 linha repete um nome que já aparece antes no próprio arquivo e não será importada.'
                : `${analise.repetidas} linhas repetem nomes que já aparecem antes no próprio arquivo e não serão importadas.`}{' '}
              Confira se são mesmo a mesma atividade: se forem duas coisas diferentes, elas
              precisam de nomes diferentes na planilha.
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <EstadoDaTela
              carregando={lendo}
              erro={null}
              quantidade={analise?.itens.length}
              vazio={
                <div className="px-6 py-12 text-center">
                  <Upload className="mx-auto size-8 text-muted-foreground" aria-hidden />
                  <p className="pt-2 text-sm font-medium">
                    {cabecalhoInvalido
                      ? 'O cabeçalho não bate, então nada foi interpretado'
                      : leitura
                        ? 'A planilha não trouxe nenhuma linha de atividade'
                        : 'Nenhuma planilha lida ainda'}
                  </p>
                  <p className="mx-auto max-w-md pt-1 text-xs text-muted-foreground">
                    {cabecalhoInvalido
                      ? 'Enquanto a tela não souber de qual coluna veio cada campo, uma prévia aqui seria chute: a coluna que existe com outro nome apareceria como campo vazio em toda linha. Corrija o cabeçalho acima e suba o arquivo de novo.'
                      : leitura
                        ? 'O cabeçalho foi encontrado, mas não há nenhuma linha preenchida abaixo dele.'
                        : 'Escolha a área e suba o arquivo. Nada é gravado antes de você revisar esta tabela.'}
                  </p>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14 text-right">Linha</TableHead>
                      <TableHead className="min-w-64">Processo</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Cadência</TableHead>
                      <TableHead>Origem e destino</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(analise?.itens ?? []).map(({ dados, estado }) => (
                      <TableRow key={dados.linha}>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {dados.linha}
                        </TableCell>
                        <TableCell>
                          <span className="block font-medium">{dados.nome}</span>
                          {dados.pendencia_de_mapeamento && (
                            <span className="mt-1 inline-flex items-start gap-1 rounded-md bg-warning-subtle px-1.5 py-0.5 text-xs text-warning-subtle-foreground">
                              <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                              pendência: {dados.pendencia_de_mapeamento}
                            </span>
                          )}
                          {/* A coluna "Tempo estimado de execução" da planilha
                              real não traz tempo, traz recado. Ela é nomeada
                              aqui para ninguém achar que virou minuto. */}
                          {dados.descricao && (
                            <span className="block pt-0.5 text-xs text-muted-foreground">
                              descrição (coluna de tempo): {dados.descricao}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {dados.categoria ?? 'sem categoria'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {dados.periodicidade ? (
                            <Badge variant="secondary">
                              {rotulo(rotulos.periodicidade, dados.periodicidade)}
                            </Badge>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-warning-subtle-foreground">
                              <CircleAlert className="size-3" aria-hidden />
                              sem cadência
                            </span>
                          )}
                          {/* O texto da planilha fica visível SEMPRE: é ele que
                              explica por que a cadência não foi classificada, e
                              é ele que a área precisa reler para decidir. */}
                          <span className="block pt-0.5 text-muted-foreground">
                            {dados.periodicidade_origem ?? 'periodicidade em branco'}
                            {dados.prazo_referencia ? ` · prazo: ${dados.prazo_referencia}` : ''}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="block">
                            {dados.suppliers ?? (
                              <span className="text-warning-subtle-foreground">sem origem</span>
                            )}
                          </span>
                          <span className="block text-muted-foreground">
                            para{' '}
                            {dados.customers ?? (
                              <span className="text-warning-subtle-foreground">sem destino</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ESTADO[estado].variante}>{ESTADO[estado].rotulo}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </EstadoDaTela>
          </div>
        </section>

        {/* Passo 4: importar */}
        <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <Cabecalho
            passo={4}
            titulo="Importar"
            descricao="Cada linha vira um processo de apoio, ativo, com maturidade 1. Categoria, cadência, texto original da periodicidade, prazo e pendência entram como a planilha os trouxe, e ficam nulos onde ela não trouxe nada. O dono fica em branco: a planilha não diz quem é."
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!podeImportar}
              onClick={() => {
                if (gravando.current) return
                gravando.current = true
                importar.mutate(aImportar, {
                  onSettled: () => {
                    gravando.current = false
                  },
                })
              }}
            >
              <Upload className="size-4" aria-hidden />
              {quantosVaoEntrar === null
                ? 'Importar'
                : `Importar ${plural(quantosVaoEntrar, 'processo', 'processos')}`}
            </Button>
            {importando && progresso && (
              <span className="text-xs text-muted-foreground">
                gravando {progresso.feitas} de {progresso.total}
              </span>
            )}
          </div>

          {importando && progresso && (
            <BarraDeProgresso
              valor={progresso.total === 0 ? null : (progresso.feitas / progresso.total) * 100}
              rotulo="Progresso da importação"
            />
          )}

          {!importando && relato !== null && (
            <p className="text-xs text-muted-foreground">
              O que já foi gravado aparece na tabela acima como "importada agora" e não entra de
              novo. Se alguma linha falhou, resolva o que o relato aponta e clique em importar
              outra vez: só as que faltam serão gravadas.
            </p>
          )}

          {!importando && relato === null && quantosVaoEntrar === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhuma linha nova neste arquivo: tudo o que ele traz já está cadastrado nesta área
              ou se repete dentro do próprio arquivo.
            </p>
          )}

          {importar.error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              A importação parou antes de terminar: {mensagemDeErro(importar.error)}
            </p>
          )}

          {relato && <RelatoDaImportacao desfechos={relato} />}
        </section>
      </div>
    </Page>
  )
}

function Cabecalho({
  passo,
  titulo,
  descricao,
}: {
  passo: number
  titulo: string
  descricao: string
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Passo {passo}
      </p>
      <h2 className="pt-0.5 text-sm font-semibold">{titulo}</h2>
      <p className="pt-0.5 text-xs text-muted-foreground">{descricao}</p>
    </div>
  )
}

/**
 * O relato é por LINHA, não um total.
 *
 * "32 de 34 importados" não diz quais duas ficaram de fora, e quem subiu a
 * planilha é justamente quem precisa voltar nelas.
 */
function RelatoDaImportacao({ desfechos }: { desfechos: DesfechoDaLinha[] }) {
  // 'parcial' conta como processo criado: o que faltou nele foi o SIPOC.
  const criados = desfechos.filter((d) => d.desfecho !== 'falhou').length
  const comSipoc = desfechos.filter((d) => d.sipoc).length
  // Linha que entrou sem SIPOC porque a planilha não trouxe os campos. Isto
  // NÃO é falha, e também não é um SIPOC: por isso aparece separado, e não
  // somado ao número de cima como se fosse mapeamento pronto.
  const semConteudoDeSipoc = desfechos.filter((d) => d.desfecho === 'ok' && !d.sipoc).length
  const parciais = desfechos.filter((d) => d.desfecho === 'parcial').length
  const falharam = desfechos.filter((d) => d.desfecho === 'falhou').length

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="success-subtle" className="gap-1">
          <CircleCheck className="size-3" aria-hidden />
          {plural(criados, 'processo criado', 'processos criados')}
        </Badge>
        {comSipoc > 0 && (
          <Badge variant="info-subtle" className="gap-1">
            {comSipoc} com SIPOC gravado
          </Badge>
        )}
        {parciais > 0 && (
          <Badge variant="warning-subtle" className="gap-1">
            <TriangleAlert className="size-3" aria-hidden />
            {plural(parciais, 'SIPOC não gravado', 'SIPOC não gravados')}
          </Badge>
        )}
        {falharam > 0 && (
          <Badge variant="destructive-subtle" className="gap-1">
            <CircleAlert className="size-3" aria-hidden />
            {plural(falharam, 'não entrou', 'não entraram')}
          </Badge>
        )}
      </div>

      {semConteudoDeSipoc > 0 && (
        <p className="text-xs text-muted-foreground">
          {`${plural(semConteudoDeSipoc, 'processo entrou sem SIPOC', 'processos entraram sem SIPOC')}: a planilha não trouxe responsável de origem, entrega nem responsável de destino nessas linhas.`}{' '}
          Um SIPOC vazio marcaria o processo como mapeado sem nada dentro, então ele continua
          pedindo o preenchimento na tela do processo.
        </p>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {desfechos.map((d) => (
          <li key={d.linha} className="flex items-start gap-3 px-3 py-2">
            <span className="w-10 shrink-0 pt-0.5 text-right text-xs text-muted-foreground">
              {d.linha}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{d.nome}</span>
              {d.detalhe && (
                <span
                  className={cn(
                    'block pt-0.5 text-xs',
                    d.desfecho === 'falhou'
                      ? 'text-destructive-subtle-foreground'
                      : d.desfecho === 'parcial'
                        ? 'text-warning-subtle-foreground'
                        : 'text-muted-foreground',
                  )}
                >
                  {d.detalhe}
                </span>
              )}
            </span>
            <Badge
              variant={
                d.desfecho === 'ok'
                  ? 'success-subtle'
                  : d.desfecho === 'parcial'
                    ? 'warning-subtle'
                    : 'destructive-subtle'
              }
              className="shrink-0 gap-1"
            >
              {d.desfecho === 'ok' ? (
                <CircleCheck className="size-3" aria-hidden />
              ) : (
                <TriangleAlert className="size-3" aria-hidden />
              )}
              {d.desfecho === 'ok'
                ? 'importada'
                : d.desfecho === 'parcial'
                  ? 'sem o SIPOC'
                  : 'falhou'}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
