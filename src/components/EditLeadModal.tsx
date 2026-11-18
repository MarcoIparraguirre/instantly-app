'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, UserCheck, Plus, Trash2, RefreshCw } from 'lucide-react';
import { Lead, LeadStatus } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface EditLeadModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSaved: (updated: Lead) => void;
}

export default function EditLeadModal({
  isOpen,
  lead,
  onClose,
  onSaved
}: EditLeadModalProps) {
  const { language } = useLanguage();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<LeadStatus>('pending');
  const [customVars, setCustomVars] = useState<{ key: string; value: string }[]>([]);
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarVal, setNewVarVal] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      setEmail(lead.email || '');
      setFirstName(lead.firstName || '');
      setLastName(lead.lastName || '');
      setCompanyName(lead.companyName || '');
      setWebsite(lead.website || '');
      setStatus(lead.status || 'pending');
      const entries = Object.entries(lead.customVariables || {}).map(([key, value]) => ({
        key,
        value: String(value ?? '')
      }));
      setCustomVars(entries);
      setErrorMsg(null);
    }
  }, [lead]);

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

  if (!isOpen || !lead) return null;

  const handleStatusChange = (nextStatus: LeadStatus) => {
    setStatus(nextStatus);
    const labelMap: Record<LeadStatus, string> = {
      pending: 'Pendiente',
      sent: 'Enviado',
      opened: 'Abierto',
      replied: 'Respondido',
      bounced: 'Rebotado',
      unsubscribed: 'Desuscripto',
      completed: 'Secuencia Completa'
    };
    setCustomVars(prev =>
      prev.map(item =>
        item.key.toUpperCase() === 'ESTADO'
          ? { ...item, value: labelMap[nextStatus] || nextStatus }
          : item
      )
    );
  };

  const handleUpdateVarValue = (idx: number, val: string) => {
    setCustomVars(prev => prev.map((item, i) => (i === idx ? { ...item, value: val } : item)));
  };

  const handleDeleteVar = (idx: number) => {
    setCustomVars(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddCustomVar = () => {
    const trimmedKey = newVarKey.trim();
    if (!trimmedKey) return;
    setCustomVars(prev => [...prev, { key: trimmedKey, value: newVarVal }]);
    setNewVarKey('');
    setNewVarVal('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg(language === 'es' ? 'Ingresa un email válido.' : 'Please enter a valid email.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    const rebuiltCustomVars: Record<string, string> = {};
    for (const item of customVars) {
      if (item.key.trim()) {
        rebuiltCustomVars[item.key.trim()] = item.value;
      }
    }

    const updatedLead: Lead = {
      ...lead,
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      companyName: companyName.trim(),
      website: website.trim(),
      status,
      customVariables: rebuiltCustomVars
    };

    try {
      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_lead',
          lead: updatedLead
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar el contacto');
      }

      onSaved(updatedLead);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando cambios');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {language === 'es' ? 'Editar Datos del Contacto (Lead)' : 'Edit Contact Data'}
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">{lead.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Basic Fields & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">
                {language === 'es' ? 'Estado del Contacto' : 'Contact Status'}
              </label>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-white font-semibold focus:outline-none"
              >
                <option value="pending">⏳ Pendiente (Por enviar)</option>
                <option value="sent">✅ Enviado (Contactado)</option>
                <option value="opened">👁️ Abierto</option>
                <option value="replied">💬 Respondido</option>
                <option value="bounced">⚠️ Rebotado (Error de entrega)</option>
                <option value="unsubscribed">🚫 Desuscripto</option>
                <option value="completed">🏁 {language === 'es' ? 'Secuencia Completa' : 'Completed'}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">
                {language === 'es' ? 'Nombre' : 'First Name'}
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">
                {language === 'es' ? 'Empresa / Sitio Web' : 'Company / Website'}
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Custom Variables from Sheet / CSV */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">
                {language === 'es'
                  ? 'Variables Personalizadas de la Hoja / CSV:'
                  : 'Custom Sheet / CSV Variables:'}
              </span>
              <span className="text-[11px] text-slate-400">
                {customVars.length} {language === 'es' ? 'columnas' : 'columns'}
              </span>
            </div>

            <div className="space-y-2.5">
              {customVars.map((item, idx) => {
                const isLongText = item.value.length > 70 || item.key.toUpperCase() === 'CUERPO';
                return (
                  <div
                    key={idx}
                    className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-blue-400">
                        {`{{${item.key}}}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteVar(idx)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition cursor-pointer"
                        title={language === 'es' ? 'Eliminar variable' : 'Remove variable'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {isLongText ? (
                      <textarea
                        rows={4}
                        value={item.value}
                        onChange={(e) => handleUpdateVarValue(idx, e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none leading-relaxed"
                      />
                    ) : (
                      <input
                        type="text"
                        value={item.value}
                        onChange={(e) => handleUpdateVarValue(idx, e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add new custom variable */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder={language === 'es' ? 'Nueva columna (ej: CARGO)' : 'New column key'}
                value={newVarKey}
                onChange={(e) => setNewVarKey(e.target.value)}
                className="w-40 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder={language === 'es' ? 'Valor...' : 'Value...'}
                value={newVarVal}
                onChange={(e) => setNewVarVal(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddCustomVar}
                disabled={!newVarKey.trim()}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-blue-400 font-semibold px-3 py-2 rounded-xl border border-slate-700 transition cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'es' ? 'Agregar' : 'Add'}</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition cursor-pointer"
            >
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold shadow-lg shadow-blue-600/25 flex items-center gap-1.5 transition cursor-pointer"
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{language === 'es' ? 'Guardar Cambios' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
