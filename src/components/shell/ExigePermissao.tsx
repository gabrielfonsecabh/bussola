import { ShieldAlert } from 'lucide-react'
import { Outlet } from 'react-router-dom'

import { Page } from '@/components/shell/Page'
import { useEmpresa } from '@/hooks/use-empresa'

/**
 * Guarda de rota por chave de permissão.
 *
 * Por que existe: `navigation.ts` declarava `permissao` em 18 dos 22 itens com
 * o comentário "aplicada na Fase 2", e NADA lia esse campo. A sidebar mostrava
 * tudo para todo mundo e o roteador aceitava qualquer URL digitada. Um
 * colaborador via Permissões, Pessoas, Bônus e Importar planilha, clicava, a
 * tela abria, e os botões iam sumindo um a um.
 *
 * Isto NÃO é a autorização: quem nega de verdade continua sendo a RLS e o gate
 * 42501 de cada função. É o que evita oferecer a porta errada, e o que impede
 * a tela de carregar uma consulta que vai voltar vazia por falta de permissão
 * e ser lida como "não há nada aqui".
 */
export function ExigePermissao({ chave }: { chave: string }) {
  const { podeFazer, carregando } = useEmpresa()

  // Enquanto o contexto carrega não se sabe nada: negar aqui piscaria a tela
  // de acesso negado para quem tem acesso.
  if (carregando) return null

  if (!podeFazer(chave)) {
    return (
      <Page title="Sem acesso a esta tela" description="O seu perfil não inclui esta permissão">
        <div className="flex max-w-2xl items-start gap-3 rounded-lg border border-border bg-card p-5">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1.5 text-sm">
            <p className="font-medium">
              Esta tela depende da permissão <span className="font-mono text-xs">{chave}</span>,
              que o seu perfil não tem.
            </p>
            <p className="text-muted-foreground">
              Isto não é uma falha: é o recorte do seu cargo. Se você precisa desta tela para o
              seu trabalho, peça a quem administra a empresa para revisar o seu papel em
              Administração, Permissões.
            </p>
          </div>
        </div>
      </Page>
    )
  }

  return <Outlet />
}
