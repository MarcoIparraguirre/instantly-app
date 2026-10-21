'use client';

import React, { useState, useEffect } from 'react';
import { 
  Mail, ShieldCheck, Plus, CheckCircle, Flame, Server, AlertCircle, Trash2, ExternalLink 
} from 'lucide-react';
import { SenderAccount } from '@/types';
import { initialEmailAccountsWithWarmup } from '@/core/storage/mockData';
import { useLanguage } from '@/context/LanguageContext';

export default function SimpleAccountsView() {
  const { t, language } = useLanguage();
  const [accounts, setAccounts] = useState<SenderAccount[]>(initialEmailAccountsWithWarmup);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: 'Sales Mailbox',
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
      if (Array.isArray(data) && data.length > 0) {
        setAccounts(data);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
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
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#0b0f17] p-8 max-w-4xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-base font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-500" />
            {language === 'es' ? 'Mis Cuentas de Correo' : 'My Email Accounts'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {language === 'es'
              ? 'Tus casillas conectadas y su nivel de protección para llegar a la bandeja principal (Inbox).'
              : 'Connected sender mailboxes and their health protection to ensure inbox placement.'}
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition"
        >
          <Plus className="w-4 h-4" />
          <span>{language === 'es' ? 'Conectar Cuenta de Correo' : 'Connect Mailbox'}</span>
        </button>
      </div>

      {/* Friendly Accounts Traffic Light Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((acc) => {
          const isOptimal = (acc.healthScore || 90) >= 90;
          return (
            <div
              key={acc.id}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">{acc.name}</h3>
                    <p className="text-[11px] text-slate-400 font-mono">{acc.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                    isOptimal
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isOptimal ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    {isOptimal
                      ? (language === 'es' ? '🟢 Lista para Enviar' : '🟢 Ready')
                      : (language === 'es' ? '🟡 Calentando' : '🟡 Warming')}
                  </span>
                  <button
                    onClick={(e) => handleDeleteAccount(acc.id, e)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition"
                    title={language === 'es' ? 'Desconectar cuenta' : 'Disconnect mailbox'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Friendly Health Diagnostic */}
              <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    {language === 'es' ? 'Salud de Entrega (Inbox Placement):' : 'Inbox Placement Health:'}
                  </span>
                  <span className="font-bold text-emerald-400 font-mono">{acc.healthScore || 95}%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${acc.healthScore || 95}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 pt-1">
                  {isOptimal
                    ? (language === 'es'
                        ? '✓ Autenticación correcta (SPF/DKIM). Tus correos no caen en SPAM.'
                        : '✓ SPF/DKIM authenticated. Emails reach primary inbox.')
                    : (language === 'es'
                        ? '⏳ El sistema está aumentando su reputación progresivamente.'
                        : '⏳ Warmup in progress to raise sender domain reputation.')}
                </p>
              </div>

              {/* Status footer */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>{language === 'es' ? 'Protección Activa' : 'Warmup Guard Active'}</span>
                </div>
                <div className="font-mono text-slate-300">
                  {acc.sentToday} / {acc.dailyLimit} {language === 'es' ? 'hoy' : 'today'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-white text-sm">
                  {language === 'es' ? 'Conectar Cuenta de Correo (Gmail / SMTP)' : 'Connect Email Account'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-medium">
                  {language === 'es' ? 'Nombre o Identificador' : 'Mailbox Nickname'}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder="Ej: Ventas Gmail"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">
                  {language === 'es' ? 'Correo Electrónico' : 'Email Address'}
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value, smtpUser: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder="tunombre@gmail.com o empresa.com"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">
                  {language === 'es' ? 'Contraseña de Aplicación' : 'App Password'}
                </label>
                <input
                  type="password"
                  required
                  value={formData.smtpPass}
                  onChange={(e) => setFormData({ ...formData, smtpPass: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder={language === 'es' ? 'Contraseña de 16 letras generada en Google' : '16-character app password'}
                />
              </div>

              {/* Google App Password Tip */}
              <div className="bg-blue-950/40 border border-blue-500/30 rounded-xl p-3 text-[11px] text-blue-200 space-y-1">
                <div className="font-semibold flex items-center justify-between">
                  <span>💡 {language === 'es' ? 'Para cuentas de Gmail:' : 'For Gmail accounts:'}</span>
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline flex items-center gap-1 font-normal text-[10px]"
                  >
                    <span>{language === 'es' ? 'Crear Contraseña' : 'Create Password'}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <p className="text-slate-300 leading-relaxed text-[10px]">
                  {language === 'es'
                    ? 'No uses tu contraseña normal. Google requiere una "Contraseña de Aplicación" de 16 caracteres desde Cuenta de Google > Seguridad.'
                    : 'Google requires a 16-character App Password generated under Google Account > Security.'}
                </p>
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
                  {isSaving ? (language === 'es' ? 'Guardando...' : 'Saving...') : (language === 'es' ? 'Conectar y Guardar' : 'Connect & Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
