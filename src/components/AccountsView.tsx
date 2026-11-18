'use client';

import React, { useState, useEffect } from 'react';
import { 
  Mail, Plus, ShieldCheck, Server, Flame, 
  X, CheckCircle, AlertTriangle, Activity, Trash2, ExternalLink, RefreshCw, Zap
} from 'lucide-react';
import { SenderAccount } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

export default function AccountsView() {
  const { t, language } = useLanguage();
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<SenderAccount | null>(null);
  const [drawerTab, setDrawerTab] = useState<'general' | 'warmup' | 'dns'>('dns');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAuditingDns, setIsAuditingDns] = useState(false);
  const [isRunningWarmup, setIsRunningWarmup] = useState(false);
  const [warmupMessage, setWarmupMessage] = useState<string | null>(null);
  const [isRunningWarmupCron, setIsRunningWarmupCron] = useState(false);
  const [warmupCronFeedback, setWarmupCronFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [accountSuccessNotice, setAccountSuccessNotice] = useState<string | null>(null);
  const [addFormError, setAddFormError] = useState<string | null>(null);

  const [oauthProvider, setOauthProvider] = useState<'google' | 'microsoft' | null>(null);
  const [oauthSmtpDefaults, setOauthSmtpDefaults] = useState<{ smtpHost: string; smtpPort: number } | null>(null);
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

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (Array.isArray(data)) {
        setAccounts(data);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  };

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
        setAccounts(prev => prev.map(a => a.id === account.id ? updatedAccount : a));
      }
    } catch (err) {
      console.error('DNS audit error:', err);
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
        setWarmupMessage(`✓ ${data.roundsExecuted} intercambios P2P realizados exitosamente.`);
        await fetchAccounts();
      } else {
        setWarmupMessage(`⚠️ ${data.logs?.[0]?.error || 'No se pudo completar el intercambio'}`);
      }
    } catch (err: unknown) {
      setWarmupMessage(`Error: ${err instanceof Error ? err.message : 'Error running warmup'}`);
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
          setWarmupCronFeedback({
            ok: true,
            text:
              language === 'es'
                ? `Cron Warmup verificado: ${executed} intercambio(s) P2P ejecutado(s).`
                : `Warmup Cron verified: ${executed} P2P exchange(s) executed.`
          });
        } else {
          const warn = data.warmupResult?.logs?.[0]?.error;
          setWarmupCronFeedback({
            ok: false,
            text:
              warn ||
              (language === 'es'
                ? 'Cron ejecutado, sin suficientes casillas activas para intercambio P2P.'
                : 'Cron executed, not enough active mailboxes for P2P exchange.')
          });
        }
        await fetchAccounts();
      } else {
        setWarmupCronFeedback({
          ok: false,
          text: data.error || (language === 'es' ? 'Error al ejecutar Warmup Cron' : 'Failed to run Warmup Cron')
        });
      }
    } catch (err: unknown) {
      setWarmupCronFeedback({
        ok: false,
        text: err instanceof Error ? err.message : (language === 'es' ? 'Error de red' : 'Network error')
      });
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
        if (formData.name && formData.name !== 'Sales Mailbox 1' && formData.name !== 'Sales Mailbox') {
          return formData.name;
        }
        return provider === 'google' ? 'Google Workspace' : 'Microsoft 365';
      });
    } catch (err: unknown) {
      setOauthError(err instanceof Error ? err.message : 'Error checking OAuth configuration');
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
          provider: oauthProvider,
          email: oauthEmail.trim(),
          name: oauthName.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setOauthError(data.error || (language === 'es' ? 'No se pudo conectar la cuenta' : 'Could not connect account'));
        return;
      }

      await fetchAccounts();
      setShowAddModal(false);
      setOauthProvider(null);
      setOauthEmail('');
      setOauthName('');
      if (data.account) {
        setSelectedAccount(data.account);
        setDrawerTab('dns');
        setAccountSuccessNotice(
          language === 'es'
            ? `Casilla ${data.account.email} conectada vía ${oauthProvider === 'google' ? 'Google Workspace' : 'Microsoft 365'} (${data.account.smtpHost}:${data.account.smtpPort}) · Score DNS: ${data.account.healthScore}%`
            : `Mailbox ${data.account.email} connected via ${oauthProvider === 'google' ? 'Google Workspace' : 'Microsoft 365'} (${data.account.smtpHost}:${data.account.smtpPort}) · DNS Score: ${data.account.healthScore}%`
        );
      }
    } catch (err: unknown) {
      setOauthError(err instanceof Error ? err.message : 'Error connecting OAuth account');
    } finally {
      setIsConnectingOauth(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/accounts')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setAccounts(data);
        }
      })
      .catch((err) => {
        console.error('Error fetching accounts:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    setAccounts(prev =>
      prev.map(a =>
        a.id === accountId ? { ...a, warmupEnabled: !a.warmupEnabled } : a
      )
    );
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setAddFormError(null);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        setShowAddModal(false);
        setFormData({
          name: 'Sales Mailbox',
          email: '',
          smtpHost: 'smtp.gmail.com',
          smtpPort: '587',
          smtpUser: '',
          smtpPass: '',
          dailyLimit: '50'
        });
        await fetchAccounts();
      } else {
        setAddFormError(data.error || (language === 'es' ? 'Error al guardar la casilla' : 'Failed to save account'));
      }
    } catch (err: unknown) {
      console.error('Error saving account:', err);
      setAddFormError(err instanceof Error ? err.message : 'Error saving account');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(language === 'es' ? '¿Deseas desvincular esta casilla de correo?' : 'Disconnect this email account?')) return;
    try {
      await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' });
      await fetchAccounts();
      if (selectedAccount?.id === id) setSelectedAccount(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0b0f17] relative">
      {/* Header */}
      <div className="h-16 px-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
        <div>
          <h1 className="text-base font-bold text-white flex items-center gap-2.5">
            <Mail className="w-5 h-5 text-blue-500" />
            {t('accounts.title')}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('accounts.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={triggerAutomatedWarmupCron}
            disabled={isRunningWarmupCron}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-amber-300 border border-amber-500/30 text-xs font-semibold px-3.5 py-2 rounded-xl transition"
            title={language === 'es' ? 'Ejecutar y verificar la ronda automática de Warmup (/api/cron/warmup)' : 'Trigger and verify automated Warmup cron (/api/cron/warmup)'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningWarmupCron ? 'animate-spin' : ''}`} />
            <span>
              {isRunningWarmupCron
                ? (language === 'es' ? 'Ejecutando Warmup...' : 'Running Warmup...')
                : (language === 'es' ? 'Verificar Warmup Cron' : 'Run Warmup Cron')}
            </span>
          </button>

          <button
            onClick={() => {
              setSelectedAccount(null);
              setOauthProvider(null);
              setOauthError(null);
              setAddFormError(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-blue-600/30 transition"
          >
            <Plus className="w-4 h-4" />
            {t('accounts.addBtn')}
          </button>
        </div>
      </div>

      {/* High-Density Account Table */}
      <div className="flex-1 p-8 overflow-y-auto space-y-4">
        {warmupCronFeedback && (
          <div
            className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs ${
              warmupCronFeedback.ok
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
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
              className="text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {accountSuccessNotice && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border bg-blue-950/40 border-blue-500/30 text-blue-200 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{accountSuccessNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setAccountSuccessNotice(null)}
              className="text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-5">{t('accounts.colEmail')}</th>
                <th className="py-3 px-5">{t('accounts.colProvider')}</th>
                <th className="py-3 px-5">{t('accounts.colSent')}</th>
                <th className="py-3 px-5">{t('accounts.colStatus')}</th>
                <th className="py-3 px-5">{t('accounts.colWarmup')}</th>
                <th className="py-3 px-5">{t('accounts.colHealth')}</th>
                <th className="py-3 px-5 text-right">{t('accounts.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {accounts.map((acc) => (
                <tr
                  key={acc.id}
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedAccount(acc);
                  }}
                  className="hover:bg-slate-800/50 cursor-pointer transition"
                >
                  <td className="py-4 px-5">
                    <div className="font-semibold text-white">{acc.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{acc.email}</div>
                  </td>
                  <td className="py-4 px-5">
                    <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded">
                      {acc.provider || 'SMTP'}
                    </span>
                  </td>
                  <td className="py-4 px-5 font-mono text-slate-300">
                    <span className="text-white font-bold">{acc.sentToday}</span> / {acc.dailyLimit}
                  </td>
                  <td className="py-4 px-5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {acc.status}
                    </span>
                  </td>
                  <td className="py-4 px-5">
                    <button
                      onClick={(e) => toggleWarmup(acc.id, e)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition ${
                        acc.warmupEnabled
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-slate-800 text-slate-500 border-slate-700'
                      }`}
                    >
                      <Flame className={`w-3.5 h-3.5 ${acc.warmupEnabled ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span>{acc.warmupEnabled ? t('accounts.warmupActive') : t('accounts.warmupPaused')}</span>
                    </button>
                  </td>
                  <td className="py-4 px-5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${acc.healthScore}%` }}
                        />
                      </div>
                      <span className="text-emerald-400 font-bold font-mono">{acc.healthScore}%</span>
                    </div>
                  </td>
                  <td className="py-4 px-5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddModal(false);
                          setSelectedAccount(acc);
                        }}
                        className="text-blue-400 hover:text-blue-300 text-xs font-semibold"
                      >
                        Audit DNS →
                      </button>
                      <button
                        onClick={(e) => handleDeleteAccount(acc.id, e)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition"
                        title={language === 'es' ? 'Eliminar cuenta' : 'Delete mailbox'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
          <div className="fixed inset-y-0 right-0 w-[540px] bg-[#0c121e] border-l border-slate-800 shadow-2xl z-50 flex flex-col transition-all">
          {/* Drawer Header */}
          <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                {selectedAccount.name}
              </h2>
              <div className="text-[11px] text-slate-400 font-mono">{selectedAccount.email}</div>
            </div>
            <button
              onClick={() => setSelectedAccount(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Tabs */}
          <div className="flex border-b border-slate-800 px-6 gap-6 text-xs font-semibold shrink-0">
            <button
              onClick={() => setDrawerTab('dns')}
              className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
                drawerTab === 'dns'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              {t('accounts.tabDns')}
            </button>
            <button
              onClick={() => setDrawerTab('warmup')}
              className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
                drawerTab === 'warmup'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-4 h-4" />
              {t('accounts.tabWarmup')}
            </button>
            <button
              onClick={() => setDrawerTab('general')}
              className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
                drawerTab === 'general'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('accounts.tabGeneral')}
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Tab: DNS Health Checker */}
            {drawerTab === 'dns' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    {t('accounts.dnsSubtitle')}
                  </p>
                  <button
                    onClick={() => runLiveDnsAudit(selectedAccount)}
                    disabled={isAuditingDns}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow transition"
                  >
                    <Activity className={`w-3.5 h-3.5 ${isAuditingDns ? 'animate-spin' : ''}`} />
                    {isAuditingDns ? 'Consultando DNS...' : 'Auditar DNS en vivo'}
                  </button>
                </div>

                <div className="space-y-3">
                  {selectedAccount.dnsChecks?.map((dns, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-xl border space-y-2 ${
                        dns.valid
                          ? 'bg-slate-900/60 border-slate-800'
                          : 'bg-rose-950/20 border-rose-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-white bg-slate-800 px-2 py-0.5 rounded font-mono">
                            {dns.type}
                          </span>
                          <span className="text-xs text-slate-300 font-medium">{dns.description}</span>
                        </div>
                        {dns.valid ? (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
                            <CheckCircle className="w-3.5 h-3.5" /> {t('accounts.dnsItemStatusOk')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5" /> {t('accounts.dnsItemStatusWarn')}
                          </span>
                        )}
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-lg font-mono text-[11px] space-y-1">
                        <div className="text-slate-400">
                          {t('accounts.dnsExpected')} <span className="text-emerald-300">{dns.expected}</span>
                        </div>
                        <div className="text-slate-500">
                          {t('accounts.dnsCurrent')} <span className={dns.valid ? 'text-slate-300' : 'text-rose-400'}>{dns.current}</span>
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
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">{t('accounts.warmupStatsTitle')}</span>
                    <span className="text-xs text-emerald-400 font-bold">{selectedAccount.warmupRescueRate}% {t('accounts.warmupRescue')}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px] uppercase">
                        {language === 'es' ? 'Enviados Hoy' : 'Sent Today'}
                      </div>
                      <div className="text-lg font-bold text-white mt-1">{selectedAccount.warmupToday} emails</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px] uppercase">
                        {language === 'es' ? 'Total Warmup Intercambiado' : 'Total Warmup Exchanged'}
                      </div>
                      <div className="text-lg font-bold text-amber-400 mt-1">{selectedAccount.warmupTotal} emails</div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>{t('accounts.warmupRampUp')}</span>
                  </div>

                  {warmupMessage && (
                    <div className="p-2.5 rounded-lg text-xs bg-slate-950 border border-slate-700 text-slate-200">
                      {warmupMessage}
                    </div>
                  )}

                  <button
                    onClick={triggerWarmupRound}
                    disabled={isRunningWarmup}
                    className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl shadow transition"
                  >
                    <Flame className={`w-4 h-4 ${isRunningWarmup ? 'animate-bounce' : ''}`} />
                    {isRunningWarmup
                      ? (language === 'es' ? 'Ejecutando intercambio P2P...' : 'Running P2P exchange...')
                      : (language === 'es' ? 'Ejecutar Ronda de Warmup P2P Ahora' : 'Run P2P Warmup Round Now')}
                  </button>
                </div>
              </div>
            )}

            {/* Tab: General Settings */}
            {drawerTab === 'general' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'es' ? 'Servidor SMTP' : 'SMTP Server'}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={`${selectedAccount.smtpHost}:${selectedAccount.smtpPort}`}
                    className="w-full bg-slate-850 bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-slate-300"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'es' ? 'Límite Diario de Envíos' : 'Daily Sending Limit'}
                  </label>
                  <input
                    type="number"
                    value={selectedAccount.dailyLimit}
                    onChange={(e) => setSelectedAccount({ ...selectedAccount, dailyLimit: parseInt(e.target.value) || 50 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                {t('accounts.modalTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Prominent Quick OAuth 2.0 (1-Click) Section */}
            <div className="bg-slate-950/70 border border-blue-500/25 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white">
                    {language === 'es'
                      ? 'Conexión Rápida OAuth 2.0 (1-Click)'
                      : 'Quick OAuth 2.0 Connection (1-Click)'}
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  Auto SMTP + DNS
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                {language === 'es'
                  ? 'Conecta tu casilla corporativa al instante sin configurar puertos ni contraseñas manuales.'
                  : 'Connect your workspace mailbox instantly with automatic SMTP defaults and live DNS verification.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => startOAuthConnection('google')}
                  disabled={isConnectingOauth}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition disabled:opacity-50 ${
                    oauthProvider === 'google'
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 hover:border-blue-500/60 text-slate-100'
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                      <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {language === 'es' ? 'Conectar con Google Workspace' : 'Connect Google Workspace'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">smtp.gmail.com:587</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => startOAuthConnection('microsoft')}
                  disabled={isConnectingOauth}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition disabled:opacity-50 ${
                    oauthProvider === 'microsoft'
                      ? 'bg-sky-600/20 border-sky-500 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 hover:border-sky-500/60 text-slate-100'
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="2" y="2" width="9" height="9" fill="#F25022" />
                      <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
                      <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
                      <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {language === 'es' ? 'Conectar con Microsoft 365' : 'Connect Microsoft 365'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">smtp.office365.com:587</div>
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
                <form onSubmit={confirmOAuthConnect} className="pt-2 border-t border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-blue-300">
                      {oauthProvider === 'google' ? 'Google Workspace' : 'Microsoft 365'} ·{' '}
                      <span className="font-mono text-slate-400">
                        {oauthSmtpDefaults?.smtpHost}:{oauthSmtpDefaults?.smtpPort}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setOauthProvider(null);
                        setOauthError(null);
                      }}
                      className="text-slate-400 hover:text-white text-[10px]"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-300 font-medium">
                        {t('accounts.nicknameLabel')}
                      </label>
                      <input
                        type="text"
                        required
                        value={oauthName}
                        onChange={(e) => setOauthName(e.target.value)}
                        className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        placeholder={oauthProvider === 'google' ? 'Google Workspace' : 'Microsoft 365'}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 font-medium">
                        {t('accounts.emailLabel')}
                      </label>
                      <input
                        type="email"
                        required
                        autoFocus
                        value={oauthEmail}
                        onChange={(e) => setOauthEmail(e.target.value)}
                        className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        placeholder={oauthProvider === 'google' ? 'nombre@empresa.com' : 'nombre@corporativo.com'}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isConnectingOauth}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg shadow transition"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>
                      {isConnectingOauth
                        ? (language === 'es' ? 'Conectando y auditando DNS...' : 'Connecting & auditing DNS...')
                        : (language === 'es' ? 'Confirmar Conexión OAuth + Auditar DNS' : 'Confirm OAuth Connection + Audit DNS')}
                    </span>
                  </button>
                </form>
              )}
            </div>

            {/* Divider to Manual SMTP Form */}
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-800" />
              <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {language === 'es'
                  ? 'Conexión Manual SMTP / App Password'
                  : 'Manual SMTP / App Password Connection'}
              </span>
              <div className="flex-grow border-t border-slate-800" />
            </div>

            {addFormError && (
              <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{addFormError}</span>
              </div>
            )}

            <form onSubmit={handleAddAccount} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-medium">{t('accounts.nicknameLabel')}</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder={t('accounts.nicknamePlaceholder')}
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">{t('accounts.emailLabel')}</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value, smtpUser: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder={t('accounts.emailPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-slate-300 font-medium">{t('accounts.serverLabel')}</label>
                  <input
                    type="text"
                    required
                    value={formData.smtpHost}
                    onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">{t('accounts.portLabel')}</label>
                  <input
                    type="number"
                    required
                    value={formData.smtpPort}
                    onChange={(e) => setFormData({ ...formData, smtpPort: e.target.value })}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                    placeholder="587"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">{t('accounts.passwordLabel')}</label>
                <input
                  type="password"
                  required
                  value={formData.smtpPass}
                  onChange={(e) => setFormData({ ...formData, smtpPass: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder={language === 'es' ? 'Contraseña de Aplicación (16 letras)' : 'App Password (16 characters)'}
                />
              </div>

              {/* Google App Password Tip */}
              <div className="bg-blue-950/40 border border-blue-500/30 rounded-xl p-3 text-[11px] text-blue-200 space-y-1">
                <div className="font-semibold flex items-center justify-between">
                  <span>💡 {language === 'es' ? '¿Usas Gmail o Google Workspace?' : 'Using Gmail or Google Workspace?'}</span>
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline flex items-center gap-1 font-normal text-[10px]"
                  >
                    <span>{language === 'es' ? 'Generar Contraseña de App' : 'Generate App Password'}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <p className="text-slate-300 leading-relaxed text-[10px]">
                  {language === 'es'
                    ? 'Google bloquea las contraseñas habituales en SMTP. Debes generar una Contraseña de Aplicación de 16 letras en Seguridad de tu cuenta de Google.'
                    : 'Google blocks normal account passwords on SMTP. Generate a 16-character App Password in Google Account Security.'}
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">{t('accounts.limitLabel')}</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={formData.dailyLimit}
                  onChange={(e) => setFormData({ ...formData, dailyLimit: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition"
                >
                  {isSaving ? (language === 'es' ? 'Guardando...' : 'Saving...') : t('accounts.saveAndVerify')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
