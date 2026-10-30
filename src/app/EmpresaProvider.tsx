import { useCallback, useMemo, useState } from 'react'

import { CHAVE_EMPRESA, EmpresaContext } from '@/app/empresa-context'
import { useAuth } from '@/hooks/use-auth'

/**
 * A empresa ativa é recorte de TENANT, não preferência de tela.
 * Toda query passa o `company_id` daqui, e o isolamento de verdade continua
 * sendo da RLS: isto é ergonomia.
 *
 * A lista vem de `app.meu_contexto()`, já filtrada pelo vínculo ativo, então
 * não existe empresa na lista que o usuário não possa abrir.
 */
export function EmpresaProvider({ children }: { children: React.ReactNode }) {
  const { contexto, carregando } = useAuth()
  const empresas = useMemo(() => contexto?.empresas ?? [], [contexto])
  const [idAtivo, setIdAtivo] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHAVE_EMPRESA)
    } catch {
      return null
    }
  })

  // A empresa salva pode não existir mais para este usuário (vínculo removido,
  // ou outra conta na mesma máquina). Nesse caso cai para a primeira válida em
  // vez de ficar sem empresa e renderizar tudo vazio.
  const empresaAtiva = useMemo(() => {
    if (empresas.length === 0) return null
    return empresas.find((e) => e.id === idAtivo) ?? empresas[0] ?? null
  }, [empresas, idAtivo])

  const definirEmpresaAtiva = useCallback(
    (id: string) => {
      if (!empresas.some((e) => e.id === id)) return
      setIdAtivo(id)
      try {
        localStorage.setItem(CHAVE_EMPRESA, id)
      } catch {
        /* sem persistência: vale só nesta aba */
      }
    },
    [empresas],
  )

  const podeFazer = useCallback(
    (chave: string) => {
      if (!empresaAtiva) return false
      if (contexto?.perfil.super_admin) return true
      if (empresaAtiva.is_admin) return true
      return empresaAtiva.permissoes.includes(chave)
    },
    [empresaAtiva, contexto],
  )

  const valor = useMemo(
    () => ({ empresas, empresaAtiva, definirEmpresaAtiva, carregando, podeFazer }),
    [empresas, empresaAtiva, definirEmpresaAtiva, carregando, podeFazer],
  )

  return <EmpresaContext value={valor}>{children}</EmpresaContext>
}
