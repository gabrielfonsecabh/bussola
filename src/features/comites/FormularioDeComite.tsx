import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, LoaderCircle, Trash2, TriangleAlert, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { PainelDeDetalhe } from '@/components/dados/PainelDeDetalhe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { listarPerfisDaEmpresa } from '@/features/admin/api'
import {
  CADENCIAS_DE_COMITE,
  atualizarComite,
  criarComite,
  excluirComite,
  type Comite,
  type DadosDoComite,
} from '@/features/comites/api'
import { PainelDeMembros } from '@/features/comites/PainelDeMembros'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { rotulo, rotulos, vazioVirarNulo } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/query'

const esquema = z.object({
  nome: z.string().trim().min(3, 'Dê um nome com pelo menos 3 caracteres'),
  descricao: z.string(),
  coordenador_user_id: z.string().nullable(),
  cadencia: z.string().nullable(),
})

type Campos = z.infer<typeof esquema>

function paraCampos(comite: Comite | null): Campos {
  return {
    nome: comite?.nome ?? '',
    descricao: comite?.descricao ?? '',
    coordenador_user_id: comite?.coordenador_user_id ?? null,
    cadencia: comite?.cadencia ?? null,
  }
}

function paraApi(c: Campos): DadosDoComite {
  return {
    nome: c.nome.trim(),
    // Texto em branco vira NULL: '' e null parecem iguais na tela e são
    // diferentes na consulta, e a descrição vazia passaria a contar como
    // descrição preenchida em qualquer `is not null`.
    descricao: vazioVirarNulo(c.descricao),
    coordenador_user_id: c.coordenador_user_id,
    cadencia: c.cadencia,
  }
}

export interface FormularioDeComiteProps {
  /** Comitê em edição, ou null para cadastrar um novo. */
  comite: Comite | null
  aoFechar: () => void
  /**
   * Chamado depois de gravar OU de excluir, com o cache já invalidado aqui
   * dentro. Quem abriu decide o que fazer (normalmente fechar o painel).
   * Sem ele, o formulário se fecha sozinho.
   */
  aoConcluir?: () => void
}

/**
 * Cadastro do fórum, com a lista de presença no mesmo painel.
 *
 * Membro NÃO entra no submit do formulário: adicionar e remover gente são
 * escritas próprias, que valem na hora. Misturar as duas coisas faria o usuário
 * perder um membro recém-adicionado ao cancelar a edição do nome.
 *
 * O que NÃO se edita aqui, de propósito: os itens acompanhados. O vínculo
 * nasce na tela do próprio OKR, projeto ou processo, porque quem sabe que o
 * item entra na pauta é quem cuida do item, não quem administra o fórum.
 */
export function FormularioDeComite({ comite, aoFechar, aoConcluir }: FormularioDeComiteProps) {
  const { empresaAtiva, podeFazer } = useEmpresa()
  const empresaId = empresaAtiva?.id ?? null
  const queryClient = useQueryClient()
  const podeGerir = podeFazer('comite.manage')
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  const form = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: paraCampos(comite),
  })

  const pessoas = useQuery({
    queryKey: chaves.perfis(empresaId),
    enabled: !!empresaId,
    queryFn: () => listarPerfisDaEmpresa(empresaId!),
  })

  function concluir() {
    // Prefixo em vez da chave exata: a lista de comitês fica em cache por
    // empresa e o painel transversal por comitê e ano. Invalidar só o recorte
    // aberto deixaria os outros mostrando o nome e a cadência de antes.
    void queryClient.invalidateQueries({ queryKey: ['comites'] })
    void queryClient.invalidateQueries({ queryKey: ['comite'] })
    void queryClient.invalidateQueries({ queryKey: ['painel-comite'] })
    if (aoConcluir) aoConcluir()
    else aoFechar()
  }

  const salvar = useMutation({
    // Sem `!` no `empresaId`: criar comitê sem empresa ativa mandaria
    // `company_id: undefined` ao insert, e o erro de not null que voltaria do
    // banco não diz ao usuário o que de fato aconteceu.
    mutationFn: (dados: DadosDoComite) => {
      if (comite) return atualizarComite(comite.id, dados)
      if (!empresaId) {
        throw new Error('Nenhuma empresa ativa. Escolha a empresa no topo antes de criar o comitê.')
      }
      return criarComite(empresaId, dados)
    },
    onSuccess: concluir,
  })

  const remover = useMutation({
    mutationFn: (id: string) => excluirComite(id),
    onSuccess: concluir,
  })

  // `useWatch` assina só estes dois campos. `form.watch` devolveria função nova
  // a cada render e derrubaria a memoização do formulário inteiro.
  const semCoordenador = !useWatch({ control: form.control, name: 'coordenador_user_id' })
  const semCadencia = !useWatch({ control: form.control, name: 'cadencia' })

  const erro = salvar.error ?? remover.error
  // Gravar e excluir disputam a mesma linha: deixar os dois botões vivos ao
  // mesmo tempo permite salvar em cima de um delete que já está em voo.
  const gravando = salvar.isPending || remover.isPending

  return (
    <PainelDeDetalhe
      aberto
      largura="larga"
      aoFechar={aoFechar}
      titulo={comite ? comite.nome : 'Novo comitê'}
      origem={
        comite
          ? `Comitês de ${empresaAtiva?.nome_fantasia ?? 'empresa'} · editando o fórum`
          : `Comitês de ${empresaAtiva?.nome_fantasia ?? 'empresa'} · cadastro`
      }
      acoes={
        podeGerir ? (
          <>
            {comite && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  confirmandoExclusao ? remover.mutate(comite.id) : setConfirmandoExclusao(true)
                }
                disabled={gravando}
                className="mr-auto text-destructive hover:text-destructive"
              >
                {remover.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
                {confirmandoExclusao ? 'Confirmar exclusão' : 'Excluir'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button size="sm" type="submit" form="form-comite" disabled={gravando}>
              {salvar.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {comite ? 'Salvar' : 'Criar comitê'}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Fechar
          </Button>
        )
      }
    >
      <div className="space-y-6">
        <form
          id="form-comite"
          onSubmit={form.handleSubmit((c) => salvar.mutate(paraApi(c)))}
          className="space-y-5"
          noValidate
        >
          {erro && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              {mensagemDeErro(erro)}
            </p>
          )}

          {!podeGerir && (
            <p className="rounded-md border border-info/40 bg-info-subtle p-3 text-xs text-info-subtle-foreground">
              Você não tem a permissão "comite.manage", então este cadastro está em modo
              leitura. Desenhar fórum é decisão de governança, e fica com a administração da
              empresa e com a diretoria.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cm-nome">Nome do comitê</Label>
            <Input
              id="cm-nome"
              placeholder="Ex.: Comitê de Orçamento"
              disabled={!podeGerir}
              aria-invalid={!!form.formState.errors.nome}
              {...form.register('nome')}
            />
            {form.formState.errors.nome && (
              <p role="alert" className="text-xs text-destructive">
                {form.formState.errors.nome.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cm-descricao">Descrição</Label>
            <textarea
              id="cm-descricao"
              rows={3}
              disabled={!podeGerir}
              placeholder="Que pauta este fórum acompanha, e que decisão ele tem alçada para tomar"
              className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
              {...form.register('descricao')}
            />
            <p className="text-xs text-muted-foreground">
              O comitê não é dono de nada: ele é um recorte transversal que acompanha itens
              de várias áreas, e cada item continua na área dele.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cm-coordenador">Coordenador</Label>
              <Controller
                control={form.control}
                name="coordenador_user_id"
                render={({ field }) => (
                  <SearchableSelect
                    id="cm-coordenador"
                    options={pessoas.data ?? []}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={!podeGerir}
                    placeholder="Ainda sem coordenador"
                  />
                )}
              />
              {pessoas.error ? (
                <p role="alert" className="text-xs text-destructive">
                  A lista de pessoas não carregou, e por isso está vazia. Isto não significa
                  que a empresa esteja sem gente: {mensagemDeErro(pessoas.error)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Quem conduz o fórum. Responde pela pauta, não pelas áreas cujos itens o
                  comitê acompanha.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cm-cadencia">Cadência</Label>
              <Controller
                control={form.control}
                name="cadencia"
                render={({ field }) => (
                  <SearchableSelect
                    id="cm-cadencia"
                    options={CADENCIAS_DE_COMITE.map((c) => ({
                      value: c,
                      label: rotulo(rotulos.periodicidade, c),
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={!podeGerir}
                    placeholder="Ainda não definida"
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                De quanto em quanto tempo o fórum se reúne. Deixe em branco enquanto não se
                sabe: cadência desconhecida não é sob demanda.
              </p>
            </div>
          </div>

          {(semCoordenador || semCadencia) && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">
                  {semCoordenador && semCadencia
                    ? 'Este comitê vai ficar sem coordenador e sem cadência.'
                    : semCoordenador
                      ? 'Este comitê vai ficar sem coordenador.'
                      : 'Este comitê vai ficar sem cadência.'}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                  {semCoordenador && (
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="size-3.5" aria-hidden />
                      Sem coordenador não há quem convoque nem quem cobre a pauta.
                    </span>
                  )}
                  {semCadencia && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3.5" aria-hidden />
                      Sem cadência o fórum não tem data para acontecer.
                    </span>
                  )}
                </p>
                <p className="pt-0.5">
                  Dá para salvar assim, e o comitê aparece marcado na lista até alguém
                  resolver.
                </p>
              </div>
            </div>
          )}

          {confirmandoExclusao && comite && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
            >
              <p className="font-semibold">Excluir o comitê "{comite.nome}"?</p>
              <p className="pt-0.5">
                Os OKRs, projetos e processos que ele acompanha NÃO são apagados: eles
                continuam nas áreas deles. O que se perde é a pauta, a lista de presença e o
                histórico de que este fórum olhava para esses itens.
              </p>
            </div>
          )}
        </form>

        {/* A lista de presença só existe depois que o comitê existe: ela precisa
            do id para gravar cada membro. Num cadastro novo, ela aparece na
            primeira edição, e o rodapé abaixo diz isso em vez de sumir calado. */}
        {comite ? (
          <PainelDeMembros comiteId={comite.id} companyId={comite.company_id} />
        ) : (
          <p className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
            A lista de presença e os itens acompanhados aparecem depois de criar o comitê.
          </p>
        )}
      </div>
    </PainelDeDetalhe>
  )
}
