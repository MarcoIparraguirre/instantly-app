'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Inbox,
  Send,
  User,
  Sparkles,
  Building2,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Eye
} from 'lucide-react';
import { EmailThread, AiSentimentTag, ROLE_PERMISSIONS, normalizeRole } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAdminProfile } from '@/context/AdminProfileContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';

interface UniboxViewProps {
  onPromoteToCrm?: (thread: EmailThread) => void;
  onUnreadCountChange?: (count: number) => void;
  onLeadsSynced?: () => void;
}

export default function UniboxView(props: UniboxViewProps) {
  const { user, currentWorkspace } = useAuth();
  const isReadOnly = ROLE_PERMISSIONS[normalizeRole(user?.role)].isReadOnly;

  return (
    <UniboxViewContent
      key={currentWorkspace.id}
      workspaceId={currentWorkspace.id}
      isReadOnly={isReadOnly}
      {...props}
    />
  );
}

interface UniboxViewContentProps extends UniboxViewProps {
  workspaceId: string;
  isReadOnly: boolean;
}

function UniboxViewContent({
  workspaceId,
  isReadOnly,
  onPromoteToCrm,
  onUnreadCountChange,
  onLeadsSynced
}: UniboxViewContentProps) {
  const { t, language } = useLanguage();
  const { profile } = useAdminProfile();
  const { showToast } = useFeedback();

  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | AiSentimentTag>('all');
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isSyncingImap, setIsSyncingImap] = useState(false);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const onUnreadCountChangeRef = useRef(onUnreadCountChange);
  const onLeadsSyncedRef = useRef(onLeadsSynced);
  const activeWorkspaceRef = useRef(workspaceId);

  useEffect(() => {
    onUnreadCountChangeRef.current = onUnreadCountChange;
  }, [onUnreadCountChange]);

  useEffect(() => {
    onLeadsSyncedRef.current = onLeadsSynced;
  }, [onLeadsSynced]);

  useEffect(() => {
    activeWorkspaceRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    const unread = threads.filter((th) => th.unread).length;
    if (onUnreadCountChangeRef.current) {
      onUnreadCountChangeRef.current(unread);
    }
  }, [threads]);

  const syncInbox = useCallback(
    async (wsId: string, options?: { manual?: boolean; isActive?: () => boolean }) => {
      const manual = options?.manual ?? false;
      const isActive = options?.isActive ?? (() => activeWorkspaceRef.current === wsId);

      setIsSyncingImap(true);
      if (manual) {
        setSyncNotice(null);
      }

      try {
        if (isReadOnly) {
          const res = await fetch(
            `/api/unibox/sync?workspaceId=${encodeURIComponent(wsId)}`,
            { cache: 'no-store' }
          );
          const data = await res.json();
          if (!isActive()) return;

          if (res.ok && Array.isArray(data.threads)) {
            setThreads(data.threads);
            setSelectedThreadId((prev) =>
              data.threads.some((th: EmailThread) => th.id === prev)
                ? prev
                : data.threads[0]?.id || ''
            );
            if (manual) {
              setSyncNotice(
                language === 'es'
                  ? 'Bandeja actualizada en modo solo lectura.'
                  : 'Inbox refreshed in read-only mode.'
              );
            }
          }
          return;
        }

        const res = await fetch(
          `/api/unibox/sync?workspaceId=${encodeURIComponent(wsId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId: wsId })
          }
        );
        const data = await res.json();
        if (!isActive()) return;

        if (res.ok && Array.isArray(data.threads)) {
          setThreads(data.threads);
          setSelectedThreadId((prev) =>
            data.threads.some((th: EmailThread) => th.id === prev)
              ? prev
              : data.threads[0]?.id || ''
          );
          const bounceCount = data.bouncedEmails?.length || 0;
          const replyCount = data.repliedEmails?.length || 0;
          const noticeText =
            language === 'es'
              ? `Sincronizado con Gmail IMAP: ${replyCount} respuestas y ${bounceCount} rebotes detectados.`
              : `Synced with Gmail IMAP: ${replyCount} replies and ${bounceCount} bounces detected.`;

          if (manual || replyCount > 0 || bounceCount > 0) {
            setSyncNotice(noticeText);
          }
          if (manual) {
            showToast({
              title: language === 'es' ? 'Bandeja sincronizada' : 'Inbox synced',
              description: noticeText,
              variant: 'success'
            });
          }
          if (onLeadsSyncedRef.current) {
            onLeadsSyncedRef.current();
          }
        } else if (manual) {
          showToast({
            title: language === 'es' ? 'Error al sincronizar bandeja' : 'Inbox sync failed',
            description: data?.error,
            variant: 'error'
          });
        }
      } catch (err) {
        console.error('Error syncing IMAP:', err);
        if (manual && isActive()) {
          showToast({
            title: language === 'es' ? 'Error al sincronizar bandeja' : 'Inbox sync failed',
            variant: 'error'
          });
        }
      } finally {
        if (isActive()) {
          setIsSyncingImap(false);
        }
      }
    },
    [isReadOnly, language, showToast]
  );

  useEffect(() => {
    let active = true;
    const wsId = workspaceId;

    const loadWorkspaceInbox = async () => {
      try {
        const res = await fetch(
          `/api/unibox/sync?workspaceId=${encodeURIComponent(wsId)}`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (!active) return;

        if (res.ok && Array.isArray(data.threads)) {
          setThreads(data.threads);
          setSelectedThreadId(data.threads[0]?.id || '');
        }
      } catch (err) {
        console.error('Error loading Unibox threads:', err);
      }

      if (active && !isReadOnly) {
        await syncInbox(wsId, { manual: false, isActive: () => active });
      }
    };

    const timer = setTimeout(() => {
      void loadWorkspaceInbox();
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [workspaceId, isReadOnly, syncInbox]);

  const handleSyncInbox = () => {
    void syncInbox(workspaceId, { manual: true });
  };

  const selectedThread = threads.find((th) => th.id === selectedThreadId) || threads[0];

  const handleSuggestAiReply = async () => {
    if (isReadOnly || !selectedThread) return;
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
      if (res.ok && data.suggestedReply) {
        setReplyText(data.suggestedReply);
      } else {
        showToast({
          title:
            language === 'es'
              ? 'No se pudo generar una sugerencia de respuesta'
              : 'Could not generate AI reply suggestion',
          variant: 'error'
        });
      }
    } catch (err) {
      console.error('Error generating suggestion:', err);
      showToast({
        title:
          language === 'es'
            ? 'Error de red generando sugerencia IA'
            : 'Network error generating AI suggestion',
        variant: 'error'
      });
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const getSentimentBadge = (sentiment: AiSentimentTag, isBounce?: boolean) => {
    if (isBounce) {
      return {
        label: language === 'es' ? 'Rebote (No entregado)' : 'Bounced',
        color: 'bg-rose-50 text-rose-700 border-rose-200',
        isAlert: true
      };
    }
    switch (sentiment) {
      case 'interested':
        return {
          label: t('unibox.filterInterested'),
          color: 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]',
          isAlert: false
        };
      case 'meeting-booked':
        return {
          label: t('unibox.filterMeeting'),
          color: 'bg-sky-50 text-sky-800 border-sky-200',
          isAlert: false
        };
      case 'not-interested':
        return {
          label: t('unibox.filterNotInterested'),
          color: 'bg-[#EEF3F0] text-[#5C6F68] border-[#DCE3DF]',
          isAlert: false
        };
      case 'out-of-office':
        return {
          label: t('unibox.filterOoo'),
          color: 'bg-amber-50 text-amber-800 border-amber-200',
          isAlert: false
        };
      case 'wrong-person':
        return {
          label: language === 'es' ? 'Rebote / Casilla Inválida' : 'Bounce / Wrong Address',
          color: 'bg-rose-50 text-rose-700 border-rose-200',
          isAlert: true
        };
      default:
        return {
          label: sentiment,
          color: 'bg-[#EEF3F0] text-[#5C6F68] border-[#DCE3DF]',
          isAlert: false
        };
    }
  };

  const filteredThreads = threads.filter((thread) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'unread') return thread.unread;
    return thread.sentiment === activeFilter;
  });

  const handleSendReply = () => {
    if (isReadOnly || !replyText.trim() || !selectedThread) return;
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

      setThreads((prev) =>
        prev.map((th) =>
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
      showToast({
        title: language === 'es' ? 'Respuesta enviada en el hilo' : 'Reply sent in thread',
        variant: 'success'
      });
    }, 600);
  };

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-[#F4F7F5] text-[#14213D]">
      {/* COLUMN 1: Inbox Filters & AI Sentiments */}
      <div className="w-64 bg-white border-r border-[#DCE3DF] p-4 space-y-4 shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#DCE3DF] pb-3">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-[#14213D]" />
            <h2 className="text-xs font-bold text-[#14213D] uppercase tracking-wider">Unibox</h2>
          </div>

          <button
            type="button"
            onClick={handleSyncInbox}
            disabled={isSyncingImap}
            className="flex items-center gap-1.5 text-[11px] font-semibold bg-[#EEF3F0] hover:bg-[#D5ECD4] text-[#14213D] border border-[#DCE3DF] hover:border-[#C3DAC3] px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
            title={
              isReadOnly
                ? language === 'es'
                  ? 'Actualizar vista de bandeja'
                  : 'Refresh inbox view'
                : language === 'es'
                ? 'Sincronizar respuestas y rebotes desde Gmail'
                : 'Sync replies & bounces from Gmail'
            }
          >
            <RefreshCw className={`w-3 h-3 text-[#14213D] ${isSyncingImap ? 'animate-spin' : ''}`} />
            <span>{language === 'es' ? 'Sincronizar' : 'Sync'}</span>
          </button>
        </div>

        {syncNotice && (
          <div className="p-2.5 rounded-xl bg-[#D5ECD4] border border-[#C3DAC3] text-[10px] text-[#14213D] leading-relaxed flex items-start gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#14213D] shrink-0 mt-0.5" />
            <span>{syncNotice}</span>
          </div>
        )}

        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-[#14213D] text-white'
                : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
            }`}
          >
            <span>{t('unibox.filterAll')}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-lg font-mono tabular-nums ${
                activeFilter === 'all'
                  ? 'bg-white/15 text-white'
                  : 'bg-[#EEF3F0] text-[#5C6F68] border border-[#DCE3DF]'
              }`}
            >
              {threads.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('unread')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
              activeFilter === 'unread'
                ? 'bg-[#14213D] text-white'
                : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
            }`}
          >
            <span>{t('unibox.filterUnread')}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-lg font-bold font-mono tabular-nums border ${
                activeFilter === 'unread'
                  ? 'bg-white/15 text-white border-white/20'
                  : 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
              }`}
            >
              {threads.filter((th) => th.unread).length}
            </span>
          </button>
        </div>

        {/* AI Sentiment & Bounce Filters */}
        <div className="pt-3 border-t border-[#DCE3DF] space-y-1">
          <div className="px-3 py-1 text-[10px] font-semibold text-[#5C6F68] uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-[#14213D]" />
            <span>{language === 'es' ? 'Clasificación y Rebotes' : 'Sentiment & Bounces'}</span>
          </div>

          {(
            [
              {
                id: 'interested',
                label: t('unibox.filterInterested'),
                color: 'text-emerald-700',
                isBounce: false
              },
              {
                id: 'meeting-booked',
                label: t('unibox.filterMeeting'),
                color: 'text-sky-700',
                isBounce: false
              },
              {
                id: 'not-interested',
                label: t('unibox.filterNotInterested'),
                color: 'text-[#5C6F68]',
                isBounce: false
              },
              {
                id: 'out-of-office',
                label: t('unibox.filterOoo'),
                color: 'text-amber-700',
                isBounce: false
              },
              {
                id: 'wrong-person',
                label: language === 'es' ? 'Rebotados (Bounces)' : 'Bounced Emails',
                color: 'text-rose-700',
                isBounce: true
              }
            ] as const
          ).map((tag) => {
            const count = threads.filter((th) => th.sentiment === tag.id).length;
            const active = activeFilter === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => setActiveFilter(tag.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                  active
                    ? 'bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]'
                    : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
                }`}
              >
                <span className={`flex items-center gap-1.5 truncate ${active ? 'text-[#14213D]' : tag.color}`}>
                  {tag.isBounce && <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                  <span className="truncate">{tag.label}</span>
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-lg font-mono tabular-nums shrink-0 border ${
                    active
                      ? 'bg-white text-[#14213D] border-[#C3DAC3]'
                      : 'bg-[#EEF3F0] border-[#DCE3DF] text-[#5C6F68]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* COLUMN 2: Thread Cards List */}
      <div className="w-80 bg-[#F4F7F5] border-r border-[#DCE3DF] flex flex-col shrink-0 overflow-hidden">
        <div className="h-14 px-4 border-b border-[#DCE3DF] bg-white flex items-center justify-between shrink-0">
          <div className="text-xs font-bold text-[#14213D] flex items-center gap-2">
            <span>{t('unibox.threadListTitle')}</span>
            <span className="text-[10px] bg-[#EEF3F0] border border-[#DCE3DF] text-[#5C6F68] px-2 py-0.5 rounded-lg font-mono tabular-nums">
              {filteredThreads.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#DCE3DF]">
          {filteredThreads.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#5C6F68]">
              {isSyncingImap
                ? language === 'es'
                  ? 'Buscando respuestas y rebotes en Gmail...'
                  : 'Checking Gmail for replies and bounces...'
                : t('unibox.noThreads')}
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const isSelected = thread.id === selectedThread?.id;
              const isBounce = thread.id.startsWith('bounce-');
              const sentimentBadge = getSentimentBadge(thread.sentiment, isBounce);
              return (
                <div
                  key={thread.id}
                  onClick={() => {
                    setSelectedThreadId(thread.id);
                    if (!isReadOnly) {
                      setThreads((prev) =>
                        prev.map((th) => (th.id === thread.id ? { ...th, unread: false } : th))
                      );
                    }
                  }}
                  className={`p-4 cursor-pointer transition space-y-1.5 ${
                    isSelected
                      ? 'bg-[#D5ECD4]/55 border-l-4 border-[#14213D]'
                      : 'bg-white hover:bg-[#EEF3F0]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-[#14213D] truncate max-w-[170px]">
                      {thread.leadName}
                    </span>
                    <span className="text-[10px] text-[#5C6F68] font-mono tabular-nums shrink-0">
                      {new Date(thread.lastActivityAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <div className="text-[11px] text-[#5C6F68] truncate">{thread.companyName}</div>

                  <p className="text-[11px] text-[#14213D]/80 line-clamp-2 leading-relaxed">
                    {thread.lastMessageSnippet}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${sentimentBadge.color}`}
                    >
                      {sentimentBadge.isAlert && <AlertTriangle className="w-3 h-3 shrink-0" />}
                      <span>{sentimentBadge.label}</span>
                    </span>

                    {thread.unread && (
                      <span className="w-2 h-2 rounded-full bg-[#14213D]" />
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
        <div className="flex-1 flex min-w-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="h-14 px-6 border-b border-[#DCE3DF] flex items-center justify-between bg-white shrink-0">
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-[#14213D] flex items-center gap-2 truncate">
                  <span>{selectedThread.leadName}</span>
                  <span className="text-[#5C6F68] font-normal font-mono">
                    ({selectedThread.leadEmail})
                  </span>
                </h3>
                <div className="text-[10px] text-[#5C6F68] flex items-center gap-2 mt-0.5">
                  <span>
                    {t('unibox.originalMailbox')}{' '}
                    <span className="text-[#14213D] font-semibold font-mono">
                      {selectedThread.messages[0]?.recipient}
                    </span>
                  </span>
                </div>
              </div>

              {onPromoteToCrm && !isReadOnly && !selectedThread.id.startsWith('bounce-') && (
                <button
                  type="button"
                  onClick={() => onPromoteToCrm(selectedThread)}
                  className="flex items-center gap-1.5 bg-[#D5ECD4] hover:bg-[#C3DAC3] text-[#14213D] border border-[#A1B0AB]/50 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#14213D]" />
                  <span>{t('unibox.moveToCrm')}</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F4F7F5]">
              {selectedThread.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-4 rounded-xl border space-y-2 text-xs leading-relaxed max-w-2xl shadow-sm ${
                    selectedThread.id.startsWith('bounce-')
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : msg.isIncoming
                      ? 'bg-white border-[#DCE3DF] mr-auto text-[#14213D]'
                      : 'bg-[#EEF3F0] border-[#C3DAC3] ml-auto text-[#14213D]'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-[#DCE3DF] pb-2 gap-4">
                    <span className="font-semibold text-[#14213D]">
                      {msg.isIncoming ? selectedThread.leadName : profile.name}
                    </span>
                    <span className="text-[10px] text-[#5C6F68] font-mono tabular-nums">
                      {new Date(msg.timestamp).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </span>
                  </div>

                  <div className="text-[11px] font-semibold text-[#5C6F68]">
                    Subject: {msg.subject}
                  </div>

                  <p className="whitespace-pre-wrap text-[#14213D]/90">{msg.body}</p>
                </div>
              ))}
            </div>

            {!selectedThread.id.startsWith('bounce-') && (
              <div className="p-4 border-t border-[#DCE3DF] bg-white space-y-2.5 shrink-0">
                {isReadOnly && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                    <Eye className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>
                      {language === 'es'
                        ? 'Modo Solo Lectura: tu agencia gestiona las respuestas activas.'
                        : 'Read-Only Mode: active replies are managed by your agency.'}
                    </span>
                  </div>
                )}

                <textarea
                  rows={3}
                  disabled={isReadOnly}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={t('unibox.replyBoxPlaceholder')}
                  className="w-full bg-[#F4F7F5] border border-[#DCE3DF] rounded-lg p-3 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none focus:border-[#14213D] disabled:opacity-50 disabled:cursor-not-allowed transition"
                />

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[#5C6F68]">
                      {language === 'es'
                        ? 'Las respuestas se envían desde la cuenta remitente original.'
                        : 'Replies are dispatched from original mailbox.'}
                    </span>
                    <button
                      type="button"
                      onClick={handleSuggestAiReply}
                      disabled={isReadOnly || isGeneratingSuggestion}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-[#14213D] bg-[#D5ECD4] hover:bg-[#C3DAC3] disabled:opacity-40 disabled:cursor-not-allowed border border-[#A1B0AB]/50 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      <Sparkles
                        className={`w-3 h-3 text-[#14213D] ${isGeneratingSuggestion ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {isGeneratingSuggestion
                          ? language === 'es'
                            ? 'Generando...'
                            : 'Generating...'
                          : language === 'es'
                          ? 'Sugerir Respuesta IA'
                          : 'Suggest AI Reply'}
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendReply}
                    disabled={isReadOnly || isSendingReply || !replyText.trim()}
                    className="bg-[#14213D] hover:bg-[#1E3158] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{t('unibox.sendReply')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Context Panel */}
          <div className="w-64 bg-white border-l border-[#DCE3DF] p-5 space-y-4 shrink-0 text-xs">
            <div className="flex items-center gap-2 border-b border-[#DCE3DF] pb-3">
              <User className="w-4 h-4 text-[#14213D]" />
              <h4 className="font-bold text-[#14213D] uppercase tracking-wider text-[11px]">
                {t('unibox.leadProfileTitle')}
              </h4>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-[#5C6F68] uppercase">
                  {t('unibox.leadCompany')}
                </span>
                <div className="font-semibold text-[#14213D] flex items-center gap-1.5 mt-0.5">
                  <Building2 className="w-3.5 h-3.5 text-[#5C6F68]" />
                  {selectedThread.companyName}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-[#5C6F68] uppercase">
                  {t('unibox.markedAsSentiment')}
                </span>
                <div className="mt-1">
                  {(() => {
                    const badge = getSentimentBadge(
                      selectedThread.sentiment,
                      selectedThread.id.startsWith('bounce-')
                    );
                    return (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-lg border ${badge.color}`}
                      >
                        {badge.isAlert && <AlertTriangle className="w-3 h-3 shrink-0" />}
                        <span>{badge.label}</span>
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F4F7F5]">
          <div className="w-16 h-16 rounded-xl bg-white border border-[#DCE3DF] shadow-sm flex items-center justify-center mb-4 text-[#14213D]">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[#14213D] mb-2">
            {language === 'es' ? 'Bandeja Unibox Sincronizada' : 'Unibox is Synced'}
          </h3>
          <p className="text-xs text-[#5C6F68] max-w-md leading-relaxed mb-4">
            {language === 'es'
              ? 'Aquí aparecerán automáticamente las respuestas que tus leads envíen a tu correo y los avisos de rebote (Mailer-Daemon) leídos directamente desde tu Gmail vía IMAP.'
              : 'All replies from your leads and bounce notifications (Mailer-Daemon) read from your Gmail via IMAP appear here.'}
          </p>
          <button
            type="button"
            onClick={handleSyncInbox}
            disabled={isSyncingImap}
            className="flex items-center gap-2 bg-[#14213D] hover:bg-[#1E3158] disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingImap ? 'animate-spin' : ''}`} />
            <span>
              {isSyncingImap
                ? language === 'es'
                  ? 'Consultando bandeja de Gmail...'
                  : 'Checking Gmail inbox...'
                : isReadOnly
                ? language === 'es'
                  ? 'Actualizar Bandeja'
                  : 'Refresh Inbox'
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
