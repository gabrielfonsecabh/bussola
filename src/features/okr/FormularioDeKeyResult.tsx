import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, Info, LoaderCircle, Trash2 } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DIRECOES_DE_KR,
  TIPOS_DE_KR,
  type DadosDoKeyResult,
  type KeyResult,
} from '@/features/okr/api'
import { rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'

/**
 * O usuário digita "4,5" e o banco espera 4.5. Vazio vira NULL, nunca zero:
 * baseline zero é uma medição de verdade (multas em zero), e "ainda não medi"
 * é outra coisa. Confundir as duas faz o farol mentir.
 */
function paraNumero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

function numeroValidoOuVazio(texto: string): boolean {
  return texto.trim() === '' || paraNumero(texto) !== null
}

const esquema = z.object({
  descricao: z
    .string()
    .trim()
    .min(5, 'Descreva o resultado-chave em pelo menos 5 caracteres'),
  tipo: z.string(),
  direcao: z.string(),
  unidade: z.string(),
  baseline: z.string().refine(numeroValidoOuVazio, 'Use um número, com vírgula ou ponto'),
  meta: z.string().refine(numeroValidoOuVazio, 'Use um número, com vírgula ou ponto'),
  peso: z
    .string()
    .refine((v) => {
      const n = paraNumero(v)
      return n !== null && n > 0
    }, 'O peso precisa ser um número maior que zero. Peso 1 é o normal.'),
})

type Campos = z.infer<typeof esquema>

function paraCampos(kr: KeyResult | null): Campos {
  return {
    descricao: kr?.descricao ?? '',
    tipo: kr?.tipo ?? 'numerico',
    direcao: kr?.direcao ?? 'subir',
    unidade: kr?.unidade ?? '',
    baseline: kr?.baseline != null ? String(kr.baseline) : '',
    meta: kr?.meta != null ? String(kr.meta) : '',
    peso: kr != null ? String(kr.peso) : '1',
  }
}

function paraApi(c: Campos, okrId: string): DadosDoKeyResult {
  const ehMarco = c.tipo === 'marco'
  return {
    okr_id: okrId,
    descricao: c.descricao.trim(),
    tipo: c.tipo,
    direcao: c.direcao,
    unidade: vazioVirarNulo(c.unidade),
    // Marco não tem alvo numérico: gravar baseline e meta aqui só criaria um
    // número que o cálculo do farol ignora e o usuário acreditaria.
    baseline: ehMarco ? null : paraNumero(c.baseline),
    meta: ehMarco ? null : paraNumero(c.meta),
    peso: paraNumero(c.peso) ?? 1,
  }
}

export interface FormularioDeKeyResultProps {
  /** Key result em edição, ou null para criar. */
  keyResult: KeyResult | null
  /** OKR ao qual o key result pertence. */
  okrId: string
  /** Título do OKR, só para o usuário confirmar onde está gravando. */
  tituloDoOkr: string
  aoFechar: () => void
  aoSalvar: (dados: DadosDoKeyResult) => void
  aoExcluir?: () => void
  salvando: boolean
  excluindo?: boolean
  erro: string | null
}

/**
 * Key result em DIALOG: é uma decisão focada sobre um registro só, e o painel
 * do OKR continua atrás para o usuário conferir os outros KRs enquanto decide
 * baseline e meta.
 */
export function FormularioDeKeyResult({
  keyResult,
  okrId,
  tituloDoOkr,
  aoFechar,
  aoSalvar,
  aoExcluir,
  salvando,
  excluindo,
  erro,
}: FormularioDeKeyResultProps) {
  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: paraCampos(keyResult),
  })

  // `useWatch` em vez de `form.watch`: assina só estes campos e não devolve
  // função nova a cada render.
  const tipo = useWatch({ control: form.control, name: 'tipo' })
  const direcao = useWatch({ control: form.control, name: 'direcao' })
  const baselineTexto = useWatch({ control: form.control, name: 'baseline' })
  const metaTexto = useWatch({ control: form.control, name: 'meta' })

  const ehMarco = tipo === 'marco'
  const baseline = paraNumero(baselineTexto)
  const meta = paraNumero(metaTexto)

  const semAlvoNumerico = !ehMarco && (baseline === null || meta === null)
  const direcaoContradizOsNumeros =
    !ehMarco &&
    baseline !== null &&
    meta !== null &&
    (direcao === 'descer' ? meta >= baseline : meta <= baseline)

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {keyResult ? 'Editar key result' : 'Novo key result'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Mede <span className="font-medium text-foreground">{tituloDoOkr}</span>. É o key
            result que dá farol ao OKR: sem ele, o objetivo fica cinza no painel para
            sempre.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-key-result"
          onSubmit={form.handleSubmit((c) => aoSalvar(paraApi(c, okrId)))}
          className="space-y-4"
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

          <div className="space-y-1.5">
            <Label htmlFor="kr-descricao">O que será medido</Label>
            <textarea
              id="kr-descricao"
              rows={2}
              placeholder="Ex.: Reduzir a inadimplência da carteira de 6,2% para 4%"
              aria-invalid={!!form.formState.errors.descricao}
              className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              {...form.register('descricao')}
            />
            {form.formState.errors.descricao && (
              <p className="text-xs text-destructive">
                {form.formState.errors.descricao.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="kr-tipo">Tipo</Label>
              <Controller
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="kr-tipo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_DE_KR.map((t) => (
                        <SelectItem key={t} value={t}>
                          {rotulo(rotulos.tipo_kr, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kr-direcao">Direção</Label>
              <Controller
                control={form.control}
                name="direcao"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="kr-direcao" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIRECOES_DE_KR.map((d) => (
                        <SelectItem key={d} value={d}>
                          {rotulo(rotulos.direcao_kr, d)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                "Quanto menor melhor" é para meta abaixo da baseline (multas em zero,
                inadimplência abaixo de 4%). O atingimento respeita a direção sozinho, não
                inverta os números na mão.
              </p>
            </div>
          </div>

          {ehMarco ? (
            <div className="flex items-start gap-2.5 rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Marco não tem baseline nem meta.</p>
                <p className="pt-0.5">
                  No tipo marco o alvo mora no texto do key result ("assinar o contrato",
                  "publicar a política"), então não há número para o banco comparar e o
                  farol deste key result fica cinza. Ele continua pesando dentro do OKR, e
                  o acompanhamento é pelo check-in e pelo texto.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="kr-baseline">Baseline (ponto de partida)</Label>
                <Input
                  id="kr-baseline"
                  inputMode="decimal"
                  placeholder="Ex.: 6,2"
                  aria-invalid={!!form.formState.errors.baseline}
                  {...form.register('baseline')}
                />
                {form.formState.errors.baseline && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.baseline.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="kr-meta">Meta</Label>
                <Input
                  id="kr-meta"
                  inputMode="decimal"
                  placeholder="Ex.: 4"
                  aria-invalid={!!form.formState.errors.meta}
                  {...form.register('meta')}
                />
                {form.formState.errors.meta && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.meta.message}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="kr-unidade">Unidade</Label>
              <Input
                id="kr-unidade"
                placeholder={ehMarco ? 'Opcional em marco' : 'Ex.: %, R$, clientes'}
                {...form.register('unidade')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kr-peso">Peso dentro do OKR</Label>
              <Input
                id="kr-peso"
                inputMode="decimal"
                aria-invalid={!!form.formState.errors.peso}
                {...form.register('peso')}
              />
              {form.formState.errors.peso ? (
                <p className="text-xs text-destructive">{form.formState.errors.peso.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  O peso pondera este key result no atingimento do OKR. Peso 1 é o normal;
                  use 2 quando ele vale o dobro dos outros.
                </p>
              )}
            </div>
          </div>

          {semAlvoNumerico && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Este key result vai ficar sem farol.</p>
                <p className="pt-0.5">
                  O farol compara o atingimento com o esperado pelo tempo já decorrido do
                  ciclo. Faltando {baseline === null && 'baseline'}
                  {baseline === null && meta === null && ' e '}
                  {meta === null && 'meta'}, não há o que comparar, e o banco deixa este
                  key result cinza. Dá para salvar assim e completar depois.
                </p>
              </div>
            </div>
          )}

          {direcaoContradizOsNumeros && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">
                  A direção não combina com os números que você digitou.
                </p>
                <p className="pt-0.5">
                  {direcao === 'descer'
                    ? 'Em "quanto menor melhor" a meta precisa ser MENOR que a baseline. Do jeito que está, qualquer medição vai parecer já atingida.'
                    : 'Em "quanto maior melhor" a meta precisa ser MAIOR que a baseline. Do jeito que está, o progresso não tem para onde subir.'}{' '}
                  Confira a direção ou troque baseline e meta de lugar.
                </p>
              </div>
            </div>
          )}
        </form>

        <DialogFooter>
          {keyResult && aoExcluir && (
            <Button
              variant="ghost"
              size="sm"
              onClick={aoExcluir}
              disabled={excluindo}
              className="mr-auto text-destructive hover:text-destructive"
            >
              {excluindo ? (
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
          <Button size="sm" type="submit" form="form-key-result" disabled={salvando}>
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {keyResult ? 'Salvar' : 'Adicionar key result'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
