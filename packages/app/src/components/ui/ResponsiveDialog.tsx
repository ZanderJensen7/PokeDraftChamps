import type { ReactNode } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Modal } from './Modal';
import { Sheet } from './Sheet';

interface ResponsiveDialogProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Desktop: the wide modal. */
  wide?: boolean;
  /** Phones: a full-screen panel instead of a bottom sheet. */
  full?: boolean;
}

/** Centered modal from 768px up, bottom sheet (or full-screen panel) on phones. */
export function ResponsiveDialog({ title, onClose, children, footer, wide, full }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  return isMobile
    ? <Sheet title={title} onClose={onClose} footer={footer} full={full}>{children}</Sheet>
    : <Modal title={title} onClose={onClose} footer={footer} wide={wide}>{children}</Modal>;
}
