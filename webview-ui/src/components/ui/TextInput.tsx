import type { InputHTMLAttributes } from 'react';

/** The office's text field. */
export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      className={`text-sm font-normal py-7 px-10 bg-bg border border-border rounded-lg text-text outline-none placeholder:text-text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 ${className}`}
      {...props}
    />
  );
}
