import { TriangleAlert } from 'lucide-react'
import { useAuth } from './AuthContext'
import { Button } from '../ui'

// O "Abrir" do Meu Ecoo trouxe um código que não valeu e o app entrou pela sessão que já estava aberta
// neste aparelho (num aparelho compartilhado, pode ser a de outra pessoa): diz de quem é a conta e
// oferece sair. Fica no topo de toda tela logada, inclusive a de acesso restrito (ver App.tsx).
export default function AvisoContaAberta() {
  const { avisoContaAberta, logout, fecharAvisoContaAberta } = useAuth()
  if (!avisoContaAberta) return null

  return (
    <div role="alert" className="border-b border-aviso/30 bg-aviso/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3">
        <p className="flex items-start gap-2 text-sm text-texto">
          <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <span>{avisoContaAberta}</span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="sm" onClick={logout}>
            Sair e entrar com a minha conta
          </Button>
          <Button size="sm" variant="outline" onClick={fecharAvisoContaAberta}>
            Continuar nesta conta
          </Button>
        </div>
      </div>
    </div>
  )
}
