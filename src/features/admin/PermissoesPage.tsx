import { useQuery } from '@tanstack/react-query'
import { Check, Database, Minus } from 'lucide-react'
import { useMemo } from 'react'

import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listarPresets } from '@/features/admin/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'

/** Agrupa `okr.edit` sob "okr", para a matriz ficar legível. */
function modulo(chave: string) {
  return chave.split('.')[0] ?? chave
}

export function PermissoesPage() {
  const { empresaAtiva } = useEmpresa()

  const consulta = useQuery({
    queryKey: chaves.presets(),
    queryFn: listarPresets,
    staleTime: 10 * 60_000,
  })

  const presets = useMemo(() => consulta.data ?? [], [consulta.data])

  const chavesOrdenadas = useMemo(() => {
    const todas = new Set<string>()
    for (const p of presets) for (const c of p.permissoes) todas.add(c)
    return [...todas].toSorted()
  }, [presets])

  const minhas = new Set(empresaAtiva?.permissoes ?? [])

  return (
    <Page title="Permissões" description="Preset de cada papel, lido do banco">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
          <Database className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold">
              Esta matriz é lida da função SQL <code>app.get_role_preset_permissions</code>,
              a mesma que as policies consultam.
            </p>
            <p>
              Não existe uma cópia em TypeScript decidindo acesso. Se existisse, ela produziria
              permissão que aparece na tela e não faz nada no banco. Para mudar um preset,
              edite a função numa migration.
            </p>
          </div>
        </div>

        {empresaAtiva && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Suas permissões efetivas em {empresaAtiva.nome_fantasia}
            </p>
            <div className="flex flex-wrap gap-1 pt-2">
              {empresaAtiva.is_admin && (
                <Badge variant="success-subtle">admin da empresa: recebe tudo</Badge>
              )}
              {[...minhas].toSorted().map((c) => (
                <Badge key={c} variant="secondary" className="font-mono text-[10px]">
                  {c}
                </Badge>
              ))}
              {minhas.size === 0 && !empresaAtiva.is_admin && (
                <span className="text-xs text-muted-foreground">
                  Nenhuma permissão. Você enxerga, mas não edita.
                </span>
              )}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <EstadoDaTela
            carregando={consulta.isLoading}
            erro={consulta.error}
            quantidade={chavesOrdenadas.length}
            aoTentarDeNovo={() => void consulta.refetch()}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Permissão</TableHead>
                    {presets.map((p) => (
                      <TableHead key={p.papel} className="text-center whitespace-nowrap">
                        {p.papel}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chavesOrdenadas.map((chave, i) => {
                    const anterior = i > 0 ? chavesOrdenadas[i - 1] : undefined
                    const novoModulo = !anterior || modulo(anterior) !== modulo(chave)
                    return (
                      <TableRow key={chave}>
                        <TableCell className="font-mono text-xs">
                          {novoModulo && (
                            <span className="mb-1 block text-[10px] font-sans font-semibold tracking-wider text-muted-foreground uppercase">
                              {modulo(chave)}
                            </span>
                          )}
                          <span className="flex items-center gap-2">
                            {chave}
                            {minhas.has(chave) && (
                              <Badge variant="success-subtle" className="text-[10px]">
                                você tem
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        {presets.map((p) => (
                          <TableCell key={p.papel} className="text-center">
                            {p.permissoes.includes(chave) ? (
                              <Check className="mx-auto size-4 text-success" aria-label="tem" />
                            ) : (
                              <Minus
                                className="mx-auto size-4 text-muted-foreground/40"
                                aria-label="não tem"
                              />
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </EstadoDaTela>
        </div>
      </div>
    </Page>
  )
}
