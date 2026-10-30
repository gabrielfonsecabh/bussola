import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, CircleMinus, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form'
import { z } from 'zod'

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
import { Skeleton } from '@/components/ui/skeleton'
import { listarPessoas, type Pessoa } from '@/features/admin/api'
import {
  atualizarProcesso,
  carregarFluxo,
  carregarProcesso,
  carregarSipoc,
  criarEtapa,
  salvarSipoc,
  PERIODICIDADES,
  type DadosDaEtapa,
  type Processo,
  type Sipoc,
} from '@/features/processos/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

/**
 * A trilha guiada de mapeamento de UM processo.
 *
 * Por que ela existe: processos importados de planilha costumam chegar sem
 * dono, sem SIPOC e sem fluxo. Um formulário de treze campos em branco para
 * cada um faz a pessoa desistir. Uma pergunta de cada vez, com o motivo logo
 * abaixo, faz a pessoa terminar.
 *
 * Duas decisões carregam o resto do arquivo:
 *
 * 1. Cada passo GRAVA ao avançar. Quem fechar no passo 3 não perde os passos 1
 *    e 2. Acumular tudo para um "salvar" final transformaria a desistência no
 *    meio, que é o caso comum, em trabalho perdido.
 * 2. Pular não grava nada e não inventa valor. Uma trilha que preenche sozinha
 *    para "completar" o processo produz um inventário que parece mapeado e não
 *    está, que é pior do que o campo vazio.
 */

type Passo = 1 | 2 | 3 | 4 | 5

/**
 * O que aconteceu com cada passo. `ja_existia` não é sinônimo de `gravado`: o
 * resumo final precisa conseguir dizer que o fluxo não foi criado aqui.
 */
type Desfecho = 'pendente' | 'gravado' | 'pulado' | 'ja_existia'

const PASSOS: Record<Passo, { titulo: string; pergunta: string; porque: string }> = {
  1: {
    titulo: 'Dono do processo',
    pergunta: 'Quem responde por este processo?',
    porque:
      'Sem dono não há quem aprove uma mudança nem quem responda pelo resultado. É o primeiro selo da jornada e o que dá endereço às outras quatro perguntas.',
  },
  2: {
    titulo: 'Entradas (SIPOC)',
    pergunta: 'De onde vem o que entra, e o que entra?',
    porque:
      'São as duas pontas de entrada do SIPOC. Elas dizem onde o processo começa: sem esse contorno, um projeto de melhoria não consegue delimitar o problema e a fase Define fica sem escopo.',
  },
  3: {
    titulo: 'Saídas (SIPOC)',
    pergunta: 'O que sai, e quem recebe?',
    porque:
      'As duas pontas de saída. Elas dizem quando o processo terminou e quem julga se a entrega ficou boa, que é quem vai reclamar quando não ficar.',
  },
  4: {
    titulo: 'Cadência e prazo',
    pergunta: 'Qual a cadência e o prazo?',
    porque:
      'É o que separa o inventário de uma lista de nomes: a cadência diz quando o processo roda, e o prazo é a regra de calendário que a área já usa ("dia 5", "15 dias antes do vencimento").',
  },
  5: {
    titulo: 'Começo e fim do fluxo',
    pergunta: 'Qual a primeira e a última etapa do fluxo?',
    porque:
      'Duas etapas já fazem o fluxo existir e marcam onde ele começa e onde termina. O desenho completo, com responsável, sistema e tempo de cada etapa, continua em "Mapear fluxo".',
  },
}

const ORDEM_DOS_PASSOS: Passo[] = [1, 2, 3, 4, 5]
const TOTAL_DE_PASSOS = ORDEM_DOS_PASSOS.length

/**
 * Valor de opção do Radix Select, que não aceita string vazia. Ele grava NULL:
 * "ainda não sei" é resposta legítima, e é diferente de "sob demanda".
 */
const SEM_CADENCIA = 'nao_sei'

const tituloDeEtapa = z
  .string()
  .trim()
  .refine((v) => v === '' || v.length >= 3, {
    message: 'Descreva a etapa em pelo menos 3 caracteres',
  })

const esquema = z.object({
  dono_user_id: z.string().nullable(),
  suppliers: z.string(),
  inputs: z.string(),
  outputs: z.string(),
  customers: z.string(),
  periodicidade: z.string(),
  prazo_referencia: z.string(),
  etapa_inicio: tituloDeEtapa,
  etapa_fim: tituloDeEtapa,
})

type Campos = z.infer<typeof esquema>

/** Campo de texto em branco vira NULL, nunca string vazia. */
function texto(v: string | undefined): string | null {
  return vazioVirarNulo(v ?? null)
}

const CAMPOS_DO_PASSO: Record<Passo, readonly (keyof Campos)[]> = {
  1: ['dono_user_id'],
  2: ['suppliers', 'inputs'],
  3: ['outputs', 'customers'],
  4: ['periodicidade', 'prazo_referencia'],
  5: ['etapa_inicio', 'etapa_fim'],
}

export function TrilhaDeMapeamento({
  processoId,
  processoNome,
  aoFechar,
  aoConcluir,
}: {
  processoId: string
  processoNome: string
  aoFechar: () => void
  aoConcluir?: () => void
}) {
  const { empresaAtiva } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null

  // As três leituras existem para a trilha não perguntar o que já está
  // respondido e, principalmente, para não gravar por cima do que já existe.
  const processo = useQuery({
    queryKey: chaves.processo(processoId),
    queryFn: () => carregarProcesso(processoId),
  })

  const sipoc = useQuery({
    queryKey: chaves.sipoc(processoId),
    queryFn: () => carregarSipoc(processoId),
  })

  const fluxo = useQuery({
    queryKey: chaves.fluxo(processoId),
    queryFn: () => carregarFluxo(processoId),
  })

  // Mesma chave e mesma função da tela de Pessoas: duas chamadas com a chave
  // igual e formatos diferentes brigariam pelo mesmo cache.
  const pessoas = useQuery({
    queryKey: chaves.pessoas(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPessoas(empresaId!),
  })

  const carregando = processo.isLoading || sipoc.isLoading || fluxo.isLoading

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Trilha de mapeamento</DialogTitle>
          <DialogDescription className="text-xs">
            Cinco perguntas sobre{' '}
            <span className="font-medium text-foreground">{processoNome}</span>, uma de cada
            vez. Cada resposta é gravada ao avançar, então dá para parar no meio sem perder o
            que já respondeu. Todo passo pode ser pulado: pular não grava nada.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="space-y-3 py-2" aria-busy="true" aria-label="Carregando a trilha">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <Assistente
            processoId={processoId}
            empresaId={empresaId}
            cadastro={processo.data ?? null}
            cadastroIndisponivel={!!processo.error}
            sipocInicial={sipoc.data ?? null}
            sipocIndisponivel={!!sipoc.error}
            etapasExistentes={fluxo.error ? null : (fluxo.data?.length ?? 0)}
            pessoas={pessoas.data ?? null}
            pessoasCarregando={pessoas.isLoading}
            pessoasIndisponiveis={!!pessoas.error}
            aoFechar={aoFechar}
            aoConcluir={aoConcluir}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Assistente({
  processoId,
  empresaId,
  cadastro,
  cadastroIndisponivel,
  sipocInicial,
  sipocIndisponivel,
  etapasExistentes,
  pessoas,
  pessoasCarregando,
  pessoasIndisponiveis,
  aoFechar,
  aoConcluir,
}: {
  processoId: string
  empresaId: string | null
  cadastro: Processo | null
  cadastroIndisponivel: boolean
  sipocInicial: Sipoc | null
  sipocIndisponivel: boolean
  /**
   * Quantas etapas o processo já tem. `null` = não deu para ler o fluxo.
   * Lido uma vez só, na montagem (veja `fluxoAoAbrir`).
   */
  etapasExistentes: number | null
  pessoas: Pessoa[] | null
  pessoasCarregando: boolean
  pessoasIndisponiveis: boolean
  aoFechar: () => void
  aoConcluir?: () => void
}) {
  const queryClient = useQueryClient()

  const [passo, setPasso] = useState<Passo>(1)
  const [concluida, setConcluida] = useState(false)
  /**
   * O que o fluxo tinha ANTES da trilha, congelado na montagem.
   *
   * Se o insert de início der certo e o de fim falhar, a releitura do fluxo
   * passaria a devolver uma etapa, e o passo 5 trocaria de modo no meio da
   * correção: em vez do formulário de retentativa, apareceria "já existe
   * fluxo", e o resumo registraria "já existia" para a etapa que esta trilha
   * acabou de criar.
   */
  const [fluxoAoAbrir] = useState(() => etapasExistentes)
  const [desfechos, setDesfechos] = useState<Record<Passo, Desfecho>>({
    1: 'pendente',
    2: 'pendente',
    3: 'pendente',
    4: 'pendente',
    5: 'pendente',
  })
  /**
   * Criar início e fim são dois inserts. Se o segundo falhar, tentar de novo
   * duplicaria o primeiro, e um fluxo com dois "início" é pior que um fluxo
   * pela metade.
   */
  const [inicioJaCriado, setInicioJaCriado] = useState(false)

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      dono_user_id: cadastro?.dono_user_id ?? null,
      suppliers: sipocInicial?.suppliers ?? '',
      inputs: sipocInicial?.inputs ?? '',
      outputs: sipocInicial?.outputs ?? '',
      customers: sipocInicial?.customers ?? '',
      periodicidade: cadastro?.periodicidade ?? SEM_CADENCIA,
      prazo_referencia: cadastro?.prazo_referencia ?? '',
      etapa_inicio: '',
      etapa_fim: '',
    },
  })

  // `useWatch` em vez de `form.watch`: o segundo devolve função nova a cada
  // render e derrubaria a memoização do formulário inteiro.
  const valores = useWatch({ control: form.control })

  // O dono que já está gravado entra na lista mesmo se estiver inativo.
  // Filtrar só por `is_active` faria o select cair no placeholder "Ainda sem
  // dono" para um processo que TEM dono, e a trilha perguntaria de novo uma
  // coisa que já está respondida.
  const donoGravado = cadastro?.dono_user_id ?? null
  const opcoesDePessoa = (pessoas ?? [])
    .filter((p) => p.is_active || p.user_id === donoGravado)
    .map((p) => ({
      value: p.user_id,
      label: p.nome ?? p.email ?? p.user_id,
      description: p.is_active
        ? (p.cargo ?? undefined)
        : [p.cargo, 'sem acesso ativo'].filter(Boolean).join(' · '),
    }))

  // O select cai no placeholder quando não acha o valor entre as opções. Sem
  // este aviso, um dono que a lista não traz (pessoa de outra empresa, conta
  // removida) apareceria na tela como "ainda sem dono".
  const donoForaDaLista =
    pessoas !== null &&
    !!valores.dono_user_id &&
    !opcoesDePessoa.some((o) => o.value === valores.dono_user_id)

  function invalidar() {
    // Prefixo, e não a chave exata: inventário, jornada e missões ficam em
    // cache por recorte de área, e invalidar só o recorte aberto deixaria os
    // outros mostrando os selos de antes desta gravação.
    void queryClient.invalidateQueries({ queryKey: ['processos'] })
    void queryClient.invalidateQueries({ queryKey: ['jornada'] })
    void queryClient.invalidateQueries({ queryKey: ['missoes'] })
    void queryClient.invalidateQueries({ queryKey: chaves.placar(empresaId) })
    void queryClient.invalidateQueries({ queryKey: chaves.processo(processoId) })
    void queryClient.invalidateQueries({ queryKey: chaves.sipoc(processoId) })
    void queryClient.invalidateQueries({ queryKey: chaves.fluxo(processoId) })
    void queryClient.invalidateQueries({ queryKey: chaves.fluxoResumo(processoId) })
    // O POP é remontado pelo banco a partir de dono, cadência, SIPOC e etapas,
    // e traz a lista de lacunas. Sem esta linha ele continuaria apontando como
    // faltando exatamente o que a trilha acabou de preencher.
    void queryClient.invalidateQueries({ queryKey: chaves.pop(processoId) })
  }

  function limparErros() {
    gravarDono.reset()
    gravarSipoc.reset()
    gravarCadencia.reset()
    criarExtremos.reset()
  }

  function irPara(proximo: number) {
    limparErros()
    if (proximo > TOTAL_DE_PASSOS) {
      setConcluida(true)
      aoConcluir?.()
      return
    }
    setPasso(Math.max(1, proximo) as Passo)
  }

  function registrar(p: Passo, desfecho: Desfecho) {
    setDesfechos((atual) => ({ ...atual, [p]: desfecho }))
    irPara(p + 1)
  }

  const gravarDono = useMutation({
    mutationFn: (donoId: string | null) =>
      atualizarProcesso(processoId, { dono_user_id: donoId }),
    onSuccess: () => {
      invalidar()
      registrar(1, 'gravado')
    },
  })

  const gravarSipoc = useMutation({
    mutationFn: async (
      parte:
        | { passo: 2; suppliers: string | null; inputs: string | null }
        | { passo: 3; outputs: string | null; customers: string | null },
    ) => {
      // Relê o SIPOC do banco no instante da gravação, e não o que a tela leu
      // ao abrir: o upsert grava a linha inteira, então mandar os quatro campos
      // com a foto antiga apagaria a metade que o outro passo acabou de gravar.
      const atual = await carregarSipoc(processoId)
      const base = {
        companyId: empresaId!,
        processoId,
        suppliers: atual?.suppliers ?? null,
        inputs: atual?.inputs ?? null,
        outputs: atual?.outputs ?? null,
        customers: atual?.customers ?? null,
      }
      const completo =
        parte.passo === 2
          ? { ...base, suppliers: parte.suppliers, inputs: parte.inputs }
          : { ...base, outputs: parte.outputs, customers: parte.customers }
      return salvarSipoc(completo)
    },
    onSuccess: (linha, parte) => {
      invalidar()
      // Apagar as duas pontas é uma gravação legítima (limpa o que a planilha
      // trouxe errado), mas não é uma resposta: contar como preenchido faria o
      // resumo dizer que este passo ficou pronto com o SIPOC vazio.
      const respondeu =
        parte.passo === 2
          ? !!linha.suppliers || !!linha.inputs
          : !!linha.outputs || !!linha.customers
      registrar(parte.passo, respondeu ? 'gravado' : 'pulado')
    },
  })

  const gravarCadencia = useMutation({
    mutationFn: (dados: { periodicidade: string | null; prazo_referencia: string | null }) =>
      atualizarProcesso(processoId, dados),
    onSuccess: (atualizado) => {
      invalidar()
      // "Ainda não sei" é resposta válida e grava NULL, mas não é cadência
      // definida: contar como preenchido faria o resumo final afirmar que este
      // passo ficou pronto quando ele continua em aberto.
      const respondeu = !!atualizado.periodicidade || !!atualizado.prazo_referencia
      registrar(4, respondeu ? 'gravado' : 'pulado')
    },
  })

  const criarExtremos = useMutation({
    mutationFn: async (extremos: { inicio: string | null; fim: string | null }) => {
      let ordem = 1
      if (extremos.inicio && !inicioJaCriado) {
        await criarEtapa(empresaId!, etapaDeExtremo(processoId, 'inicio', extremos.inicio, ordem))
        setInicioJaCriado(true)
      }
      // `inicioJaCriado` conta tanto quanto o campo preenchido: numa segunda
      // tentativa em que a pessoa apagou o texto do início, a etapa de início
      // continua no banco na ordem 1, e o fim entrando também na 1 deixaria
      // duas etapas disputando a mesma posição do fluxograma.
      if (extremos.inicio || inicioJaCriado) ordem += 1
      if (extremos.fim) {
        await criarEtapa(empresaId!, etapaDeExtremo(processoId, 'fim', extremos.fim, ordem))
      }
    },
    onSuccess: () => {
      invalidar()
      registrar(5, 'gravado')
    },
    // Invalida no erro TAMBÉM: são dois inserts, e quando o início entra e o
    // fim falha uma etapa foi criada de verdade. Deixar o cache dizendo "sem
    // fluxo" esconderia essa etapa da jornada, do inventário e do POP.
    onError: () => invalidar(),
  })

  const salvando =
    gravarDono.isPending ||
    gravarSipoc.isPending ||
    gravarCadencia.isPending ||
    criarExtremos.isPending

  const erro =
    gravarDono.error ?? gravarSipoc.error ?? gravarCadencia.error ?? criarExtremos.error

  async function avancar() {
    const valido = await form.trigger(CAMPOS_DO_PASSO[passo])
    if (!valido) return
    const v = form.getValues()

    if (passo === 1) {
      gravarDono.mutate(v.dono_user_id)
      return
    }
    if (passo === 2) {
      gravarSipoc.mutate({
        passo: 2,
        suppliers: texto(v.suppliers),
        inputs: texto(v.inputs),
      })
      return
    }
    if (passo === 3) {
      gravarSipoc.mutate({
        passo: 3,
        outputs: texto(v.outputs),
        customers: texto(v.customers),
      })
      return
    }
    if (passo === 4) {
      gravarCadencia.mutate({
        periodicidade: v.periodicidade === SEM_CADENCIA ? null : v.periodicidade,
        prazo_referencia: texto(v.prazo_referencia),
      })
      return
    }
    criarExtremos.mutate({ inicio: texto(v.etapa_inicio), fim: texto(v.etapa_fim) })
  }

  if (concluida) {
    return <Resumo desfechos={desfechos} aoFechar={aoFechar} />
  }

  const fluxoJaExiste = fluxoAoAbrir !== null && fluxoAoAbrir > 0
  const fluxoIndisponivel = fluxoAoAbrir === null
  // Passos bloqueados por leitura que falhou. Gravar aqui seria escrever por
  // cima de um estado que a tela não conseguiu ler. O passo 4 entra na lista
  // porque grava cadência E prazo na mesma chamada: responder só a cadência
  // sem ter lido o cadastro apagaria em silêncio o prazo que estiver lá.
  const passoBloqueado =
    ((passo === 2 || passo === 3) && sipocIndisponivel) ||
    (passo === 4 && cadastroIndisponivel) ||
    (passo === 5 && fluxoIndisponivel)

  const preenchido: Record<Passo, boolean> = {
    1: !!valores.dono_user_id,
    // Esvaziar as duas pontas também é gravação: apaga o que veio errado da
    // planilha. Dizer "não há o que gravar" aí travaria a correção.
    2:
      !!texto(valores.suppliers) ||
      !!texto(valores.inputs) ||
      !!sipocInicial?.suppliers ||
      !!sipocInicial?.inputs,
    3:
      !!texto(valores.outputs) ||
      !!texto(valores.customers) ||
      !!sipocInicial?.outputs ||
      !!sipocInicial?.customers,
    // "Ainda não sei" também é uma gravação: limpa uma cadência errada herdada
    // da planilha. Só não há o que fazer quando nada mudou e nada foi dito.
    4:
      (valores.periodicidade ?? SEM_CADENCIA) !== SEM_CADENCIA ||
      !!texto(valores.prazo_referencia) ||
      !!cadastro?.periodicidade ||
      !!cadastro?.prazo_referencia,
    5: !!texto(valores.etapa_inicio) || !!texto(valores.etapa_fim),
  }

  // O fluxo já existir só desliga a gravação do passo 5: nos outros quatro ela
  // continua valendo, senão um processo que já tem fluxo ficaria sem trilha.
  const passoResolvido = fluxoJaExiste && passo === 5
  const podeGravar = !passoBloqueado && !passoResolvido && preenchido[passo]
  /**
   * Só conta quem tem resposta no banco. Passo pulado NÃO é passo respondido:
   * contá-lo levaria a barra a 100% com as cinco perguntas em branco, e o
   * resumo logo depois listaria as cinco como "continua faltando". A posição na
   * trilha quem informa é o "Passo N de 5" ao lado.
   */
  const respondidos = ORDEM_DOS_PASSOS.filter(
    (p) => desfechos[p] === 'gravado' || desfechos[p] === 'ja_existia',
  ).length
  const info = PASSOS[passo]

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Passo {passo} de {TOTAL_DE_PASSOS}: {info.titulo}
            </p>
            <p className="text-xs text-muted-foreground">
              {respondidos} de {TOTAL_DE_PASSOS} respondidos
            </p>
          </div>
          <BarraDeProgresso
            valor={(respondidos / TOTAL_DE_PASSOS) * 100}
            rotulo="Perguntas respondidas na trilha"
          />
        </div>

        {erro && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
          >
            {mensagemDeErro(erro)}
            {passo === 5 && inicioJaCriado && (
              <span className="block pt-1">
                A etapa de início já foi criada. Tentar de novo cria só a de fim.
              </span>
            )}
          </p>
        )}

        <form
          id="form-trilha"
          onSubmit={(e) => {
            e.preventDefault()
            void avancar()
          }}
          className="space-y-3"
          noValidate
        >
          <div>
            <h3 className="text-sm font-semibold">{info.pergunta}</h3>
            <p className="pt-1 text-xs text-muted-foreground">{info.porque}</p>
          </div>

          {passo === 1 && (
            <div className="space-y-3">
              {cadastroIndisponivel && <AvisoDeLeitura oQue="o cadastro deste processo" />}
              <div className="space-y-1.5">
                <Label htmlFor="trilha-dono">Dono do processo</Label>
                <Controller
                  control={form.control}
                  name="dono_user_id"
                  render={({ field }) => (
                    <SearchableSelect
                      id="trilha-dono"
                      options={opcoesDePessoa}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={
                        pessoasCarregando ? 'Carregando as pessoas...' : 'Ainda sem dono'
                      }
                      disabled={pessoasIndisponiveis || pessoasCarregando}
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Quem responde pelo resultado, não quem executa a tarefa.
                </p>
                {donoForaDaLista && (
                  <p className="text-xs text-warning-subtle-foreground">
                    Este processo tem um dono gravado que não está na lista de pessoas desta
                    empresa, por isso o campo aparece como se estivesse vazio. O dono
                    continua lá, e só muda se você escolher alguém aqui.
                  </p>
                )}
                {pessoasIndisponiveis && <AvisoDeLeitura oQue="a lista de pessoas da empresa" />}
              </div>
            </div>
          )}

          {passo === 2 && (
            <div className="space-y-3">
              {sipocIndisponivel ? (
                <AvisoDeLeitura oQue="o SIPOC já gravado" impedeGravacao />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <CampoLongo
                    id="trilha-suppliers"
                    rotulo="Suppliers (quem fornece)"
                    ajuda="Quem entrega as entradas, dentro ou fora da empresa."
                    placeholder="Ex.: Comercial, fornecedor parceiro, cliente"
                    registro={form.register('suppliers')}
                  />
                  <CampoLongo
                    id="trilha-inputs"
                    rotulo="Inputs (o que entra)"
                    ajuda="O que precisa chegar para o processo poder rodar."
                    placeholder="Ex.: Contrato assinado, nota recebida, ordem de serviço"
                    registro={form.register('inputs')}
                  />
                </div>
              )}
            </div>
          )}

          {passo === 3 && (
            <div className="space-y-3">
              {sipocIndisponivel ? (
                <AvisoDeLeitura oQue="o SIPOC já gravado" impedeGravacao />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <CampoLongo
                    id="trilha-outputs"
                    rotulo="Outputs (o que sai)"
                    ajuda="O que o processo entrega quando termina."
                    placeholder="Ex.: Guia emitida, obrigação transmitida, relatório publicado"
                    registro={form.register('outputs')}
                  />
                  <CampoLongo
                    id="trilha-customers"
                    rotulo="Customers (quem recebe)"
                    ajuda="Quem recebe a saída e julga se ela ficou boa."
                    placeholder="Ex.: Diretoria, Fisco, cliente final, Financeiro"
                    registro={form.register('customers')}
                  />
                </div>
              )}
            </div>
          )}

          {passo === 4 && cadastroIndisponivel && (
            <AvisoDeLeitura oQue="o cadastro deste processo" impedeGravacao />
          )}

          {passo === 4 && !cadastroIndisponivel && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="trilha-periodicidade">Cadência</Label>
                  <Controller
                    control={form.control}
                    name="periodicidade"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="trilha-periodicidade" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM_CADENCIA}>Ainda não sei</SelectItem>
                          {PERIODICIDADES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {rotulo(rotulos.periodicidade, p)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    "Ainda não sei" é resposta válida e grava vazio. Cadência desconhecida não
                    é sob demanda, e o chute vira regra de calendário errada mais tarde.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="trilha-prazo">Prazo</Label>
                  <Input
                    id="trilha-prazo"
                    placeholder="Ex.: dia 5, ou 15 dias antes do vencimento"
                    {...form.register('prazo_referencia')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Como a área enuncia o prazo. É regra de calendário, não data.
                  </p>
                </div>
              </div>

              {cadastro?.periodicidade_origem && (
                <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  A planilha de origem dizia:{' '}
                  <span className="font-medium text-foreground">
                    {cadastro.periodicidade_origem}
                  </span>
                </p>
              )}
            </div>
          )}

          {passo === 5 && (
            <div className="space-y-3">
              {fluxoIndisponivel && <AvisoDeLeitura oQue="o fluxo deste processo" impedeGravacao />}

              {fluxoJaExiste && (
                <p className="flex items-start gap-2.5 rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
                  <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Este processo já tem {fluxoAoAbrir} etapa(s) desenhadas, então esta
                    pergunta não se aplica. Continue o desenho em "Mapear fluxo", no painel do
                    processo.
                  </span>
                </p>
              )}

              {!fluxoJaExiste && !fluxoIndisponivel && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="trilha-inicio">Primeira etapa</Label>
                    <Input
                      id="trilha-inicio"
                      placeholder="Ex.: Receber a documentação do cliente"
                      aria-invalid={!!form.formState.errors.etapa_inicio}
                      {...form.register('etapa_inicio')}
                    />
                    {form.formState.errors.etapa_inicio ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.etapa_inicio.message}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        O gatilho: o que faz este processo começar.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="trilha-fim">Última etapa</Label>
                    <Input
                      id="trilha-fim"
                      placeholder="Ex.: Arquivar o protocolo e avisar a área"
                      aria-invalid={!!form.formState.errors.etapa_fim}
                      {...form.register('etapa_fim')}
                    />
                    {form.formState.errors.etapa_fim ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.etapa_fim.message}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        A entrega: o que marca que o processo terminou.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!podeGravar && !passoBloqueado && !passoResolvido && (
            <p className="text-xs text-muted-foreground">
              Sem resposta aqui não há o que gravar. Use "Pular este passo": a trilha não
              inventa valor, e o processo continua aparecendo como incompleto até alguém
              responder.
            </p>
          )}
        </form>
      </div>

      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={passo === 1 || salvando}
          onClick={() => irPara(passo - 1)}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar
        </Button>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {/* Pular fica de fora quando o fluxo já existe: marcar como pulado um
              passo que já está resolvido faria o resumo final dizer que falta
              fluxo num processo que tem fluxo. */}
          {!passoResolvido && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() => registrar(passo, 'pulado')}
            >
              Pular este passo
            </Button>
          )}

          {passoResolvido ? (
            <Button type="button" size="sm" onClick={() => registrar(5, 'ja_existia')}>
              Concluir
            </Button>
          ) : (
            <Button type="submit" form="form-trilha" size="sm" disabled={salvando || !podeGravar}>
              {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {passo === TOTAL_DE_PASSOS ? 'Gravar e concluir' : 'Gravar e avançar'}
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  )
}

/**
 * O fechamento da trilha. Ele NÃO diz "tudo pronto": se a pessoa pulou três
 * passos, o processo continua incompleto, e é exatamente isso que o resumo
 * precisa dizer para a próxima pessoa que abrir o inventário.
 */
function Resumo({
  desfechos,
  aoFechar,
}: {
  desfechos: Record<Passo, Desfecho>
  aoFechar: () => void
}) {
  const faltando = ORDEM_DOS_PASSOS.filter(
    (p) => desfechos[p] === 'pulado' || desfechos[p] === 'pendente',
  )

  return (
    <>
      <div className="space-y-4">
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {ORDEM_DOS_PASSOS.map((p) => (
            <li key={p} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0 text-sm">
                <span className="text-muted-foreground">{p}.</span> {PASSOS[p].titulo}
              </span>
              <SeloDoDesfecho desfecho={desfechos[p]} />
            </li>
          ))}
        </ul>

        {faltando.length === 0 ? (
          <p className="flex items-start gap-2.5 rounded-md border border-success/40 bg-success-subtle p-3 text-xs text-success-subtle-foreground">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              As cinco perguntas foram respondidas. O que existe aqui é o contorno do
              processo: o desenho completo do fluxo, os indicadores e o POP continuam no
              painel do processo.
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Ficou faltando: {faltando.map((p) => PASSOS[p].titulo).join(', ')}.
              Nada foi inventado nesses passos, então o processo continua contado como
              incompleto na jornada até alguém respondê-los.
            </span>
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" size="sm" onClick={aoFechar}>
          Fechar
        </Button>
      </DialogFooter>
    </>
  )
}

/** Identidade nunca só por cor: cada desfecho tem rótulo e ícone próprios. */
function SeloDoDesfecho({ desfecho }: { desfecho: Desfecho }) {
  if (desfecho === 'gravado') {
    return (
      <Badge variant="success-subtle" className="shrink-0 gap-1">
        <CircleCheck className="size-3" aria-hidden />
        gravado
      </Badge>
    )
  }
  if (desfecho === 'ja_existia') {
    return (
      <Badge variant="info-subtle" className="shrink-0 gap-1">
        <CircleCheck className="size-3" aria-hidden />
        já existia
      </Badge>
    )
  }
  return (
    <Badge variant="warning-subtle" className="shrink-0 gap-1">
      <CircleMinus className="size-3" aria-hidden />
      continua faltando
    </Badge>
  )
}

function AvisoDeLeitura({ oQue, impedeGravacao }: { oQue: string; impedeGravacao?: boolean }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        Não deu para ler {oQue} agora.
        {impedeGravacao
          ? ' Gravar sem saber o que já está lá apagaria o que existe, então este passo só pode ser pulado. Feche a trilha e tente de novo daqui a pouco.'
          : ' Os campos abaixo começam vazios, e o que você responder substitui o que estiver gravado neles.'}
      </span>
    </p>
  )
}

function CampoLongo({
  id,
  rotulo: r,
  ajuda,
  placeholder,
  registro,
}: {
  id: string
  rotulo: string
  ajuda: string
  placeholder: string
  registro: UseFormRegisterReturn
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{r}</Label>
      <textarea
        id={id}
        rows={3}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        {...registro}
      />
      <p className="text-xs text-muted-foreground">{ajuda}</p>
    </div>
  )
}

/**
 * Início e fim entram com o mínimo: título, tipo e ordem. Preencher responsável,
 * sistema ou tempo por dedução aqui colocaria no banco uma informação que
 * ninguém conferiu, e ela sairia depois num POP como se fosse levantada.
 */
function etapaDeExtremo(
  processoId: string,
  tipo: 'inicio' | 'fim',
  titulo: string,
  ordem: number,
): DadosDaEtapa {
  return {
    processo_id: processoId,
    ordem,
    tipo,
    titulo,
    descricao: null,
    responsavel_user_id: null,
    area_id: null,
    sistema: null,
    tempo_estimado_min: null,
    eh_gargalo: false,
    rotulo_sim: null,
    rotulo_nao: null,
    desvio_para_etapa_id: null,
  }
}
