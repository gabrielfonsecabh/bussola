import { Link } from 'react-router-dom'

import { ROTA_INICIAL } from '@/app/navigation'
import { Page } from '@/components/shell/Page'
import { Button } from '@/components/ui/button'
import { SemCorrespondencia } from '@/components/ui/estado-da-tela'

export function NaoEncontrado() {
  return (
    <Page title="Página não encontrada" description="404">
      <SemCorrespondencia
        titulo="Esta rota não existe"
        descricao="O endereço pode ter mudado, ou a tela não existe."
        acao={
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link to={ROTA_INICIAL}>Voltar ao painel</Link>
          </Button>
        }
      />
    </Page>
  )
}
