'use client';

import React, { useState, useEffect } from 'react';
import { Mail, Plus, X, Sparkles, Check, Send, CheckCircle2 } from 'lucide-react';
import { Campaign, SenderAccount } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAdminProfile } from '@/context/AdminProfileContext';

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (campaign: Campaign) => void;
}

export default function CreateCampaignModal({
  isOpen,
  onClose,
  onCreated
}: CreateCampaignModalProps) {
  const { language } = useLanguage();
  const { profile } = useAdminProfile();
  const isEs = language === 'es';

  const [name, setName] = useState('');
  const [templateType, setTemplateType] = useState<'b2b' | 'short' | 'blank'>('b2b');
  const [dailyLimit, setDailyLimit] = useState(50);
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/accounts')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setAccounts(data);
            setSelectedAccountIds([data[0].id]);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

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
                  body: initialBody
                }
              ]
            }
          ],
          schedule: {
            timing: { from: '09:00', to: '17:00' },
            days: [1, 2, 3, 4, 5],
            timezone: 'America/New_York',
            dailyLimit,
            strategy: 'office-hours'
          },
          senderAccountIds: selectedAccountIds.length > 0 
            ? selectedAccountIds 
            : (accounts.length > 0 ? [accounts[0].id] : [])
        })
      });

      if (!res.ok) {
        throw new Error('Error al crear la campaña en el servidor');
      }

      const created = await res.json();
      onCreated(created);
      onClose();
      setName('');
    } catch (err: any) {
      setError(err.message || 'Error al crear la campaña');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {isEs ? 'Crear Nueva Campaña' : 'Create New Campaign'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEs ? 'Configura tu secuencia de correos en frío' : 'Set up your cold email sequence'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 text-red-300 rounded-xl text-xs">
              {error}
            </div>
          )}

          {/* Campaign Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isEs ? 'Nombre de la Campaña' : 'Campaign Name'}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isEs ? 'ej: Prospección SaaS Q4' : 'e.g., Q4 SaaS Outbound'}
              className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none transition"
            />
          </div>

          {/* Quick-Start Template Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              {isEs ? 'Plantilla Inicial Recomendada' : 'Initial Template'}
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setTemplateType('b2b')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  templateType === 'b2b'
                    ? 'bg-blue-600/10 border-blue-500 text-white'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold text-white mb-1">
                  {isEs ? 'Pitch Directo' : 'Direct Pitch'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {isEs ? 'Eficaz para founders y ejecutivos' : 'High reply rate for founders'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTemplateType('short')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  templateType === 'short'
                    ? 'bg-blue-600/10 border-blue-500 text-white'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold text-white mb-1">
                  {isEs ? 'Consulta Corta' : 'Quick Question'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {isEs ? 'Solo 3 líneas, alta apertura' : '3 lines, max open rate'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTemplateType('blank')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  templateType === 'blank'
                    ? 'bg-blue-600/10 border-blue-500 text-white'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold text-white mb-1">
                  {isEs ? 'En Blanco' : 'Blank'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {isEs ? 'Redacta desde cero' : 'Start from scratch'}
                </div>
              </button>
            </div>
          </div>

          {/* Sender Account Selection */}
          {accounts.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-400" />
                <span>{isEs ? 'Casilla de Correo Remitente' : 'Sender Email Account'}</span>
              </label>
              <div className="space-y-1.5">
                {accounts.map(acc => {
                  const isSelected = selectedAccountIds.includes(acc.id);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => {
                        if (isSelected && selectedAccountIds.length > 1) {
                          setSelectedAccountIds(prev => prev.filter(id => id !== acc.id));
                        } else if (!isSelected) {
                          setSelectedAccountIds(prev => [...prev, acc.id]);
                        }
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition ${
                        isSelected 
                          ? 'bg-blue-600/15 border-blue-500/50 text-white' 
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-[10px]">
                          {acc.provider === 'google' ? 'G' : 'M'}
                        </div>
                        <div>
                          <span className="font-semibold text-white">{acc.name || acc.email}</span>
                          <span className="text-[11px] text-slate-400 ml-2 font-mono">({acc.email})</span>
                        </div>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-blue-400" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-700" />
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
              <label className="text-xs font-semibold text-slate-300">
                {isEs ? 'Límite Diario de Envíos' : 'Daily Sending Limit'}
              </label>
              <span className="text-xs font-bold text-blue-400">{dailyLimit} correos/día</span>
            </div>
            <input
              type="range"
              min="10"
              max="200"
              step="10"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
              className="w-full accent-blue-500 bg-slate-800 rounded-lg cursor-pointer h-2"
            />
            <div className="text-[10px] text-slate-500 mt-1">
              {isEs ? '💡 Recomendación: 50/día para proteger la reputación de tu dominio.' : '💡 Tip: 50/day protects domain reputation.'}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
            >
              {isEs ? 'Cancelar' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-5 py-2 rounded-xl text-xs shadow-lg shadow-blue-600/20 transition disabled:opacity-50"
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
