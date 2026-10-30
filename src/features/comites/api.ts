import { exigeLinhaAfetada } from '@/lib/query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Tabelas = Database['app']['Tables']

/**
 * Comitê é FÓRUM TRANSVERSAL, não unidade organizacional.
 *
 * Até a migration 0026 ele era um valor de `areas.tipo`, e o vínculo do item ao
 * comitê seria o próprio `area_id`, que é de uma área só. Para um OKR ser "do
 * Comitê de Orçamento" ele precisava DEIXAR de ser da Tesouraria, e aí sumia do
 * Kit, do OPR e do bônus dela. Ninguém fazia essa troca, e por isso os quatro
 * comitês ficaram com zero itens desde que nasceram.
 *
 * Agora o item continua na área dele E é acompanhado por um ou mais comitês.
 */
export type Comite = Tabelas['comites']['Row']
export type MembroDoComite = Tabelas['comite_membros']['Row']

export const CADENCIAS_DE_COMITE = [
  'semanal',
  'quinzenal',
  'mensal',
  'bimestral',
  'trimestral',
  'sob_demanda',
] as const

export type LinhaDeComite = {
  id: string
  nome: string
  cadencia: string | null
  coordenador_nome: string | null
  okrs: number
  projetos: number
  processos: number
  membros: number
}

export async function listarComites(companyId: string): Promise<LinhaDeComite[]> {
  const { data, error } = await supabase().rpc('comites_da_empresa', { p_company: companyId })
  if (error) throw error
  return (data ?? []) as LinhaDeComite[]
}

export type DadosDoComite = {
  nome: string
  descricao: string | null
  coordenador_user_id: string | null
  cadencia: string | null
}

export async function criarComite(companyId: string, dados: DadosDoComite): Promise<Comite> {
  const { data, error } = await supabase()
    .from('comites')
    .insert({ ...dados, company_id: companyId })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'comitê')
}

export async function atualizarComite(id: string, patch: Partial<DadosDoComite>) {
  const { data, error } = await supabase()
    .from('comites')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'comitê')
}

export async function excluirComite(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('comites')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'comitê')
}

export async function listarMembros(comiteId: string) {
  const { data, error } = await supabase()
    .from('comite_membros')
    /* `select('*')` e não um embed de profiles: `comite_membros.user_id`
       aponta para auth.users, e o PostgREST só embute por chave estrangeira
       DENTRO do schema exposto. O embed voltava 400 e deixava o painel de
       membros permanentemente em "a consulta falhou". O nome da pessoa é
       resolvido na tela, pelo mapa de perfis que ela já carrega. */
    .select('*')
    .eq('comite_id', comiteId)
    .order('id')
  if (error) throw error
  return data ?? []
}

export async function adicionarMembro(entrada: {
  companyId: string
  comiteId: string
  userId: string
  papel: string
}) {
  const { data, error } = await supabase()
    .from('comite_membros')
    .insert({
      company_id: entrada.companyId,
      comite_id: entrada.comiteId,
      user_id: entrada.userId,
      papel: entrada.papel,
    })
    .select()
    .maybeSingle()
  return exigeLinhaAfetada({ data, error }, 'membro do comitê')
}

export async function removerMembro(id: string): Promise<void> {
  const { data, error } = await supabase()
    .from('comite_membros')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  exigeLinhaAfetada({ data, error }, 'membro do comitê')
}

/**
 * Os três vínculos N para N.
 *
 * A permissão de vincular é a de editar o PRÓPRIO ITEM, não uma chave de
 * governança: quem edita o projeto pode dizer que o comitê de orçamento o
 * acompanha. Exigir permissão de governança para isso tornaria o vínculo
 * burocrático, e ninguém o usaria, que é exatamente o erro que a 0026 desfez.
 */
export type TipoDeVinculo = 'okr' | 'projeto' | 'processo'

/**
 * Três funções explícitas em vez de uma com nome de tabela e de coluna
 * montados em tempo de execução. A versão dinâmica compila com `as any` e
 * perde exatamente o que os tipos gerados servem para garantir: que a coluna
 * existe naquela tabela. Aqui, errar o par tabela/coluna é erro de compilação.
 */
export async function vincularAoComite(entrada: {
  companyId: string
  comiteId: string
  tipo: TipoDeVinculo
  itemId: string
}) {
  const base = { company_id: entrada.companyId, comite_id: entrada.comiteId }
  const cliente = supabase()

  const { data, error } =
    entrada.tipo === 'okr'
      ? await cliente
          .from('comite_okrs')
          .insert({ ...base, okr_id: entrada.itemId })
          .select()
          .maybeSingle()
      : entrada.tipo === 'projeto'
        ? await cliente
            .from('comite_projetos')
            .insert({ ...base, projeto_id: entrada.itemId })
            .select()
            .maybeSingle()
        : await cliente
            .from('comite_processos')
            .insert({ ...base, processo_id: entrada.itemId })
            .select()
            .maybeSingle()

  return exigeLinhaAfetada({ data, error }, 'vínculo com o comitê')
}

export async function desvincularDoComite(entrada: {
  comiteId: string
  tipo: TipoDeVinculo
  itemId: string
}): Promise<void> {
  const cliente = supabase()

  const { data, error } =
    entrada.tipo === 'okr'
      ? await cliente
          .from('comite_okrs')
          .delete()
          .eq('comite_id', entrada.comiteId)
          .eq('okr_id', entrada.itemId)
          .select()
          .maybeSingle()
      : entrada.tipo === 'projeto'
        ? await cliente
            .from('comite_projetos')
            .delete()
            .eq('comite_id', entrada.comiteId)
            .eq('projeto_id', entrada.itemId)
            .select()
            .maybeSingle()
        : await cliente
            .from('comite_processos')
            .delete()
            .eq('comite_id', entrada.comiteId)
            .eq('processo_id', entrada.itemId)
            .select()
            .maybeSingle()

  exigeLinhaAfetada({ data, error }, 'vínculo com o comitê')
}

/** Os comitês que acompanham um item, para a tela do item mostrar e editar. */
export async function comitesDoItem(tipo: TipoDeVinculo, itemId: string): Promise<string[]> {
  const cliente = supabase()

  const { data, error } =
    tipo === 'okr'
      ? await cliente.from('comite_okrs').select('comite_id').eq('okr_id', itemId).order('comite_id')
      : tipo === 'projeto'
        ? await cliente
            .from('comite_projetos')
            .select('comite_id')
            .eq('projeto_id', itemId)
            .order('comite_id')
        : await cliente
            .from('comite_processos')
            .select('comite_id')
            .eq('processo_id', itemId)
            .order('comite_id')

  if (error) throw error
  return (data ?? []).map((l) => l.comite_id)
}

/**
 * A linha inteira do comitê.
 *
 * `comites_da_empresa` devolve só o agregado (nome, cadência e contagens), sem
 * descrição nem coordenador. Abrir o formulário com o agregado gravaria campo
 * em branco por cima do que está no banco, que é o mesmo erro que o SIPOC e o
 * POP já evitam esperando a leitura terminar.
 */
export async function carregarComite(id: string): Promise<Comite | null> {
  const { data, error } = await supabase()
    .from('comites')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  // Null e não exceção: com RLS, comitê de outro tenant volta zero linha, e
  // isso é "não existe para você", não falha de consulta.
  return data
}
