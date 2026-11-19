'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ToastNotification, ToastItem } from '@/components/ui/ToastNotification';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}

export interface FeedbackContextValue {
  showToast: (options: ToastOptions | string, variant?: ToastVariant) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const DEFAULT_TOAST_DURATION_MS = 4000;
const MAX_VISIBLE_TOASTS = 6;

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

/**
 * Provides application-wide toast notifications and promise-based confirmation dialogs.
 */
export function FeedbackProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);

  const toastCounterRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingConfirmRef = useRef<{ resolve: (value: boolean) => void } | null>(null);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      if (pendingConfirmRef.current) {
        pendingConfirmRef.current.resolve(false);
        pendingConfirmRef.current = null;
      }
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (options: ToastOptions | string, variant?: ToastVariant) => {
      const normalized: ToastOptions =
        typeof options === 'string'
          ? { title: options, variant: variant ?? 'info', durationMs: DEFAULT_TOAST_DURATION_MS }
          : {
              title: options.title,
              description: options.description,
              variant: options.variant ?? variant ?? 'info',
              durationMs: options.durationMs ?? DEFAULT_TOAST_DURATION_MS,
            };

      const id = `toast-${++toastCounterRef.current}`;
      const newToast: ToastItem = {
        id,
        title: normalized.title,
        description: normalized.description,
        variant: normalized.variant ?? 'info',
      };

      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE_TOASTS - 1)), newToast]);

      const durationMs = normalized.durationMs ?? DEFAULT_TOAST_DURATION_MS;
      if (Number.isFinite(durationMs) && durationMs > 0) {
        const timer = setTimeout(() => {
          timersRef.current.delete(id);
          setToasts((prev) => prev.filter((item) => item.id !== id));
        }, durationMs);
        timersRef.current.set(id, timer);
      }
    },
    []
  );

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    if (pendingConfirmRef.current) {
      pendingConfirmRef.current.resolve(false);
      pendingConfirmRef.current = null;
    }

    return new Promise<boolean>((resolve) => {
      pendingConfirmRef.current = { resolve };
      setConfirmState(options);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const pending = pendingConfirmRef.current;
    pendingConfirmRef.current = null;
    setConfirmState(null);
    pending?.resolve(true);
  }, []);

  const handleCancel = useCallback(() => {
    const pending = pendingConfirmRef.current;
    pendingConfirmRef.current = null;
    setConfirmState(null);
    pending?.resolve(false);
  }, []);

  const value = useMemo<FeedbackContextValue>(
    () => ({ showToast, confirm }),
    [showToast, confirm]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      <ConfirmationModal
        isOpen={confirmState !== null}
        title={confirmState?.title ?? ''}
        description={confirmState?.description ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        variant={confirmState?.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return ctx;
}
