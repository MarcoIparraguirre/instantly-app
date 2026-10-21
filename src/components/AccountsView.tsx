'use client';

import React, { useState, useEffect } from 'react';
import { 
  Mail, Plus, ShieldCheck, Server, Flame, 
  X, CheckCircle, AlertTriangle, Activity, Trash2, ExternalLink
} from 'lucide-react';
import { SenderAccount } from '@/types';
import { initialEmailAccountsWithWarmup } from '@/core/storage/mockData';
import { useLanguage } from '@/context/LanguageContext';

export default function AccountsView() {
  const { t, language } = useLanguage();
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<SenderAccount | null>(null);
  const [drawerTab, setDrawerTab] = useState<'general' | 'warmup' | 'dns'>('dns');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: 'Sales Mailbox 1',
    email: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpUser: '',
    smtpPass: '',
    dailyLimit: '50'
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

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
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
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
      }
    } catch (err) {
      console.error('Error saving account:', err);
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

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-blue-600/30 transition"
        >
          <Plus className="w-4 h-4" />
          {t('accounts.addBtn')}
        </button>
      </div>

      {/* High-Density Account Table */}
      <div className="flex-1 p-8 overflow-y-auto">
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
                  onClick={() => setSelectedAccount(acc)}
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
                <p className="text-xs text-slate-400">
                  {t('accounts.dnsSubtitle')}
                </p>

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
                      <div className="text-slate-400 text-[10px] uppercase">Sent Today</div>
                      <div className="text-lg font-bold text-white mt-1">{selectedAccount.warmupToday} emails</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px] uppercase">Total Warmup Exchanged</div>
                      <div className="text-lg font-bold text-amber-400 mt-1">{selectedAccount.warmupTotal} emails</div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>{t('accounts.warmupRampUp')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: General Settings */}
            {drawerTab === 'general' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">SMTP Host</label>
                  <input
                    type="text"
                    disabled
                    value={`${selectedAccount.smtpHost}:${selectedAccount.smtpPort}`}
                    className="w-full bg-slate-850 bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-slate-300"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Daily Sending Limit</label>
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
      )}

      {/* Add Mailbox Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              {t('accounts.modalTitle')}
            </h2>

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
