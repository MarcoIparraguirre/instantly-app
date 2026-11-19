'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { ToastVariant } from '@/context/FeedbackContext';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

export interface ToastNotificationProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  {
    borderAccent: string;
    iconBadge: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  success: {
    borderAccent: 'border-l-4 border-l-emerald-600',
    iconBadge: 'bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D]',
    Icon: CheckCircle2,
  },
  error: {
    borderAccent: 'border-l-4 border-l-rose-600',
    iconBadge: 'bg-rose-50 border border-rose-200 text-rose-700',
    Icon: AlertCircle,
  },
  warning: {
    borderAccent: 'border-l-4 border-l-amber-600',
    iconBadge: 'bg-amber-50 border border-amber-200 text-amber-800',
    Icon: AlertTriangle,
  },
  info: {
    borderAccent: 'border-l-4 border-l-[#14213D]',
    iconBadge: 'bg-[#EEF3F0] border border-[#DCE3DF] text-[#14213D]',
    Icon: Info,
  },
};

/**
 * Bottom-right toast notification stack with status accents and accessible dismissal.
 */
export function ToastNotification({ toasts, onDismiss }: ToastNotificationProps): React.JSX.Element | null {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[90] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => {
        const style = VARIANT_STYLES[toast.variant];
        const StatusIcon = style.Icon;

        return (
          <div
            key={toast.id}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto bg-white border border-[#DCE3DF] text-[#14213D] ${style.borderAccent} rounded-xl shadow-xl p-3.5 flex items-start gap-3`}
          >
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${style.iconBadge}`}
            >
              <StatusIcon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#14213D] leading-snug break-words">
                {toast.title}
              </p>
              {toast.description && (
                <p className="text-[11px] text-[#5C6F68] mt-0.5 leading-relaxed break-words">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Cerrar notificación"
              className="p-1 rounded-md text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0] transition shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default ToastNotification;
