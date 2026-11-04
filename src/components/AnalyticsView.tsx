'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Mail,
  MessageSquare,
  CheckCircle2,
  ShieldCheck,
  ArrowUpRight,
  AlertTriangle,
  RefreshCw,
  Info
} from 'lucide-react';
import { Campaign, SenderAccount, Lead } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface AnalyticsViewProps {
  campaign: Campaign | null;
  leads?: Lead[];
  accounts?: SenderAccount[];
  onRefreshData?: () => void;
}

export default function AnalyticsView({
  campaign,
  leads = [],
  accounts: propAccounts,
  onRefreshData
}: AnalyticsViewProps) {
  const { t, language } = useLanguage();
  const [accounts, setAccounts] = useState<SenderAccount[]>(propAccounts || []);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setAccounts(data);
      })
      .catch(() => {});
  }, []);

  const handleSyncImapAnalytics = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/unibox/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const bCount = data.bouncedEmails?.length || 0;
        const rCount = data.repliedEmails?.length || 0;
        setSyncMessage(
          language === 'es'
            ? `Sincronizado con Gmail: ${rCount} respuestas y ${bCount} rebotes actualizados.`
            : `Synced with Gmail: ${rCount} replies and ${bCount} bounces updated.`
        );
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Compute real live metrics from leads & campaign stats
  const relevantLeads = campaign
    ? leads.filter(l => l.campaignId === campaign.id)
    : leads;

  const sentFromLeads = relevantLeads.filter(l => l.status !== 'pending').length;
  const openedFromLeads = relevantLeads.filter(
    l => l.status === 'opened' || l.status === 'replied'
  ).length;
  const repliedFromLeads = relevantLeads.filter(l => l.status === 'replied').length;
  const bouncedFromLeads = relevantLeads.filter(l => l.status === 'bounced').length;

  const stats = {
    sent: Math.max(campaign?.stats?.sent || 0, sentFromLeads),
    opened: Math.max(campaign?.stats?.opened || 0, openedFromLeads),
    replied: Math.max(campaign?.stats?.replied || 0, repliedFromLeads),
    bounced: Math.max(campaign?.stats?.bounced || 0, bouncedFromLeads),
    opportunities: campaign?.stats?.opportunities || repliedFromLeads
  };

  const openRate = stats.sent > 0 ? ((stats.opened / stats.sent) * 100).toFixed(1) : '0.0';
  const replyRate = stats.sent > 0 ? ((stats.replied / stats.sent) * 100).toFixed(1) : '0.0';
  const bounceRate = stats.sent > 0 ? ((stats.bounced / stats.sent) * 100).toFixed(1) : '0.0';

  return (
    <div className="flex-1 p-8 space-y-6 overflow-y-auto bg-[#0b0f17]">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-white flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            {t('analytics.title')}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('analytics.subtitle')} {campaign ? `"${campaign.name}"` : 'todas las campañas'}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncImapAnalytics}
            disabled={isSyncing}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-blue-600/20 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {isSyncing
                ? language === 'es'
                  ? 'Sincronizando con Gmail...'
                  : 'Syncing with Gmail...'
                : language === 'es'
                ? 'Sincronizar Respuestas y Rebotes (IMAP)'
                : 'Sync Replies & Bounces (IMAP)'}
            </span>
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">{t('analytics.emailsSent')}</span>
            <Mail className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{stats.sent.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400">
            {relevantLeads.filter(l => l.status === 'pending').length}{' '}
            {language === 'es' ? 'pendientes en cola' : 'pending in queue'}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">{t('analytics.openRate')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{openRate}%</div>
          <div className="text-[11px] text-slate-400">
            {stats.opened.toLocaleString()} {t('analytics.totalOpens')}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">{t('analytics.replyRate')}</span>
            <MessageSquare className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white">{replyRate}%</div>
          <div className="text-[11px] text-slate-400">
            {stats.replied} {t('analytics.prospectsEngaged')}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">
              {language === 'es' ? 'Correos Rebotados' : 'Bounced Emails'}
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400">{stats.bounced}</div>
          <div className="text-[11px] text-slate-400">
            {bounceRate}% {language === 'es' ? 'tasa de rebote' : 'bounce rate'}
          </div>
        </div>
      </div>

      {/* Info Box explaining Open Tracking on Localhost vs Public Domain */}
      <div className="bg-blue-950/20 border border-blue-500/30 rounded-2xl p-4 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <div className="font-bold text-white">
            {language === 'es'
              ? '¿Cómo funcionan las detecciones de Rebotes, Respuestas y Aperturas?'
              : 'How do Bounce, Reply, and Open tracking work?'}
          </div>
          <p className="text-[11px] text-slate-300">
            {language === 'es'
              ? '• Respuestas y Rebotes (Mailer-Daemon): Se leen directamente de tu bandeja de Gmail por protocolo IMAP al presionar "Sincronizar Respuestas y Rebotes" (o al abrir Unibox), actualizando automáticamente el estado del contacto a "Respondido" o "Rebotado".'
              : '• Replies & Bounces: Synced directly from your Gmail Inbox via IMAP.'}
          </p>
          <p className="text-[11px] text-slate-400">
            {language === 'es'
              ? '• Aperturas (Píxel invisible): El sistema inserta un píxel de seguimiento (/api/track/open). Nota: Si envías desde localhost (tu propia PC sin dominio público en internet), los servidores de Google del destinatario no pueden conectarse a tu localhost para notificar la apertura; funcionará automáticamente apenas la app esté publicada en un dominio web (Vercel/Render).'
              : '• Opens (Tracking Pixel): Requires a public URL (Vercel/Render) so external email clients can load the pixel.'}
          </p>
        </div>
      </div>

      {/* Outbound Conversion Funnel */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-blue-400" />
          {t('analytics.funnelTitle')}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 uppercase font-semibold">
              {t('analytics.stepSent')}
            </div>
            <div className="text-xl font-bold text-white">{stats.sent}</div>
            <div className="text-[10px] text-slate-500">100% Enviados</div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 uppercase font-semibold">
              {t('analytics.stepOpened')}
            </div>
            <div className="text-xl font-bold text-emerald-400">{stats.opened}</div>
            <div className="text-[10px] text-emerald-400 font-semibold">{openRate}%</div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 uppercase font-semibold">
              {t('analytics.stepReplied')}
            </div>
            <div className="text-xl font-bold text-purple-400">{stats.replied}</div>
            <div className="text-[10px] text-purple-400 font-semibold">{replyRate}%</div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs text-slate-400 uppercase font-semibold">
              {language === 'es' ? 'Rebotados' : 'Bounced'}
            </div>
            <div className="text-xl font-bold text-rose-400">{stats.bounced}</div>
            <div className="text-[10px] text-rose-400 font-semibold">{bounceRate}%</div>
          </div>
        </div>
      </div>

      {/* Mailbox Breakdown Table */}
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
            {accounts.map(acc => (
              <tr key={acc.id} className="hover:bg-slate-800/40">
                <td className="py-3 px-4 font-mono text-white">{acc.email}</td>
                <td className="py-3 px-4 font-mono text-slate-400">{acc.dailyLimit} / day</td>
                <td className="py-3 px-4 font-mono text-slate-300">{acc.sentToday} sent</td>
                <td className="py-3 px-4 font-mono text-emerald-400">{bounceRate}%</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-emerald-400 font-bold">
                      {acc.healthScore || 98}% Optimal
                    </span>
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
