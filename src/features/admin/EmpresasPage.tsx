import { useQuery } from '@tanstack/react-query'
import { Building2, Network } from 'lucide-react'

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
import { listarEmpresas } from '@/features/admin/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'

export function EmpresasPage() {
  const { empresas: minhas, empresaAtiva, definirEmpresaAtiva } = useEmpresa()

  const consulta = useQuery({
    queryKey: chaves.empresas(),
    queryFn: listarEmpresas,
  })

  const linhas = consulta.data ?? []
  const porId = new Map(linhas.map((e) => [e.id, e]))

  return (
    <Page
      title="Empresas"
      description="Holding e controladas do grupo"
    >
      <div className="space-y-4">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Esta lista já vem filtrada pela RLS: você só enxerga as empresas em que tem
          vínculo ativo. Criar e excluir empresa é operação de plataforma e é feita pelo
          time de TI, com migration.
        </p>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <EstadoDaTela
            carregando={consulta.isLoading}
            erro={consulta.error}
            quantidade={linhas.length}
            aoTentarDeNovo={() => void consulta.refetch()}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome fantasia</TableHead>
                    <TableHead>Razão social</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Controladora</TableHead>
                    <TableHead>Meu vínculo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((empresa) => {
                    const vinculo = minhas.find((m) => m.id === empresa.id)
                    const ativa = empresaAtiva?.id === empresa.id
                    const pai = empresa.parent_company_id
                      ? porId.get(empresa.parent_company_id)
                      : null
                    return (
                      <TableRow
                        key={empresa.id}
                        onClick={() => definirEmpresaAtiva(empresa.id)}
                        className="cursor-pointer"
                        data-state={ativa ? 'selected' : undefined}
                      >
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            <Building2 className="size-3.5 text-muted-foreground" aria-hidden />
                            {empresa.nome_fantasia ?? empresa.razao_social}
                            {ativa && <Badge variant="info-subtle">ativa</Badge>}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {empresa.razao_social}
                        </TableCell>
                        <TableCell>
                          <Badge variant={empresa.tipo === 'holding' ? 'info-subtle' : 'secondary'}>
                            {empresa.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {pai ? (
                            <span className="flex items-center gap-1.5">
                              <Network className="size-3.5" aria-hidden />
                              {pai.nome_fantasia ?? pai.razao_social}
                            </span>
                          ) : (
                            <span className="text-xs">é a controladora</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {vinculo ? (
                            <span className="flex flex-wrap gap-1">
                              <Badge variant="secondary">{vinculo.nivel}</Badge>
                              {vinculo.is_admin && (
                                <Badge variant="success-subtle">admin</Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">sem vínculo</span>
                          )}
                        </TableCell>
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
