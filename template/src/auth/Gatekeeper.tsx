import { useState } from 'react'
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { useAuth } from './AuthContext'
import { cx } from '../lib/cx'
import { MARCA } from '../marca'
import { SeletorTema } from '../components/SeletorTema'

// Tela de login: email+senha + "Entrar com Google", os dois pelo provedor de identidade (Meu Ecoo).
// A aparência vem dos tokens do app (src/index.css); a lógica não muda de app para app.
export default function Gatekeeper() {
  const { login, loginGoogle, isLoading, error: erroDaSessao } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Começa com o aviso que veio da sessão (ex.: a entrada direta pelo Meu Ecoo falhou).
  const [error, setError] = useState(erroDaSessao ?? '')
  const { nome, Icone } = MARCA

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

  const campo = cx(
    'w-full rounded-xl border bg-superficie py-3 pl-11 pr-4 text-sm text-texto placeholder:text-apagado transition-colors',
    error ? 'border-erro' : 'border-borda-controle',
  )

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <SeletorTema />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-selecionado text-marca-texto">
              <Icone className="h-8 w-8" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{nome}</h1>
            <p className="mt-1.5 text-sm text-apoio">Entre com a mesma conta do Meu Ecoo</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-borda bg-superficie p-6 shadow-sm">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-apoio">
                E-mail
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-apagado" aria-hidden />
                <input
                  id="email"
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
                  aria-describedby={error ? 'erro-login' : undefined}
                  className={campo}
                />
              </div>
            </div>

            <div>
              <label htmlFor="senha" className="mb-1.5 block text-sm font-medium text-apoio">
                Senha
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-apagado" aria-hidden />
                <input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  aria-describedby={error ? 'erro-login' : undefined}
                  className={cx(campo, 'pr-12')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Esconder a senha' : 'Mostrar a senha'}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-apagado transition-colors hover:text-texto"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            {error && (
              <div
                id="erro-login"
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-erro/30 bg-erro/10 px-3 py-2.5 text-sm text-erro"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-marca text-sm font-semibold text-tinta shadow-sm transition-colors hover:bg-marca/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  Entrando…
                </>
              ) : (
                'Entrar'
              )}
            </button>

            <div className="flex items-center gap-3 pt-1">
              <div className="h-px flex-1 bg-borda" />
              <span className="text-xs text-apagado">ou</span>
              <div className="h-px flex-1 bg-borda" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={isLoading}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-borda-controle bg-superficie text-sm font-semibold text-texto transition-colors hover:bg-selecionado/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
              </svg>
              Entrar com Google
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-apagado">Acesso para assinantes do Meu Ecoo.</p>
        </div>
      </div>
    </div>
  )
}
