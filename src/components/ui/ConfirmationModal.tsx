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
        className="bg-white border border-[#DCE3DF] text-[#14213D] rounded-2xl shadow-2xl max-w-md w-full p-6"
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              isDanger
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-[#D5ECD4]/60 border-[#C3DAC3] text-[#14213D]'
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-[#14213D] leading-snug">
              {title}
            </h2>
            <p id={descriptionId} className="text-sm text-[#5C6F68] mt-1.5 leading-relaxed">
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar diálogo"
            className="p-1.5 rounded-lg text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0] transition shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[#14213D] bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] transition cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition cursor-pointer ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-[#14213D] hover:bg-[#1E3158]'
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
