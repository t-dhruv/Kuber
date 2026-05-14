import { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  placement?: TooltipPlacement;
  delay?: number;
  disabled?: boolean;
}

export function Tooltip({ content, children, placement = 'top', delay = 300, disabled }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (disabled) return;
    timerRef.current = setTimeout(() => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const gap = 8;
      let top = 0;
      let left = 0;
      switch (placement) {
        case 'top':
          top = rect.top + window.scrollY - gap;
          left = rect.left + window.scrollX + rect.width / 2;
          break;
        case 'bottom':
          top = rect.bottom + window.scrollY + gap;
          left = rect.left + window.scrollX + rect.width / 2;
          break;
        case 'left':
          top = rect.top + window.scrollY + rect.height / 2;
          left = rect.left + window.scrollX - gap;
          break;
        case 'right':
          top = rect.top + window.scrollY + rect.height / 2;
          left = rect.right + window.scrollX + gap;
          break;
      }
      setCoords({ top, left });
      setVisible(true);
    }, delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  const toggle = () => {
    if (visible) {
      hide();
    } else {
      show();
    }
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches && timerRef.current) {
      clearTimeout(timerRef.current);
      setVisible(false);
    }
  }, []);

  const placementClasses: Record<TooltipPlacement, string> = {
    top: '-translate-x-1/2 -translate-y-full',
    bottom: '-translate-x-1/2',
    left: '-translate-x-full -translate-y-1/2',
    right: '-translate-y-1/2',
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={toggle}
        onTouchStart={toggle}
        className="inline-flex"
        role="button"
        aria-label={typeof content === 'string' ? content : undefined}
        aria-expanded={visible}
      >
        {children}
      </div>
      {visible && !disabled && createPortal(
        <div
          role="tooltip"
          style={{ top: coords.top, left: coords.left }}
          className={`fixed z-[9999] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-inverse)] bg-[var(--color-text)] rounded-[var(--radius-sm)] shadow-[var(--shadow-md)] pointer-events-none whitespace-nowrap max-w-xs ${placementClasses[placement]}`}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
}
