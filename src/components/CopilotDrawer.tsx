'use client';

import React, { useState, useEffect } from 'react';
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
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize or re-localize welcome message if empty
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: t('copilot.welcome'),
          timestamp: 'Just now'
        }
      ]);
    }
  }, [language]);

  if (!isOpen) return null;

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: CopilotMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: 'Just now'
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          campaignId: campaign?.id,
          language
        })
      });

      const data = await res.json();
      if (res.ok) {
        const assistantMsg: CopilotMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.reply,
          timestamp: 'Just now',
          approval: data.approval
        };
        setMessages(prev => [...prev, assistantMsg]);
        if (data.updatedCampaign) {
          onCampaignUpdated(data.updatedCampaign);
        }
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `⚠️ Error: ${data.error || 'Failed to process request.'}`,
            timestamp: 'Just now'
          }
        ]);
      }
    } catch (err) {
      console.error(err);
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
          language
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMessages(prev =>
          prev.map(m =>
            m.approval?.id === approval.id
              ? { ...m, approval: { ...approval, status } }
              : m
          )
        );

        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: data.reply,
            timestamp: 'Just now'
          }
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
      prompt: language === 'es' ? 'Ayúdame a crear una secuencia completa de prospección en 3 pasos' : 'Help me create a complete 3-step cold email sequence'
    },
    {
      label: t('copilot.chipSpam'),
      prompt: language === 'es' ? 'Auditar y escanear palabras spam en la campaña' : 'Audit this campaign sequence for spam words and suggest replacements'
    },
    {
      label: t('copilot.chipSpintax'),
      prompt: language === 'es' ? 'Aplicar variaciones spintax al Paso 1' : 'Apply spintax variations to Step 1 body'
    },
    {
      label: t('copilot.chipDiagnose'),
      prompt: language === 'es' ? 'Diagnóstico de salud de la campaña' : 'Diagnose campaign deliverability and health'
    }
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-[#0c121e] border-l border-slate-800 shadow-2xl z-50 flex flex-col transition-all">
      {/* Header */}
      <div className="h-16 px-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-white text-sm flex items-center gap-2">
              {t('copilot.title')}
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-[11px] text-slate-400">
              {campaign ? `${t('copilot.context')} ${campaign.name}` : t('copilot.generalAssistant')}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Action Chips */}
      <div className="p-3 border-b border-slate-800/60 bg-slate-900/30 flex gap-2 overflow-x-auto no-scrollbar">
        {quickPrompts.map((qp, i) => (
          <button
            key={i}
            onClick={() => handleSend(qp.prompt)}
            disabled={loading}
            className="text-[11px] whitespace-nowrap bg-slate-800/80 hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-300 border border-slate-700/60 hover:border-indigo-500/40 px-2.5 py-1.5 rounded-full transition flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-indigo-400" />
            {qp.label}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none whitespace-pre-wrap'
              }`}
            >
              {msg.content}
            </div>

            {/* Action Approval Card (Human-in-the-Loop) */}
            {msg.approval && (
              <div className="mt-3 w-[90%] bg-slate-900/95 border border-indigo-500/40 rounded-xl p-3.5 shadow-xl">
                <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold mb-1.5">
                  <ShieldAlert className="w-4 h-4 text-indigo-400" />
                  {t('copilot.actionRequiresApproval')}
                </div>
                <p className="text-xs text-slate-300 mb-3">{msg.approval.description}</p>

                {msg.approval.status === 'pending' ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprovalAction(msg.approval!, 'approved')}
                      disabled={loading}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 shadow"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {t('copilot.approveAndApply')}
                    </button>
                    <button
                      onClick={() => handleApprovalAction(msg.approval!, 'rejected')}
                      disabled={loading}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs py-2 px-3 rounded-lg transition"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                    {msg.approval.status === 'approved' ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> {t('copilot.approvedAndExecuted')}
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {t('copilot.actionCancelled')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            {t('copilot.thinking')}
          </div>
        )}
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('copilot.placeholder')}
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition shadow"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
