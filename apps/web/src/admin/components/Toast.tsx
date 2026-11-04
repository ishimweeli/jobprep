import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';

/**
 * A short message after something was done ("Access extended until 4 Dec"). Not designed (A18): a small white card at
 * the bottom of the screen, a green or red edge and the word as text (never colour alone), announced politely. It goes
 * by itself after 6 seconds and has a Dismiss button. Without a provider (unit tests of one component) it does nothing.
 */
export interface ToastInput { text: string; tone?: 'success' | 'error' }
interface ToastItem extends ToastInput { id: number }

type Push = (t: ToastInput) => void;
const ToastContext = createContext<Push>(() => undefined);

export const useToast = (): Push => useContext(ToastContext);

const LIFETIME_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((l) => l.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback<Push>((t) => {
    const id = next.current++;
    setItems((l) => [...l.slice(-2), { ...t, id }]);
    timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME_MS));
  }, [dismiss]);

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => clearTimeout(t));
  }, []);

  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-[88px] z-[60] flex flex-col items-stretch gap-2 min-[900px]:inset-x-auto min-[900px]:bottom-6 min-[900px]:right-6 min-[900px]:w-[380px]">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex items-start gap-3 rounded-[12px] border border-l-4 bg-white p-3.5 shadow-modal',
              t.tone === 'error' ? 'border-incorrect-line border-l-incorrect' : 'border-correct-line border-l-correct',
            )}
          >
            <span className="flex-1 text-[15px] text-ink">
              <span className="sr-only">{t.tone === 'error' ? 'Error: ' : 'Done: '}</span>
              {t.text}
            </span>
            <button type="button" onClick={() => dismiss(t.id)} className="min-h-11 min-w-11 rounded-[10px] border-0 bg-transparent text-sm font-semibold text-brand">
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
