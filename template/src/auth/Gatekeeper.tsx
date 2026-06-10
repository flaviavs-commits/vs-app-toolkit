import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, LogIn } from 'lucide-react'
import { useAuth } from './AuthContext'

// Tela de login: email+senha + "Entrar com Google" (ambos via VS).
export default function Gatekeeper() {
  const { login, loginGoogle, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await login(email.trim(), password)
    } catch (err: any) {
      setError(err.message || 'Credenciais inválidas. Tente novamente.')
    }
  }

  async function handleGoogle() {
    setError('')
    try {
      await loginGoogle()
    } catch (err: any) {
      setError(err.message || 'Não foi possível autenticar com o Google.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-900/50">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{{APP_NAME}}</h1>
          <p className="text-slate-500 mt-1.5 text-sm">Acesse com sua conta de membro</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
        >
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                placeholder="seu@email.com"
                required
                autoFocus
                autoComplete="email"
                className={`w-full bg-slate-800 border rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-600 text-sm focus:outline-none transition-colors ${
                  error ? 'border-red-500 focus:border-red-400' : 'border-slate-700 focus:border-blue-500'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={`w-full bg-slate-800 border rounded-xl pl-11 pr-11 py-3 text-white placeholder-slate-600 text-sm focus:outline-none transition-colors ${
                  error ? 'border-red-500 focus:border-red-400' : 'border-slate-700 focus:border-blue-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Autenticando...
              </>
            ) : (
              'Acessar Agora'
            )}
          </button>

          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-slate-600 text-xs">ou</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed text-slate-800 font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            Entrar com Google
          </button>
        </form>

        <p className="text-center text-slate-700 text-xs mt-6">
          Acesso restrito a membros ativos do Descontos VIP
        </p>
      </div>
    </div>
  )
}
