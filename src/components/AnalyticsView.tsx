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
import { Campaign, SenderAccount, Lead, ROLE_PERMISSIONS, normalizeRole } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';

interface AnalyticsViewProps {
  campaign: Campaign | null;
  leads?: Lead[];
  accounts?: SenderAccount[];
  onRefreshData?: () => void;
}

export default function AnalyticsView(props: AnalyticsViewProps) {
  const { user, currentWorkspace } = useAuth();
  const isReadOnly = ROLE_PERMISSIONS[normalizeRole(user?.role)].isReadOnly;

  return (
    <AnalyticsViewContent
      key={currentWorkspace.id}
      workspaceId={currentWorkspace.id}
      isReadOnly={isReadOnly}
      {...props}
    />
  );
}

interface AnalyticsViewContentProps extends AnalyticsViewProps {
  workspaceId: string;
  isReadOnly: boolean;
}

function AnalyticsViewContent({
  workspaceId,
  isReadOnly,
  campaign,
  leads = [],
  accounts: propAccounts,
  onRefreshData
}: AnalyticsViewContentProps) {
  const { t, language } = useLanguage();
  const { showToast } = useFeedback();

  const [accounts, setAccounts] = useState<SenderAccount[]>(propAccounts || []);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        setIsLocalhost(host === 'localhost' || host === '127.0.0.1');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;

    fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`, {
      cache: 'no-store'
    })
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data)) {
          setAccounts(data);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [workspaceId]);

  const handleSyncImapAnalytics = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      if (isReadOnly) {
        if (onRefreshData) onRefreshData();
        const msg =
          language === 'es'
            ? 'Métricas actualizadas en modo solo lectura.'
            : 'Metrics refreshed in read-only mode.';
        setSyncMessage(msg);
        showToast({ title: msg, variant: 'info' });
        return;
      }

      const res = await fetch(
        `/api/unibox/sync?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId })
        }
      );
      const data = await res.json();
      if (res.ok) {
        const bCount = data.bouncedEmails?.length || 0;
        const rCount = data.repliedEmails?.length || 0;
        const msg =
          language === 'es'
            ? `Sincronizado con Gmail: ${rCount} respuestas y ${bCount} rebotes actualizados.`
            : `Synced with Gmail: ${rCount} replies and ${bCount} bounces updated.`;
        setSyncMessage(msg);
        showToast({
          title: language === 'es' ? 'Sincronización completada' : 'Sync completed',
          description: msg,
          variant: 'success'
        });
        if (onRefreshData) onRefreshData();
      } else {
        showToast({
          title: language === 'es' ? 'Error al sincronizar analíticas' : 'Failed to sync analytics',
          description: data?.error,
          variant: 'error'
        });
      }
    } catch (err) {
      console.error(err);
      showToast({
        title: language === 'es' ? 'Error de red al sincronizar IMAP' : 'Network error syncing IMAP',
        variant: 'error'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Compute real live metrics from leads & campaign stats
  const relevantLeads = campaign ? leads.filter((l) => l.campaignId === campaign.id) : leads;

  const sentFromLeads = relevantLeads.filter((l) => l.status !== 'pending').length;
  const openedFromLeads = relevantLeads.filter(
    (l) => l.status === 'opened' || l.status === 'replied'
  ).length;
  const repliedFromLeads = relevantLeads.filter((l) => l.status === 'replied').length;
  const bouncedFromLeads = relevantLeads.filter((l) => l.status === 'bounced').length;

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
    <div className="flex-1 min-h-0 p-8 space-y-6 overflow-y-auto bg-[#0A0C10] text-[#F3F5F8]">
      {/* Header */}
      <div className="border-b border-[#1D2330] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-[#F3F5F8] flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-[#E85D2A]" />
            <span>{t('analytics.title')}</span>
          </h1>
          <p className="text-xs text-[#949EB0] mt-0.5">
            {t('analytics.subtitle')}{' '}
            {campaign
              ? `"${campaign.name}"`
              : language === 'es'
              ? 'todas las campañas'
              : 'all campaigns'}
            .
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSyncImapAnalytics}
            disabled={isSyncing}
            className="flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {isSyncing
                ? language === 'es'
                  ? 'Sincronizando con Gmail...'
                  : 'Syncing with Gmail...'
                : isReadOnly
                ? language === 'es'
                  ? 'Actualizar Métricas'
                  : 'Refresh Metrics'
                : language === 'es'
                ? 'Sincronizar Respuestas y Rebotes (IMAP)'
                : 'Sync Replies & Bounces (IMAP)'}
            </span>
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-[#949EB0]">
            <span className="text-xs font-semibold uppercase">{t('analytics.emailsSent')}</span>
            <Mail className="w-4 h-4 text-[#E85D2A]" />
          </div>
          <div className="text-2xl font-bold text-[#F3F5F8] font-mono tabular-nums">
            {stats.sent.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#949EB0] font-mono tabular-nums">
            {relevantLeads.filter((l) => l.status === 'pending').length}{' '}
            {language === 'es' ? 'pendientes en cola' : 'pending in queue'}
          </div>
        </div>

        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-[#949EB0]">
            <span className="text-xs font-semibold uppercase">{t('analytics.openRate')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-[#F3F5F8] font-mono tabular-nums">
            {openRate}%
          </div>
          <div className="text-[11px] text-[#949EB0] font-mono tabular-nums">
            {stats.opened.toLocaleString()} {t('analytics.totalOpens')}
          </div>
        </div>

        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-[#949EB0]">
            <span className="text-xs font-semibold uppercase">{t('analytics.replyRate')}</span>
            <MessageSquare className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-[#F3F5F8] font-mono tabular-nums">
            {replyRate}%
          </div>
          <div className="text-[11px] text-[#949EB0] font-mono tabular-nums">
            {stats.replied} {t('analytics.prospectsEngaged')}
          </div>
        </div>

        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-[#949EB0]">
            <span className="text-xs font-semibold uppercase">
              {language === 'es' ? 'Correos Rebotados' : 'Bounced Emails'}
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono tabular-nums">
            {stats.bounced}
          </div>
          <div className="text-[11px] text-[#949EB0] font-mono tabular-nums">
            {bounceRate}% {language === 'es' ? 'tasa de rebote' : 'bounce rate'}
          </div>
        </div>
      </div>

      {/* Telemetry Tracking Explanation (production-safe; local tip only when isLocalhost is true) */}
      <div className="bg-[#11141C] border border-[#232938] rounded-xl p-4 flex items-start gap-3 text-xs text-[#949EB0]">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1.5 leading-relaxed">
          <div className="font-bold text-[#F3F5F8]">
            {language === 'es'
              ? '¿Cómo funcionan las detecciones de Rebotes, Respuestas y Aperturas?'
              : 'How do Bounce, Reply, and Open tracking work?'}
          </div>
          <p className="text-[11px] text-[#949EB0]">
            {language === 'es'
              ? '• Respuestas y Rebotes (IMAP): Se sincronizan automáticamente desde las casillas conectadas del workspace al ejecutar la sincronización IMAP o abrir Unibox, actualizando el estado del contacto a "Respondido" o "Rebotado".'
              : '• Replies & Bounces (IMAP): Synced directly from your workspace mailboxes during IMAP sync or Unibox visits, automatically updating contact statuses to "Replied" or "Bounced".'}
          </p>
          <p className="text-[11px] text-[#949EB0]">
            {language === 'es'
              ? '• Aperturas (Píxel de seguimiento): Cada correo HTML inserta un píxel transparente (/api/track/open) que registra la lectura en tiempo real cuando el cliente de correo del destinatario carga las imágenes.'
              : '• Opens (Tracking Pixel): Outbound HTML emails include a lightweight tracking pixel (/api/track/open) that logs opens in real time when the recipient email client loads images.'}
          </p>
          {isLocalhost && (
            <p className="text-[11px] text-amber-300/90 pt-0.5">
              {language === 'es'
                ? '• Diagnóstico en entorno local (localhost): Al enviar desde tu propia PC sin un dominio público en internet, los servidores externos del destinatario no pueden conectarse a localhost para notificar la apertura; el píxel operará automáticamente en tu dominio público desplegado.'
                : '• Local environment notice (localhost): External recipient mail servers cannot connect back to localhost to trigger /api/track/open; open tracking operates automatically once deployed on a public HTTPS domain.'}
            </p>
          )}
        </div>
      </div>

      {/* Outbound Conversion Funnel */}
      <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-[#F3F5F8] flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-[#E85D2A]" />
          <span>{t('analytics.funnelTitle')}</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-[#171B26] p-4 rounded-xl border border-[#232938] space-y-1">
            <div className="text-xs text-[#949EB0] uppercase font-semibold">
              {t('analytics.stepSent')}
            </div>
            <div className="text-xl font-bold text-[#F3F5F8] font-mono tabular-nums">
              {stats.sent.toLocaleString()}
            </div>
            <div className="text-[10px] text-[#949EB0] font-mono tabular-nums">
              100% {language === 'es' ? 'Enviados' : 'Sent'}
            </div>
          </div>

          <div className="bg-[#171B26] p-4 rounded-xl border border-[#232938] space-y-1">
            <div className="text-xs text-[#949EB0] uppercase font-semibold">
              {t('analytics.stepOpened')}
            </div>
            <div className="text-xl font-bold text-emerald-400 font-mono tabular-nums">
              {stats.opened.toLocaleString()}
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold font-mono tabular-nums">
              {openRate}%
            </div>
          </div>

          <div className="bg-[#171B26] p-4 rounded-xl border border-[#232938] space-y-1">
            <div className="text-xs text-[#949EB0] uppercase font-semibold">
              {t('analytics.stepReplied')}
            </div>
            <div className="text-xl font-bold text-sky-400 font-mono tabular-nums">
              {stats.replied.toLocaleString()}
            </div>
            <div className="text-[10px] text-sky-400 font-semibold font-mono tabular-nums">
              {replyRate}%
            </div>
          </div>

          <div className="bg-[#171B26] p-4 rounded-xl border border-[#232938] space-y-1">
            <div className="text-xs text-[#949EB0] uppercase font-semibold">
              {language === 'es' ? 'Rebotados' : 'Bounced'}
            </div>
            <div className="text-xl font-bold text-rose-400 font-mono tabular-nums">
              {stats.bounced.toLocaleString()}
            </div>
            <div className="text-[10px] text-rose-400 font-semibold font-mono tabular-nums">
              {bounceRate}%
            </div>
          </div>
        </div>
      </div>

      {/* Mailbox Breakdown Table */}
      <div className="bg-[#11141C] border border-[#1D2330] rounded-xl overflow-hidden p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#F3F5F8] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>{t('analytics.accountBreakdownTitle')}</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#171B26] text-[#949EB0] uppercase tracking-wider text-[10px] border-b border-[#1D2330]">
              <tr>
                <th className="py-2.5 px-4">{t('analytics.colMailbox')}</th>
                <th className="py-2.5 px-4">{t('analytics.colDailyLimit')}</th>
                <th className="py-2.5 px-4">{t('analytics.colSentToday')}</th>
                <th className="py-2.5 px-4">{t('analytics.colBounceRate')}</th>
                <th className="py-2.5 px-4">{t('analytics.colHealth')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D2330] text-[#F3F5F8]">
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#949EB0]">
                    {language === 'es'
                      ? 'No hay casillas conectadas en este workspace todavía.'
                      : 'No mailboxes connected in this workspace yet.'}
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => {
                  const health = acc.healthScore ?? 98;
                  const isHealthy = health >= 90;
                  return (
                    <tr key={acc.id} className="hover:bg-[#171B26]/60 transition">
                      <td className="py-3 px-4 font-mono text-[#F3F5F8]">{acc.email}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#949EB0]">
                        {acc.dailyLimit} / {language === 'es' ? 'día' : 'day'}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#F3F5F8]">
                        {acc.sentToday} {language === 'es' ? 'enviados' : 'sent'}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-emerald-400">
                        {bounceRate}%
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isHealthy ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                          />
                          <span
                            className={`font-bold font-mono tabular-nums ${
                              isHealthy ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {health}% {isHealthy ? (language === 'es' ? 'Óptimo' : 'Optimal') : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
