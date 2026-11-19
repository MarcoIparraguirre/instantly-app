'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Plus,
  ShieldCheck,
  Server,
  Flame,
  X,
  CheckCircle,
  AlertTriangle,
  Activity,
  Trash2,
  ExternalLink,
  RefreshCw,
  Zap,
  Lightbulb,
  ArrowRight
} from 'lucide-react';
import { SenderAccount } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';

export default function AccountsView() {
  const { currentWorkspace } = useAuth();
  return <AccountsViewContent key={currentWorkspace.id} workspaceId={currentWorkspace.id} />;
}

function AccountsViewContent({ workspaceId }: { workspaceId: string }) {
  const { t, language } = useLanguage();
  const { showToast, confirm } = useFeedback();

  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<SenderAccount | null>(null);
  const [drawerTab, setDrawerTab] = useState<'general' | 'warmup' | 'dns'>('dns');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAuditingDns, setIsAuditingDns] = useState(false);
  const [isRunningWarmup, setIsRunningWarmup] = useState(false);
  const [warmupMessage, setWarmupMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isRunningWarmupCron, setIsRunningWarmupCron] = useState(false);
  const [warmupCronFeedback, setWarmupCronFeedback] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [accountSuccessNotice, setAccountSuccessNotice] = useState<string | null>(null);
  const [addFormError, setAddFormError] = useState<string | null>(null);

  const [oauthProvider, setOauthProvider] = useState<'google' | 'microsoft' | null>(null);
  const [oauthSmtpDefaults, setOauthSmtpDefaults] = useState<{
    smtpHost: string;
    smtpPort: number;
  } | null>(null);
  const [oauthEmail, setOauthEmail] = useState('');
  const [oauthName, setOauthName] = useState('');
  const [isConnectingOauth, setIsConnectingOauth] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: 'Sales Mailbox 1',
    email: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpUser: '',
    smtpPass: '',
    dailyLimit: '50'
  });

  const fetchAccounts = useCallback(
    async (targetWsId: string = workspaceId) => {
      try {
        const res = await fetch(
          `/api/accounts?workspaceId=${encodeURIComponent(targetWsId)}`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          setAccounts(data);
        }
      } catch (err) {
        console.error('Error fetching accounts:', err);
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`, {
      cache: 'no-store'
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setAccounts(data);
        }
      })
      .catch((err) => {
        console.error('Error fetching accounts:', err);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const runLiveDnsAudit = async (account: SenderAccount) => {
    const domain = account.email.split('@')[1];
    if (!domain) return;
    setIsAuditingDns(true);
    try {
      const res = await fetch('/api/accounts/dns-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      const data = await res.json();
      if (data && data.spf) {
        const updatedDnsChecks = [
          {
            type: 'SPF' as const,
            valid: data.spf.valid,
            expected: 'v=spf1 include:... ~all',
            current: data.spf.record || 'No detectado',
            description: data.spf.details
          },
          {
            type: 'DKIM' as const,
            valid: data.dkim.valid,
            expected: 'selector._domainkey (2048-bit RSA)',
            current: data.dkim.selector ? `Selector: ${data.dkim.selector}` : 'No detectado',
            description: data.dkim.details
          },
          {
            type: 'DMARC' as const,
            valid: data.dmarc.valid,
            expected: 'v=DMARC1; p=quarantine o reject',
            current: data.dmarc.record || 'No detectado',
            description: data.dmarc.details
          },
          {
            type: 'MX' as const,
            valid: data.mx.valid,
            expected: 'Servidores MX activos',
            current: data.mx.records?.join(', ') || 'Sin MX',
            description: data.mx.details
          },
          {
            type: 'CTD' as const,
            valid: data.ctd.valid,
            expected: 'track.tudominio.com CNAME',
            current: data.ctd.valid ? 'Activo' : 'Inactivo',
            description: data.ctd.details
          }
        ];

        const updatedAccount = {
          ...account,
          healthScore: data.overallHealth,
          dnsChecks: updatedDnsChecks
        };
        setSelectedAccount(updatedAccount);
        setAccounts((prev) => prev.map((a) => (a.id === account.id ? updatedAccount : a)));
        showToast({
          title: language === 'es' ? 'Auditoría DNS completada' : 'DNS audit completed',
          description: `${domain} · Score: ${data.overallHealth}%`,
          variant: 'success'
        });
      }
    } catch (err) {
      console.error('DNS audit error:', err);
      showToast({
        title: language === 'es' ? 'Error al auditar DNS' : 'DNS audit failed',
        variant: 'error'
      });
    } finally {
      setIsAuditingDns(false);
    }
  };

  const triggerWarmupRound = async () => {
    setIsRunningWarmup(true);
    setWarmupMessage(null);
    try {
      const res = await fetch('/api/accounts/warmup/run', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const msg =
          language === 'es'
            ? `${data.roundsExecuted} intercambios P2P realizados exitosamente.`
            : `${data.roundsExecuted} P2P warmup exchanges completed.`;
        setWarmupMessage({ ok: true, text: msg });
        showToast({
          title: language === 'es' ? 'Ronda de Warmup completada' : 'Warmup round completed',
          description: msg,
          variant: 'success'
        });
        await fetchAccounts(workspaceId);
      } else {
        const msg =
          data.logs?.[0]?.error ||
          (language === 'es'
            ? 'No se pudo completar el intercambio'
            : 'Could not complete warmup exchange');
        setWarmupMessage({ ok: false, text: msg });
        showToast({
          title: language === 'es' ? 'Warmup con observaciones' : 'Warmup warning',
          description: msg,
          variant: 'warning'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error running warmup';
      setWarmupMessage({ ok: false, text: msg });
      showToast({
        title: language === 'es' ? 'Error ejecutando Warmup' : 'Warmup failed',
        description: msg,
        variant: 'error'
      });
    } finally {
      setIsRunningWarmup(false);
    }
  };

  const triggerAutomatedWarmupCron = async () => {
    setIsRunningWarmupCron(true);
    setWarmupCronFeedback(null);
    try {
      const res = await fetch('/api/cron/warmup', {
        method: 'POST',
        headers: { 'x-manual-trigger': 'true' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const executed = data.warmupResult?.roundsExecuted ?? 0;
        if (data.warmupResult?.success) {
          const text =
            language === 'es'
              ? `Cron Warmup verificado: ${executed} intercambio(s) P2P ejecutado(s).`
              : `Warmup Cron verified: ${executed} P2P exchange(s) executed.`;
          setWarmupCronFeedback({ ok: true, text });
          showToast({
            title: language === 'es' ? 'Warmup Cron verificado' : 'Warmup Cron verified',
            description: text,
            variant: 'success'
          });
        } else {
          const warn = data.warmupResult?.logs?.[0]?.error;
          const text =
            warn ||
            (language === 'es'
              ? 'Cron ejecutado, sin suficientes casillas activas para intercambio P2P.'
              : 'Cron executed, not enough active mailboxes for P2P exchange.');
          setWarmupCronFeedback({ ok: false, text });
          showToast({
            title: language === 'es' ? 'Warmup Cron sin intercambios' : 'Warmup Cron skipped',
            description: text,
            variant: 'warning'
          });
        }
        await fetchAccounts(workspaceId);
      } else {
        const text =
          data.error ||
          (language === 'es' ? 'Error al ejecutar Warmup Cron' : 'Failed to run Warmup Cron');
        setWarmupCronFeedback({ ok: false, text });
        showToast({ title: text, variant: 'error' });
      }
    } catch (err: unknown) {
      const text =
        err instanceof Error ? err.message : language === 'es' ? 'Error de red' : 'Network error';
      setWarmupCronFeedback({ ok: false, text });
      showToast({ title: text, variant: 'error' });
    } finally {
      setIsRunningWarmupCron(false);
    }
  };

  const startOAuthConnection = async (provider: 'google' | 'microsoft') => {
    setOauthError(null);
    setIsConnectingOauth(true);
    try {
      const res = await fetch(`/api/accounts/oauth?provider=${provider}`);
      const data = await res.json();
      if (!res.ok) {
        setOauthError(data.error || 'Failed to initialize OAuth');
        return;
      }

      if (data.configured && (data.redirectUrl || data.authUrl)) {
        window.location.href = data.redirectUrl || data.authUrl;
        return;
      }

      setOauthProvider(provider);
      setOauthSmtpDefaults(
        data.smtpDefaults || {
          smtpHost: provider === 'google' ? 'smtp.gmail.com' : 'smtp.office365.com',
          smtpPort: 587
        }
      );
      setOauthEmail((prev) => prev || formData.email || '');
      setOauthName((prev) => {
        if (prev) return prev;
        if (
          formData.name &&
          formData.name !== 'Sales Mailbox 1' &&
          formData.name !== 'Sales Mailbox'
        ) {
          return formData.name;
        }
        return provider === 'google' ? 'Google Workspace' : 'Microsoft 365';
      });
    } catch (err: unknown) {
      setOauthError(
        err instanceof Error ? err.message : 'Error checking OAuth configuration'
      );
    } finally {
      setIsConnectingOauth(false);
    }
  };

  const confirmOAuthConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oauthProvider) return;
    setOauthError(null);
    setIsConnectingOauth(true);
    try {
      const res = await fetch('/api/accounts/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          provider: oauthProvider,
          email: oauthEmail.trim(),
          name: oauthName.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const errMsg =
          data.error ||
          (language === 'es' ? 'No se pudo conectar la cuenta' : 'Could not connect account');
        setOauthError(errMsg);
        showToast({ title: errMsg, variant: 'error' });
        return;
      }

      await fetchAccounts(workspaceId);
      setShowAddModal(false);
      setOauthProvider(null);
      setOauthEmail('');
      setOauthName('');
      if (data.account) {
        setSelectedAccount(data.account);
        setDrawerTab('dns');
        const notice =
          language === 'es'
            ? `Casilla ${data.account.email} conectada vía ${
                oauthProvider === 'google' ? 'Google Workspace' : 'Microsoft 365'
              } (${data.account.smtpHost}:${data.account.smtpPort}) · Score DNS: ${
                data.account.healthScore
              }%`
            : `Mailbox ${data.account.email} connected via ${
                oauthProvider === 'google' ? 'Google Workspace' : 'Microsoft 365'
              } (${data.account.smtpHost}:${data.account.smtpPort}) · DNS Score: ${
                data.account.healthScore
              }%`;
        setAccountSuccessNotice(notice);
        showToast({
          title: language === 'es' ? 'Casilla conectada' : 'Mailbox connected',
          description: data.account.email,
          variant: 'success'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error connecting OAuth account';
      setOauthError(msg);
      showToast({ title: msg, variant: 'error' });
    } finally {
      setIsConnectingOauth(false);
    }
  };

  // Escape key listener for active drawer or modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddModal) {
          setShowAddModal(false);
        } else if (selectedAccount) {
          setSelectedAccount(null);
        }
      }
    };
    if (selectedAccount || showAddModal) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedAccount, showAddModal]);

  // Mutual exclusivity: close accounts drawer/modal when copilot drawer opens
  useEffect(() => {
    const handleCloseFromCopilot = () => {
      setSelectedAccount(null);
      setShowAddModal(false);
    };
    window.addEventListener('misender:close-accounts-drawer', handleCloseFromCopilot);
    return () => window.removeEventListener('misender:close-accounts-drawer', handleCloseFromCopilot);
  }, []);

  // Mutual exclusivity: notify copilot to close when an account drawer or modal is opened
  useEffect(() => {
    if (selectedAccount || showAddModal) {
      window.dispatchEvent(new CustomEvent('misender:close-copilot'));
    }
  }, [selectedAccount, showAddModal]);

  const toggleWarmup = (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = accounts.find((a) => a.id === accountId);
    const nextEnabled = !target?.warmupEnabled;
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, warmupEnabled: nextEnabled } : a))
    );
    showToast({
      title: nextEnabled
        ? language === 'es'
          ? 'Warmup activado'
          : 'Warmup enabled'
        : language === 'es'
        ? 'Warmup pausado'
        : 'Warmup paused',
      description: target?.email,
      variant: 'info'
    });
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setAddFormError(null);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          workspaceId
        })
      });
      const data = await res.json();
      if (res.ok) {
        setShowAddModal(false);
        const savedEmail = formData.email;
        setFormData({
          name: 'Sales Mailbox',
          email: '',
          smtpHost: 'smtp.gmail.com',
          smtpPort: '587',
          smtpUser: '',
          smtpPass: '',
          dailyLimit: '50'
        });
        await fetchAccounts(workspaceId);
        showToast({
          title: language === 'es' ? 'Casilla SMTP conectada' : 'SMTP mailbox connected',
          description: savedEmail,
          variant: 'success'
        });
      } else {
        const msg =
          data.error ||
          (language === 'es' ? 'Error al guardar la casilla' : 'Failed to save account');
        setAddFormError(msg);
        showToast({ title: msg, variant: 'error' });
      }
    } catch (err: unknown) {
      console.error('Error saving account:', err);
      const msg = err instanceof Error ? err.message : 'Error saving account';
      setAddFormError(msg);
      showToast({ title: msg, variant: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = accounts.find((a) => a.id === id);
    const confirmed = await confirm({
      title: language === 'es' ? 'Desvincular casilla de correo' : 'Disconnect Email Account',
      description:
        language === 'es'
          ? `¿Deseas desvincular ${target?.email || 'esta casilla'} de este workspace?`
          : `Are you sure you want to disconnect ${target?.email || 'this email account'}?`,
      confirmLabel: language === 'es' ? 'Desvincular' : 'Disconnect',
      cancelLabel: t('common.cancel'),
      variant: 'danger'
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('Failed to delete account');
      }
      await fetchAccounts(workspaceId);
      if (selectedAccount?.id === id) setSelectedAccount(null);
      showToast({
        title: language === 'es' ? 'Casilla desvinculada' : 'Mailbox disconnected',
        description: target?.email,
        variant: 'success'
      });
    } catch (err) {
      console.error(err);
      showToast({
        title: language === 'es' ? 'Error al desvincular casilla' : 'Failed to disconnect mailbox',
        variant: 'error'
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#0A0C10] text-[#F3F5F8] relative">
      {/* Header */}
      <div className="h-16 px-8 border-b border-[#1D2330] flex items-center justify-between bg-[#11141C] shrink-0">
        <div>
          <h1 className="text-base font-bold text-[#F3F5F8] flex items-center gap-2.5">
            <Mail className="w-5 h-5 text-[#E85D2A]" />
            <span>{t('accounts.title')}</span>
          </h1>
          <p className="text-xs text-[#949EB0] mt-0.5">{t('accounts.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={triggerAutomatedWarmupCron}
            disabled={isRunningWarmupCron}
            className="flex items-center gap-1.5 bg-[#171B26] hover:bg-[#1D2330] disabled:opacity-50 text-amber-300 border border-amber-500/30 text-xs font-semibold px-3.5 py-2 rounded-lg transition cursor-pointer"
            title={
              language === 'es'
                ? 'Ejecutar y verificar la ronda automática de Warmup (/api/cron/warmup)'
                : 'Trigger and verify automated Warmup cron (/api/cron/warmup)'
            }
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningWarmupCron ? 'animate-spin' : ''}`} />
            <span>
              {isRunningWarmupCron
                ? language === 'es'
                  ? 'Ejecutando Warmup...'
                  : 'Running Warmup...'
                : language === 'es'
                ? 'Verificar Warmup Cron'
                : 'Run Warmup Cron'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedAccount(null);
              setOauthProvider(null);
              setOauthError(null);
              setAddFormError(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white text-xs font-semibold px-4 py-2 rounded-lg transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('accounts.addBtn')}</span>
          </button>
        </div>
      </div>

      {/* High-Density Account Table */}
      <div className="flex-1 min-h-0 p-8 overflow-y-auto space-y-4">
        {warmupCronFeedback && (
          <div
            className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs ${
              warmupCronFeedback.ok
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {warmupCronFeedback.ok ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{warmupCronFeedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setWarmupCronFeedback(null)}
              className="text-[#949EB0] hover:text-[#F3F5F8] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {accountSuccessNotice && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-200 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{accountSuccessNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setAccountSuccessNotice(null)}
              className="text-[#949EB0] hover:text-[#F3F5F8] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#171B26] text-[#949EB0] uppercase tracking-wider text-[11px] border-b border-[#1D2330]">
              <tr>
                <th className="py-3 px-5">{t('accounts.colEmail')}</th>
                <th className="py-3 px-5">{t('accounts.colProvider')}</th>
                <th className="py-3 px-5">{t('accounts.colSent')}</th>
                <th className="py-3 px-5">{t('accounts.colStatus')}</th>
                <th className="py-3 px-5">
                  <span className="inline-flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>Warmup</span>
                  </span>
                </th>
                <th className="py-3 px-5">{t('accounts.colHealth')}</th>
                <th className="py-3 px-5 text-right">{t('accounts.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D2330] text-[#F3F5F8]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#949EB0]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#949EB0]">
                    <div className="space-y-2">
                      <div>
                        {language === 'es'
                          ? 'No hay casillas de correo conectadas en este workspace.'
                          : 'No sender mailboxes connected in this workspace yet.'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="inline-flex items-center gap-1.5 bg-[#E85D2A] hover:bg-[#F26B3A] text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('accounts.addBtn')}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => {
                  const health = acc.healthScore ?? 95;
                  return (
                    <tr
                      key={acc.id}
                      onClick={() => {
                        setShowAddModal(false);
                        setSelectedAccount(acc);
                      }}
                      className="hover:bg-[#171B26]/70 cursor-pointer transition"
                    >
                      <td className="py-4 px-5">
                        <div className="font-semibold text-[#F3F5F8]">{acc.name}</div>
                        <div className="text-[11px] text-[#949EB0] font-mono">{acc.email}</div>
                      </td>
                      <td className="py-4 px-5">
                        <span className="text-[10px] font-mono uppercase bg-[#171B26] text-[#F3F5F8] border border-[#232938] px-2 py-0.5 rounded-lg">
                          {acc.provider || 'SMTP'}
                        </span>
                      </td>
                      <td className="py-4 px-5 font-mono tabular-nums text-[#949EB0]">
                        <span className="text-[#F3F5F8] font-bold">{acc.sentToday}</span> /{' '}
                        {acc.dailyLimit}
                      </td>
                      <td className="py-4 px-5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>{acc.status}</span>
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        <button
                          type="button"
                          onClick={(e) => toggleWarmup(acc.id, e)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                            acc.warmupEnabled
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-[#171B26] text-[#949EB0] border-[#232938]'
                          }`}
                        >
                          <Flame
                            className={`w-3.5 h-3.5 ${
                              acc.warmupEnabled ? 'text-amber-400' : 'text-[#949EB0]'
                            }`}
                          />
                          <span>
                            {acc.warmupEnabled ? t('accounts.warmupActive') : t('accounts.warmupPaused')}
                          </span>
                        </button>
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#171B26] rounded-full overflow-hidden border border-[#232938]">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${health}%` }}
                            />
                          </div>
                          <span className="text-emerald-400 font-bold font-mono tabular-nums">
                            {health}%
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAddModal(false);
                              setSelectedAccount(acc);
                            }}
                            className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs font-semibold cursor-pointer"
                          >
                            <span>Audit DNS</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteAccount(acc.id, e)}
                            className="p-1 text-[#949EB0] hover:text-rose-400 transition cursor-pointer"
                            title={language === 'es' ? 'Eliminar cuenta' : 'Delete mailbox'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Drawer Panel (Sliding in from Right) */}
      {selectedAccount && (
        <>
          <div
            onClick={() => setSelectedAccount(null)}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 transition-opacity"
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 w-[540px] max-w-full bg-[#11141C] border-l border-[#232938] shadow-2xl z-50 flex flex-col transition-all">
            {/* Drawer Header */}
            <div className="h-16 px-6 border-b border-[#1D2330] flex items-center justify-between bg-[#171B26]/80 shrink-0">
              <div>
                <h2 className="text-sm font-bold text-[#F3F5F8] flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#E85D2A]" />
                  <span>{selectedAccount.name}</span>
                </h2>
                <div className="text-[11px] text-[#949EB0] font-mono">
                  {selectedAccount.email}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAccount(null)}
                className="p-1 rounded-lg text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#1D2330] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Tabs */}
            <div className="flex border-b border-[#1D2330] px-6 gap-6 text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setDrawerTab('dns')}
                className={`py-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  drawerTab === 'dns'
                    ? 'border-[#E85D2A] text-[#E85D2A]'
                    : 'border-transparent text-[#949EB0] hover:text-[#F3F5F8]'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{t('accounts.tabDns')}</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('warmup')}
                className={`py-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  drawerTab === 'warmup'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-[#949EB0] hover:text-[#F3F5F8]'
                }`}
              >
                <Flame className="w-4 h-4" />
                <span>{t('accounts.tabWarmup')}</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('general')}
                className={`py-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  drawerTab === 'general'
                    ? 'border-[#E85D2A] text-[#E85D2A]'
                    : 'border-transparent text-[#949EB0] hover:text-[#F3F5F8]'
                }`}
              >
                <span>{t('accounts.tabGeneral')}</span>
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Tab: DNS Health Checker */}
              {drawerTab === 'dns' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[#949EB0]">{t('accounts.dnsSubtitle')}</p>
                    <button
                      type="button"
                      onClick={() => runLiveDnsAudit(selectedAccount)}
                      disabled={isAuditingDns}
                      className="flex items-center gap-1.5 bg-[#E85D2A] hover:bg-[#F26B3A] disabled:opacity-50 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0"
                    >
                      <Activity className={`w-3.5 h-3.5 ${isAuditingDns ? 'animate-spin' : ''}`} />
                      <span>
                        {isAuditingDns
                          ? language === 'es'
                            ? 'Consultando DNS...'
                            : 'Auditing DNS...'
                          : language === 'es'
                          ? 'Auditar DNS en vivo'
                          : 'Audit Live DNS'}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {selectedAccount.dnsChecks?.map((dns, i) => (
                      <div
                        key={i}
                        className={`p-4 rounded-xl border space-y-2 ${
                          dns.valid
                            ? 'bg-[#171B26] border-[#232938]'
                            : 'bg-rose-950/20 border-rose-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-xs text-[#F3F5F8] bg-[#11141C] border border-[#232938] px-2 py-0.5 rounded-lg font-mono">
                              {dns.type}
                            </span>
                            <span className="text-xs text-[#F3F5F8]/90 font-medium truncate">
                              {dns.description}
                            </span>
                          </div>
                          {dns.valid ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/25 font-semibold shrink-0">
                              <CheckCircle className="w-3.5 h-3.5" />{' '}
                              {t('accounts.dnsItemStatusOk')}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/25 font-semibold shrink-0">
                              <AlertTriangle className="w-3.5 h-3.5" />{' '}
                              {t('accounts.dnsItemStatusWarn')}
                            </span>
                          )}
                        </div>

                        <div className="bg-[#0A0C10] border border-[#1D2330] p-2.5 rounded-lg font-mono text-[11px] space-y-1">
                          <div className="text-[#949EB0]">
                            {t('accounts.dnsExpected')}{' '}
                            <span className="text-emerald-300">{dns.expected}</span>
                          </div>
                          <div className="text-[#949EB0]">
                            {t('accounts.dnsCurrent')}{' '}
                            <span className={dns.valid ? 'text-[#F3F5F8]' : 'text-rose-400'}>
                              {dns.current}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Warmup Performance */}
              {drawerTab === 'warmup' && (
                <div className="space-y-4">
                  <div className="bg-[#171B26] border border-[#232938] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#F3F5F8]">
                        {t('accounts.warmupStatsTitle')}
                      </span>
                      <span className="text-xs text-emerald-400 font-bold font-mono tabular-nums">
                        {selectedAccount.warmupRescueRate ?? 98}% {t('accounts.warmupRescue')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-[#11141C] p-3 rounded-xl border border-[#232938]">
                        <div className="text-[#949EB0] text-[10px] uppercase">
                          {language === 'es' ? 'Enviados Hoy' : 'Sent Today'}
                        </div>
                        <div className="text-lg font-bold text-[#F3F5F8] font-mono tabular-nums mt-1">
                          {selectedAccount.warmupToday ?? 0} emails
                        </div>
                      </div>
                      <div className="bg-[#11141C] p-3 rounded-xl border border-[#232938]">
                        <div className="text-[#949EB0] text-[10px] uppercase">
                          {language === 'es'
                            ? 'Total Warmup Intercambiado'
                            : 'Total Warmup Exchanged'}
                        </div>
                        <div className="text-lg font-bold text-amber-400 font-mono tabular-nums mt-1">
                          {selectedAccount.warmupTotal ?? 0} emails
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-[#949EB0] bg-[#11141C] p-2.5 rounded-lg border border-[#1D2330] flex items-center gap-2">
                      <Activity className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>{t('accounts.warmupRampUp')}</span>
                    </div>

                    {warmupMessage && (
                      <div
                        className={`p-2.5 rounded-lg text-xs border flex items-center gap-2 ${
                          warmupMessage.ok
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        {warmupMessage.ok ? (
                          <CheckCircle className="w-4 h-4 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                        )}
                        <span>{warmupMessage.text}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={triggerWarmupRound}
                      disabled={isRunningWarmup}
                      className="w-full flex items-center justify-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-lg transition cursor-pointer"
                    >
                      <Flame className={`w-4 h-4 ${isRunningWarmup ? 'animate-bounce' : ''}`} />
                      <span>
                        {isRunningWarmup
                          ? language === 'es'
                            ? 'Ejecutando intercambio P2P...'
                            : 'Running P2P exchange...'
                          : language === 'es'
                          ? 'Ejecutar Ronda de Warmup P2P Ahora'
                          : 'Run P2P Warmup Round Now'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tab: General Settings */}
              {drawerTab === 'general' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[#949EB0] block mb-1">
                      {language === 'es' ? 'Servidor SMTP' : 'SMTP Server'}
                    </label>
                    <input
                      type="text"
                      disabled
                      value={`${selectedAccount.smtpHost}:${selectedAccount.smtpPort}`}
                      className="w-full bg-[#171B26] border border-[#232938] rounded-lg p-2 font-mono tabular-nums text-[#949EB0]"
                    />
                  </div>
                  <div>
                    <label className="text-[#949EB0] block mb-1">
                      {language === 'es' ? 'Límite Diario de Envíos' : 'Daily Sending Limit'}
                    </label>
                    <input
                      type="number"
                      value={selectedAccount.dailyLimit}
                      onChange={(e) =>
                        setSelectedAccount({
                          ...selectedAccount,
                          dailyLimit: parseInt(e.target.value, 10) || 50
                        })
                      }
                      className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg p-2 font-mono tabular-nums text-[#F3F5F8] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Add Mailbox Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#11141C] border border-[#232938] rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#F3F5F8] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#E85D2A]" />
                <span>{t('accounts.modalTitle')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26] transition cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Prominent Quick OAuth 2.0 (1-Click) Section */}
            <div className="bg-[#171B26] border border-[#232938] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#E85D2A]" />
                  <span className="text-xs font-bold text-[#F3F5F8]">
                    {language === 'es'
                      ? 'Conexión Rápida OAuth 2.0 (1-Click)'
                      : 'Quick OAuth 2.0 Connection (1-Click)'}
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-lg bg-[#E85D2A]/15 text-[#E85D2A] border border-[#E85D2A]/30">
                  Auto SMTP + DNS
                </span>
              </div>

              <p className="text-[11px] text-[#949EB0] leading-relaxed">
                {language === 'es'
                  ? 'Conecta tu casilla corporativa al instante sin configurar puertos ni contraseñas manuales.'
                  : 'Connect your workspace mailbox instantly with automatic SMTP defaults and live DNS verification.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => startOAuthConnection('google')}
                  disabled={isConnectingOauth}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-left transition disabled:opacity-50 cursor-pointer ${
                    oauthProvider === 'google'
                      ? 'bg-[#E85D2A]/15 border-[#E85D2A] text-[#F3F5F8]'
                      : 'bg-[#11141C] hover:bg-[#1D2330] border-[#232938] hover:border-[#E85D2A]/50 text-[#F3F5F8]'
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                      />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {language === 'es'
                        ? 'Conectar con Google Workspace'
                        : 'Connect Google Workspace'}
                    </div>
                    <div className="text-[10px] text-[#949EB0] font-mono">smtp.gmail.com:587</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => startOAuthConnection('microsoft')}
                  disabled={isConnectingOauth}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-left transition disabled:opacity-50 cursor-pointer ${
                    oauthProvider === 'microsoft'
                      ? 'bg-[#E85D2A]/15 border-[#E85D2A] text-[#F3F5F8]'
                      : 'bg-[#11141C] hover:bg-[#1D2330] border-[#232938] hover:border-[#E85D2A]/50 text-[#F3F5F8]'
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg bg-[#171B26] border border-[#232938] flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="2" y="2" width="9" height="9" fill="#F25022" />
                      <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
                      <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
                      <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {language === 'es'
                        ? 'Conectar con Microsoft 365'
                        : 'Connect Microsoft 365'}
                    </div>
                    <div className="text-[10px] text-[#949EB0] font-mono">
                      smtp.office365.com:587
                    </div>
                  </div>
                </button>
              </div>

              {oauthError && (
                <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{oauthError}</span>
                </div>
              )}

              {oauthProvider && (
                <form
                  onSubmit={confirmOAuthConnect}
                  className="pt-2 border-t border-[#232938] space-y-2.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#F3F5F8]">
                      {oauthProvider === 'google' ? 'Google Workspace' : 'Microsoft 365'} ·{' '}
                      <span className="font-mono text-[#949EB0]">
                        {oauthSmtpDefaults?.smtpHost}:{oauthSmtpDefaults?.smtpPort}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setOauthProvider(null);
                        setOauthError(null);
                      }}
                      className="text-[#949EB0] hover:text-[#F3F5F8] text-[10px] cursor-pointer"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-[#949EB0] font-medium">
                        {t('accounts.nicknameLabel')}
                      </label>
                      <input
                        type="text"
                        required
                        value={oauthName}
                        onChange={(e) => setOauthName(e.target.value)}
                        className="w-full mt-1 bg-[#11141C] border border-[#232938] rounded-lg px-2.5 py-1.5 text-xs text-[#F3F5F8] focus:outline-none focus:border-[#E85D2A]"
                        placeholder={
                          oauthProvider === 'google' ? 'Google Workspace' : 'Microsoft 365'
                        }
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#949EB0] font-medium">
                        {t('accounts.emailLabel')}
                      </label>
                      <input
                        type="email"
                        required
                        autoFocus
                        value={oauthEmail}
                        onChange={(e) => setOauthEmail(e.target.value)}
                        className="w-full mt-1 bg-[#11141C] border border-[#232938] rounded-lg px-2.5 py-1.5 text-xs text-[#F3F5F8] focus:outline-none focus:border-[#E85D2A]"
                        placeholder={
                          oauthProvider === 'google'
                            ? 'nombre@empresa.com'
                            : 'nombre@corporativo.com'
                        }
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isConnectingOauth}
                    className="w-full flex items-center justify-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>
                      {isConnectingOauth
                        ? language === 'es'
                          ? 'Conectando y auditando DNS...'
                          : 'Connecting & auditing DNS...'
                        : language === 'es'
                        ? 'Confirmar Conexión OAuth + Auditar DNS'
                        : 'Confirm OAuth Connection + Audit DNS'}
                    </span>
                  </button>
                </form>
              )}
            </div>

            {/* Divider to Manual SMTP Form */}
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-[#1D2330]" />
              <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[#949EB0]">
                {language === 'es'
                  ? 'Conexión Manual SMTP / App Password'
                  : 'Manual SMTP / App Password Connection'}
              </span>
              <div className="flex-grow border-t border-[#1D2330]" />
            </div>

            {addFormError && (
              <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{addFormError}</span>
              </div>
            )}

            <form onSubmit={handleAddAccount} className="space-y-3">
              <div>
                <label className="text-xs text-[#949EB0] font-medium">
                  {t('accounts.nicknameLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none"
                  placeholder={t('accounts.nicknamePlaceholder')}
                />
              </div>

              <div>
                <label className="text-xs text-[#949EB0] font-medium">
                  {t('accounts.emailLabel')}
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value, smtpUser: e.target.value })
                  }
                  className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none"
                  placeholder={t('accounts.emailPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-[#949EB0] font-medium">
                    {t('accounts.serverLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.smtpHost}
                    onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })}
                    className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none"
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#949EB0] font-medium">
                    {t('accounts.portLabel')}
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.smtpPort}
                    onChange={(e) => setFormData({ ...formData, smtpPort: e.target.value })}
                    className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-[#F3F5F8] focus:outline-none"
                    placeholder="587"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-[#949EB0] font-medium">
                  {t('accounts.passwordLabel')}
                </label>
                <input
                  type="password"
                  required
                  value={formData.smtpPass}
                  onChange={(e) => setFormData({ ...formData, smtpPass: e.target.value })}
                  className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none"
                  placeholder={
                    language === 'es'
                      ? 'Contraseña de Aplicación (16 letras)'
                      : 'App Password (16 characters)'
                  }
                />
              </div>

              {/* Google App Password Tip */}
              <div className="bg-[#171B26] border border-[#232938] rounded-xl p-3 text-[11px] text-[#F3F5F8] space-y-1">
                <div className="font-semibold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-[#E85D2A] shrink-0" />
                    <span>
                      {language === 'es'
                        ? '¿Usas Gmail o Google Workspace?'
                        : 'Using Gmail or Google Workspace?'}
                    </span>
                  </span>
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline flex items-center gap-1 font-normal text-[10px]"
                  >
                    <span>
                      {language === 'es' ? 'Generar Contraseña de App' : 'Generate App Password'}
                    </span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <p className="text-[#949EB0] leading-relaxed text-[10px]">
                  {language === 'es'
                    ? 'Google bloquea las contraseñas habituales en SMTP. Debes generar una Contraseña de Aplicación de 16 letras en Seguridad de tu cuenta de Google.'
                    : 'Google blocks normal account passwords on SMTP. Generate a 16-character App Password in Google Account Security.'}
                </p>
              </div>

              <div>
                <label className="text-xs text-[#949EB0] font-medium">
                  {t('accounts.limitLabel')}
                </label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={formData.dailyLimit}
                  onChange={(e) => setFormData({ ...formData, dailyLimit: e.target.value })}
                  className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-[#F3F5F8] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] text-[#949EB0] hover:text-[#F3F5F8] text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#E85D2A] hover:bg-[#F26B3A] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  {isSaving
                    ? language === 'es'
                      ? 'Guardando...'
                      : 'Saving...'
                    : t('accounts.saveAndVerify')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
