/** Estado de carregamento: aparece só depois de 300 ms (index.css) e respira devagar. */
export function Carregador({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="carregando" role="status">
      <span className="respiro" aria-hidden />
      <p>{texto}</p>
    </div>
  )
}
