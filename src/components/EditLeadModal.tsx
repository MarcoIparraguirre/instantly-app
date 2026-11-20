'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, UserCheck, Plus, Trash2, RefreshCw } from 'lucide-react';
import { Lead, LeadStatus } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';

interface EditLeadModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSaved: (updated: Lead) => void;
}

interface EditLeadFormProps {
  lead: Lead;
  onClose: () => void;
  onSaved: (updated: Lead) => void;
}

function EditLeadForm({ lead, onClose, onSaved }: EditLeadFormProps) {
  const { language } = useLanguage();
  const { currentWorkspace } = useAuth();
  const { showToast } = useFeedback();
  const isEs = language === 'es';

  const [email, setEmail] = useState(lead.email || '');
  const [firstName, setFirstName] = useState(lead.firstName || '');
  const [lastName] = useState(lead.lastName || '');
  const [companyName, setCompanyName] = useState(lead.companyName || '');
  const [website] = useState(lead.website || '');
  const [status, setStatus] = useState<LeadStatus>(lead.status || 'pending');
  const [customVars, setCustomVars] = useState<{ key: string; value: string }[]>(() =>
    Object.entries(lead.customVariables || {}).map(([key, value]) => ({
      key,
      value: String(value ?? ''),
    }))
  );
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarVal, setNewVarVal] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStatusChange = (nextStatus: LeadStatus) => {
    setStatus(nextStatus);
    const labelMap: Record<LeadStatus, string> = {
      pending: 'Pendiente',
      sent: 'Enviado',
      opened: 'Abierto',
      replied: 'Respondido',
      bounced: 'Rebotado',
      unsubscribed: 'Desuscripto',
      completed: 'Secuencia Completa',
    };
    setCustomVars((prev) =>
      prev.map((item) =>
        item.key.toUpperCase() === 'ESTADO'
          ? { ...item, value: labelMap[nextStatus] || nextStatus }
          : item
      )
    );
  };

  const handleUpdateVarValue = (idx: number, val: string) => {
    setCustomVars((prev) => prev.map((item, i) => (i === idx ? { ...item, value: val } : item)));
  };

  const handleDeleteVar = (idx: number) => {
    setCustomVars((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddCustomVar = () => {
    const trimmedKey = newVarKey.trim();
    if (!trimmedKey) return;
    setCustomVars((prev) => [...prev, { key: trimmedKey, value: newVarVal }]);
    setNewVarKey('');
    setNewVarVal('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg(isEs ? 'Ingresa un email válido.' : 'Please enter a valid email.');
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
      workspaceId: lead.workspaceId || currentWorkspace.id,
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      companyName: companyName.trim(),
      website: website.trim(),
      status,
      customVariables: rebuiltCustomVars,
    };

    try {
      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_lead',
          workspaceId: updatedLead.workspaceId,
          lead: updatedLead,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || (isEs ? 'Error al guardar el contacto' : 'Failed to save contact')
        );
      }

      showToast({
        title: isEs ? 'Contacto actualizado' : 'Contact updated',
        description: updatedLead.email,
        variant: 'success',
      });
      onSaved(updatedLead);
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : isEs
            ? 'Error guardando cambios'
            : 'Error saving changes';
      setErrorMsg(msg);
      showToast({
        title: isEs ? 'Error al guardar contacto' : 'Failed to save contact',
        description: msg,
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="bg-white border border-[#DCE3DF] text-[#14213D] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#DCE3DF] flex items-center justify-between bg-[#F4F7F5] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] flex items-center justify-center">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#14213D]">
              {isEs ? 'Editar Datos del Contacto (Lead)' : 'Edit Contact Data'}
            </h2>
            <p className="text-[11px] text-[#5C6F68] font-mono">{lead.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[#5C6F68] hover:text-[#14213D] p-1.5 rounded-lg hover:bg-[#EEF3F0] transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
        {/* Basic Fields & Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[#14213D] font-semibold">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3.5 py-2 text-[#14213D] font-mono focus:outline-none transition"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[#14213D] font-semibold">
              {isEs ? 'Estado del Contacto' : 'Contact Status'}
            </label>
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3.5 py-2 text-[#14213D] font-semibold focus:outline-none transition"
            >
              <option value="pending">
                {isEs ? 'Pendiente (Por enviar)' : 'Pending (To send)'}
              </option>
              <option value="sent">
                {isEs ? 'Enviado (Contactado)' : 'Sent (Contacted)'}
              </option>
              <option value="opened">{isEs ? 'Abierto' : 'Opened'}</option>
              <option value="replied">{isEs ? 'Respondido' : 'Replied'}</option>
              <option value="bounced">
                {isEs ? 'Rebotado (Error de entrega)' : 'Bounced (Delivery error)'}
              </option>
              <option value="unsubscribed">{isEs ? 'Desuscripto' : 'Unsubscribed'}</option>
              <option value="completed">{isEs ? 'Secuencia Completa' : 'Completed'}</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[#14213D] font-semibold">
              {isEs ? 'Nombre' : 'First Name'}
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3.5 py-2 text-[#14213D] focus:outline-none transition"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[#14213D] font-semibold">
              {isEs ? 'Empresa / Sitio Web' : 'Company / Website'}
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3.5 py-2 text-[#14213D] focus:outline-none transition"
            />
          </div>
        </div>

        {/* Custom Variables from Sheet / CSV */}
        <div className="space-y-3 pt-3 border-t border-[#DCE3DF]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#14213D]">
              {isEs
                ? 'Variables Personalizadas de la Hoja / CSV:'
                : 'Custom Sheet / CSV Variables:'}
            </span>
            <span className="text-[11px] text-[#5C6F68] font-mono tabular-nums">
              {customVars.length} {isEs ? 'columnas' : 'columns'}
            </span>
          </div>

          <div className="space-y-2.5">
            {customVars.map((item, idx) => {
              const isLongText = item.value.length > 70 || item.key.toUpperCase() === 'CUERPO';
              return (
                <div
                  key={idx}
                  className="bg-[#F4F7F5] border border-[#DCE3DF] rounded-xl p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-[#14213D] bg-[#D5ECD4] border border-[#C3DAC3] px-2 py-0.5 rounded-md">
                      {`{{${item.key}}}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteVar(idx)}
                      className="text-[#5C6F68] hover:text-rose-700 hover:bg-rose-50 p-1 rounded-lg transition cursor-pointer"
                      title={isEs ? 'Eliminar variable' : 'Remove variable'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {isLongText ? (
                    <textarea
                      rows={4}
                      value={item.value}
                      onChange={(e) => handleUpdateVarValue(idx, e.target.value)}
                      className="w-full bg-white border border-[#DCE3DF] focus:border-[#14213D] rounded-lg p-2.5 text-xs text-[#14213D] focus:outline-none leading-relaxed transition"
                    />
                  ) : (
                    <input
                      type="text"
                      value={item.value}
                      onChange={(e) => handleUpdateVarValue(idx, e.target.value)}
                      className="w-full bg-white border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3 py-1.5 text-xs text-[#14213D] focus:outline-none transition"
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
              placeholder={isEs ? 'Nueva columna (ej: CARGO)' : 'New column key'}
              value={newVarKey}
              onChange={(e) => setNewVarKey(e.target.value)}
              className="w-40 bg-[#F4F7F5] border border-[#DCE3DF] rounded-lg px-3 py-2 text-xs font-mono text-[#14213D] placeholder-[#5C6F68]/70 focus:outline-none focus:border-[#14213D] focus:bg-white transition"
            />
            <input
              type="text"
              placeholder={isEs ? 'Valor...' : 'Value...'}
              value={newVarVal}
              onChange={(e) => setNewVarVal(e.target.value)}
              className="flex-1 bg-[#F4F7F5] border border-[#DCE3DF] rounded-lg px-3 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/70 focus:outline-none focus:border-[#14213D] focus:bg-white transition"
            />
            <button
              type="button"
              onClick={handleAddCustomVar}
              disabled={!newVarKey.trim()}
              className="bg-[#D5ECD4] hover:bg-[#C3DAC3] disabled:opacity-40 text-[#14213D] font-semibold px-3 py-2 rounded-lg border border-[#A1B0AB]/50 transition cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEs ? 'Agregar' : 'Add'}</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
            {errorMsg}
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-3 border-t border-[#DCE3DF]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] text-[#14213D] font-semibold transition cursor-pointer"
          >
            {isEs ? 'Cancelar' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 rounded-lg bg-[#14213D] hover:bg-[#1E3158] disabled:opacity-50 text-white font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isEs ? 'Guardar Cambios' : 'Save Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export default function EditLeadModal({
  isOpen,
  lead,
  onClose,
  onSaved,
}: EditLeadModalProps) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <EditLeadForm key={lead.id} lead={lead} onClose={onClose} onSaved={onSaved} />
    </div>
  );
}
