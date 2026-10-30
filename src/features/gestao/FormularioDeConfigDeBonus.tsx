import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, LoaderCircle, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  useFieldArray,
  useForm,
  useWatch,
  type UseFormRegisterReturn,
  type UseFormReturn,
} from 'react-hook-form'
import { z } from 'zod'

import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Button } from '@/components/ui/button'
import { ValorOuSemDado } from '@/components/ui/estado-da-tela'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  globalSomaUm,
  lerPesos,
  lerReguas,
  pesosSomamUm,
  problemasDaRegua,
  REGUAS_PADRAO,
  type BonusConfig,
  type Faixa,
  type PesosDoBonus,
  type ReguasDoBonus,
} from '@/features/gestao/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { cn } from '@/lib/utils'

const CAMPOS_DE_PESO = ['global', 'setorial', 'individual', 'ebitda', 'faturamento'] as const
const CAMPOS_DE_REGUA = ['faixas_ebitda', 'faixas_faturamento'] as const

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(',', '.').trim()
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/**
 * O banco guarda fração (0.7) e a tela mostra porcentagem (70). A ida e volta
 * em ponto flutuante produz 70.00000000000001, então o texto é arredondado
 * em vez de sair direto do `String(v * 100)`.
 */
function fracaoParaTexto(v: number): string {
  return String(Math.round(v * 10000) / 100)
}

const linhaDeFaixa = z.object({ de: z.string(), ate: z.string(), paga: z.string() })

const esquema = z
  .object({
    global: z.string(),
    setorial: z.string(),
    individual: z.string(),
    ebitda: z.string(),
    faturamento: z.string(),
    faixas_ebitda: z.array(linhaDeFaixa),
    faixas_faturamento: z.array(linhaDeFaixa),
    multiplicadores: z.array(z.object({ nivel: z.string(), valor: z.string() })),
  })
  .superRefine((c, ctx) => {
    for (const campo of CAMPOS_DE_PESO) {
      if (paraNumero(c[campo]) === null) {
        ctx.addIssue({
          code: 'custom',
          path: [campo],
          message: 'Informe a porcentagem em número',
        })
      }
    }

    const bolo = montarFatias({
      global: c.global,
      setorial: c.setorial,
      individual: c.individual,
    })
    if (bolo && !pesosSomamUm(bolo)) {
      ctx.addIssue({
        code: 'custom',
        path: ['global'],
        message: 'Global, setorial e individual precisam somar 100%',
      })
    }

    const dentroDaGlobal = montarFatias({ ebitda: c.ebitda, faturamento: c.faturamento })
    if (dentroDaGlobal && !globalSomaUm(dentroDaGlobal)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ebitda'],
        message: 'EBITDA e faturamento precisam somar 100% da fatia global',
      })
    }

    for (const chave of CAMPOS_DE_REGUA) {
      const linhas = c[chave]
      if (linhas.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: [chave],
          message: 'A régua precisa de pelo menos uma faixa',
        })
        continue
      }
      linhas.forEach((linha, i) => {
        if (paraNumero(linha.de) === null) {
          ctx.addIssue({ code: 'custom', path: [chave, i, 'de'], message: 'Informe o piso' })
        }
        if (paraNumero(linha.paga) === null) {
          ctx.addIssue({ code: 'custom', path: [chave, i, 'paga'], message: 'Informe o quanto paga' })
        }
      })

      // As faixas precisam cobrir a reta inteira sem buraco nem sobreposicao.
      // Um intervalo descoberto nao vira zero: vira "sem dado" na apuracao, e
      // o fechamento do bonus fica sem numero para aquele componente.
      const faixas = montarFaixas(linhas)
      if (faixas) {
        for (const problema of problemasDaRegua(faixas)) {
          ctx.addIssue({ code: 'custom', path: [chave], message: problema })
        }
      }
    }

    c.multiplicadores.forEach((m, i) => {
      if (m.valor.trim() !== '' && paraNumero(m.valor) === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['multiplicadores', i, 'valor'],
          message: 'Informe em número de salários',
        })
      }
    })
  })

type Campos = z.infer<typeof esquema>
type LinhaDeFaixa = { de: string; ate: string; paga: string }

const PESOS_ZERADOS: PesosDoBonus = {
  global: 0,
  setorial: 0,
  individual: 0,
  ebitda: 0,
  faturamento: 0,
}

/**
 * `pesosSomamUm` e `globalSomaUm` olham fatias diferentes do mesmo objeto, e
 * cada conferência é montada só com os campos dela: um campo em branco numa
 * das divisões não pode acusar erro na outra.
 */
function montarFatias<C extends keyof PesosDoBonus>(
  textos: Record<C, string>,
): PesosDoBonus | null {
  const pesos = { ...PESOS_ZERADOS }
  for (const campo of Object.keys(textos) as C[]) {
    const n = paraNumero(textos[campo])
    if (n === null) return null
    pesos[campo] = n / 100
  }
  return pesos
}

function montarPesos(c: Pick<Campos, (typeof CAMPOS_DE_PESO)[number]>): PesosDoBonus | null {
  return montarFatias({
    global: c.global,
    setorial: c.setorial,
    individual: c.individual,
    ebitda: c.ebitda,
    faturamento: c.faturamento,
  })
}

function montarFaixas(linhas: LinhaDeFaixa[]): Faixa[] | null {
  const faixas: Faixa[] = []
  for (const linha of linhas) {
    const de = paraNumero(linha.de)
    const ate = linha.ate.trim() === '' ? null : paraNumero(linha.ate)
    const paga = paraNumero(linha.paga)
    if (de === null || paga === null) return null
    faixas.push({ min: de, max: ate, paga })
  }
  return faixas
}

function somaEmPorcentagem(...textos: string[]): number | null {
  const numeros = textos.map(paraNumero)
  if (numeros.some((v) => v === null)) return null
  return numeros.reduce<number>((total, v) => total + (v ?? 0), 0)
}

function faixasParaCampos(faixas: Faixa[]): LinhaDeFaixa[] {
  return faixas.map((f) => ({
    de: String(f.min),
    // "até" em branco e a faixa de topo, aberta para cima.
    ate: f.max === null ? '' : String(f.max),
    paga: String(f.paga),
  }))
}

/**
 * Os níveis vêm do enum do produto, mas um modelo já gravado pode ter chaves
 * que o enum não conhece. Somar as duas listas evita que salvar a tela apague
 * silenciosamente um multiplicador que a apuração está usando.
 */
function multiplicadoresParaCampos(reguas: ReguasDoBonus) {
  const doEnum = Object.keys(rotulos.nivel_usuario)
  const doBanco = Object.keys(reguas.multiplicador_nivel)
  const niveis = [...doEnum, ...doBanco.filter((n) => !doEnum.includes(n))]
  return niveis.map((nivel) => {
    const valor = reguas.multiplicador_nivel[nivel]
    return { nivel, valor: valor === undefined ? '' : String(valor) }
  })
}

function paraCampos(config: BonusConfig | null): Campos {
  const pesos = lerPesos(config)
  const reguas = lerReguas(config)
  return {
    global: fracaoParaTexto(pesos.global),
    setorial: fracaoParaTexto(pesos.setorial),
    individual: fracaoParaTexto(pesos.individual),
    ebitda: fracaoParaTexto(pesos.ebitda),
    faturamento: fracaoParaTexto(pesos.faturamento),
    faixas_ebitda: faixasParaCampos(reguas.ebitda),
    faixas_faturamento: faixasParaCampos(reguas.faturamento),
    multiplicadores: multiplicadoresParaCampos(reguas),
  }
}

export interface DadosDoModeloDeBonus {
  pesos: PesosDoBonus
  reguas: ReguasDoBonus
}

export interface FormularioDeConfigDeBonusProps {
  ano: number
  /** Configuração do ano, ou null para criar partindo dos padrões. */
  config: BonusConfig | null
  aoFechar: () => void
  aoSalvar: (dados: DadosDoModeloDeBonus) => void
  salvando: boolean
  erro: string | null
}

/**
 * Editor do modelo em SHEET: são muitos campos ligados entre si (a soma dos
 * pesos, a ordem das faixas), e o usuário precisa continuar vendo a apuração
 * atrás enquanto mexe neles.
 */
export function FormularioDeConfigDeBonus({
  ano,
  config,
  aoFechar,
  aoSalvar,
  salvando,
  erro,
}: FormularioDeConfigDeBonusProps) {
  const { empresaAtiva } = useEmpresa()

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: paraCampos(config),
  })

  const faixasDeEbitda = useFieldArray({ control: form.control, name: 'faixas_ebitda' })
  const faixasDeFaturamento = useFieldArray({
    control: form.control,
    name: 'faixas_faturamento',
  })
  const multiplicadores = useFieldArray({ control: form.control, name: 'multiplicadores' })

  const global = useWatch({ control: form.control, name: 'global' })
  const setorial = useWatch({ control: form.control, name: 'setorial' })
  const individual = useWatch({ control: form.control, name: 'individual' })
  const ebitda = useWatch({ control: form.control, name: 'ebitda' })
  const faturamento = useWatch({ control: form.control, name: 'faturamento' })

  const bolo = montarFatias({ global, setorial, individual })
  const dentroDaGlobal = montarFatias({ ebitda, faturamento })
  const boloOk = bolo !== null && pesosSomamUm(bolo)
  const globalOk = dentroDaGlobal !== null && globalSomaUm(dentroDaGlobal)

  function enviar(c: Campos) {
    const pesos = montarPesos(c)
    const ebitdaFaixas = montarFaixas(c.faixas_ebitda)
    const faturamentoFaixas = montarFaixas(c.faixas_faturamento)
    // O zodResolver já barrou o formulário inválido; este retorno é só para o
    // TypeScript, que não sabe disso.
    if (!pesos || !ebitdaFaixas || !faturamentoFaixas) return

    const porNivel: Record<string, number> = {}
    for (const m of c.multiplicadores) {
      const valor = paraNumero(m.valor)
      // Nível em branco fica FORA do objeto: gravar 0 diria à apuração que
      // aquele nível recebe zero salário, que é uma afirmação diferente.
      if (valor !== null) porNivel[m.nivel] = valor
    }

    aoSalvar({
      pesos,
      reguas: {
        ebitda: ebitdaFaixas,
        faturamento: faturamentoFaixas,
        multiplicador_nivel: porNivel,
      },
    })
  }

  return (
    <PainelDeDetalhe
      aberto
      largura="larga"
      aoFechar={aoFechar}
      titulo={`Modelo de bônus de ${ano}`}
      origem={
        config
          ? `${empresaAtiva?.nome_fantasia ?? 'Empresa'} · editando o modelo gravado`
          : `${empresaAtiva?.nome_fantasia ?? 'Empresa'} · criando a partir dos padrões`
      }
      acoes={
        <>
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button size="sm" type="submit" form="form-config-bonus" disabled={salvando}>
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {config ? 'Salvar modelo' : 'Criar modelo'}
          </Button>
        </>
      }
    >
      <form
        id="form-config-bonus"
        onSubmit={form.handleSubmit(enviar)}
        className="space-y-6"
        noValidate
      >
        {erro && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
          >
            {erro}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Este é o modelo que a apuração de {ano} vai ler. Mudar aqui não recalcula o que já
          foi apurado: refaça a apuração do período depois de salvar.
        </p>

        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Divisão do bônus
          </legend>

          <div className="grid gap-4 sm:grid-cols-3">
            <CampoDePorcentagem
              id="cb-global"
              rotulo="Global"
              ajuda="EBITDA e faturamento"
              erro={form.formState.errors.global?.message}
              registro={form.register('global')}
            />
            <CampoDePorcentagem
              id="cb-setorial"
              rotulo="Setorial"
              ajuda="Kit mínimo de gestão da área"
              erro={form.formState.errors.setorial?.message}
              registro={form.register('setorial')}
            />
            <CampoDePorcentagem
              id="cb-individual"
              rotulo="Individual"
              ajuda="assiduidade"
              erro={form.formState.errors.individual?.message}
              registro={form.register('individual')}
            />
          </div>

          <Soma
            total={somaEmPorcentagem(global, setorial, individual)}
            ok={boloOk}
            aviso="Enquanto as três fatias não somarem 100%, a apuração distribui um bolo diferente de 100% e a tela não denuncia isso em lugar nenhum."
          />
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Dentro da fatia global
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoDePorcentagem
              id="cb-ebitda"
              rotulo="EBITDA"
              ajuda="parte da fatia global, não do bônus inteiro"
              erro={form.formState.errors.ebitda?.message}
              registro={form.register('ebitda')}
            />
            <CampoDePorcentagem
              id="cb-faturamento"
              rotulo="Faturamento"
              ajuda="parte da fatia global, não do bônus inteiro"
              erro={form.formState.errors.faturamento?.message}
              registro={form.register('faturamento')}
            />
          </div>

          <Soma
            total={somaEmPorcentagem(ebitda, faturamento)}
            ok={globalOk}
            aviso="EBITDA e faturamento repartem a fatia global entre si, então precisam somar 100%."
          />
        </fieldset>

        <TabelaDeFaixas
          titulo="Régua de EBITDA"
          prefixo="cb-eb"
          campos={faixasDeEbitda.fields}
          nome="faixas_ebitda"
          form={form}
          aoAdicionar={() => faixasDeEbitda.append({ de: '', ate: '', paga: '' })}
          aoRemover={(i) => faixasDeEbitda.remove(i)}
          aoRestaurar={() => faixasDeEbitda.replace(faixasParaCampos(REGUAS_PADRAO.ebitda))}
        />

        <TabelaDeFaixas
          titulo="Régua de faturamento"
          prefixo="cb-fat"
          campos={faixasDeFaturamento.fields}
          nome="faixas_faturamento"
          form={form}
          aoAdicionar={() => faixasDeFaturamento.append({ de: '', ate: '', paga: '' })}
          aoRemover={(i) => faixasDeFaturamento.remove(i)}
          aoRestaurar={() =>
            faixasDeFaturamento.replace(faixasParaCampos(REGUAS_PADRAO.faturamento))
          }
        />

        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Multiplicador por nível
          </legend>
          <p className="text-xs text-muted-foreground">
            Quantos salários o nível recebe quando o atingimento é integral. Nível deixado em
            branco fica sem multiplicador no modelo, e a apuração não converte o resultado
            dele em salários.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {multiplicadores.fields.map((campo, i) => (
              <div key={campo.id} className="space-y-1.5">
                <Label htmlFor={`cb-mult-${campo.id}`}>
                  {rotulo(rotulos.nivel_usuario, campo.nivel)}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`cb-mult-${campo.id}`}
                    className="h-8"
                    inputMode="decimal"
                    placeholder="sem multiplicador"
                    aria-invalid={!!form.formState.errors.multiplicadores?.[i]?.valor}
                    {...form.register(`multiplicadores.${i}.valor` as const)}
                  />
                  <span className="text-xs text-muted-foreground">salários</span>
                </div>
                {form.formState.errors.multiplicadores?.[i]?.valor && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.multiplicadores[i]?.valor?.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      </form>
    </PainelDeDetalhe>
  )
}

function CampoDePorcentagem({
  id,
  rotulo: r,
  ajuda,
  erro,
  registro,
}: {
  id: string
  rotulo: string
  ajuda: string
  erro?: string
  registro: UseFormRegisterReturn
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{r}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} className="h-8" inputMode="decimal" aria-invalid={!!erro} {...registro} />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <p className="text-xs text-muted-foreground">{ajuda}</p>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  )
}

function Soma({ total, ok, aviso }: { total: number | null; ok: boolean; aviso: string }) {
  return (
    <div
      role={ok ? undefined : 'alert'}
      className={cn(
        'flex items-start gap-2.5 rounded-md border p-3 text-xs',
        ok
          ? 'border-success/40 bg-success-subtle text-success-subtle-foreground'
          : 'border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground',
      )}
    >
      {!ok && <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="space-y-0.5">
        <p className="font-semibold">
          Soma:{' '}
          <ValorOuSemDado valor={total} formatar={(v) => fmt.percentual(v, 2)} />
        </p>
        {!ok && <p>{aviso}</p>}
      </div>
    </div>
  )
}

function TabelaDeFaixas({
  titulo,
  prefixo,
  campos,
  nome,
  form,
  aoAdicionar,
  aoRemover,
  aoRestaurar,
}: {
  titulo: string
  prefixo: string
  campos: { id: string }[]
  nome: 'faixas_ebitda' | 'faixas_faturamento'
  form: UseFormReturn<Campos>
  aoAdicionar: () => void
  aoRemover: (indice: number) => void
  aoRestaurar: () => void
}) {
  const linhas = useWatch({ control: form.control, name: nome }) ?? []
  const faixas = montarFaixas(linhas)
  const problemas = faixas === null ? [] : problemasDaRegua(faixas)
  const erros = form.formState.errors[nome]

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {titulo}
      </legend>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>De</TableHead>
              <TableHead>Até</TableHead>
              <TableHead>Paga</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {campos.map((campo, i) => (
              <TableRow key={campo.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${prefixo}-de-${campo.id}`}
                      className="h-8 w-24"
                      inputMode="decimal"
                      aria-label={`Piso da faixa ${i + 1}`}
                      aria-invalid={!!erros?.[i]?.de}
                      {...form.register(`${nome}.${i}.de` as const)}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {erros?.[i]?.de && (
                    <p className="pt-1 text-xs text-destructive">{erros[i]?.de?.message}</p>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${prefixo}-ate-${campo.id}`}
                      className="h-8 w-24"
                      inputMode="decimal"
                      placeholder="em diante"
                      aria-label={`Teto da faixa ${i + 1}, vazio para a faixa de topo`}
                      aria-invalid={!!erros?.[i]?.ate}
                      {...form.register(`${nome}.${i}.ate` as const)}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {erros?.[i]?.ate && (
                    <p className="pt-1 text-xs text-destructive">{erros[i]?.ate?.message}</p>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${prefixo}-paga-${campo.id}`}
                      className="h-8 w-24"
                      inputMode="decimal"
                      aria-label={`Quanto paga na faixa ${i + 1}`}
                      aria-invalid={!!erros?.[i]?.paga}
                      {...form.register(`${nome}.${i}.paga` as const)}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {erros?.[i]?.paga && (
                    <p className="pt-1 text-xs text-destructive">{erros[i]?.paga?.message}</p>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={campos.length <= 1}
                    onClick={() => aoRemover(i)}
                    title={
                      campos.length <= 1
                        ? 'A régua precisa de pelo menos uma faixa'
                        : 'Remover esta faixa'
                    }
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">Remover faixa {i + 1}</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {problemas.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold">Esta régua não classifica todo atingimento.</p>
            <ul className="list-inside list-disc space-y-0.5">
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="pt-0.5">
              Um intervalo descoberto não paga zero: ele sai como "sem dado" na apuração, e o
              componente fica sem número no fechamento.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={aoAdicionar}>
          <Plus className="size-4" aria-hidden />
          Adicionar faixa
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={aoRestaurar}
          title="Volta às faixas de exemplo"
        >
          <RotateCcw className="size-4" aria-hidden />
          Restaurar faixas padrão
        </Button>
      </div>
    </fieldset>
  )
}
