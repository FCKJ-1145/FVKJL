import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { useEffect } from 'react';
import type { ToastMessage } from '../types';

interface ToastProps {
  toast: ToastMessage;
  onClose: () => void;
}

export function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, [toast.id, onClose]);

  const Icon = toast.kind === 'error' ? AlertTriangle : toast.kind === 'info' ? Info : Check;

  return (
    <div className={`toast toast-${toast.kind ?? 'success'}`} role="status" aria-live="polite">
      <span className="toast-icon"><Icon size={16} aria-hidden="true" /></span>
      <div className="toast-copy">
        <strong>{toast.title}</strong>
        {toast.detail && <span>{toast.detail}</span>}
      </div>
      <button type="button" className="icon-button" aria-label="关闭通知" onClick={onClose}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}