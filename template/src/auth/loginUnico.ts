import { loginComMeuEcoo, type AuthUser, type LoginResponse } from './api'

// Login único (B7 do Meu Ecoo): o "Abrir" do Meu Ecoo abre o app com `?meuecoo_codigo=<código de uso
// único>`. O código é tirado da URL antes de qualquer chamada de rede (assim ele não fica no histórico
// nem volta num recarregamento) e trocado por sessão no backend do app, que o troca no Meu Ecoo com o
// token de serviço. O que fazer com o resultado é do AuthProvider.
export const PARAMETRO_MEUECOO = 'meuecoo_codigo'

// O que a tela de login mostra quando o código não valeu (vencido, já usado ou Meu Ecoo fora do ar).
export const MEUECOO_FALHOU = 'Não foi possível entrar direto pelo Meu Ecoo. Entre com e-mail e senha.'

/** O aviso dentro do app quando o código não valeu e o app entrou pela sessão que já estava aberta
 *  neste aparelho (pode ser de outra pessoa): diz de quem é a conta. */
export function avisoDaContaAberta(user: AuthUser | null): string {
  const conta = user?.email || user?.nome
  return conta
    ? `Não foi possível entrar direto pelo Meu Ecoo. Você está na conta ${conta}, que já estava aberta neste aparelho.`
    : 'Não foi possível entrar direto pelo Meu Ecoo. Você está na conta que já estava aberta neste aparelho.'
}

/** A URL atual traz um código do Meu Ecoo? Só lê: não mexe na URL. */
export function temCodigoDoMeuEcoo(): boolean {
  return new URL(window.location.href).searchParams.has(PARAMETRO_MEUECOO)
}

/** Lê o código e já o tira da URL, trocando a entrada do histórico (sem criar outra). O resto da
 *  URL (outros parâmetros, hash) e o estado da página ficam. */
export function tirarCodigoDaUrl(): string | null {
  const url = new URL(window.location.href)
  const codigo = url.searchParams.get(PARAMETRO_MEUECOO)
  if (codigo === null) return null
  url.searchParams.delete(PARAMETRO_MEUECOO)
  window.history.replaceState(window.history.state, '', url)
  return codigo
}

/** null: não havia código; `sessao`: o backend aceitou; `falhou`: havia código e ele não valeu. */
export type EntradaPeloMeuEcoo = { sessao: LoginResponse } | { falhou: true } | null

/** Tira o código da URL e o troca por sessão. Não guarda a sessão: quem decide é o AuthProvider.
 *  O 401 desta rota é código recusado, não sessão expirada (api.ts a deixa fora da renovação). */
export async function entrarPeloMeuEcoo(): Promise<EntradaPeloMeuEcoo> {
  const codigo = tirarCodigoDaUrl()?.trim()
  if (!codigo) return null
  try {
    const { data } = await loginComMeuEcoo(codigo)
    return { sessao: data }
  } catch {
    return { falhou: true }
  }
}
