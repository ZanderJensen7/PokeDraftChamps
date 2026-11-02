import type { ReactNode } from 'react';

/** Classic cream text frame with a double border. */
export function DialogueBox({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`dialogue px-4 py-3 text-base font-semibold leading-snug ${className}`}>{children}</div>;
}
