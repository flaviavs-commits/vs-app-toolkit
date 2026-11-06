import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../lib/cx'

/**
 * Botão do app, por papel: primary (marca), outline (contorno ≥ 3:1), ghost e danger. O foco é o anel
 * global do index.css. Alvo de toque ≥ 44px em todos os tamanhos.
 */
type Variant = 'primary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variants: Record<Variant, string> = {
  primary: 'bg-marca text-tinta border-marca hover:bg-marca/90 shadow-sm',
  outline: 'bg-superficie text-texto border-borda-controle hover:bg-selecionado/60',
  ghost: 'bg-transparent text-apoio border-transparent hover:bg-selecionado/60 hover:text-texto',
  danger: 'bg-superficie text-erro border-erro/40 hover:bg-erro/10 hover:border-erro/60',
}

const sizes: Record<Size, string> = {
  sm: 'h-11 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl border font-semibold',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
