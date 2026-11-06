/**
 * Dados do app no aparelho (local-first): cada chave fica no localStorage com o prefixo do app,
 * como JSON. Sem acesso ao armazenamento (navegação privada, cookies bloqueados), ler devolve o
 * padrão e gravar devolve false — o app continua funcionando só nesta visita.
 *
 * "Baixar meus dados" (LGPD, portabilidade) junta tudo o que tem o prefixo num JSON, fora a
 * preferência de tema e a sessão (que ficam em chaves próprias: {{APP_SLUG}}_token e _refresh).
 */
export const PREFIXO = '{{APP_SLUG}}:'

export const chave = (nome: string) => `${PREFIXO}${nome}`

export function lerJSON<T>(nome: string, padrao: T, storage?: Storage): T {
  try {
    const bruto = (storage ?? localStorage).getItem(chave(nome))
    return bruto === null ? padrao : (JSON.parse(bruto) as T)
  } catch {
    return padrao
  }
}

export function gravarJSON(nome: string, valor: unknown, storage?: Storage): boolean {
  try {
    ;(storage ?? localStorage).setItem(chave(nome), JSON.stringify(valor))
    return true
  } catch {
    return false
  }
}

export function apagarJSON(nome: string, storage?: Storage): void {
  try {
    ;(storage ?? localStorage).removeItem(chave(nome))
  } catch {
    // sem armazenamento: nada a apagar
  }
}

/** Todos os dados do app no aparelho, por nome (sem o prefixo), fora o tema. */
export function todosOsDados(storage?: Storage): Record<string, unknown> {
  const dados: Record<string, unknown> = {}
  try {
    const s = storage ?? localStorage
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i)
      if (!k || !k.startsWith(PREFIXO) || k === chave('tema')) continue
      const bruto = s.getItem(k)
      if (bruto === null) continue
      try {
        dados[k.slice(PREFIXO.length)] = JSON.parse(bruto)
      } catch {
        dados[k.slice(PREFIXO.length)] = bruto
      }
    }
  } catch {
    // sem armazenamento: exporta vazio
  }
  return dados
}

/** Data local como AAAA-MM-DD (o fuso do aparelho, que é o da pessoa). */
export function chaveDoDia(data = new Date()): string {
  const y = data.getFullYear()
  const m = String(data.getMonth() + 1).padStart(2, '0')
  const d = String(data.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Baixa um JSON no navegador, sem upload. */
export function baixarJSON(nomeDoArquivo: string, conteudo: unknown, doc?: Document): void {
  const d = doc ?? document
  const blob = new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = d.createElement('a')
  a.href = url
  a.download = nomeDoArquivo
  a.click()
  URL.revokeObjectURL(url)
}

/** O arquivo de "Baixar meus dados": app, versão, data e tudo o que está no aparelho. */
export function pacoteDeDados(storage?: Storage, agora = new Date()) {
  return { app: '{{APP_SLUG}}', versao: 1, exportadoEm: agora.toISOString(), dados: todosOsDados(storage) }
}

export function baixarMeusDados(): void {
  baixarJSON(`{{APP_SLUG}}-${chaveDoDia()}.json`, pacoteDeDados())
}
