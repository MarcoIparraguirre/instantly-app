'use client';

import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Send,
  User,
  Sparkles,
  Building2,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { EmailThread, AiSentimentTag } from '@/types';
import { initialUniboxThreads } from '@/core/storage/mockData';
import { useLanguage } from '@/context/LanguageContext';
import { useAdminProfile } from '@/context/AdminProfileContext';

interface UniboxViewProps {
  onPromoteToCrm?: (thread: EmailThread) => void;
  onUnreadCountChange?: (count: number) => void;
  onLeadsSynced?: () => void;
}

export default function UniboxView({
  onPromoteToCrm,
  onUnreadCountChange,
  onLeadsSynced
}: UniboxViewProps) {
  const { t, language } = useLanguage();
  const { profile } = useAdminProfile();
  const [threads, setThreads] = useState<EmailThread[]>(initialUniboxThreads);
  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0]?.id || '');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | AiSentimentTag>('all');
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isSyncingImap, setIsSyncingImap] = useState(false);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const handleSuggestAiReply = async () => {
    if (!selectedThread) return;
    const lastMsg = selectedThread.messages[selectedThread.messages.length - 1];
    if (!lastMsg) return;

    setIsGeneratingSuggestion(true);
    try {
      const res = await fetch('/api/unibox/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: lastMsg.subject,
          body: lastMsg.body,
          leadName: selectedThread.leadName,
          leadEmail: selectedThread.leadEmail,
          companyName: selectedThread.companyName
        })
      });
      const data = await res.json();
      if (data.suggestedReply) {
        setReplyText(data.suggestedReply);
      }
    } catch (err) {
      console.error('Error generating suggestion:', err);
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  useEffect(() => {
    handleSyncInbox();
  }, []);

  useEffect(() => {
    const unread = threads.filter(th => th.unread).length;
    if (onUnreadCountChange) onUnreadCountChange(unread);
  }, [threads]);

  const handleSyncInbox = async () => {
    setIsSyncingImap(true);
    setSyncNotice(null);
    try {
      const res = await fetch('/api/unibox/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.threads)) {
        setThreads(data.threads);
        if (data.threads.length > 0 && !selectedThreadId) {
          setSelectedThreadId(data.threads[0].id);
        }
        const bounceCount = data.bouncedEmails?.length || 0;
        const replyCount = data.repliedEmails?.length || 0;
        setSyncNotice(
          language === 'es'
            ? `Sincronizado con Gmail IMAP: ${replyCount} respuestas y ${bounceCount} rebotes detectados.`
            : `Synced with Gmail IMAP: ${replyCount} replies and ${bounceCount} bounces detected.`
        );
        if (onLeadsSynced) onLeadsSynced();
      }
    } catch (err) {
      console.error('Error syncing IMAP:', err);
    } finally {
      setIsSyncingImap(false);
    }
  };

  const selectedThread = threads.find(t => t.id === selectedThreadId) || threads[0];

  const getSentimentBadge = (sentiment: AiSentimentTag, isBounce?: boolean) => {
    if (isBounce) {
      return {
        label: language === 'es' ? '⚠️ Rebote (No entregado)' : '⚠️ Bounced',
        color: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    switch (sentiment) {
      case 'interested':
        return {
          label: t('unibox.filterInterested'),
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        };
      case 'meeting-booked':
        return {
          label: t('unibox.filterMeeting'),
          color: 'bg-blue-500/10 text-blue-400 border-blue-500/30'
        };
      case 'not-interested':
        return {
          label: t('unibox.filterNotInterested'),
          color: 'bg-slate-700/40 text-slate-400 border-slate-700'
        };
      case 'out-of-office':
        return {
          label: t('unibox.filterOoo'),
          color: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
        };
      case 'wrong-person':
        return {
          label: language === 'es' ? '⚠️ Rebote / Casilla Inválida' : '⚠️ Bounce / Wrong Address',
          color: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        };
      default:
        return { label: sentiment, color: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  const filteredThreads = threads.filter(thread => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'unread') return thread.unread;
    return thread.sentiment === activeFilter;
  });

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedThread) return;
    setIsSendingReply(true);

    setTimeout(() => {
      const newMessage = {
        id: `msg-${Date.now()}`,
        sender: profile.email || 'marcos@vectrasystems.com.ar',
        recipient: selectedThread.leadEmail,
        subject: `Re: ${selectedThread.messages[0]?.subject || 'Follow up'}`,
        body: replyText,
        timestamp: new Date().toISOString(),
        isIncoming: false
      };

      setThreads(prev =>
        prev.map(th =>
          th.id === selectedThread.id
            ? {
                ...th,
                unread: false,
                lastActivityAt: new Date().toISOString(),
                messages: [...th.messages, newMessage]
              }
            : th
        )
      );

      setReplyText('');
      setIsSendingReply(false);
    }, 600);
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0b0f17]">
      {/* COLUMN 1: Inbox Filters & AI Sentiments */}
      <div className="w-64 bg-[#090d16] border-r border-slate-800/80 p-4 space-y-4 shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Unibox</h2>
          </div>

          <button
            onClick={handleSyncInbox}
            disabled={isSyncingImap}
            className="flex items-center gap-1 text-[11px] font-semibold bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-lg transition cursor-pointer"
            title={language === 'es' ? 'Sincronizar respuestas y rebotes desde Gmail' : 'Sync replies & bounces from Gmail'}
          >
            <RefreshCw className={`w-3 h-3 ${isSyncingImap ? 'animate-spin' : ''}`} />
            <span>{language === 'es' ? 'Sincronizar' : 'Sync'}</span>
          </button>
        </div>

        {syncNotice && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 leading-relaxed flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span>{syncNotice}</span>
          </div>
        )}

        <div className="space-y-1">
          <button
            onClick={() => setActiveFilter('all')}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span>{t('unibox.filterAll')}</span>
            <span className="text-[10px] bg-slate-900/60 px-1.5 py-0.5 rounded font-mono">
              {threads.length}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('unread')}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
              activeFilter === 'unread'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span>{t('unibox.filterUnread')}</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold font-mono">
              {threads.filter(t => t.unread).length}
            </span>
          </button>
        </div>

        {/* AI Sentiment & Bounce Filters */}
        <div className="pt-3 border-t border-slate-800 space-y-1">
          <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>{language === 'es' ? 'Clasificación y Rebotes' : 'Sentiment & Bounces'}</span>
          </div>

          {[
            { id: 'interested', label: t('unibox.filterInterested'), color: 'text-emerald-400' },
            { id: 'meeting-booked', label: t('unibox.filterMeeting'), color: 'text-blue-400' },
            { id: 'not-interested', label: t('unibox.filterNotInterested'), color: 'text-slate-400' },
            { id: 'out-of-office', label: t('unibox.filterOoo'), color: 'text-amber-400' },
            {
              id: 'wrong-person',
              label: language === 'es' ? '⚠️ Rebotados (Bounces)' : '⚠️ Bounced Emails',
              color: 'text-rose-400'
            }
          ].map(tag => {
            const count = threads.filter(t => t.sentiment === tag.id).length;
            const active = activeFilter === tag.id;
            return (
              <button
                key={tag.id}
                onClick={() => setActiveFilter(tag.id as any)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                  active
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <span className={active ? 'text-white' : tag.color}>{tag.label}</span>
                <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded font-mono text-slate-500">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* COLUMN 2: Thread Cards List */}
      <div className="w-80 bg-[#0c121e] border-r border-slate-800/80 flex flex-col shrink-0 overflow-hidden">
        <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs font-bold text-white flex items-center gap-2">
            <span>{t('unibox.threadListTitle')}</span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              {filteredThreads.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {filteredThreads.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              {isSyncingImap
                ? language === 'es'
                  ? 'Buscando respuestas y rebotes en Gmail...'
                  : 'Checking Gmail for replies and bounces...'
                : t('unibox.noThreads')}
            </div>
          ) : (
            filteredThreads.map(thread => {
              const isSelected = thread.id === selectedThread?.id;
              const isBounce = thread.id.startsWith('bounce-');
              const sentimentBadge = getSentimentBadge(thread.sentiment, isBounce);
              return (
                <div
                  key={thread.id}
                  onClick={() => {
                    setSelectedThreadId(thread.id);
                    setThreads(prev =>
                      prev.map(t => (t.id === thread.id ? { ...t, unread: false } : t))
                    );
                  }}
                  className={`p-4 cursor-pointer transition space-y-1.5 ${
                    isSelected
                      ? 'bg-blue-600/10 border-l-2 border-blue-500'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-white truncate max-w-[170px]">
                      {thread.leadName}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(thread.lastActivityAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 truncate">{thread.companyName}</div>

                  <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                    {thread.lastMessageSnippet}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sentimentBadge.color}`}
                    >
                      {sentimentBadge.label}
                    </span>

                    {thread.unread && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* COLUMN 3: Conversation Thread */}
      {selectedThread ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <span>{selectedThread.leadName}</span>
                  <span className="text-slate-400 font-normal">({selectedThread.leadEmail})</span>
                </h3>
                <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>
                    {t('unibox.originalMailbox')}{' '}
                    <span className="text-blue-400 font-mono">
                      {selectedThread.messages[0]?.recipient}
                    </span>
                  </span>
                </div>
              </div>

              {onPromoteToCrm && !selectedThread.id.startsWith('bounce-') && (
                <button
                  onClick={() => onPromoteToCrm(selectedThread)}
                  className="flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{t('unibox.moveToCrm')}</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {selectedThread.messages.map(msg => (
                <div
                  key={msg.id}
                  className={`p-4 rounded-2xl border space-y-2 text-xs leading-relaxed max-w-2xl ${
                    selectedThread.id.startsWith('bounce-')
                      ? 'bg-rose-950/20 border-rose-500/30 text-rose-100'
                      : msg.isIncoming
                      ? 'bg-slate-900 border-slate-800 mr-auto text-slate-200'
                      : 'bg-blue-950/20 border-blue-500/30 ml-auto text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                    <span className="font-semibold text-white">
                      {msg.isIncoming ? selectedThread.leadName : profile.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(msg.timestamp).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </span>
                  </div>

                  <div className="text-[11px] font-semibold text-slate-400">
                    Subject: {msg.subject}
                  </div>

                  <p className="whitespace-pre-wrap">{msg.body}</p>
                </div>
              ))}
            </div>

            {!selectedThread.id.startsWith('bounce-') && (
              <div className="p-4 border-t border-slate-800 bg-[#090d16] space-y-2 shrink-0">
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={t('unibox.replyBoxPlaceholder')}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500">
                      {language === 'es'
                        ? 'Las respuestas se envían desde la cuenta remitente original.'
                        : 'Replies are dispatched from original mailbox.'}
                    </span>
                    <button
                      type="button"
                      onClick={handleSuggestAiReply}
                      disabled={isGeneratingSuggestion}
                      className="flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/30 px-2.5 py-1 rounded-lg transition"
                    >
                      <Sparkles className={`w-3 h-3 text-purple-400 ${isGeneratingSuggestion ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingSuggestion ? 'Generando...' : '✨ Sugerir Respuesta IA'}</span>
                    </button>
                  </div>

                  <button
                    onClick={handleSendReply}
                    disabled={isSendingReply || !replyText.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{t('unibox.sendReply')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Context Panel */}
          <div className="w-64 bg-[#090d16] border-l border-slate-800/80 p-5 space-y-4 shrink-0 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <User className="w-4 h-4 text-blue-400" />
              <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">
                {t('unibox.leadProfileTitle')}
              </h4>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-slate-500 uppercase">
                  {t('unibox.leadCompany')}
                </span>
                <div className="font-semibold text-white flex items-center gap-1.5 mt-0.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {selectedThread.companyName}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase">
                  {t('unibox.markedAsSentiment')}
                </span>
                <div className="mt-1">
                  <span
                    className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      getSentimentBadge(
                        selectedThread.sentiment,
                        selectedThread.id.startsWith('bounce-')
                      ).color
                    }`}
                  >
                    {
                      getSentimentBadge(
                        selectedThread.sentiment,
                        selectedThread.id.startsWith('bounce-')
                      ).label
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0b0f17]">
          <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-blue-400 shadow-xl shadow-blue-500/10">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white mb-2">
            {language === 'es' ? 'Bandeja Unibox Sincronizada' : 'Unibox is Synced'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md leading-relaxed mb-4">
            {language === 'es'
              ? 'Aquí aparecerán automáticamente las respuestas que tus leads envíen a tu correo y los avisos de rebote (Mailer-Daemon) leídos directamente desde tu Gmail vía IMAP.'
              : 'All replies from your leads and bounce notifications (Mailer-Daemon) read from your Gmail via IMAP appear here.'}
          </p>
          <button
            onClick={handleSyncInbox}
            disabled={isSyncingImap}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingImap ? 'animate-spin' : ''}`} />
            <span>
              {isSyncingImap
                ? language === 'es'
                  ? 'Consultando bandeja de Gmail...'
                  : 'Checking Gmail inbox...'
                : language === 'es'
                ? 'Sincronizar Respuestas y Rebotes Ahora'
                : 'Sync Replies & Bounces Now'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
