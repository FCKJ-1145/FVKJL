import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  /** 附加到 .modal-panel 上的类名，用于按弹窗类型定制尺寸（如 downloads-modal） */
  className?: string;
}

export function Modal({ title, description, children, onClose, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>('button, input, select, [tabindex="0"]');
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className={`modal-panel${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description">
        <div className="modal-heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            <p id="modal-description">{description}</p>
          </div>
          <button type="button" className="icon-button pressable" data-ripple aria-label="关闭弹窗" onClick={onClose}>
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
