'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Plus,
  CheckCircle,
  Flame,
  Trash2,
  ExternalLink,
  Clock,
  Lightbulb,
  X
} from 'lucide-react';
import { SenderAccount } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';

export default function SimpleAccountsView() {
  const { currentWorkspace } = useAuth();
  return <SimpleAccountsViewContent key={currentWorkspace.id} workspaceId={currentWorkspace.id} />;
}

function SimpleAccountsViewContent({ workspaceId }: { workspaceId: string }) {
  const { t, language } = useLanguage();
  const { showToast, confirm } = useFeedback();

  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    let active = true;

    fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`, {
      cache: 'no-store'
    })
      .then((res) => res.json())
      .then((data) => {
        if (active && Array.isArray(data)) {
          setAccounts(data);
        }
      })
      .catch((err) => {
        console.error('Error fetching accounts:', err);
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!showAddModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAddModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddModal]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
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
        const savedEmail = formData.email;
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
        await fetchAccounts(workspaceId);
        showToast({
          title: language === 'es' ? 'Cuenta de correo conectada' : 'Email account connected',
          description: savedEmail,
          variant: 'success'
        });
      } else {
        showToast({
          title:
            data?.error ||
            (language === 'es' ? 'Error al conectar la cuenta' : 'Failed to connect account'),
          variant: 'error'
        });
      }
    } catch (err) {
      console.error('Error saving account:', err);
      showToast({
        title: language === 'es' ? 'Error de red al guardar cuenta' : 'Network error saving account',
        variant: 'error'
      });
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
        throw new Error('Failed to disconnect account');
      }
      await fetchAccounts(workspaceId);
      showToast({
        title: language === 'es' ? 'Cuenta desvinculada' : 'Account disconnected',
        description: target?.email,
        variant: 'success'
      });
    } catch (err) {
      console.error(err);
      showToast({
        title:
          language === 'es' ? 'No se pudo desvincular la cuenta' : 'Could not disconnect account',
        variant: 'error'
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-y-auto bg-[#0A0C10] text-[#F3F5F8]">
      <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1D2330] pb-5 gap-4">
          <div>
            <h1 className="text-base font-bold text-[#F3F5F8] flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#E85D2A]" />
              <span>{language === 'es' ? 'Mis Cuentas de Correo' : 'My Email Accounts'}</span>
            </h1>
            <p className="text-xs text-[#949EB0] mt-0.5">
              {language === 'es'
                ? 'Tus casillas conectadas y su nivel de protección para llegar a la bandeja principal (Inbox).'
                : 'Connected sender mailboxes and their health protection to ensure inbox placement.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white text-xs font-semibold px-4 py-2 rounded-lg transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>
              {language === 'es' ? 'Conectar Cuenta de Correo' : 'Connect Mailbox'}
            </span>
          </button>
        </div>

        {/* Friendly Accounts Traffic Light Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-44 rounded-xl bg-[#11141C] border border-[#1D2330] animate-pulse" />
            <div className="h-44 rounded-xl bg-[#11141C] border border-[#1D2330] animate-pulse" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-[#171B26] border border-[#232938] flex items-center justify-center mx-auto text-[#E85D2A]">
              <Mail className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-[#F3F5F8]">
              {language === 'es'
                ? 'Sin cuentas de correo conectadas'
                : 'No email accounts connected'}
            </h3>
            <p className="text-xs text-[#949EB0] max-w-md mx-auto">
              {language === 'es'
                ? 'Conecta tu primera casilla en este workspace para comenzar a enviar campañas.'
                : 'Connect your first sender mailbox in this workspace to start launching campaigns.'}
            </p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white text-xs font-semibold px-4 py-2 rounded-lg transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>
                {language === 'es' ? 'Conectar Cuenta de Correo' : 'Connect Mailbox'}
              </span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((acc) => {
              const health = acc.healthScore ?? 95;
              const isOptimal = health >= 90;
              return (
                <div
                  key={acc.id}
                  className="bg-[#11141C] border border-[#1D2330] hover:border-[#232938] rounded-xl p-5 space-y-4 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#171B26] border border-[#232938] flex items-center justify-center shrink-0">
                        <Mail className="w-5 h-5 text-[#E85D2A]" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold text-[#F3F5F8] truncate">{acc.name}</h3>
                        <p className="text-[11px] text-[#949EB0] font-mono truncate">{acc.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 border ${
                          isOptimal
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOptimal ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                          }`}
                        />
                        <span>
                          {isOptimal
                            ? language === 'es'
                              ? 'Lista para Enviar'
                              : 'Ready'
                            : language === 'es'
                            ? 'Calentando'
                            : 'Warming'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteAccount(acc.id, e)}
                        className="p-1 text-[#949EB0] hover:text-rose-400 transition cursor-pointer"
                        title={language === 'es' ? 'Desconectar cuenta' : 'Disconnect mailbox'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Friendly Health Diagnostic */}
                  <div className="bg-[#171B26] rounded-xl p-3 border border-[#232938] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#949EB0]">
                        {language === 'es'
                          ? 'Salud de Entrega (Inbox Placement):'
                          : 'Inbox Placement Health:'}
                      </span>
                      <span className="font-bold text-emerald-400 font-mono tabular-nums">
                        {health}%
                      </span>
                    </div>
                    <div className="w-full bg-[#0A0C10] h-1.5 rounded-full overflow-hidden border border-[#1D2330]">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{ width: `${health}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[#949EB0] pt-1 flex items-start gap-1.5">
                      {isOptimal ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>
                            {language === 'es'
                              ? 'Autenticación correcta (SPF/DKIM). Tus correos no caen en SPAM.'
                              : 'SPF/DKIM authenticated. Emails reach primary inbox.'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>
                            {language === 'es'
                              ? 'El sistema está aumentando su reputación progresivamente.'
                              : 'Warmup in progress to raise sender domain reputation.'}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Status footer */}
                  <div className="flex items-center justify-between text-[11px] text-[#949EB0] pt-1 border-t border-[#1D2330]">
                    <div className="flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {language === 'es' ? 'Protección Activa' : 'Warmup Guard Active'}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-[#F3F5F8]">
                      {acc.sentToday} / {acc.dailyLimit} {language === 'es' ? 'hoy' : 'today'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowAddModal(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#11141C] border border-[#232938] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#1D2330] pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-[#E85D2A]" />
                <h3 className="font-bold text-[#F3F5F8] text-sm">
                  {language === 'es'
                    ? 'Conectar Cuenta de Correo (Gmail / SMTP)'
                    : 'Connect Email Account'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label={t('common.close')}
                className="p-1.5 rounded-lg text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="space-y-3">
              <div>
                <label className="text-xs text-[#949EB0] font-medium">
                  {language === 'es' ? 'Nombre o Identificador' : 'Mailbox Nickname'}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none"
                  placeholder="Ej: Ventas Gmail"
                />
              </div>

              <div>
                <label className="text-xs text-[#949EB0] font-medium">
                  {language === 'es' ? 'Correo Electrónico' : 'Email Address'}
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value, smtpUser: e.target.value })
                  }
                  className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none"
                  placeholder="tunombre@gmail.com o empresa.com"
                />
              </div>

              <div>
                <label className="text-xs text-[#949EB0] font-medium">
                  {language === 'es' ? 'Contraseña de Aplicación' : 'App Password'}
                </label>
                <input
                  type="password"
                  required
                  value={formData.smtpPass}
                  onChange={(e) => setFormData({ ...formData, smtpPass: e.target.value })}
                  className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none"
                  placeholder={
                    language === 'es'
                      ? 'Contraseña de 16 letras generada en Google'
                      : '16-character app password'
                  }
                />
              </div>

              {/* Google App Password Tip */}
              <div className="bg-[#171B26] border border-[#232938] rounded-xl p-3 text-[11px] text-[#F3F5F8] space-y-1">
                <div className="font-semibold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-[#E85D2A] shrink-0" />
                    <span>
                      {language === 'es' ? 'Para cuentas de Gmail:' : 'For Gmail accounts:'}
                    </span>
                  </span>
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline flex items-center gap-1 font-normal text-[10px]"
                  >
                    <span>
                      {language === 'es' ? 'Crear Contraseña' : 'Create Password'}
                    </span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <p className="text-[#949EB0] leading-relaxed text-[10px]">
                  {language === 'es'
                    ? 'No uses tu contraseña normal. Google requiere una "Contraseña de Aplicación" de 16 caracteres desde Cuenta de Google > Seguridad.'
                    : 'Google requires a 16-character App Password generated under Google Account > Security.'}
                </p>
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
                    : language === 'es'
                    ? 'Conectar y Guardar'
                    : 'Connect & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
