import { Lock, ExternalLink, LogOut } from 'lucide-react'
import { useAuth } from './AuthContext'

// URL de checkout do Descontos VIP (configurável via env).
const CHECKOUT_URL =
  import.meta.env.VITE_CHECKOUT_URL || 'https://checkout.vitissouls.com/'

// Site principal do Descontos VIP.
const SITE_URL = 'https://www.descontoss-vip.com/'

// Tela mostrada a quem logou mas não é membro ativo.
export default function MembershipGate() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-4">
            <Lock className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Acesso restrito</h1>
          <p className="text-slate-500 mt-1.5 text-sm">
            Disponível apenas para membros ativos do Descontos VIP
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <p className="text-slate-400 text-sm leading-relaxed">
            {user?.nome ? `Olá, ${user.nome}. ` : ''}
            Seu login foi confirmado, mas não encontramos uma assinatura ativa na sua conta.
            Para usar o {{APP_NAME}}, ative sua assinatura do Descontos VIP.
          </p>

          <a
            href={CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            Assinar agora
            <ExternalLink className="w-4 h-4" />
          </a>

          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-3 rounded-xl transition-colors text-sm"
          >
            Conhecer o Descontos VIP
          </a>

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 font-medium py-2 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>

        <p className="text-center text-slate-700 text-xs mt-6">
          Já é membro? Saia e entre novamente para atualizar seu status.
        </p>
      </div>
    </div>
  )
}
