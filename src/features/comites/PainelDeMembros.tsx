import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CarregandoTabela, EstadoDaTela } from '@/components/ui/estado-da-tela'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listarPerfisDaEmpresa } from '@/features/admin/api'
import { adicionarMembro, listarMembros, removerMembro } from '@/features/comites/api'
import { useEmpresa } from '@/hooks/use-empresa'
import { chaves } from '@/lib/chaves'
import { mensagemDeErro } from '@/lib/query'

const PAPEIS = ['coordenador', 'membro', 'convidado'] as const

const ROTULO_DE_PAPEL: Record<string, string> = {
  coordenador: 'Coordenador',
  membro: 'Membro',
  convidado: 'Convidado',
}

/** Papel nunca se distingue só pela cor: o texto vai junto em todos os casos. */
const VARIANTE_DE_PAPEL: Record<string, 'info-subtle' | 'secondary' | 'outline'> = {
  coordenador: 'info-subtle',
  membro: 'secondary',
  convidado: 'outline',
}

export interface PainelDeMembrosProps {
  comiteId: string
  companyId: string
}

/**
 * A lista de presença do comitê.
 *
 * Ela é o que dá sentido a "o comitê acompanha isto": sem nome na mesa, o
 * vínculo do OKR com o fórum é só uma linha de tabela, porque não existe
 * ninguém de quem cobrar a leitura do item nem a decisão sobre ele.
 *
 * O papel aqui é o assento na reunião. Ele é outra coisa do `coordenador` do
 * cadastro do comitê, que é quem responde pelo fórum inteiro, e os dois podem
 * divergir sem que nada esteja errado.
 */
export function PainelDeMembros({ comiteId, companyId }: PainelDeMembrosProps) {
  const { podeFazer } = useEmpresa()
  const podeGerir = podeFazer('comite.manage')
  const queryClient = useQueryClient()

  const [novoUserId, setNovoUserId] = useState<string | null>(null)
  const [novoPapel, setNovoPapel] = useState<string>('membro')
  const [confirmandoSaida, setConfirmandoSaida] = useState<string | null>(null)

  const membros = useQuery({
    // `chaves.comiteMembros` ainda não existe em src/lib/chaves.ts, e aquele
    // arquivo não é desta frente. A chave está escrita na forma exata que ela
    // terá lá, para a invalidação continuar casando depois da mudança.
    queryKey: ['comite-membros', comiteId] as const,
    queryFn: () => listarMembros(comiteId),
  })

  const pessoas = useQuery({
    queryKey: chaves.perfis(companyId),
    queryFn: () => listarPerfisDaEmpresa(companyId),
  })

  /* O nome sai da lista de pessoas da empresa, e não da linha de `comite_membros`.
     `comite_membros.user_id` referencia `auth.users`, não `app.profiles`, então
     não existe relação que o PostgREST possa embutir a partir dessa tabela. */
  const nomePorUsuario = useMemo(
    () => new Map((pessoas.data ?? []).map((p) => [p.value, p.label])),
    [pessoas.data],
  )

  const linhas = useMemo(() => membros.data ?? [], [membros.data])

  // Quem já está na mesa sai do seletor: reoferecer a pessoa só produz o erro
  // de chave duplicada de `unique (comite_id, user_id)`.
  const disponiveis = useMemo(() => {
    const jaEstao = new Set(linhas.map((m) => m.user_id))
    return (pessoas.data ?? []).filter((p) => !jaEstao.has(p.value))
  }, [linhas, pessoas.data])

  /* Seletor sem opção tem CAUSAS DIFERENTES, e "todo mundo já está na mesa" é
     só uma delas. Dizer essa frase quando a lista de pessoas não carregou, ou
     quando a empresa não tem ninguém ativo, é a tela afirmando um fato que ela
     não apurou: nos dois casos ela não sabe quem está na mesa. */
  const totalDePessoas = (pessoas.data ?? []).length
  const seletorVazio = pessoas.isLoading
    ? 'Carregando pessoas...'
    : pessoas.error
      ? 'A lista de pessoas não carregou'
      : totalDePessoas === 0
        ? 'Nenhuma pessoa ativa nesta empresa'
        : disponiveis.length === 0
          ? 'Todo mundo já está na mesa'
          : 'Escolher pessoa'

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ['comite-membros', comiteId] })
    // A contagem de membros vive na lista de comitês e no painel transversal.
    void queryClient.invalidateQueries({ queryKey: ['comites'] })
    void queryClient.invalidateQueries({ queryKey: ['painel-comite'] })
  }

  const adicionar = useMutation({
    mutationFn: (entrada: { userId: string; papel: string }) =>
      adicionarMembro({ companyId, comiteId, userId: entrada.userId, papel: entrada.papel }),
    onSuccess: () => {
      setNovoUserId(null)
      setNovoPapel('membro')
      adicionar.reset()
      invalidar()
    },
  })

  const remover = useMutation({
    mutationFn: (id: string) => removerMembro(id),
    onSuccess: () => {
      setConfirmandoSaida(null)
      remover.reset()
      invalidar()
    },
  })

  const erroDeEscrita = adicionar.error ?? remover.error

  function nomeDe(userId: string): string {
    const nome = nomePorUsuario.get(userId)
    if (nome) return nome
    if (pessoas.isLoading) return 'carregando o nome'
    if (pessoas.error) return 'nome não carregado'
    // Pessoa inativa ou desligada da empresa continua na lista de presença até
    // alguém tirá-la. Dizer isso é melhor do que mostrar o uuid cru.
    return 'pessoa fora da lista ativa da empresa'
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
          <Users className="size-3.5 text-muted-foreground" aria-hidden />
          Lista de presença
        </h2>
        <p className="pt-1 text-xs text-muted-foreground">
          É ela que dá sentido a "o comitê acompanha isto": sem nome na mesa, não há de quem
          cobrar a leitura do item nem a decisão sobre ele.
        </p>
      </header>

      {erroDeEscrita && (
        <p
          role="alert"
          className="m-3 rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
        >
          {mensagemDeErro(erroDeEscrita)}
        </p>
      )}

      <EstadoDaTela
        carregando={membros.isLoading}
        erro={membros.error}
        quantidade={linhas.length}
        aoTentarDeNovo={() => void membros.refetch()}
        carregandoNode={<CarregandoTabela linhas={3} />}
        vazio={
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Nenhum membro registrado neste comitê.
            {podeGerir
              ? ' Comece pelo coordenador e por quem realmente senta na reunião.'
              : ' Quem tem a permissão "comite.manage" pode montar a mesa.'}
          </p>
        }
      >
        <ul className="divide-y divide-border">
          {linhas.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 text-sm">{nomeDe(m.user_id)}</span>
              <Badge variant={VARIANTE_DE_PAPEL[m.papel] ?? 'outline'}>
                {ROTULO_DE_PAPEL[m.papel] ?? m.papel}
              </Badge>
              {podeGerir && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive hover:text-destructive"
                  disabled={remover.isPending}
                  onClick={() =>
                    confirmandoSaida === m.id
                      ? remover.mutate(m.id)
                      : setConfirmandoSaida(m.id)
                  }
                  aria-label={
                    confirmandoSaida === m.id
                      ? `Confirmar a saída de ${nomeDe(m.user_id)} do comitê`
                      : `Tirar ${nomeDe(m.user_id)} do comitê`
                  }
                >
                  {remover.isPending && confirmandoSaida === m.id && (
                    <LoaderCircle className="size-3 animate-spin" aria-hidden />
                  )}
                  {confirmandoSaida === m.id ? 'Confirmar saída' : 'Tirar da mesa'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </EstadoDaTela>

      {podeGerir && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border px-4 py-3">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="mb-pessoa">Adicionar pessoa</Label>
            <SearchableSelect
              id="mb-pessoa"
              options={disponiveis}
              value={novoUserId}
              onChange={setNovoUserId}
              placeholder={seletorVazio}
              disabled={pessoas.isLoading || disponiveis.length === 0}
            />
            {/* A lista de presença falhou: o filtro de quem já está sentado não
                rodou, e o seletor pode reoferecer alguém que já é membro. Dizer
                isso antes é melhor do que a pessoa descobrir pelo erro de chave
                duplicada depois de clicar em Adicionar. */}
            {membros.error && !pessoas.error && (
              <p className="text-xs text-warning-subtle-foreground">
                A lista de presença não carregou, então o seletor não sabe quem já está
                sentado. Se a pessoa escolhida já for membro, a gravação volta erro de
                duplicidade em vez de gravar por cima.
              </p>
            )}
          </div>

          <div className="w-40 space-y-1.5">
            <Label htmlFor="mb-papel">Papel</Label>
            <Select value={novoPapel} onValueChange={setNovoPapel}>
              <SelectTrigger id="mb-papel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {ROTULO_DE_PAPEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            disabled={!novoUserId || adicionar.isPending}
            onClick={() => novoUserId && adicionar.mutate({ userId: novoUserId, papel: novoPapel })}
          >
            {adicionar.isPending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <UserPlus className="size-4" aria-hidden />
            )}
            Adicionar
          </Button>

          {pessoas.error && (
            <p role="alert" className="w-full text-xs text-destructive">
              A lista de pessoas não carregou, e por isso o seletor está vazio. Isto não
              significa que a empresa esteja sem gente: {mensagemDeErro(pessoas.error)}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
