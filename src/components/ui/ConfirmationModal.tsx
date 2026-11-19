'use client';

import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation dialog supporting Escape dismissal, backdrop click cancel, and danger/primary variants.
 */
export function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmationModalProps): React.JSX.Element | null {
  const titleId = useId();
  const descriptionId = useId();
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  useEffect(() => {
    if (!isOpen) return;
    const targetBtn = variant === 'danger' ? cancelBtnRef.current : confirmBtnRef.current;
    targetBtn?.focus();
  }, [isOpen, variant]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const Icon = isDanger ? AlertTriangle : ShieldCheck;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={onCancel}
      className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#11141C] border border-[#232938] rounded-2xl shadow-2xl max-w-md w-full p-6"
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              isDanger
                ? 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                : 'bg-[#E85D2A]/10 border-[#E85D2A]/25 text-[#E85D2A]'
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-[#F3F5F8] leading-snug">
              {title}
            </h2>
            <p id={descriptionId} className="text-sm text-[#949EB0] mt-1.5 leading-relaxed">
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar diálogo"
            className="p-1.5 rounded-lg text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26] transition shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[#949EB0] hover:text-[#F3F5F8] bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] transition cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition cursor-pointer ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-[#E85D2A] hover:bg-[#F26B3A]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmationModal;
