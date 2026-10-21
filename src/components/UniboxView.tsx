'use client';

import React, { useState } from 'react';
import { 
  Inbox, Send, User, Sparkles, Building2, Tag, 
  Clock, ArrowUpRight
} from 'lucide-react';
import { EmailThread, AiSentimentTag } from '@/types';
import { initialUniboxThreads } from '@/core/storage/mockData';
import { useLanguage } from '@/context/LanguageContext';

interface UniboxViewProps {
  onPromoteToCrm?: (thread: EmailThread) => void;
}

export default function UniboxView({ onPromoteToCrm }: UniboxViewProps) {
  const { t } = useLanguage();
  const [threads, setThreads] = useState<EmailThread[]>(initialUniboxThreads);
  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0]?.id || '');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | AiSentimentTag>('all');
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  const selectedThread = threads.find(t => t.id === selectedThreadId) || threads[0];

  const getSentimentBadge = (sentiment: AiSentimentTag) => {
    switch (sentiment) {
      case 'interested':
        return { label: t('unibox.filterInterested'), color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      case 'meeting-booked':
        return { label: t('unibox.filterMeeting'), color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' };
      case 'not-interested':
        return { label: t('unibox.filterNotInterested'), color: 'bg-slate-700/40 text-slate-400 border-slate-700' };
      case 'out-of-office':
        return { label: t('unibox.filterOoo'), color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'wrong-person':
        return { label: t('unibox.filterWrongPerson'), color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' };
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
        sender: 'alex.morgan@growthpilot.io',
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
      <div className="w-60 bg-[#090d16] border-r border-slate-800/80 p-4 space-y-4 shrink-0 overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Inbox className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            Unibox Filters
          </h2>
        </div>

        <div className="space-y-1">
          <button
            onClick={() => setActiveFilter('all')}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
              activeFilter === 'all'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span>{t('unibox.filterAll')}</span>
            <span className="text-[10px] bg-slate-900/60 px-1.5 py-0.5 rounded font-mono">{threads.length}</span>
          </button>

          <button
            onClick={() => setActiveFilter('unread')}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
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

        {/* AI Sentiment Filters */}
        <div className="pt-3 border-t border-slate-800 space-y-1">
          <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>AI Sentiment Tag</span>
          </div>

          {[
            { id: 'interested', label: t('unibox.filterInterested'), color: 'text-emerald-400' },
            { id: 'meeting-booked', label: t('unibox.filterMeeting'), color: 'text-blue-400' },
            { id: 'not-interested', label: t('unibox.filterNotInterested'), color: 'text-slate-400' },
            { id: 'out-of-office', label: t('unibox.filterOoo'), color: 'text-amber-400' },
            { id: 'wrong-person', label: t('unibox.filterWrongPerson'), color: 'text-purple-400' },
          ].map((tag) => {
            const count = threads.filter(t => t.sentiment === tag.id).length;
            const active = activeFilter === tag.id;
            return (
              <button
                key={tag.id}
                onClick={() => setActiveFilter(tag.id as any)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
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
              {t('unibox.noThreads')}
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const isSelected = thread.id === selectedThread?.id;
              const sentimentBadge = getSentimentBadge(thread.sentiment);
              return (
                <div
                  key={thread.id}
                  onClick={() => {
                    setSelectedThreadId(thread.id);
                    // Mark as read
                    setThreads(prev =>
                      prev.map(t => t.id === thread.id ? { ...t, unread: false } : t)
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
                      {new Date(thread.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 truncate">
                    {thread.companyName}
                  </div>

                  <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                    {thread.lastMessageSnippet}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sentimentBadge.color}`}>
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

      {/* COLUMN 3: Conversation Thread, Quick Reply & Lead Intelligence */}
      {selectedThread ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Main Conversation & Reply Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Thread Header */}
            <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <span>{selectedThread.leadName}</span>
                  <span className="text-slate-400 font-normal">({selectedThread.leadEmail})</span>
                </h3>
                <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>{t('unibox.originalMailbox')} <span className="text-blue-400 font-mono">{selectedThread.messages[0]?.sender}</span></span>
                </div>
              </div>

              {onPromoteToCrm && (
                <button
                  onClick={() => onPromoteToCrm(selectedThread)}
                  className="flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 px-3 py-1.5 rounded-xl text-xs font-semibold transition"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{t('unibox.moveToCrm')}</span>
                </button>
              )}
            </div>

            {/* Chronological Messages Stream */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {selectedThread.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-4 rounded-2xl border space-y-2 text-xs leading-relaxed max-w-2xl ${
                    msg.isIncoming
                      ? 'bg-slate-900 border-slate-800 mr-auto text-slate-200'
                      : 'bg-blue-950/20 border-blue-500/30 ml-auto text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                    <span className="font-semibold text-white">
                      {msg.isIncoming ? selectedThread.leadName : 'You (Alex)'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(msg.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>

                  <div className="text-[11px] font-semibold text-slate-400">
                    Subject: {msg.subject}
                  </div>

                  <p className="whitespace-pre-wrap">{msg.body}</p>
                </div>
              ))}
            </div>

            {/* Quick Reply Box */}
            <div className="p-4 border-t border-slate-800 bg-[#090d16] space-y-2 shrink-0">
              <textarea
                rows={3}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={t('unibox.replyBoxPlaceholder')}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  Replies are dispatched from original mailbox preserving message headers.
                </span>

                <button
                  onClick={handleSendReply}
                  disabled={isSendingReply || !replyText.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{t('unibox.sendReply')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Context Panel: Lead Intelligence Card */}
          <div className="w-64 bg-[#090d16] border-l border-slate-800/80 p-5 space-y-4 shrink-0 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <User className="w-4 h-4 text-blue-400" />
              <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">
                {t('unibox.leadProfileTitle')}
              </h4>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-slate-500 uppercase">{t('unibox.leadCompany')}</span>
                <div className="font-semibold text-white flex items-center gap-1.5 mt-0.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {selectedThread.companyName}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase">{t('unibox.markedAsSentiment')}</span>
                <div className="mt-1">
                  <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${getSentimentBadge(selectedThread.sentiment).color}`}>
                    {getSentimentBadge(selectedThread.sentiment).label}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase">{t('unibox.leadCampaign')}</span>
                <div className="text-slate-300 font-mono mt-0.5">SaaS Outbound Demo</div>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase">{t('unibox.leadScore')}</span>
                <div className="text-emerald-400 font-bold text-base mt-0.5">92 / 100 🔥</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
