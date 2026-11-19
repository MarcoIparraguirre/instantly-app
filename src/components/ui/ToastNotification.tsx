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
    iconColor: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  success: {
    borderAccent: 'border-l-4 border-l-emerald-500',
    iconColor: 'text-emerald-400',
    Icon: CheckCircle2,
  },
  error: {
    borderAccent: 'border-l-4 border-l-rose-500',
    iconColor: 'text-rose-400',
    Icon: AlertCircle,
  },
  warning: {
    borderAccent: 'border-l-4 border-l-amber-500',
    iconColor: 'text-amber-400',
    Icon: AlertTriangle,
  },
  info: {
    borderAccent: 'border-l-4 border-l-[#E85D2A]',
    iconColor: 'text-[#E85D2A]',
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
            className={`pointer-events-auto bg-[#11141C] border border-[#232938] ${style.borderAccent} rounded-xl shadow-2xl p-3.5 flex items-start gap-3`}
          >
            <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${style.iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#F3F5F8] leading-snug break-words">
                {toast.title}
              </p>
              {toast.description && (
                <p className="text-[11px] text-[#949EB0] mt-0.5 leading-relaxed break-words">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Cerrar notificación"
              className="p-1 rounded-md text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26] transition shrink-0 cursor-pointer"
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
