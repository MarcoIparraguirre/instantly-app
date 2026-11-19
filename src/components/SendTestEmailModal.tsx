'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Send, X, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAdminProfile } from '@/context/AdminProfileContext';

interface SendTestEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
}

interface TestEmailResult {
  success?: boolean;
  error?: string;
  messageId?: string;
  sentTo?: string;
}

export default function SendTestEmailModal({
  isOpen,
  onClose,
  campaignId,
}: SendTestEmailModalProps) {
  const { language } = useLanguage();
  const { profile } = useAdminProfile();
  const isEs = language === 'es';

  const [targetEmail, setTargetEmail] = useState(profile.email || 'marcos@vectrasystems.com.ar');
  const [recipientName, setRecipientName] = useState(profile.name || 'Marco');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<TestEmailResult | null>(null);

  const handleClose = useCallback(() => {
    setResult(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedEmail = targetEmail.trim();
    if (!cleanedEmail) return;

    setIsSending(true);
    setResult(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: cleanedEmail,
          firstName: recipientName.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResult({
          success: true,
          messageId: data.messageId,
          sentTo: data.to || cleanedEmail,
        });
      } else {
        setResult({
          success: false,
          error:
            data.error ||
            (isEs ? 'Error al despachar el correo de prueba' : 'Failed to dispatch test email'),
        });
      }
    } catch (err: unknown) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : isEs ? 'Error de red' : 'Network error',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-test-email-title"
        className="bg-white border border-[#DCE3DF] text-[#14213D] rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#DCE3DF] flex items-center justify-between bg-[#F4F7F5]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3
                id="send-test-email-title"
                className="text-sm font-bold text-[#14213D] leading-tight"
              >
                {isEs ? 'Enviar Correo de Prueba Real' : 'Send Real Test Email'}
              </h3>
              <p className="text-[11px] text-[#5C6F68]">
                {isEs
                  ? 'Comprueba el envío real y míralo en tu Gmail'
                  : 'Test real SMTP delivery to your inbox'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={isEs ? 'Cerrar' : 'Close'}
            className="text-[#5C6F68] hover:text-[#14213D] p-1.5 rounded-lg hover:bg-[#EEF3F0] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSendTest} className="p-6 space-y-4">
          <div>
            <label
              htmlFor="test-email-destination"
              className="block text-[11px] font-semibold text-[#5C6F68] uppercase tracking-wider mb-1.5"
            >
              {isEs ? 'Enviar a este correo' : 'Destination Email'}
            </label>
            <input
              id="test-email-destination"
              type="email"
              required
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="tu-correo@ejemplo.com"
              className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3.5 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/70 focus:outline-none font-mono tabular-nums transition"
            />
          </div>

          <div>
            <label
              htmlFor="test-email-recipient-name"
              className="block text-[11px] font-semibold text-[#5C6F68] uppercase tracking-wider mb-1.5"
            >
              {isEs ? 'Nombre para personalizar variables' : 'Recipient Name for {{Nombre}}'}
            </label>
            <input
              id="test-email-recipient-name"
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Marco"
              className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3.5 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/70 focus:outline-none transition"
            />
          </div>

          {result &&
            (result.success ? (
              <div className="p-3.5 bg-[#D5ECD4]/65 border border-[#C3DAC3] rounded-xl text-xs space-y-1.5 animate-in fade-in">
                <div className="flex items-center gap-2 font-bold text-[#14213D]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#14213D]" />
                  <span>
                    {isEs ? '¡Correo enviado con éxito!' : 'Email dispatched successfully!'}
                  </span>
                </div>
                <p className="text-[11px] text-[#14213D]/90 leading-relaxed">
                  {isEs ? (
                    <>
                      Se envió a{' '}
                      <span className="font-mono tabular-nums font-semibold text-[#14213D]">
                        {result.sentTo || targetEmail}
                      </span>
                      . Puedes verificarlo en tu Bandeja de Entrada y en tu carpeta
                      &ldquo;Enviados&rdquo; de Gmail.
                    </>
                  ) : (
                    <>
                      Dispatched to{' '}
                      <span className="font-mono tabular-nums font-semibold text-[#14213D]">
                        {result.sentTo || targetEmail}
                      </span>
                      . Check your inbox and &ldquo;Sent&rdquo; folder.
                    </>
                  )}
                </p>
                {result.messageId && (
                  <p className="text-[10px] text-[#5C6F68] font-mono tabular-nums truncate">
                    ID: {result.messageId}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1 animate-in fade-in">
                <div className="flex items-center gap-2 font-bold text-rose-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{isEs ? 'Error al enviar por SMTP' : 'SMTP dispatch error'}</span>
                </div>
                <p className="text-[11px] text-rose-700 leading-relaxed font-mono tabular-nums">
                  {result.error}
                </p>
              </div>
            ))}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#DCE3DF]">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] text-xs font-semibold text-[#14213D] transition cursor-pointer"
            >
              {isEs ? 'Cerrar' : 'Close'}
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="px-4 py-2 bg-[#14213D] hover:bg-[#1E3158] text-white rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEs ? 'Enviando por SMTP...' : 'Sending via SMTP...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>{isEs ? 'Enviar Prueba Real' : 'Send Real Test'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
