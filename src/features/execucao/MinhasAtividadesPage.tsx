import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, LoaderCircle } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  minhasAtividades,
  moverAtividade,
  STATUS_DO_KANBAN,
  type MinhaAtividade,
} from '@/features/execucao/api'
import { useAuth } from '@/hooks/use-auth'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { fmt, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'
import { cn } from '@/lib/utils'

const HORIZONTES = ['diario', 'semanal', 'mensal', 'trimestral', 'anual'] as const

const hoje = () => new Date().toISOString().slice(0, 10)

function fimDaSemana(): string {
  const d = new Date()
  d.setDate(d.getDate() + (7 - d.getDay()))
  return d.toISOString().slice(0, 10)
}

export function MinhasAtividadesPage() {
  const { empresaAtiva } = useEmpresa()
  const { usuario } = useAuth()
  const queryClient = useQueryClient()
  const empresaId = empresaAtiva?.id ?? null
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)

  const consulta = useQuery({
    queryKey: chaves.minhasAtividades(empresaId),
    enabled: !!empresaId && !!usuario,
    queryFn: () => minhasAtividades(empresaId!, usuario!.id),
  })

  const mudar = useMutation({
    mutationFn: (dados: { atividade: MinhaAtividade; status: string }) =>
      moverAtividade({
        id: dados.atividade.id,
        status: dados.status,
        versao: dados.atividade.updated_at,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chaves.minhasAtividades(empresaId) })
      void queryClient.invalidateQueries({ queryKey: ['projetos'] })
    },
  })

  const todas = useMemo(() => consulta.data ?? [], [consulta.data])
  const visiveis = mostrarConcluidas ? todas : todas.filter((a) => a.status !== 'concluido')

  const resumo = useMemo(() => {
    const abertas = todas.filter((a) => a.status !== 'concluido')
    const limite = hoje()
    const semana = fimDaSemana()
    return {
      abertas: abertas.length,
      hoje: abertas.filter((a) => a.data_prazo === limite).length,
      semana: abertas.filter((a) => a.data_prazo && a.data_prazo <= semana).length,
      atrasadas: abertas.filter((a) => a.data_prazo && a.data_prazo < limite).length,
    }
  }, [todas])

  const porHorizonte = useMemo(() => {
    const mapa = new Map<string, MinhaAtividade[]>()
    for (const h of HORIZONTES) mapa.set(h, [])
    for (const a of visiveis) mapa.set(a.horizonte, [...(mapa.get(a.horizonte) ?? []), a])
    return mapa
  }, [visiveis])

  return (
    <Page
      title="Minhas atividades"
      description="O que está na sua mão, do dia ao ano"
      actions={
        <Button size="sm" variant="outline" onClick={() => setMostrarConcluidas((v) => !v)}>
          {mostrarConcluidas ? 'Ocultar concluídas' : 'Mostrar concluídas'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoDeMetrica rotulo="Abertas" valor={resumo.abertas} carregando={consulta.isLoading} />
          <CartaoDeMetrica
            rotulo="Vencem hoje"
            valor={resumo.hoje}
            tom={resumo.hoje > 0 ? 'warning' : 'neutro'}
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Nesta semana"
            valor={resumo.semana}
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Atrasadas"
            valor={resumo.atrasadas}
            tom={resumo.atrasadas > 0 ? 'destructive' : 'success'}
            carregando={consulta.isLoading}
          />
        </div>

        {mudar.error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground">
            {mensagemDeErro(mudar.error)}
          </p>
        )}

        <EstadoDaTela
          carregando={consulta.isLoading}
          erro={consulta.error}
          quantidade={visiveis.length}
          aoTentarDeNovo={() => void consulta.refetch()}
          vazio={
            <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
              <p className="text-sm font-medium">
                {mostrarConcluidas
                  ? 'Nenhuma atividade atribuída a você nesta empresa'
                  : 'Nenhuma atividade aberta'}
              </p>
              <p className="pt-1 text-xs text-muted-foreground">
                Isto é "sem correspondência", não uma falha de consulta.
              </p>
            </div>
          }
        >
          <div className="space-y-4">
            {HORIZONTES.map((h) => {
              const lista = porHorizonte.get(h) ?? []
              if (lista.length === 0) return null
              return (
                <section key={h} className="overflow-hidden rounded-lg border border-border bg-card">
                  <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                    <h2 className="text-sm font-semibold">{rotulo(rotulos.horizonte, h)}</h2>
                    <Badge variant="secondary">{lista.length}</Badge>
                  </header>

                  <ul className="divide-y divide-border">
                    {lista.map((a) => {
                      const atrasada =
                        !!a.data_prazo && a.data_prazo < hoje() && a.status !== 'concluido'
                      return (
                        <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                          <span className="min-w-48 flex-1">
                            <span
                              className={cn(
                                'block text-sm',
                                a.status === 'concluido' && 'text-muted-foreground line-through',
                              )}
                            >
                              {a.titulo}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {a.projetos?.nome ?? 'sem projeto'}
                              {a.key_results?.descricao
                                ? ` · avança o KR: ${a.key_results.descricao}`
                                : ''}
                            </span>
                          </span>

                          {a.data_prazo && (
                            <span
                              className={cn(
                                'shrink-0 text-xs',
                                atrasada ? 'font-medium text-destructive' : 'text-muted-foreground',
                              )}
                            >
                              {fmt.data(a.data_prazo)}
                            </span>
                          )}

                          <Select
                            value={a.status}
                            onValueChange={(v) => mudar.mutate({ atividade: a, status: v })}
                            disabled={mudar.isPending}
                          >
                            <SelectTrigger size="sm" className="w-36 shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_DO_KANBAN.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {rotulo(rotulos.status_atividade, s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {a.status !== 'concluido' && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Concluir ${a.titulo}`}
                              disabled={mudar.isPending}
                              onClick={() => mudar.mutate({ atividade: a, status: 'concluido' })}
                            >
                              {mudar.isPending ? (
                                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                              ) : (
                                <CircleCheck className="size-4" aria-hidden />
                              )}
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        </EstadoDaTela>
      </div>
    </Page>
  )
}
