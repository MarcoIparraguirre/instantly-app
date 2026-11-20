'use client';

import React, { useState, useEffect } from 'react';
import { Mail, Plus, X, CheckCircle2, Lightbulb } from 'lucide-react';
import { Campaign, SenderAccount } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAdminProfile } from '@/context/AdminProfileContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (campaign: Campaign) => void;
}

export default function CreateCampaignModal({
  isOpen,
  onClose,
  onCreated,
}: CreateCampaignModalProps) {
  const { language } = useLanguage();
  const { profile } = useAdminProfile();
  const { currentWorkspace } = useAuth();
  const { showToast } = useFeedback();
  const isEs = language === 'es';

  const [name, setName] = useState('');
  const [templateType, setTemplateType] = useState<'b2b' | 'short' | 'blank'>('b2b');
  const [dailyLimit, setDailyLimit] = useState(50);
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetch(`/api/accounts?workspaceId=${encodeURIComponent(currentWorkspace.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data)) {
          setAccounts(data);
          setSelectedAccountIds(data.length > 0 ? [data[0].id] : []);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, currentWorkspace.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    const senderSign = profile.name || 'Admin';

    let initialSubject = 'Pregunta rápida para {{firstName}}';
    let initialBody = `Hola {{firstName}},\n\nEstuve revisando {{companyName}} y me pareció muy interesante lo que están construyendo.\n\n¿Tendrías 5 minutos el próximo martes para una breve llamada?\n\nSaludos cordiales,\n${senderSign}`;

    if (templateType === 'short') {
      initialSubject = '{{firstName}}, consulta breve sobre {{companyName}}';
      initialBody = `Hola {{firstName}},\n\n¿Cómo gestionan actualmente la prospección en frío en {{companyName}}?\n\nMe encantaría compartirte cómo otros equipos aumentaron sus reuniones en un 40%.\n\nUn saludo,\n${senderSign}`;
    } else if (templateType === 'blank') {
      initialSubject = 'Asunto del correo para {{firstName}}';
      initialBody = `Hola {{firstName}},\n\nEscribe tu propuesta de valor aquí.\n\nSaludos,\n${senderSign}`;
    }

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          name: name.trim(),
          steps: [
            {
              id: crypto.randomUUID(),
              stepNumber: 1,
              waitDays: 0,
              variants: [
                {
                  id: crypto.randomUUID(),
                  name: 'Variante A',
                  subject: initialSubject,
                  body: initialBody,
                },
              ],
            },
          ],
          schedule: {
            timing: { from: '09:00', to: '17:00' },
            days: [1, 2, 3, 4, 5],
            timezone: 'America/New_York',
            dailyLimit,
            strategy: 'office-hours',
          },
          senderAccountIds:
            selectedAccountIds.length > 0
              ? selectedAccountIds
              : accounts.length > 0
                ? [accounts[0].id]
                : [],
        }),
      });

      if (!res.ok) {
        throw new Error(
          isEs ? 'Error al crear la campaña en el servidor' : 'Failed to create campaign on server'
        );
      }

      const created: Campaign = await res.json();
      showToast({
        title: isEs ? 'Campaña creada' : 'Campaign created',
        description: created.name,
        variant: 'success',
      });
      onCreated(created);
      onClose();
      setName('');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : isEs
            ? 'Error al crear la campaña'
            : 'Failed to create campaign';
      setError(msg);
      showToast({
        title: isEs ? 'No se pudo crear la campaña' : 'Could not create campaign',
        description: msg,
        variant: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#DCE3DF] text-[#14213D] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-[#DCE3DF] flex items-center justify-between bg-[#F4F7F5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#14213D] flex items-center justify-center text-white">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#14213D] leading-tight">
                {isEs ? 'Crear Nueva Campaña' : 'Create New Campaign'}
              </h3>
              <p className="text-xs text-[#5C6F68]">
                {isEs ? 'Configura tu secuencia de correos en frío' : 'Set up your cold email sequence'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0] rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
              {error}
            </div>
          )}

          {/* Campaign Name */}
          <div>
            <label className="block text-xs font-semibold text-[#14213D] mb-1.5">
              {isEs ? 'Nombre de la Campaña' : 'Campaign Name'}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isEs ? 'ej: Prospección SaaS Q4' : 'e.g., Q4 SaaS Outbound'}
              className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-4 py-2.5 text-sm text-[#14213D] placeholder-[#5C6F68]/70 focus:outline-none transition"
            />
          </div>

          {/* Quick-Start Template Selector */}
          <div>
            <label className="block text-xs font-semibold text-[#14213D] mb-2">
              {isEs ? 'Plantilla Inicial Recomendada' : 'Initial Template'}
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setTemplateType('b2b')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  templateType === 'b2b'
                    ? 'bg-[#D5ECD4]/55 border-[#14213D] text-[#14213D]'
                    : 'bg-[#F4F7F5] border-[#DCE3DF] text-[#5C6F68] hover:border-[#A1B0AB] hover:text-[#14213D]'
                }`}
              >
                <div className="text-xs font-bold text-[#14213D] mb-1">
                  {isEs ? 'Pitch Directo' : 'Direct Pitch'}
                </div>
                <div className="text-[10px] text-[#5C6F68]">
                  {isEs ? 'Eficaz para founders y ejecutivos' : 'High reply rate for founders'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTemplateType('short')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  templateType === 'short'
                    ? 'bg-[#D5ECD4]/55 border-[#14213D] text-[#14213D]'
                    : 'bg-[#F4F7F5] border-[#DCE3DF] text-[#5C6F68] hover:border-[#A1B0AB] hover:text-[#14213D]'
                }`}
              >
                <div className="text-xs font-bold text-[#14213D] mb-1">
                  {isEs ? 'Consulta Corta' : 'Quick Question'}
                </div>
                <div className="text-[10px] text-[#5C6F68]">
                  {isEs ? 'Solo 3 líneas, alta apertura' : '3 lines, max open rate'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTemplateType('blank')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  templateType === 'blank'
                    ? 'bg-[#D5ECD4]/55 border-[#14213D] text-[#14213D]'
                    : 'bg-[#F4F7F5] border-[#DCE3DF] text-[#5C6F68] hover:border-[#A1B0AB] hover:text-[#14213D]'
                }`}
              >
                <div className="text-xs font-bold text-[#14213D] mb-1">
                  {isEs ? 'En Blanco' : 'Blank'}
                </div>
                <div className="text-[10px] text-[#5C6F68]">
                  {isEs ? 'Redacta desde cero' : 'Start from scratch'}
                </div>
              </button>
            </div>
          </div>

          {/* Sender Account Selection */}
          {accounts.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-[#14213D] mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#14213D]" />
                <span>{isEs ? 'Casilla de Correo Remitente' : 'Sender Email Account'}</span>
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                {accounts.map((acc) => {
                  const isSelected = selectedAccountIds.includes(acc.id);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => {
                        if (isSelected && selectedAccountIds.length > 1) {
                          setSelectedAccountIds((prev) => prev.filter((id) => id !== acc.id));
                        } else if (!isSelected) {
                          setSelectedAccountIds((prev) => [...prev, acc.id]);
                        }
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition ${
                        isSelected
                          ? 'bg-[#D5ECD4]/45 border-[#14213D] text-[#14213D]'
                          : 'bg-[#F4F7F5] border-[#DCE3DF] text-[#5C6F68] hover:border-[#A1B0AB]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] font-mono ${
                            isSelected
                              ? 'bg-[#14213D] text-white'
                              : 'bg-white border border-[#DCE3DF] text-[#5C6F68]'
                          }`}
                        >
                          {acc.provider === 'google' ? 'G' : acc.provider === 'microsoft' ? 'M' : 'S'}
                        </div>
                        <div>
                          <span className="font-semibold text-[#14213D]">{acc.name || acc.email}</span>
                          <span className="text-[11px] text-[#5C6F68] ml-2 font-mono">
                            ({acc.email})
                          </span>
                        </div>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-[#14213D]" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-[#A1B0AB]" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily Sending Limit */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#14213D]">
                {isEs ? 'Límite Diario de Envíos' : 'Daily Sending Limit'}
              </label>
              <span className="text-xs font-bold text-[#14213D] font-mono tabular-nums">
                {dailyLimit} {isEs ? 'correos/día' : 'emails/day'}
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="200"
              step="10"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
              className="w-full accent-[#14213D] bg-[#EEF3F0] rounded-lg cursor-pointer h-2"
            />
            <div className="text-[10px] text-[#5C6F68] mt-1.5 flex items-center gap-1.5">
              <Lightbulb className="w-3 h-3 text-amber-600 shrink-0" />
              <span>
                {isEs
                  ? 'Recomendación: 50/día para proteger la reputación de tu dominio.'
                  : 'Tip: 50/day protects domain reputation.'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DCE3DF]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#14213D] bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] rounded-lg transition cursor-pointer"
            >
              {isEs ? 'Cancelar' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-2 bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold px-5 py-2 rounded-lg text-xs transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>{isEs ? 'Crear Campaña' : 'Create Campaign'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
