'use client';

import React from 'react';
import { 
  BarChart3, TrendingUp, Mail, MessageSquare, Target, 
  CheckCircle2, ShieldCheck, ArrowUpRight
} from 'lucide-react';
import { Campaign, SenderAccount } from '@/types';
import { initialEmailAccountsWithWarmup } from '@/core/storage/mockData';
import { useLanguage } from '@/context/LanguageContext';

interface AnalyticsViewProps {
  campaign: Campaign | null;
  accounts?: SenderAccount[];
}

export default function AnalyticsView({
  campaign,
  accounts = initialEmailAccountsWithWarmup
}: AnalyticsViewProps) {
  const { t } = useLanguage();
  const stats = campaign?.stats || { sent: 1450, opened: 928, replied: 182, bounced: 14, opportunities: 38 };
  const openRate = stats.sent > 0 ? ((stats.opened / stats.sent) * 100).toFixed(1) : '64.0';
  const replyRate = stats.sent > 0 ? ((stats.replied / stats.sent) * 100).toFixed(1) : '12.5';
  const bounceRate = stats.sent > 0 ? ((stats.bounced / stats.sent) * 100).toFixed(1) : '0.9';

  return (
    <div className="flex-1 p-8 space-y-6 overflow-y-auto bg-[#0b0f17]">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-white flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            {t('analytics.title')}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('analytics.subtitle')} {campaign ? `"${campaign.name}"` : 'all workspaces'}.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Time Range:</span>
          <select className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white">
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
            <option>All Time</option>
          </select>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">{t('analytics.emailsSent')}</span>
            <Mail className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{stats.sent.toLocaleString()}</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
            <TrendingUp className="w-3 h-3" /> +14.2% vs last month
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">{t('analytics.openRate')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{openRate}%</div>
          <div className="text-[11px] text-slate-400">{stats.opened.toLocaleString()} {t('analytics.totalOpens')}</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">{t('analytics.replyRate')}</span>
            <MessageSquare className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white">{replyRate}%</div>
          <div className="text-[11px] text-slate-400">{stats.replied} {t('analytics.prospectsEngaged')}</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">{t('analytics.opportunities')}</span>
            <Target className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-400">{stats.opportunities}</div>
          <div className="text-[11px] text-slate-400">{t('analytics.dealsGenerated')}</div>
        </div>
      </div>

      {/* Outbound Conversion Funnel */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-blue-400" />
          {t('analytics.funnelTitle')}
        </h3>

        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 uppercase font-semibold">{t('analytics.stepSent')}</div>
            <div className="text-xl font-bold text-white">{stats.sent}</div>
            <div className="text-[10px] text-slate-500">100% Outreach Pool</div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 uppercase font-semibold">{t('analytics.stepOpened')}</div>
            <div className="text-xl font-bold text-emerald-400">{stats.opened}</div>
            <div className="text-[10px] text-emerald-400 font-semibold">{openRate}% of sent</div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 uppercase font-semibold">{t('analytics.stepReplied')}</div>
            <div className="text-xl font-bold text-purple-400">{stats.replied}</div>
            <div className="text-[10px] text-purple-400 font-semibold">{replyRate}% response</div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 uppercase font-semibold">{t('analytics.stepOpp')}</div>
            <div className="text-xl font-bold text-indigo-400">{stats.opportunities}</div>
            <div className="text-[10px] text-indigo-400 font-semibold">Positive ROI</div>
          </div>
        </div>
      </div>

      {/* Mailbox Breakdown Table (Detect and Isolate Bouncing Accounts) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-2 p-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          {t('analytics.accountBreakdownTitle')}
        </h3>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-4">{t('analytics.colMailbox')}</th>
              <th className="py-2.5 px-4">{t('analytics.colDailyLimit')}</th>
              <th className="py-2.5 px-4">{t('analytics.colSentToday')}</th>
              <th className="py-2.5 px-4">{t('analytics.colBounceRate')}</th>
              <th className="py-2.5 px-4">{t('analytics.colHealth')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-200">
            {accounts.map((acc) => (
              <tr key={acc.id} className="hover:bg-slate-800/40">
                <td className="py-3 px-4 font-mono text-white">
                  {acc.email}
                </td>
                <td className="py-3 px-4 font-mono text-slate-400">
                  {acc.dailyLimit} / day
                </td>
                <td className="py-3 px-4 font-mono text-slate-300">
                  {acc.sentToday} sent
                </td>
                <td className="py-3 px-4 font-mono text-emerald-400">
                  {bounceRate}%
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-emerald-400 font-bold">{acc.healthScore}% Optimal</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
