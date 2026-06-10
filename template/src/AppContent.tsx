import { LogOut } from 'lucide-react'
import { useAuth } from './auth/AuthContext'

// ── Conteúdo do app (só visível para membros ativos) ────────────────────────────
// Este é o ponto de partida do {{APP_NAME}}. Substitua pelo seu app real —
// telas, abas, dashboard, etc. O gate de membership já garante que só membros
// chegam aqui (frontend) e a API já está protegida por requireMember (backend).
export default function AppContent() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-semibold">{{APP_NAME}}</h1>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h2 className="text-2xl font-bold">Olá, {user?.nome || user?.email} 👋</h2>
        <p className="mt-2 text-slate-400">
          Você é membro ativo. Comece a construir o {{APP_NAME}} aqui
          (<code className="text-slate-300">src/AppContent.tsx</code>).
        </p>
      </main>
    </div>
  )
}
