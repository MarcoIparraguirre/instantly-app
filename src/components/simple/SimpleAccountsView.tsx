'use client';

import React, { useState } from 'react';
import { 
  Mail, ShieldCheck, Plus, CheckCircle, Flame, Server, AlertCircle 
} from 'lucide-react';
import { SenderAccount } from '@/types';
import { initialEmailAccountsWithWarmup } from '@/core/storage/mockData';
import { useLanguage } from '@/context/LanguageContext';

export default function SimpleAccountsView() {
  const { t, language } = useLanguage();
  const [accounts, setAccounts] = useState<SenderAccount[]>(initialEmailAccountsWithWarmup);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: 'Sales Mailbox',
    email: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpUser: '',
    smtpPass: '',
    dailyLimit: '50'
  });

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const newAcc: SenderAccount = {
      id: `acc-${Date.now()}`,
      name: formData.name,
      email: formData.email,
      provider: 'smtp',
      smtpHost: formData.smtpHost,
      smtpPort: Number(formData.smtpPort) || 587,
      smtpUser: formData.smtpUser,
      smtpPass: formData.smtpPass,
      dailyLimit: Number(formData.dailyLimit) || 50,
      sentToday: 0,
      status: 'active',
      warmupEnabled: true,
      warmupToday: 2,
      warmupTotal: 2,
      warmupRescueRate: 100,
      healthScore: 95
    };
    setAccounts([...accounts, newAcc]);
    setShowAddModal(false);
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

                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                  isOptimal
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isOptimal ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {isOptimal
                    ? (language === 'es' ? 'Lista para Enviar' : 'Ready to Send')
                    : (language === 'es' ? 'En Preparación' : 'Warming up')}
                </span>
              </div>

              {/* Friendly Health Banner */}
              <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800/80 text-xs space-y-2">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {language === 'es' ? 'Salud del Dominio' : 'Domain Health Score'}
                  </span>
                  <span className="font-bold text-white font-mono">{acc.healthScore}% (Excelente)</span>
                </div>

                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${acc.healthScore}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>{language === 'es' ? 'Enviados hoy:' : 'Sent today:'}</span>
                  <span className="text-white font-mono">{acc.sentToday} / {acc.dailyLimit}</span>
                </div>
              </div>

              {/* Automatic Warmup Indicator */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span className="flex items-center gap-1 text-amber-400 font-medium">
                  <Flame className="w-3.5 h-3.5" />
                  {language === 'es' ? 'Calentamiento automático activo' : 'Auto-warmup active'}
                </span>
                <span className="text-slate-500">
                  {language === 'es' ? 'Protege contra spam' : 'Guards against spam'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect Mailbox Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              {language === 'es' ? 'Conectar Cuenta de Correo (SMTP)' : 'Connect Email Account (SMTP)'}
            </h2>

            <form onSubmit={handleAddAccount} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-medium">
                  {language === 'es' ? 'Nombre o Remitente' : 'Sender Name'}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder="ej. Alex Ventas"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value, smtpUser: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder="alex@tuempresa.com"
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
                  placeholder="Contraseña de aplicación generada en Google o Outlook"
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition"
                >
                  {language === 'es' ? 'Conectar y Activar' : 'Connect & Activate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
