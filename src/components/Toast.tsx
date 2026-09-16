"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Toast = {
  id: number;
  message: string;
  tone: "info" | "danger";
  action?: { label: string; onClick: () => void };
  duration: number;
};

type ToastInput = Omit<Toast, "id" | "tone" | "duration"> & Partial<Pick<Toast, "tone" | "duration">>;

const ToastContext = createContext<{
  push: (t: ToastInput) => number;
  dismiss: (id: number) => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    const toast: Toast = { tone: "info", duration: 3500, ...input, id };
    setToasts((list) => [...list, toast]);
    timers.current.set(id, setTimeout(() => dismiss(id), toast.duration));
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 rounded border-2 px-4 py-2.5 text-sm font-bold shadow-hard-2 ${
              t.tone === "danger"
                ? "border-danger bg-danger-soft text-danger"
                : "border-border bg-bg-card text-ink"
            }`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => { t.action?.onClick(); dismiss(t.id); }}
                className="rounded border-2 border-border bg-primary px-2 py-0.5 text-xs font-extrabold uppercase tracking-wider text-white btn-push-sm"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-ink-muted hover:text-ink"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
