import { useState } from 'react'

import { Page } from '@/components/shell/Page'
import { ActiveFiltersBar } from '@/components/ui/active-filters-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ColumnFilterHeader } from '@/components/ui/column-filter-header'
import {
  ConsultaFalhou,
  SemCorrespondencia,
  ValorOuSemDado,
} from '@/components/ui/estado-da-tela'
import { Farol, type EstadoDoFarol } from '@/components/ui/farol'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelectSearchable } from '@/components/ui/multi-select-searchable'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { TablePagination } from '@/components/ui/table-pagination'
import {
  definirFiltro,
  removerFiltro,
  type Filtros,
  type Ordenacao,
} from '@/lib/filtros'

const TOKENS_DE_SUPERFICIE = [
  ['background', 'bg-background'],
  ['card', 'bg-card'],
  ['muted', 'bg-muted'],
  ['secondary', 'bg-secondary'],
  ['accent', 'bg-accent'],
  ['input-background', 'bg-input-background'],
  ['border', 'bg-border'],
] as const

const TOKENS_DE_ESTADO = [
  ['primary', 'bg-primary text-primary-foreground'],
  ['success', 'bg-success text-success-foreground'],
  ['warning', 'bg-warning text-warning-foreground'],
  ['info', 'bg-info text-info-foreground'],
  ['destructive', 'bg-destructive text-destructive-foreground'],
] as const

const FAROIS: EstadoDoFarol[] = ['verde', 'amarelo', 'vermelho', 'neutro', 'sem_dado']

const AREAS: SearchableSelectOption[] = [
  { value: 'a1', label: 'Controladoria e Fiscal', description: 'Administrativo-Financeiro', badge: 'gerência' },
  { value: 'a2', label: 'Tesouraria', description: 'Administrativo-Financeiro', badge: 'gerência' },
  { value: 'a3', label: 'Administrativo e Jurídico', description: 'Administrativo-Financeiro', badge: 'gerência' },
  { value: 'a4', label: 'Suprimentos', description: 'Administrativo-Financeiro', badge: 'gerência' },
  { value: 'a5', label: 'Logística', description: 'Operações', badge: 'gerência' },
  { value: 'a6', label: 'Marketing', description: 'Comercial', badge: 'gerência' },
]

const STATUS: SearchableSelectOption[] = [
  { value: 'a_fazer', label: 'A fazer' },
  { value: 'fazendo', label: 'Fazendo' },
  { value: 'revisao', label: 'Revisão' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'bloqueado', label: 'Bloqueado' },
]

const ROTULOS_DE_COLUNA = {
  titulo: 'Título',
  area: 'Área',
  status: 'Status',
  prazo: 'Prazo',
}

/**
 * Página de verificação do design system. Não faz parte do produto: existe
 * para conferir, nos dois temas, que todo token resolve e que os primitives
 * têm o comportamento certo antes de virarem doze variações por tela.
 *
 * Rota: /design-system (fora da navegação).
 */
export function DesignSystemPage() {
  const [filtros, setFiltros] = useState<Filtros>({
    titulo: { tipo: 'texto', valor: 'migração' },
    status: { tipo: 'selecao', valor: ['fazendo', 'bloqueado'] },
  })
  const [ordenacao, setOrdenacao] = useState<Ordenacao | null>({
    coluna: 'prazo',
    direcao: 'asc',
  })
  const [area, setArea] = useState<string | null>('a2')
  const [areasSelecionadas, setAreasSelecionadas] = useState<string[]>(['a1', 'a4'])
  const [pagina, setPagina] = useState(3)
  const [tamanho, setTamanho] = useState(50)

  return (
    <Page
      title="Design system"
      description="Verificação de tokens e primitives"
      actions={
        <Button variant="outline" size="sm" asChild>
          <a href="/">Voltar ao app</a>
        </Button>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tokens</CardTitle>
            <CardDescription>
              Troque o tema no header. Todo quadro abaixo precisa mudar junto: se algum
              ficar parado, aquela cor foi definida fora da camada de tokens.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="pb-2 text-xs font-medium text-muted-foreground">Superfícies</p>
              <div className="flex flex-wrap gap-2">
                {TOKENS_DE_SUPERFICIE.map(([nome, classe]) => (
                  <div key={nome} className="w-36">
                    <div className={`h-10 rounded-md border border-border ${classe}`} />
                    <p className="pt-1 text-[11px] text-muted-foreground">{nome}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="pb-2 text-xs font-medium text-muted-foreground">
                Estados (o shadcn traz só destructive)
              </p>
              <div className="flex flex-wrap gap-2">
                {TOKENS_DE_ESTADO.map(([nome, classe]) => (
                  <div
                    key={nome}
                    className={`grid h-10 w-36 place-items-center rounded-md text-xs font-medium ${classe}`}
                  >
                    {nome}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="pb-2 text-xs font-medium text-muted-foreground">
                Faróis (a regra vive no banco; o componente só mapeia)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {FAROIS.map((f) => (
                  <Farol key={f} estado={f} />
                ))}
                {FAROIS.map((f) => (
                  <Farol key={`${f}-suave`} estado={f} suave />
                ))}
                <Farol estado="verde" rotulo="97% da meta" suave />
              </div>
            </div>

            <div>
              <p className="pb-2 text-xs font-medium text-muted-foreground">Botões e badges</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button>Ação primária</Button>
                <Button variant="secondary">Secundária</Button>
                <Button variant="outline">Contorno</Button>
                <Button variant="ghost">Fantasma</Button>
                <Button variant="destructive">Excluir</Button>
                <Badge>padrão</Badge>
                <Badge variant="secondary">secundário</Badge>
                <Badge variant="outline">contorno</Badge>
              </div>
            </div>

            <div>
              <p className="pb-2 text-xs font-medium text-muted-foreground">
                Vazio nunca é zero
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span>
                  Ganho realizado: <ValorOuSemDado valor={0} formatar={(v) => `R$ ${v},00`} />
                </span>
                <span>
                  Ganho realizado: <ValorOuSemDado valor={null} />
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Primitives</CardTitle>
            <CardDescription>
              Construídos cedo e com API estável, para não nascerem doze filtros
              diferentes ao longo do produto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ds-area">searchable-select</Label>
                <SearchableSelect
                  id="ds-area"
                  options={AREAS}
                  value={area}
                  onChange={setArea}
                  placeholder="Selecionar área"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ds-areas">multi-select-searchable</Label>
                <MultiSelectSearchable
                  id="ds-areas"
                  options={AREAS}
                  value={areasSelecionadas}
                  onChange={setAreasSelecionadas}
                  placeholder="Todas as áreas"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ds-input">input</Label>
                <Input id="ds-input" placeholder="Buscar por título" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>active-filters-bar</Label>
              <ActiveFiltersBar
                filters={filtros}
                columnLabels={ROTULOS_DE_COLUNA}
                valueLabels={{
                  status: (v) => STATUS.find((s) => s.value === v)?.label ?? v,
                }}
                onClearFilter={(chave) => setFiltros((f) => removerFiltro(f, chave))}
                onClearAll={() => setFiltros({})}
              />
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-4 gap-3 border-b border-border bg-muted/50 px-3 py-2 text-xs">
                <ColumnFilterHeader
                  columnKey="titulo"
                  label="Título"
                  filterType="texto"
                  value={filtros.titulo}
                  onChange={(v) =>
                    setFiltros((f) =>
                      v ? definirFiltro(f, 'titulo', v) : removerFiltro(f, 'titulo'),
                    )
                  }
                  sort={ordenacao}
                  onSortChange={setOrdenacao}
                />
                <ColumnFilterHeader
                  columnKey="area"
                  label="Área"
                  filterType="selecao"
                  options={AREAS}
                  value={filtros.area}
                  onChange={(v) =>
                    setFiltros((f) =>
                      v ? definirFiltro(f, 'area', v) : removerFiltro(f, 'area'),
                    )
                  }
                  sort={ordenacao}
                  onSortChange={setOrdenacao}
                />
                <ColumnFilterHeader
                  columnKey="status"
                  label="Status"
                  filterType="selecao"
                  options={STATUS}
                  value={filtros.status}
                  onChange={(v) =>
                    setFiltros((f) =>
                      v ? definirFiltro(f, 'status', v) : removerFiltro(f, 'status'),
                    )
                  }
                  sort={ordenacao}
                  onSortChange={setOrdenacao}
                />
                <ColumnFilterHeader
                  columnKey="prazo"
                  label="Prazo"
                  filterType="intervalo"
                  align="right"
                  value={filtros.prazo}
                  onChange={(v) =>
                    setFiltros((f) =>
                      v ? definirFiltro(f, 'prazo', v) : removerFiltro(f, 'prazo'),
                    )
                  }
                  sort={ordenacao}
                  onSortChange={setOrdenacao}
                />
              </div>

              <SemCorrespondencia />

              <TablePagination
                page={pagina}
                pageSize={tamanho}
                totalCount={1_284}
                onPageChange={setPagina}
                onPageSizeChange={(t) => {
                  setTamanho(t)
                  setPagina(1)
                }}
              />
            </div>

            <div className="rounded-lg border border-border">
              <ConsultaFalhou
                erro={{ message: 'canceling statement due to statement timeout', code: '57014' }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}
