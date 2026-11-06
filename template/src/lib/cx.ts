/** Junta classes, ignorando o que for falso: cx("a", cond && "b") → "a b". */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
