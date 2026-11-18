'use client';

import React, { useState, useEffect } from 'react';
import { Mail, Send, X, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAdminProfile } from '@/context/AdminProfileContext';

interface SendTestEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
}

export default function SendTestEmailModal({
  isOpen,
  onClose,
  campaignId
}: SendTestEmailModalProps) {
  const { language } = useLanguage();
  const { profile } = useAdminProfile();
  const [targetEmail, setTargetEmail] = useState(profile.email || 'marcos@vectrasystems.com.ar');
  const [recipientName, setRecipientName] = useState(profile.name || 'Marco');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string; messageId?: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEmail.trim()) return;

    setIsSending(true);
    setResult(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: targetEmail.trim(),
          firstName: recipientName.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResult({ success: true, messageId: data.messageId });
      } else {
        setResult({ success: false, error: data.error || 'Failed to dispatch test email' });
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message || 'Network error' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div 
        className="bg-[#0e1422] border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                {language === 'es' ? 'Enviar Correo de Prueba Real' : 'Send Real Test Email'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {language === 'es' ? 'Comprueba el envío real y míralo en tu Gmail' : 'Test real SMTP delivery to your inbox'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSendTest} className="space-y-3.5">
          <div>
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              {language === 'es' ? 'Enviar a este correo:' : 'Destination Email:'}
            </label>
            <input
              type="email"
              required
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="tu-correo@ejemplo.com"
              className="w-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              {language === 'es' ? 'Nombre para personalizar variables:' : 'Recipient Name for {{Nombre}}:'}
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Marco"
              className="w-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {result && (
            result.success ? (
              <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/40 rounded-2xl text-xs space-y-1 animate-in fade-in">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{language === 'es' ? '¡Correo enviado con éxito!' : 'Email dispatched successfully!'}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {language === 'es'
                    ? `Se envió a ${targetEmail}. Puedes verificarlo en tu Bandeja de Entrada y en tu carpeta "Enviados" de Gmail.`
                    : `Dispatched to ${targetEmail}. Check your inbox and "Sent" folder.`}
                </p>
              </div>
            ) : (
              <div className="p-3.5 bg-rose-950/30 border border-rose-500/40 rounded-2xl text-xs space-y-1 animate-in fade-in">
                <div className="flex items-center gap-2 font-bold text-rose-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{language === 'es' ? 'Error al enviar por SMTP' : 'SMTP dispatch error'}</span>
                </div>
                <p className="text-[11px] text-rose-300/90 leading-relaxed">{result.error}</p>
              </div>
            )
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-white"
            >
              {language === 'es' ? 'Cerrar' : 'Close'}
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{language === 'es' ? 'Enviando por SMTP...' : 'Sending via SMTP...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>{language === 'es' ? 'Enviar Prueba Real' : 'Send Real Test'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
