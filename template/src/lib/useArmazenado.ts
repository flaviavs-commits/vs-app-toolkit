import { useEffect, useState } from 'react'

import { gravarJSON, lerJSON } from './armazenamento'

/**
 * Estado que vive no aparelho: lê do localStorage na montagem e grava a cada mudança (com o prefixo
 * do app). Mesma assinatura do useState.
 */
export function useArmazenado<T>(nome: string, padrao: T) {
  const [valor, setValor] = useState<T>(() => lerJSON(nome, padrao))
  useEffect(() => {
    gravarJSON(nome, valor)
  }, [nome, valor])
  return [valor, setValor] as const
}
