'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Send, Sparkles, AlertCircle, CheckCircle, ShieldAlert } from 'lucide-react';
import { Campaign, CopilotMessage, ActionApproval } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  onCampaignUpdated: (updated: Campaign) => void;
}

export default function CopilotDrawer({ isOpen, onClose, campaign, onCampaignUpdated }: CopilotDrawerProps) {
  const { t, language } = useLanguage();
  const msgSeqRef = useRef(0);
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: t('copilot.welcome'),
      timestamp: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const nextId = (prefix = 'msg') => `${prefix}-${++msgSeqRef.current}`;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Mutual exclusivity: close copilot when an accounts drawer/modal is opened
  useEffect(() => {
    const handleCloseFromAccounts = () => {
      if (isOpen) {
        onClose();
      }
    };
    window.addEventListener('misender:close-copilot', handleCloseFromAccounts);
    return () => window.removeEventListener('misender:close-copilot', handleCloseFromAccounts);
  }, [isOpen, onClose]);

  // Mutual exclusivity: notify accounts view to close its drawers/modals when copilot opens
  useEffect(() => {
    if (isOpen) {
      window.dispatchEvent(new CustomEvent('misender:close-accounts-drawer'));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: CopilotMessage = {
      id: nextId('usr'),
      role: 'user',
      content: textToSend,
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          campaignId: campaign?.id,
          language,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const assistantMsg: CopilotMessage = {
          id: nextId('ast'),
          role: 'assistant',
          content: data.reply,
          timestamp: 'Just now',
          approval: data.approval,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (data.updatedCampaign) {
          onCampaignUpdated(data.updatedCampaign);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId('err'),
            role: 'assistant',
            content:
              data.error ||
              (language === 'es' ? 'No se pudo procesar la solicitud.' : 'Failed to process request.'),
            timestamp: 'Just now',
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId('err'),
          role: 'assistant',
          content:
            language === 'es'
              ? 'Error de conexión con el asistente.'
              : 'Network error communicating with assistant.',
          timestamp: 'Just now',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprovalAction = async (approval: ActionApproval, status: 'approved' | 'rejected') => {
    setLoading(true);
    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionApproval: { ...approval, status },
          campaignId: campaign?.id,
          language,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.approval?.id === approval.id
              ? { ...m, approval: { ...approval, status } }
              : m
          )
        );

        setMessages((prev) => [
          ...prev,
          {
            id: nextId('ast'),
            role: 'assistant',
            content: data.reply,
            timestamp: 'Just now',
          },
        ]);

        if (data.updatedCampaign) {
          onCampaignUpdated(data.updatedCampaign);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    {
      label: t('copilot.chipSequence'),
      prompt:
        language === 'es'
          ? 'Ayúdame a crear una secuencia completa de prospección en 3 pasos'
          : 'Help me create a complete 3-step cold email sequence',
    },
    {
      label: t('copilot.chipSpam'),
      prompt:
        language === 'es'
          ? 'Auditar y escanear palabras spam en la campaña'
          : 'Audit this campaign sequence for spam words and suggest replacements',
    },
    {
      label: t('copilot.chipSpintax'),
      prompt:
        language === 'es'
          ? 'Aplicar variaciones spintax al Paso 1'
          : 'Apply spintax variations to Step 1 body',
    },
    {
      label: t('copilot.chipDiagnose'),
      prompt:
        language === 'es'
          ? 'Diagnóstico de salud de la campaña'
          : 'Diagnose campaign deliverability and health',
    },
  ];

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 transition-opacity"
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-white border-l border-[#DCE3DF] shadow-2xl z-50 flex flex-col transition-all text-[#14213D]">
        {/* Header */}
        <div className="h-16 px-5 border-b border-[#DCE3DF] flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#14213D] text-[#D5ECD4] flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-[#14213D] text-sm flex items-center gap-2">
                <span>{t('copilot.title')}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-[11px] text-[#5C6F68] truncate max-w-[280px]">
                {campaign ? `${t('copilot.context')} ${campaign.name}` : t('copilot.generalAssistant')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-lg text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Chips */}
        <div className="p-3 border-b border-[#DCE3DF] bg-[#F4F7F5] flex gap-2 overflow-x-auto no-scrollbar shrink-0">
          {quickPrompts.map((qp, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSend(qp.prompt)}
              disabled={loading}
              className="text-[11px] whitespace-nowrap bg-white hover:bg-[#D5ECD4] text-[#5C6F68] hover:text-[#14213D] border border-[#DCE3DF] hover:border-[#C3DAC3] px-2.5 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3 text-[#14213D]" />
              <span>{qp.label}</span>
            </button>
          ))}
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F4F7F5]">
          {messages.map((msg) => {
            const isError = msg.id.startsWith('err-');
            const displayContent = msg.id === 'welcome' ? t('copilot.welcome') : msg.content;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#14213D] text-white rounded-tr-none shadow-sm'
                      : isError
                        ? 'bg-rose-50 text-rose-700 border border-rose-200 rounded-tl-none'
                        : 'bg-white text-[#14213D] border border-[#DCE3DF] shadow-sm rounded-tl-none whitespace-pre-wrap'
                  }`}
                >
                  {isError ? (
                    <div className="flex items-start gap-2 text-xs">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-rose-800 mr-1">Error:</span>
                        <span>{displayContent}</span>
                      </div>
                    </div>
                  ) : (
                    displayContent
                  )}
                </div>

                {/* Action Approval Card (Human-in-the-Loop) */}
                {msg.approval && (
                  <div className="mt-3 w-[90%] bg-white border border-[#14213D]/30 rounded-xl p-3.5 shadow-md">
                    <div className="flex items-center gap-2 text-[#14213D] text-xs font-semibold mb-1.5">
                      <ShieldAlert className="w-4 h-4 text-[#14213D]" />
                      <span>{t('copilot.actionRequiresApproval')}</span>
                    </div>
                    <p className="text-xs text-[#5C6F68] mb-3">{msg.approval.description}</p>

                    {msg.approval.status === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprovalAction(msg.approval!, 'approved')}
                          disabled={loading}
                          className="flex-1 bg-[#14213D] hover:bg-[#1E3158] text-white text-xs font-semibold py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-[#D5ECD4]" />
                          <span>{t('copilot.approveAndApply')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprovalAction(msg.approval!, 'rejected')}
                          disabled={loading}
                          className="bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] text-[#5C6F68] hover:text-[#14213D] text-xs font-semibold py-2 px-3 rounded-lg transition cursor-pointer disabled:opacity-50"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] font-medium text-[#5C6F68] flex items-center gap-1.5">
                        {msg.approval.status === 'approved' ? (
                          <span className="text-emerald-700 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> {t('copilot.approvedAndExecuted')}
                          </span>
                        ) : (
                          <span className="text-rose-700 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> {t('copilot.actionCancelled')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <span className="text-[10px] font-mono tabular-nums text-[#5C6F68] mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-[#5C6F68] text-xs py-2">
              <div className="w-4 h-4 border-2 border-[#14213D] border-t-transparent rounded-full animate-spin" />
              <span>{t('copilot.thinking')}</span>
            </div>
          )}
        </div>

        {/* Input Box */}
        <div className="p-3 border-t border-[#DCE3DF] bg-white shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-center gap-2 bg-[#F4F7F5] border border-[#DCE3DF] rounded-xl px-3 py-2 focus-within:border-[#14213D] transition"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('copilot.placeholder')}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="p-1.5 rounded-lg bg-[#14213D] hover:bg-[#1E3158] disabled:opacity-40 text-white transition cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
