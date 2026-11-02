import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-xl',
};

/** Chunky bevelled button: yellow primary, blue secondary, red danger. Presses down 2px. */
export function GameButton({ variant = 'primary', size = 'md', block, className = '', type, ...rest }: GameButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={`game-btn btn-${variant} ${SIZE[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  );
}
