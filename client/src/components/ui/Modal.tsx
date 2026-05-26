import { useEffect, useRef, ReactNode, HTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({ open, onClose, title, description, children, size = 'md', closeOnBackdrop = false }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === overlayRef.current) {
      e.stopPropagation();
      onClose();
    }
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement;
    firstFocusRef.current?.focus();
    return () => { prev?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const content = contentRef.current;
    if (!content) return;
    const focusable = content.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    content.addEventListener('keydown', handleTab);
    return () => content.removeEventListener('keydown', handleTab);
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-3 sm:p-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div
        ref={contentRef}
        className={`relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full ${sizeStyles[size]} flex-col overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] border border-[var(--color-border)] sm:max-h-[calc(100dvh-2rem)]`}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex shrink-0 items-start justify-between gap-4 px-4 pt-5 pb-4 border-b border-[var(--color-border)] sm:px-6 sm:pt-6">
            <div>
              {title && <h2 id="modal-title" className="text-base font-semibold text-[var(--color-text)]">{title}</h2>}
              {description && <p id="modal-description" className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>}
            </div>
            <button
              ref={firstFocusRef}
              onClick={onClose}
              className="flex-shrink-0 rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}

interface ModalFooterProps extends HTMLAttributes<HTMLDivElement> {}

export function ModalFooter({ children, className = '', ...props }: ModalFooterProps) {
  return (
    <div
      className={`sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 pt-4 pb-1 sm:-mx-6 sm:px-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
