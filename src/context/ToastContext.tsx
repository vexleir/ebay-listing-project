import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastAction { label: string; onClick: () => void; }
interface Toast { id: string; message: string; type: ToastType; action?: ToastAction; }
interface ToastContextValue { toast: (message: string, type?: ToastType, action?: ToastAction) => void; }

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type, action }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const iconColor = (type: ToastType) =>
    type === 'error' ? '#ef4444' : type === 'success' ? 'var(--success)' : 'var(--accent-color)';

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 9999, maxWidth: '380px', width: 'calc(100vw - 3rem)' }}>
        {toasts.map(t => (
          <div key={t.id} className="glass-panel" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', borderLeft: `3px solid ${iconColor(t.type)}`, animation: 'toastSlideIn 0.2s ease', fontSize: '0.9rem', lineHeight: 1.4 }}>
            <span style={{ color: iconColor(t.type), flexShrink: 0, marginTop: '1px' }}>
              {t.type === 'success' && <CheckCircle2 size={17} />}
              {t.type === 'error' && <XCircle size={17} />}
              {t.type === 'info' && <Info size={17} />}
            </span>
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                style={{ flexShrink: 0, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-primary)', borderRadius: '5px', padding: '3px 10px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="btn-icon" style={{ padding: '2px', flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <style>{`@keyframes toastSlideIn { from { opacity:0; transform:translateX(10px); } to { opacity:1; transform:none; } }`}</style>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
