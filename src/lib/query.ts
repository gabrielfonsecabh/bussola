import { QueryClient } from '@tanstack/react-query'

/**
 * Configuração do TanStack Query.
 *
 * Regra do projeto: nada de fetch solto em `useEffect`. Toda leitura de
 * servidor passa por `useQuery`, toda escrita por `useMutation`, e a
 * invalidação é explícita.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dado de gestão não muda a cada segundo. 30s evita refetch em rajada
      // ao navegar entre telas sem deixar o número velho na tela.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (falhas, erro) => {
        // Não insista em erro de permissão nem em erro de sintaxe da query:
        // repetir não muda o resultado e só atrasa a mensagem para o usuário.
        if (ehErroDePermissao(erro)) return false
        return falhas < 2
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})

/** Formato de erro que o PostgREST devolve. */
export type ErroPostgrest = {
  message: string
  details?: string | null
  hint?: string | null
  code?: string | null
}

function comoErroPostgrest(erro: unknown): ErroPostgrest | null {
  if (typeof erro !== 'object' || erro === null) return null
  if (!('message' in erro)) return null
  return erro as ErroPostgrest
}

/** 42501 = insufficient_privilege. É o código que os gates das RPCs levantam. */
export function ehErroDePermissao(erro: unknown): boolean {
  const e = comoErroPostgrest(erro)
  return e?.code === '42501' || e?.code === 'PGRST301'
}

/** 57014 = query_canceled, o `statement_timeout` estourando. */
export function ehErroDeTimeout(erro: unknown): boolean {
  const e = comoErroPostgrest(erro)
  return e?.code === '57014' || /timeout/i.test(e?.message ?? '')
}

/**
 * Traduz o erro para uma frase que o usuário consegue agir em cima.
 * Nunca engula o código original: ele vai no final, entre parênteses.
 */
export function mensagemDeErro(erro: unknown): string {
  if (ehErroDePermissao(erro)) {
    return 'Você não tem permissão para esta operação nesta empresa.'
  }
  if (ehErroDeTimeout(erro)) {
    return 'A consulta demorou demais e foi cancelada. Reduza o período ou o ' +
      'escopo do filtro, ou peça o total agregado em vez das linhas.'
  }
  const e = comoErroPostgrest(erro)
  if (e) return e.code ? `${e.message} (${e.code})` : e.message
  if (erro instanceof Error) return erro.message
  return 'Erro desconhecido.'
}

/**
 * Trata "0 linhas afetadas" como ERRO, com as duas causas nomeadas.
 *
 * Por que isto existe: em Postgres + RLS, um update sem policy correspondente
 * não levanta exceção. Ele casa zero linhas, devolve `error = null`, e a tela
 * mostra um toast de sucesso para uma gravação que não aconteceu.
 *
 * Culpar só concorrência joga o usuário num loop de retentativa contra um
 * problema de permissão. Por isso a mensagem cita as duas causas.
 *
 *   const linha = exigeLinhaAfetada(
 *     await supabase().from('atividades').update(patch).eq('id', id)
 *       .select().maybeSingle(),
 *     'atividade',
 *   )
 */
export function exigeLinhaAfetada<T>(
  resultado: { data: T | null; error: unknown },
  oQue = 'registro',
): T {
  if (resultado.error) throw new Error(mensagemDeErro(resultado.error))
  if (resultado.data === null || resultado.data === undefined) {
    throw new Error(
      `Nada foi gravado neste ${oQue}. Ou ele mudou desde que a tela carregou, ` +
        'ou você não tem permissão para editá-lo. Recarregue e tente de novo; ' +
        'se repetir, é permissão.',
    )
  }
  return resultado.data
}

/**
 * Estado de uma leitura agregada, para a tela nunca renderizar vazio como zero.
 * A distinção entre "sem correspondência" e "consulta falhou" é obrigatória
 * (detalhamento progressivo).
 */
export type EstadoDaConsulta = 'carregando' | 'falhou' | 'vazio' | 'com-dados'

export function estadoDaConsulta(args: {
  carregando: boolean
  erro: unknown
  quantidade: number | null | undefined
}): EstadoDaConsulta {
  if (args.carregando) return 'carregando'
  if (args.erro) return 'falhou'
  if (!args.quantidade) return 'vazio'
  return 'com-dados'
}
