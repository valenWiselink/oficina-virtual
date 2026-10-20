import type { ButtonHTMLAttributes } from 'react';

const base =
  'border rounded-lg cursor-pointer font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

const sizes = {
  sm: 'py-4 px-10 text-xs',
  md: 'py-6 px-12 text-sm',
  lg: 'py-7 px-14 text-sm',
  xl: 'py-10 px-20 text-base',
  icon: 'p-0 w-24 h-24 flex items-center justify-center',
  icon_lg: 'p-0 w-40 h-40 flex items-center justify-center',
} as const;

const variants = {
  default: `${base} bg-btn-bg text-text border-transparent hover:bg-btn-hover`,
  active: `${base} bg-text! text-bg border-text`,
  disabled: `${base} bg-btn-bg border-transparent cursor-default opacity-[var(--btn-disabled-opacity)]`,
  accent: `${base} bg-accent! hover:bg-accent-bright! text-white border-accent hover:border-accent-bright`,
  ghost: `${base} bg-transparent text-text-muted border-transparent hover:text-text hover:bg-btn-bg`,
} as const;

type ButtonVariant = keyof typeof variants;
type ButtonSize = keyof typeof sizes;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'default',
  size = 'lg',
  className = '',
  ...props
}: ButtonProps) {
  return <button className={`${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
