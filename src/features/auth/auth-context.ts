import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type Empresa = {
  id: string
  razao_social: string
  nome_fantasia: string
  tipo: 'holding' | 'controlada'
  parent_company_id: string | null
  is_admin: boolean
  nivel: string
  cargo: string | null
  papeis: string[]
  /**
   * PREVIEW DE UI. Diz o que mostrar habilitado; NÃO decide acesso.
   * Quem decide é a RLS e o gate de cada função no banco. Se os dois
   * discordarem, quem está errado é a tela.
   */
  permissoes: string[]
}

export type Perfil = {
  user_id: string
  nome: string | null
  email: string | null
  avatar_url: string | null
  super_admin: boolean
  /**
   * true enquanto o usuário ainda estiver na senha provisória definida pela
   * administração. Quem trava o acesso é o banco (app.profiles); a rota
   * protegida só evita mostrar o app antes disso.
   */
  deve_trocar_senha: boolean
}

export type Contexto = {
  perfil: Perfil
  empresas: Empresa[]
}

export type AuthContexto = {
  session: Session | null
  usuario: User | null
  contexto: Contexto | null
  /** true enquanto a sessão ainda não foi resolvida (evita piscar o login). */
  carregando: boolean
  erroDeContexto: unknown
  sair: () => Promise<void>
  recarregarContexto: () => Promise<void>
}

export const AuthContext = createContext<AuthContexto | null>(null)
