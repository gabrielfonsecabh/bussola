import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, LoaderCircle, Save } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CartaoDeMetrica } from '@/components/dados/CartaoDeMetrica'
import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Page } from '@/components/shell/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EstadoDaTela } from '@/components/ui/estado-da-tela'
import { Farol } from '@/components/ui/farol'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { carregarKit, congelarKit, estadoDoItemDoKit, type LinhaDoKit } from '@/features/gestao/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { baixarCsv } from '@/lib/exportar'
import { periodoAtual, rotulo, rotulos } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

export function KitPage() {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const [periodo, setPeriodo] = useState(periodoAtual())
  const [selecionada, setSelecionada] = useState<LinhaDoKit | null>(null)

  const consulta = useQuery({
    queryKey: chaves.kit(empresaId, periodo),
    enabled: !!empresaId,
    queryFn: () => carregarKit(empresaId!, periodo),
  })

  const congelar = useMutation({
    mutationFn: () => congelarKit(empresaId!, periodo),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: chaves.kit(empresaId, periodo) }),
  })

  const linhas = useMemo(() => consulta.data ?? [], [consulta.data])

  const resumo = useMemo(
    () => ({
      areas: linhas.length,
      emDia: linhas.filter((l) => l.percentual === 100).length,
      parcial: linhas.filter((l) => l.percentual > 0 && l.percentual < 100).length,
      pendente: linhas.filter((l) => l.percentual === 0).length,
      media:
        linhas.length === 0 ? null : linhas.reduce((s, l) => s + l.percentual, 0) / linhas.length,
    }),
    [linhas],
  )

  return (
    <Page
      title="Kit mínimo de gestão"
      description="Matriz de área por item, derivada dos módulos"
      actions={
        <>
          <Input
            type="month"
            className="h-8 w-36"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            aria-label="Período do Kit"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={linhas.length === 0}
            onClick={() =>
              baixarCsv(
                `kit-${empresaAtiva?.nome_fantasia ?? 'empresa'}-${periodo}`,
                linhas.map((l) => ({
                  area: l.area_nome,
                  tipo: rotulo(rotulos.tipo_area, l.area_tipo),
                  responsavel: l.responsavel_nome ?? '',
                  mapa_estrategico: l.mapa_status,
                  processos_procedimentos: l.processos_status,
                  opr: l.opr_status,
                  percentual: l.percentual,
                })),
              )
            }
          >
            <Download className="size-4" aria-hidden />
            Exportar
          </Button>
          {podeFazer('kit.view') && (
            <Button
              size="sm"
              disabled={congelar.isPending || linhas.length === 0}
              onClick={() => congelar.mutate()}
              title="Grava o resultado deste mês em app.kit_gestao, para virar histórico."
            >
              {congelar.isPending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Congelar o mês
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="max-w-3xl text-sm text-muted-foreground">
          O status de cada item vem do que existe DE FATO nos módulos: mapa lê os OKRs da área,
          processos lê o SIPOC dos processos da área, e OPR lê se o relatório do mês foi
          publicado. Ninguém digita "em dia" aqui.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CartaoDeMetrica rotulo="Áreas" valor={resumo.areas} carregando={consulta.isLoading} />
          <CartaoDeMetrica
            rotulo="Kit completo"
            valor={resumo.emDia}
            tom="success"
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Parcial"
            valor={resumo.parcial}
            tom="warning"
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Nada feito"
            valor={resumo.pendente}
            tom={resumo.pendente > 0 ? 'destructive' : 'success'}
            carregando={consulta.isLoading}
          />
          <CartaoDeMetrica
            rotulo="Média do Kit"
            valor={resumo.media}
            formatar={(v) => `${Math.round(v)}%`}
            detalhe="pesa no bônus setorial"
            carregando={consulta.isLoading}
          />
        </div>

        {congelar.error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground">
            {mensagemDeErro(congelar.error)}
          </p>
        )}
        {congelar.isSuccess && (
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {congelar.data} linha(s) gravada(s) no histórico do Kit para {periodo}.
          </p>
        )}

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <EstadoDaTela
            carregando={consulta.isLoading}
            erro={consulta.error}
            quantidade={linhas.length}
            aoTentarDeNovo={() => void consulta.refetch()}
            vazio={
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium">Nenhuma área cadastrada nesta empresa</p>
                <p className="pt-1 text-xs text-muted-foreground">
                  O Kit é avaliado por área. Cadastre o organograma em Administração {'>'} Áreas.
                </p>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-64">Área</TableHead>
                    <TableHead className="text-center">Mapa estratégico</TableHead>
                    <TableHead className="text-center">Processos e procedimentos</TableHead>
                    <TableHead className="text-center">OPR do mês</TableHead>
                    <TableHead className="text-right">Kit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow
                      key={l.area_id}
                      onClick={() => setSelecionada(l)}
                      className="cursor-pointer"
                    >
                      <TableCell>
                        <span className="block font-medium">{l.area_nome}</span>
                        <span className="block text-xs text-muted-foreground">
                          {rotulo(rotulos.tipo_area, l.area_tipo)}
                          {l.responsavel_nome ? ` · ${l.responsavel_nome}` : ' · sem responsável'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Farol estado={estadoDoItemDoKit(l.mapa_status)} suave rotulo={l.mapa_status} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Farol
                          estado={estadoDoItemDoKit(l.processos_status)}
                          suave
                          rotulo={l.processos_status}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Farol estado={estadoDoItemDoKit(l.opr_status)} suave rotulo={l.opr_status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            l.percentual === 100
                              ? 'success-subtle'
                              : l.percentual === 0
                                ? 'destructive-subtle'
                                : 'warning-subtle'
                          }
                        >
                          {l.percentual}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </EstadoDaTela>
        </div>
      </div>

      {selecionada && (
        <PainelDeDetalhe
          aberto
          aoFechar={() => setSelecionada(null)}
          titulo={selecionada.area_nome}
          origem={`Kit de gestão · ${periodo} · responsável ${
            selecionada.responsavel_nome ?? 'não definido'
          }`}
        >
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cada item abaixo mostra o que o banco encontrou. É esta evidência que define o
              status, e é ela que o diretor cobra na reunião.
            </p>

            <ItemDoKit
              titulo="Mapa estratégico da área"
              status={selecionada.mapa_status}
              detalhe={selecionada.mapa_detalhe}
              origem="Lido dos OKRs cadastrados para a área (módulo OKR)."
            />
            <ItemDoKit
              titulo="Processos e procedimentos"
              status={selecionada.processos_status}
              detalhe={selecionada.processos_detalhe}
              origem="Lido dos processos da área que têm SIPOC preenchido."
            />
            <ItemDoKit
              titulo="One Page Report"
              status={selecionada.opr_status}
              detalhe={selecionada.opr_detalhe}
              origem="Lido do OPR do período com status publicado."
            />
          </div>
        </PainelDeDetalhe>
      )}
    </Page>
  )
}

function ItemDoKit({
  titulo,
  status,
  detalhe,
  origem,
}: {
  titulo: string
  status: string
  detalhe: string
  origem: string
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{titulo}</p>
        <Farol estado={estadoDoItemDoKit(status)} suave rotulo={status} />
      </div>
      <p className="pt-1.5 text-xs">{detalhe}</p>
      <p className="pt-1 text-[11px] text-muted-foreground">{origem}</p>
    </div>
  )
}
