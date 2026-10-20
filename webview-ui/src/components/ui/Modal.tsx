import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { Button } from './Button.js';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** z-index for backdrop (modal gets +1). Default 50 */
  zIndex?: number;
  /** Panel width in px (it still shrinks to fit narrow screens). Default 460. */
  width?: number;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  zIndex = 50,
  width = 460,
  className = '',
}: ModalProps) {
  // Esc closes, like every dialog.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-text/25 backdrop-blur-[2px]"
        style={{ zIndex }}
        onClick={onClose}
      />
      {/* Sizing wrapper: a full-viewport flex box (inset-0, no viewport
          units — dvw/dvh support varies across iOS) whose padding is the
          modal's screen margin. The panel can never exceed it: max-w/h-full
          caps it and overflow scrolls. Clicks on the margin fall through to
          the backdrop. */}
      <div
        className="fixed inset-0 flex items-center justify-center p-16 pointer-events-none"
        style={{ zIndex: zIndex + 1 }}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`pointer-events-auto bg-bg border border-border rounded-2xl shadow-soft max-w-full max-h-full overflow-y-auto overflow-x-hidden ${className}`}
          style={{ width }}
        >
          {/* Sticky so the close button stays reachable while long content
              scrolls under it. */}
          <div className="sticky top-0 z-10 bg-bg flex items-center justify-between px-18 pt-14 pb-10">
            <span className="text-text text-base font-semibold">{title}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Cerrar (Esc)"
              aria-label="Cerrar"
            >
              <span className="material-symbols-sharp text-base" aria-hidden="true">
                close
              </span>
            </Button>
          </div>
          <div className="px-10 pb-14">{children}</div>
        </div>
      </div>
    </>
  );
}
