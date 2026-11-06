import { ExternalLink, Lock, LogOut } from 'lucide-react'
import { useAuth } from './AuthContext'
import { MARCA } from '../marca'
import { SeletorTema } from '../components/SeletorTema'

// Página de assinatura (configurável via env).
const CHECKOUT_URL = import.meta.env.VITE_CHECKOUT_URL || 'https://checkout.vitissouls.com/'

// Tela mostrada a quem logou mas não tem assinatura ativa. A fonte de verdade da assinatura é o
// provedor; o app só espelha o que ele devolve.
export default function MembershipGate() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <SeletorTema />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-aviso/30 bg-aviso/10 text-texto">
              <Lock className="h-7 w-7" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Acesso restrito</h1>
            <p className="mt-1.5 text-sm text-apoio">O {MARCA.nome} é para assinantes do Meu Ecoo</p>
          </div>

          <div className="space-y-4 rounded-2xl border border-borda bg-superficie p-6 shadow-sm">
            <p className="text-sm leading-relaxed text-apoio">
              {user?.nome ? `Olá, ${user.nome}. ` : ''}
              Seu login foi confirmado, mas não encontramos uma assinatura ativa na sua conta. Para usar o {MARCA.nome},
              ative sua assinatura.
            </p>

            <a
              href={CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-marca text-sm font-semibold text-tinta shadow-sm transition-colors hover:bg-marca/90"
            >
              Assinar agora
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>

            <button
              type="button"
              onClick={logout}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-borda-controle bg-superficie text-sm font-medium text-texto transition-colors hover:bg-selecionado/60"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Já assinei: sair e entrar de novo
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-apagado">Entrar de novo atualiza o status da assinatura.</p>
        </div>
      </div>
    </div>
  )
}
