import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx'

/** Cartão composto (Card + Header + Title + Content), na superfície do app. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-2xl border border-borda bg-superficie shadow-sm', className)} {...props} />
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('border-b border-borda p-5', className)} {...props} />
}

export function CardTitle({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <h2 className={cx('flex items-center gap-2 text-base font-semibold', className)}>
      {icon ? (
        <span className="text-marca-texto" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </h2>
  )
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('p-5', className)} {...props} />
}
