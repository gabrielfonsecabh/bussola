import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useFieldArray, useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { z } from 'zod'

import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { salvarPop, type DadosDoPop, type Pop } from '@/features/processos/api'
import { useAuth } from '@/hooks/use-auth'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { vazioVirarNulo } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

const esquema = z
  .object({
    codigo: z.string(),
    objetivo: z.string(),
    abrangencia: z.string(),
    definicoes: z.array(z.object({ sigla: z.string(), significado: z.string() })),
    responsabilidades: z.array(z.object({ papel: z.string(), responsabilidade: z.string() })),
    controles_internos: z.array(z.object({ texto: z.string() })),
    riscos: z.array(z.object({ risco: z.string(), mitigacao: z.string() })),
    registros: z.array(z.object({ texto: z.string() })),
  })
  // Item pela metade é barrado em vez de descartado: a gravação joga fora a
  // linha incompleta, e descartar em silêncio apaga o que a pessoa digitou sem
  // ela nunca ficar sabendo.
  .superRefine((c, ctx) => {
    c.definicoes.forEach((d, i) => {
      if (d.sigla.trim() !== '' && d.significado.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['definicoes', i, 'significado'],
          message: 'Escreva o que a sigla significa, ou remova a linha',
        })
      }
      if (d.sigla.trim() === '' && d.significado.trim() !== '') {
        ctx.addIssue({
          code: 'custom',
          path: ['definicoes', i, 'sigla'],
          message: 'Escreva a sigla, ou remova a linha',
        })
      }
    })

    c.responsabilidades.forEach((r, i) => {
      if (r.papel.trim() !== '' && r.responsabilidade.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['responsabilidades', i, 'responsabilidade'],
          message: 'Escreva pelo que este papel responde, ou remova a linha',
        })
      }
      if (r.papel.trim() === '' && r.responsabilidade.trim() !== '') {
        ctx.addIssue({
          code: 'custom',
          path: ['responsabilidades', i, 'papel'],
          message: 'Escreva o papel (a função, não a pessoa), ou remova a linha',
        })
      }
    })

    c.riscos.forEach((r, i) => {
      if (r.risco.trim() !== '' && r.mitigacao.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['riscos', i, 'mitigacao'],
          message: 'Escreva a mitigação: risco sem resposta escrita vira improviso',
        })
      }
      if (r.risco.trim() === '' && r.mitigacao.trim() !== '') {
        ctx.addIssue({
          code: 'custom',
          path: ['riscos', i, 'risco'],
          message: 'Escreva o risco que esta mitigação responde, ou remova a linha',
        })
      }
    })
  })
  // Gravar tudo em branco cria o documento em rascunho, com versão 1 e código
  // de POP, sem uma linha escrita. O POP passa a existir no controle documental
  // afirmando algo que ninguém redigiu.
  .refine(
    (c) =>
      [c.codigo, c.objetivo, c.abrangencia].some((t) => t.trim() !== '') ||
      c.definicoes.some((d) => d.sigla.trim() !== '' || d.significado.trim() !== '') ||
      c.responsabilidades.some(
        (r) => r.papel.trim() !== '' || r.responsabilidade.trim() !== '',
      ) ||
      c.controles_internos.some((i) => i.texto.trim() !== '') ||
      c.riscos.some((r) => r.risco.trim() !== '' || r.mitigacao.trim() !== '') ||
      c.registros.some((i) => i.texto.trim() !== ''),
    {
      path: ['objetivo'],
      message:
        'Preencha ao menos uma seção. Um POP em branco entra no controle documental como documento existente sem nada escrito dentro.',
    },
  )

type Campos = z.infer<typeof esquema>

export interface FormularioDePopProps {
  processoId: string
  processoNome: string
  /** POP já gravado, ou null quando o processo ainda não tem um. */
  pop: Pop | null
  aoFechar: () => void
}

/**
 * As CINCO seções do POP que não têm casa em outro lugar, mais o código do
 * documento.
 *
 * As outras oito não aparecem aqui de propósito: a 7 é o fluxo de etapas, a 6
 * sai do campo "sistema" dessas etapas, a 9 são os indicadores do processo e a
 * 1 vem do cadastro. Redigitá-las criaria duas verdades, e a versão digitada
 * aqui envelheceria em silêncio.
 *
 * Painel (e não dialog) porque são cinco blocos com listas que crescem, e o
 * usuário precisa rolar entre eles sem perder o que já escreveu.
 */
export function FormularioDePop({
  processoId,
  processoNome,
  pop,
  aoFechar,
}: FormularioDePopProps) {
  const { empresaAtiva } = useEmpresa()
  const { usuario } = useAuth()
  const queryClient = useQueryClient()
  const empresaId = empresaAtiva?.id ?? null

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      codigo: pop?.codigo ?? '',
      objetivo: pop?.objetivo ?? '',
      abrangencia: pop?.abrangencia ?? '',
      definicoes: lerPares(pop?.definicoes, 'sigla', 'significado').map((p) => ({
        sigla: p.a,
        significado: p.b,
      })),
      responsabilidades: lerPares(pop?.responsabilidades, 'papel', 'responsabilidade').map(
        (p) => ({ papel: p.a, responsabilidade: p.b }),
      ),
      controles_internos: lerTextos(pop?.controles_internos),
      riscos: lerPares(pop?.riscos, 'risco', 'mitigacao').map((p) => ({
        risco: p.a,
        mitigacao: p.b,
      })),
      registros: lerTextos(pop?.registros),
    },
  })

  const definicoes = useFieldArray({ control: form.control, name: 'definicoes' })
  const responsabilidades = useFieldArray({ control: form.control, name: 'responsabilidades' })
  const controles = useFieldArray({ control: form.control, name: 'controles_internos' })
  const riscos = useFieldArray({ control: form.control, name: 'riscos' })
  const registros = useFieldArray({ control: form.control, name: 'registros' })

  const gravar = useMutation({
    mutationFn: async (dados: DadosDoPop) => {
      // Sem empresa ativa não existe tenant para a linha, e a RLS barraria a
      // gravação com uma mensagem que não explica nada.
      if (!empresaId) throw new Error('Nenhuma empresa ativa para gravar o POP.')
      return salvarPop({ companyId: empresaId, processoId, dados })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chaves.pop(processoId) })
      // O selo de POP e o estágio da jornada leem esta tabela: deixá-los no
      // cache velho mostra "sem POP" logo depois de gravar o POP.
      void queryClient.invalidateQueries({ queryKey: ['processos'] })
      void queryClient.invalidateQueries({ queryKey: ['jornada'] })
      aoFechar()
    },
  })

  function enviar(c: Campos) {
    gravar.mutate({
      codigo: vazioVirarNulo(c.codigo),
      objetivo: vazioVirarNulo(c.objetivo),
      abrangencia: vazioVirarNulo(c.abrangencia),
      // Linha em branco não entra no array: item vazio no documento é seção
      // fingindo estar preenchida, e some da lista de lacunas.
      definicoes: c.definicoes
        .map((d) => ({ sigla: d.sigla.trim(), significado: d.significado.trim() }))
        .filter((d) => d.sigla !== '' && d.significado !== ''),
      responsabilidades: c.responsabilidades
        .map((r) => ({ papel: r.papel.trim(), responsabilidade: r.responsabilidade.trim() }))
        .filter((r) => r.papel !== '' && r.responsabilidade !== ''),
      controles_internos: c.controles_internos
        .map((i) => i.texto.trim())
        .filter((t) => t !== ''),
      riscos: c.riscos
        .map((r) => ({ risco: r.risco.trim(), mitigacao: r.mitigacao.trim() }))
        .filter((r) => r.risco !== '' && r.mitigacao !== ''),
      registros: c.registros.map((i) => i.texto.trim()).filter((t) => t !== ''),
      // Autoria: quem escreveu fica carimbado na primeira gravação e não é
      // sobrescrito depois. Trocar o nome a cada edição apagaria o rastro que a
      // segregação de funções da seção 8 depende para separar quem elabora de
      // quem aprova.
      elaborado_por: pop?.elaborado_por ?? usuario?.id ?? null,
      revisado_por: pop?.revisado_por ?? null,
    })
  }

  const erro = gravar.error ? mensagemDeErro(gravar.error) : null

  return (
    <PainelDeDetalhe
      aberto
      largura="larga"
      aoFechar={aoFechar}
      titulo={pop ? `Editar POP de ${processoNome}` : `Criar POP de ${processoNome}`}
      origem="Processo · as cinco seções que não saem do que já está mapeado"
      acoes={
        <>
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            size="sm"
            type="submit"
            form="form-pop"
            disabled={gravar.isPending || !empresaId}
          >
            {gravar.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {pop ? 'Salvar POP' : 'Gravar POP'}
          </Button>
        </>
      }
    >
      <form id="form-pop" onSubmit={form.handleSubmit(enviar)} className="space-y-5" noValidate>
        {erro && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
          >
            {erro}
          </p>
        )}

        {pop?.status === 'vigente' && (
          <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="space-y-0.5">
              <p className="font-semibold">
                Este POP está vigente: o que você salvar aqui não passa por aprovação.
              </p>
              <p>
                A gravação muda o texto que já está valendo. O documento continua vigente e
                carimbado por quem aprovou a versão anterior, esta edição não gera linha no
                histórico de revisões (seção 12), e um POP já vigente não pode ser aprovado de
                novo. Corrija redação por aqui; mudança de regra precisa ser combinada com
                quem aprovou.
              </p>
            </div>
          </div>
        )}

        <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Só estas cinco seções se escrevem à mão. As outras oito o documento monta sozinho: a
          descrição do processo (7) é o fluxo de etapas, os sistemas (6) saem do campo sistema
          dessas etapas, os indicadores (9) são os do processo e a identificação (1) vem do
          cadastro.
        </p>

        <Bloco titulo="Cabeçalho do documento">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="pop-codigo">Código do POP</Label>
            <Input
              id="pop-codigo"
              placeholder="Ex.: POP-CTB-001"
              aria-invalid={!!form.formState.errors.codigo}
              {...form.register('codigo')}
            />
            <p className="text-xs text-muted-foreground">
              O código pelo qual a área chama este documento. Em branco, o documento aparece
              sem código.
            </p>
          </div>
        </Bloco>

        <Bloco titulo="2. Objetivo">
          <CampoDeTexto
            id="pop-objetivo"
            rotulo="Objetivo"
            ajuda="O que este procedimento se propõe a garantir, em uma ou duas frases."
            placeholder="Ex.: Garantir que toda nota fiscal de serviço seja emitida até o dia 5 do mês seguinte."
            registro={form.register('objetivo')}
            erro={form.formState.errors.objetivo?.message}
          />
        </Bloco>

        <Bloco titulo="3. Abrangência">
          <CampoDeTexto
            id="pop-abrangencia"
            rotulo="Abrangência"
            ajuda="Onde este procedimento vale, e onde ele não vale. O limite é tão importante quanto o alcance."
            placeholder="Ex.: Vale para todas as empresas do grupo. Não vale para compras de estoque, que seguem outro POP."
            registro={form.register('abrangencia')}
            erro={form.formState.errors.abrangencia?.message}
          />
        </Bloco>

        <Bloco
          titulo="4. Definições e siglas"
          descricao="Sigla que só o time atual conhece trava quem chega depois."
        >
          <Lista
            vazia={definicoes.fields.length === 0}
            avisoDeVazio="Nenhuma definição cadastrada. A seção 4 vai aparecer como pendente no documento."
            rotuloDeAdicao="Adicionar definição"
            aoAdicionar={() => definicoes.append({ sigla: '', significado: '' })}
          >
            {definicoes.fields.map((campo, i) => (
              <Linha
                key={campo.id}
                rotuloDeRemocao={`Remover a definição ${i + 1}`}
                aoRemover={() => definicoes.remove(i)}
              >
                <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                  <div className="space-y-1">
                    <Label htmlFor={`pop-def-sigla-${campo.id}`} className="sr-only">
                      Sigla da definição {i + 1}
                    </Label>
                    <Input
                      id={`pop-def-sigla-${campo.id}`}
                      className="h-8"
                      placeholder="Sigla"
                      aria-invalid={!!form.formState.errors.definicoes?.[i]?.sigla}
                      {...form.register(`definicoes.${i}.sigla` as const)}
                    />
                    <ErroDoCampo mensagem={form.formState.errors.definicoes?.[i]?.sigla?.message} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pop-def-sig-${campo.id}`} className="sr-only">
                      Significado da definição {i + 1}
                    </Label>
                    <Input
                      id={`pop-def-sig-${campo.id}`}
                      className="h-8"
                      placeholder="Significado"
                      aria-invalid={!!form.formState.errors.definicoes?.[i]?.significado}
                      {...form.register(`definicoes.${i}.significado` as const)}
                    />
                    <ErroDoCampo
                      mensagem={form.formState.errors.definicoes?.[i]?.significado?.message}
                    />
                  </div>
                </div>
              </Linha>
            ))}
          </Lista>
        </Bloco>

        <Bloco
          titulo="5. Responsabilidades"
          descricao="O papel é função, não pessoa. Escrever o nome do ocupante obriga a revisar o documento a cada troca de time."
        >
          <Lista
            vazia={responsabilidades.fields.length === 0}
            avisoDeVazio="Nenhuma responsabilidade cadastrada. A seção 5 vai aparecer como pendente no documento."
            rotuloDeAdicao="Adicionar responsabilidade"
            aoAdicionar={() => responsabilidades.append({ papel: '', responsabilidade: '' })}
          >
            {responsabilidades.fields.map((campo, i) => (
              <Linha
                key={campo.id}
                rotuloDeRemocao={`Remover a responsabilidade ${i + 1}`}
                aoRemover={() => responsabilidades.remove(i)}
              >
                <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
                  <div className="space-y-1">
                    <Label htmlFor={`pop-resp-papel-${campo.id}`} className="sr-only">
                      Papel da responsabilidade {i + 1}
                    </Label>
                    <Input
                      id={`pop-resp-papel-${campo.id}`}
                      className="h-8"
                      placeholder="Papel (ex.: Analista fiscal)"
                      aria-invalid={!!form.formState.errors.responsabilidades?.[i]?.papel}
                      {...form.register(`responsabilidades.${i}.papel` as const)}
                    />
                    <ErroDoCampo
                      mensagem={form.formState.errors.responsabilidades?.[i]?.papel?.message}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pop-resp-texto-${campo.id}`} className="sr-only">
                      Responsabilidade {i + 1}
                    </Label>
                    <Input
                      id={`pop-resp-texto-${campo.id}`}
                      className="h-8"
                      placeholder="Pelo que este papel responde"
                      aria-invalid={
                        !!form.formState.errors.responsabilidades?.[i]?.responsabilidade
                      }
                      {...form.register(`responsabilidades.${i}.responsabilidade` as const)}
                    />
                    <ErroDoCampo
                      mensagem={
                        form.formState.errors.responsabilidades?.[i]?.responsabilidade?.message
                      }
                    />
                  </div>
                </div>
              </Linha>
            ))}
          </Lista>
        </Bloco>

        <Bloco
          titulo="8. Controles internos"
          descricao="Conferência, segregação de funções e evidência: é esta seção que separa um procedimento de uma lista de passos."
        >
          <Lista
            vazia={controles.fields.length === 0}
            avisoDeVazio="Nenhum controle cadastrado. A seção 8 vai aparecer como pendente no documento."
            rotuloDeAdicao="Adicionar controle"
            aoAdicionar={() => controles.append({ texto: '' })}
          >
            {controles.fields.map((campo, i) => (
              <Linha
                key={campo.id}
                rotuloDeRemocao={`Remover o controle interno ${i + 1}`}
                aoRemover={() => controles.remove(i)}
              >
                <Label htmlFor={`pop-ctrl-${campo.id}`} className="sr-only">
                  Controle interno {i + 1}
                </Label>
                <Input
                  id={`pop-ctrl-${campo.id}`}
                  className="h-8"
                  placeholder="Ex.: Quem lança o pagamento não é quem aprova o pagamento"
                  {...form.register(`controles_internos.${i}.texto` as const)}
                />
              </Linha>
            ))}
          </Lista>
        </Bloco>

        <Bloco
          titulo="10. Riscos e mitigações"
          descricao="Cada risco anda com a resposta dele. Risco sem mitigação escrita vira improviso no dia em que acontece."
        >
          <Lista
            vazia={riscos.fields.length === 0}
            avisoDeVazio="Nenhum risco cadastrado. A seção 10 vai aparecer como pendente no documento."
            rotuloDeAdicao="Adicionar risco"
            aoAdicionar={() => riscos.append({ risco: '', mitigacao: '' })}
          >
            {riscos.fields.map((campo, i) => (
              <Linha
                key={campo.id}
                rotuloDeRemocao={`Remover o risco ${i + 1}`}
                aoRemover={() => riscos.remove(i)}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`pop-risco-${campo.id}`} className="sr-only">
                      Risco {i + 1}
                    </Label>
                    <Input
                      id={`pop-risco-${campo.id}`}
                      className="h-8"
                      placeholder="Risco"
                      aria-invalid={!!form.formState.errors.riscos?.[i]?.risco}
                      {...form.register(`riscos.${i}.risco` as const)}
                    />
                    <ErroDoCampo mensagem={form.formState.errors.riscos?.[i]?.risco?.message} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pop-mitig-${campo.id}`} className="sr-only">
                      Mitigação do risco {i + 1}
                    </Label>
                    <Input
                      id={`pop-mitig-${campo.id}`}
                      className="h-8"
                      placeholder="Mitigação"
                      aria-invalid={!!form.formState.errors.riscos?.[i]?.mitigacao}
                      {...form.register(`riscos.${i}.mitigacao` as const)}
                    />
                    <ErroDoCampo
                      mensagem={form.formState.errors.riscos?.[i]?.mitigacao?.message}
                    />
                  </div>
                </div>
              </Linha>
            ))}
          </Lista>
        </Bloco>

        <Bloco
          titulo="11. Registros"
          descricao="Que evidência o processo deixa, e onde ela fica guardada."
        >
          <Lista
            vazia={registros.fields.length === 0}
            avisoDeVazio="Nenhum registro cadastrado. A seção 11 vai aparecer como pendente no documento."
            rotuloDeAdicao="Adicionar registro"
            aoAdicionar={() => registros.append({ texto: '' })}
          >
            {registros.fields.map((campo, i) => (
              <Linha
                key={campo.id}
                rotuloDeRemocao={`Remover o registro ${i + 1}`}
                aoRemover={() => registros.remove(i)}
              >
                <Label htmlFor={`pop-reg-${campo.id}`} className="sr-only">
                  Registro {i + 1}
                </Label>
                <Input
                  id={`pop-reg-${campo.id}`}
                  className="h-8"
                  placeholder="Ex.: Protocolo da nota, guardado na pasta do mês"
                  {...form.register(`registros.${i}.texto` as const)}
                />
              </Linha>
            ))}
          </Lista>
        </Bloco>
      </form>
    </PainelDeDetalhe>
  )
}

/**
 * As listas vêm do banco como jsonb, então um item torto (importação antiga,
 * campo renomeado) precisa ser tolerado: derrubar o formulário inteiro deixaria
 * o POP sem edição possível.
 */
function lerPares(valor: unknown, a: string, b: string): { a: string; b: string }[] {
  if (!Array.isArray(valor)) return []
  const itens: { a: string; b: string }[] = []
  for (const bruto of valor) {
    if (typeof bruto !== 'object' || bruto === null) continue
    const item = bruto as Record<string, unknown>
    itens.push({ a: comoTexto(item[a]), b: comoTexto(item[b]) })
  }
  return itens
}

function lerTextos(valor: unknown): { texto: string }[] {
  if (!Array.isArray(valor)) return []
  return valor.filter((i): i is string => typeof i === 'string').map((texto) => ({ texto }))
}

function comoTexto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

function Bloco({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {titulo}
      </legend>
      {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      {children}
    </fieldset>
  )
}

function Lista({
  vazia,
  avisoDeVazio,
  rotuloDeAdicao,
  aoAdicionar,
  children,
}: {
  vazia: boolean
  avisoDeVazio: string
  rotuloDeAdicao: string
  aoAdicionar: () => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      {/* Lista vazia diz que a seção vai sair pendente, em vez de só não
          mostrar nada: a consequência aparece antes de gravar. */}
      {vazia ? <p className="text-xs text-muted-foreground">{avisoDeVazio}</p> : children}
      <Button type="button" variant="outline" size="sm" onClick={aoAdicionar}>
        <Plus className="size-4" aria-hidden />
        {rotuloDeAdicao}
      </Button>
    </div>
  )
}

function Linha({
  rotuloDeRemocao,
  aoRemover,
  children,
}: {
  rotuloDeRemocao: string
  aoRemover: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={rotuloDeRemocao}
        onClick={aoRemover}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  )
}

function ErroDoCampo({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null
  return (
    <p role="alert" className="text-xs text-destructive">
      {mensagem}
    </p>
  )
}

function CampoDeTexto({
  id,
  rotulo,
  ajuda,
  placeholder,
  registro,
  erro,
}: {
  id: string
  rotulo: string
  ajuda: string
  placeholder: string
  registro: UseFormRegisterReturn
  erro?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <textarea
        id={id}
        rows={3}
        placeholder={placeholder}
        aria-invalid={!!erro}
        className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none aria-invalid:border-destructive focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        {...registro}
      />
      {erro ? (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{ajuda}</p>
      )}
    </div>
  )
}
