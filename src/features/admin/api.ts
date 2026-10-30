import { exigeLinhaAfetada, mensagemDeErro } from '@/lib/query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Tabelas = Database['app']['Tables']
export type Area = Tabelas['areas']['Row']
export type Company = Tabelas['companies']['Row']

export type Pessoa = {
  user_id: string
  nome: string | null
  email: string | null
  cargo: string | null
  nivel: string
  is_admin: boolean
  is_active: boolean
  papeis: string[]
  areas_responsavel: string[]
}

export type Preset = { papel: string; permissoes: string[] }

/**
 * Toda leitura ordena por chave ÚNICA. Sem isso, `.range()` pula e duplica
 * linha em silêncio, e o usuário exporta uma lista incompleta sem saber.
 */

export async function listarEmpresas(): Promise<Company[]> {
  const { data, error } = await supabase()
    .from('companies')
    .select('*')
    .order('tipo', { ascending: false })
    .order('id')
  if (error) throw error
  return data ?? []
}

export async function listarAreas(companyId: string): Promise<Area[]> {
  const { data, error } = await supabase()
    .from('areas')
    .select('*')
    .eq('company_id', companyId)
    .order('nome')
    .order('id')
  if (error) throw error
  return data ?? []
}

export async function listarPessoas(companyId: string): Promise<Pessoa[]> {
  const { data, error } = await supabase().rpc('pessoas_da_empresa', { p_company: companyId })
  if (error) throw error
  return (data ?? []) as Pessoa[]
}

export async function listarPresets(): Promise<Preset[]> {
  const { data, error } = await supabase().rpc('presets_de_permissao')
  if (error) throw error
  return (data ?? []) as Preset[]
}

/** Perfis das pessoas da empresa, para os selects de responsável e dono. */
export async function listarPerfisDaEmpresa(companyId: string) {
  const pessoas = await listarPessoas(companyId)
  return pessoas
    .filter((p) => p.is_active)
    .map((p) => ({
      value: p.user_id,
      label: p.nome ?? p.email ?? p.user_id,
      description: p.cargo ?? undefined,
    }))
}

export type NovaArea = {
  company_id: string
  nome: string
  tipo: string
  parent_area_id: string | null
  responsavel_user_id: string | null
}

export async function criarArea(area: NovaArea): Promise<Area> {
  const { data, error } = await supabase().from('areas').insert(area).select().maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'área')
}

export async function atualizarArea(id: string, patch: Partial<NovaArea>): Promise<Area> {
  const { data, error } = await supabase()
    .from('areas')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'área')
}

export async function excluirArea(id: string): Promise<void> {
  const { data, error } = await supabase().from('areas').delete().eq('id', id).select().maybeSingle()
  exigeLinhaAfetada({ data, error }, 'área')
}

export async function atualizarVinculo(
  companyId: string,
  userId: string,
  patch: {
    is_admin?: boolean
    is_active?: boolean
    nivel?: string
    cargo?: string | null
    /** Área de lotação. Nula é legítimo: ainda não definida, não "sem área". */
    area_id?: string | null
  },
) {
  const { data, error } = await supabase()
    .from('company_users')
    .update(patch)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'vínculo')
}

export async function definirPapel(companyId: string, userId: string, papel: string) {
  /**
   * Uma chamada só, e o banco faz o delete e o insert na mesma transação.
   *
   * A versão anterior disparava DELETE e INSERT como duas requisições
   * independentes e não conferia linhas afetadas no delete. Como a unique é em
   * (empresa, pessoa, papel), ela PERMITE dois papéis: um delete que falhasse
   * calado gravava o papel novo e mantinha o antigo, e `minhas_permissoes` faz
   * union sobre todos, então a pessoa rebaixada seguia com o acesso antigo.
   */
  const { data, error } = await supabase().rpc('definir_papel', {
    p_company: companyId,
    p_user: userId,
    p_role: papel,
  })
  if (error) throw error
  return data
}

/**
 * As áreas sobre as quais eu tenho alçada: onde respondo, onde sou lotado, e
 * tudo abaixo disso. É o que permite a um diretor ver as gerências dele num
 * recorte só, em vez de trocar o filtro uma a uma.
 */
export async function listarMinhasAreas(companyId: string): Promise<
  { area_id: string; nome: string; tipo: string; motivo: string }[]
> {
  const { data, error } = await supabase().rpc('minhas_areas', { p_company: companyId })
  if (error) throw error
  return (data ?? []) as { area_id: string; nome: string; tipo: string; motivo: string }[]
}

// ===========================================================================
// Cadastro de pessoa
//
// Criar o usuário no Auth exige a chave `service_role`, que NUNCA pode existir
// no frontend. Por isso o cadastro passa por uma Edge Function, que faz só o
// que só ela pode (criar o acesso) e delega perfil, vínculo e papel para
// `app.vincular_pessoa`, com gate próprio e numa transação só.
// ===========================================================================

export type DadosDoCadastro = {
  email: string
  nome: string
  cargo: string | null
  nivel: string
  /** Área de lotação. Nulo é legítimo: define-se depois. */
  area_id: string | null
  papel: string
}

export type PessoaCadastrada = {
  user_id: string
  email: string
  nome: string
  /**
   * A senha temporária, que aparece UMA ÚNICA VEZ.
   *
   * Nula quando a pessoa já tinha acesso ao sistema e só ganhou o vínculo com
   * esta empresa: nesse caso a senha dela não foi tocada, e resetá-la seria um
   * estrago silencioso em quem já usa o produto.
   */
  senha_temporaria: string | null
  ja_existia: boolean
  aviso: string
}

export async function cadastrarPessoa(
  companyId: string,
  dados: DadosDoCadastro,
): Promise<PessoaCadastrada> {
  const { data, error } = await supabase().functions.invoke('cadastrar-pessoa', {
    body: { company_id: companyId, ...dados },
  })

  if (error) {
    /* `functions.invoke` embrulha o corpo do erro. A mensagem específica da
       função (e-mail inválido, sem permissão, área de outra empresa) vale mais
       que "Edge Function returned a non-2xx status code", que não diz nada a
       quem está cadastrando. */
    const detalhe = await (async () => {
      const resposta = (error as { context?: Response }).context
      if (!resposta || typeof resposta.json !== 'function') return null
      try {
        const corpo = (await resposta.json()) as { erro?: string }
        return corpo?.erro ?? null
      } catch {
        return null
      }
    })()
    throw new Error(detalhe ?? mensagemDeErro(error))
  }

  return data as PessoaCadastrada
}
