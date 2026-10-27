import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Kind = 'info' | 'error' | 'success';
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            className={`pointer-events-auto max-w-md rounded-lg px-4 py-2 text-sm shadow-lg ${
              i.kind === 'error' ? 'bg-red-600 text-white' : i.kind === 'success' ? 'bg-teal-700 text-white' : 'bg-slate-800 text-white'
            }`}
          >
            {i.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}

/** 執行一個寫入動作，失敗時用提示訊息顯示原因（衝突、斷網…） */
export function useAction() {
  const toast = useToast();
  return useCallback(
    async (fn: () => Promise<void>, success?: string): Promise<boolean> => {
      try {
        await fn();
        if (success) toast(success, 'success');
        return true;
      } catch (e) {
        console.error(e);
        toast(e instanceof Error ? e.message : String(e), 'error');
        return false;
      }
    },
    [toast],
  );
}
