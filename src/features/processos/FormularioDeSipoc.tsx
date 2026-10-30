import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle } from 'lucide-react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
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
import { Label } from '@/components/ui/label'
import type { Sipoc } from '@/features/processos/api'
import { vazioVirarNulo } from '@/lib/formato'

const esquema = z
  .object({
    suppliers: z.string(),
    inputs: z.string(),
    outputs: z.string(),
    customers: z.string(),
  })
  // Gravar os quatro campos em branco cria a linha do SIPOC assim mesmo, e o
  // inventário passa a contar o processo como "tem SIPOC" e, se houver um
  // indicador Y, como "pronto para DMAIC". Um contorno em branco não delimita
  // nada, então o registro vazio seria a tela afirmando o que não existe.
  .refine(
    (v) => [v.suppliers, v.inputs, v.outputs, v.customers].some((t) => t.trim() !== ''),
    {
      path: ['suppliers'],
      message:
        'Preencha ao menos um dos quatro campos. Um SIPOC em branco marca o processo como delimitado sem dizer onde ele começa nem onde termina.',
    },
  )

type Campos = z.infer<typeof esquema>

export type DadosDoSipoc = {
  suppliers: string | null
  inputs: string | null
  outputs: string | null
  customers: string | null
}

export interface FormularioDeSipocProps {
  processoNome: string
  /** SIPOC já gravado, ou null quando o processo ainda não tem um. */
  sipoc: Sipoc | null
  aoFechar: () => void
  aoSalvar: (dados: DadosDoSipoc) => void
  salvando: boolean
  erro: string | null
}

/**
 * SIPOC em DIALOG: são quatro campos de uma decisão só, e o painel do processo
 * atrás não precisa ser comparado enquanto se escreve.
 */
export function FormularioDeSipoc({
  processoNome,
  sipoc,
  aoFechar,
  aoSalvar,
  salvando,
  erro,
}: FormularioDeSipocProps) {
  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      suppliers: sipoc?.suppliers ?? '',
      inputs: sipoc?.inputs ?? '',
      outputs: sipoc?.outputs ?? '',
      customers: sipoc?.customers ?? '',
    },
  })

  function enviar(c: Campos) {
    aoSalvar({
      suppliers: vazioVirarNulo(c.suppliers),
      inputs: vazioVirarNulo(c.inputs),
      outputs: vazioVirarNulo(c.outputs),
      customers: vazioVirarNulo(c.customers),
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {sipoc ? 'Editar SIPOC' : 'Preencher SIPOC'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            SIPOC é o contorno do processo em cinco partes (Suppliers, Inputs, Process,
            Outputs, Customers). Aqui você preenche as quatro das pontas: quem fornece, o
            que entra, o que sai e quem recebe. O "P" do meio, a sequência de etapas, é
            desenhado em "Mapear fluxo", no painel do processo, porque cada etapa tem
            responsável, sistema e tempo próprios e não cabe num campo de texto. É
            pré-requisito de um projeto DMAIC porque sem ele não dá para dizer onde o
            problema começa e onde termina, e a fase Define fica sem escopo.
          </DialogDescription>
        </DialogHeader>

        <form id="form-sipoc" onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
          {erro && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {erro}
            </p>
          )}

          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Processo: <span className="font-medium text-foreground">{processoNome}</span>
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoDeTexto
              id="sipoc-suppliers"
              rotulo="Suppliers (fornecedores)"
              ajuda="Quem entrega as entradas, dentro ou fora da empresa."
              placeholder="Ex.: Comercial, fornecedor parceiro, cliente"
              registro={form.register('suppliers')}
              erro={form.formState.errors.suppliers?.message}
            />
            <CampoDeTexto
              id="sipoc-inputs"
              rotulo="Inputs (entradas)"
              ajuda="O que precisa chegar para o processo poder rodar."
              placeholder="Ex.: Contrato assinado, cadastro do cliente, ordem de serviço"
              registro={form.register('inputs')}
            />
            <CampoDeTexto
              id="sipoc-outputs"
              rotulo="Outputs (saídas)"
              ajuda="O que o processo entrega quando termina."
              placeholder="Ex.: Nota fiscal emitida, pedido entregue"
              registro={form.register('outputs')}
            />
            <CampoDeTexto
              id="sipoc-customers"
              rotulo="Customers (clientes)"
              ajuda="Quem recebe a saída e julga se ela ficou boa."
              placeholder="Ex.: Cliente final, Financeiro, Suporte"
              registro={form.register('customers')}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button size="sm" type="submit" form="form-sipoc" disabled={salvando}>
            {salvando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {sipoc ? 'Salvar SIPOC' : 'Gravar SIPOC'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        <p className="text-xs text-destructive">{erro}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{ajuda}</p>
      )}
    </div>
  )
}
