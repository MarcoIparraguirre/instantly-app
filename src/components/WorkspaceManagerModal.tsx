'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Plus, Edit2, Trash2, X } from 'lucide-react';
import { Workspace, WorkspacePlan, SAAS_PLANS, normalizePlan } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';

interface WorkspaceManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  onSelectWorkspace: (ws: Workspace) => void;
  onUpdateWorkspaces: (workspaces: Workspace[]) => void;
}

export default function WorkspaceManagerModal({
  isOpen,
  onClose,
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  onUpdateWorkspaces,
}: WorkspaceManagerModalProps) {
  const { language } = useLanguage();
  const isEs = language === 'es';
  const { createWorkspace } = useAuth();
  const { showToast, confirm } = useFeedback();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editClient, setEditClient] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newPlan, setNewPlan] = useState<WorkspacePlan>('growth');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleStartEdit = (ws: Workspace) => {
    setEditingId(ws.id);
    setEditName(ws.name);
    setEditClient(ws.clientName || '');
  };

  const handleSaveEdit = (wsId: string) => {
    if (!editName.trim()) {
      showToast({
        title: isEs ? 'Nombre requerido' : 'Name required',
        description: isEs
          ? 'Ingresa un nombre válido para el espacio de trabajo.'
          : 'Enter a valid workspace name.',
        variant: 'warning',
      });
      return;
    }
    const updated = workspaces.map((w) =>
      w.id === wsId
        ? { ...w, name: editName.trim(), clientName: editClient.trim() || 'Internal' }
        : w
    );
    onUpdateWorkspaces(updated);
    setEditingId(null);

    if (currentWorkspace.id === wsId) {
      const active = updated.find((w) => w.id === wsId);
      if (active) onSelectWorkspace(active);
    }

    showToast({
      title: isEs ? 'Workspace actualizado' : 'Workspace updated',
      description: editName.trim(),
      variant: 'success',
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const res = await createWorkspace({
      name: newName.trim(),
      clientName: newClient.trim() || (isEs ? 'Interno' : 'Internal'),
      plan: newPlan,
    });
    setIsSubmitting(false);

    if (res.error || !res.workspace) {
      showToast({
        title: isEs ? 'Error al crear workspace' : 'Failed to create workspace',
        description: res.error || (isEs ? 'Intenta nuevamente.' : 'Please try again.'),
        variant: 'error',
      });
      return;
    }

    onSelectWorkspace(res.workspace);
    showToast({
      title: isEs ? 'Workspace creado y activado' : 'Workspace created & activated',
      description: `${res.workspace.name} (${SAAS_PLANS[normalizePlan(res.workspace.plan)].name})`,
      variant: 'success',
    });
    setNewName('');
    setNewClient('');
    setNewPlan('growth');
    setIsCreating(false);
  };

  const handleDelete = async (wsId: string) => {
    if (workspaces.length <= 1) {
      showToast({
        title: isEs ? 'Workspace requerido' : 'Workspace required',
        description: isEs
          ? 'Debes tener al menos un espacio de trabajo activo.'
          : 'You must have at least one active workspace.',
        variant: 'warning',
      });
      return;
    }

    const target = workspaces.find((w) => w.id === wsId);
    const confirmed = await confirm({
      title: isEs ? 'Eliminar espacio de trabajo' : 'Delete workspace',
      description: isEs
        ? `¿Estás seguro de eliminar "${target?.name || wsId}"? Sus configuraciones quedarán archivadas.`
        : `Are you sure you want to delete "${target?.name || wsId}"? Its settings will be archived.`,
      confirmLabel: isEs ? 'Eliminar' : 'Delete',
      cancelLabel: isEs ? 'Cancelar' : 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    const updated = workspaces.filter((w) => w.id !== wsId);
    onUpdateWorkspaces(updated);

    if (currentWorkspace.id === wsId && updated.length > 0) {
      onSelectWorkspace(updated[0]);
    }

    showToast({
      title: isEs ? 'Workspace eliminado' : 'Workspace deleted',
      description: target?.name || wsId,
      variant: 'info',
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEs ? 'Gestión de Espacios de Trabajo' : 'Workspace Management'}
      onClick={onClose}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#DCE3DF] text-[#14213D] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#DCE3DF]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D5ECD4]/60 border border-[#C3DAC3] flex items-center justify-center text-[#14213D]">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#14213D] leading-tight">
                {isEs ? 'Gestión de Espacios de Trabajo' : 'Workspace Management'}
              </h2>
              <p className="text-xs text-[#5C6F68]">
                {isEs
                  ? 'Organiza tus clientes, marcas o campañas en entornos separados'
                  : 'Separate clients, brands or outbound campaigns'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={isEs ? 'Cerrar modal' : 'Close modal'}
            className="w-8 h-8 rounded-lg bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] text-[#5C6F68] hover:text-[#14213D] flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Workspace List */}
        <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
          {workspaces.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-[#A1B0AB] bg-[#F4F7F5] text-center text-xs text-[#5C6F68]">
              {isEs
                ? 'Todavía no tienes espacios de trabajo. Crea el primero abajo.'
                : 'No workspaces yet. Create the first one below.'}
            </div>
          ) : (
            workspaces.map((ws) => {
            const isActive = currentWorkspace.id === ws.id;
            const isEditing = editingId === ws.id;
            const planCfg = SAAS_PLANS[normalizePlan(ws.plan)];

            if (isEditing) {
              return (
                <div
                  key={ws.id}
                  className="p-3 bg-[#EEF3F0] border border-[#14213D]/40 rounded-xl space-y-2.5"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#5C6F68] font-semibold uppercase">
                        {isEs ? 'Nombre del Espacio' : 'Workspace Name'}
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full mt-1 bg-[#F4F7F5] border border-[#DCE3DF] rounded-lg px-3 py-1.5 text-xs text-[#14213D] focus:outline-none focus:border-[#14213D]"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#5C6F68] font-semibold uppercase">
                        {isEs ? 'Cliente / Organización' : 'Client / Org'}
                      </label>
                      <input
                        type="text"
                        value={editClient}
                        onChange={(e) => setEditClient(e.target.value)}
                        className="w-full mt-1 bg-[#F4F7F5] border border-[#DCE3DF] rounded-lg px-3 py-1.5 text-xs text-[#14213D] focus:outline-none focus:border-[#14213D]"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 text-xs text-[#5C6F68] hover:text-[#14213D] cursor-pointer"
                    >
                      {isEs ? 'Cancelar' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(ws.id)}
                      className="px-3 py-1 bg-[#14213D] hover:bg-[#1E3158] text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      {isEs ? 'Guardar' : 'Save'}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={ws.id}
                className={`p-3.5 rounded-xl border transition flex items-center justify-between ${
                  isActive
                    ? 'bg-[#D5ECD4]/40 border-[#C3DAC3] shadow-sm'
                    : 'bg-[#F4F7F5] border-[#DCE3DF] hover:border-[#A1B0AB]'
                }`}
              >
                <div
                  onClick={() => onSelectWorkspace(ws)}
                  className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isActive
                        ? 'bg-[#14213D] text-white'
                        : 'bg-white border border-[#DCE3DF] text-[#5C6F68]'
                    }`}
                  >
                    {ws.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-[#14213D] truncate">
                        {ws.name}
                      </span>
                      <span className="text-[10px] bg-white text-[#5C6F68] border border-[#DCE3DF] px-1.5 py-0.5 rounded-lg font-mono shrink-0">
                        {planCfg.name}
                      </span>
                      {isActive && (
                        <span className="text-[10px] bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3] px-2 py-0.5 rounded-lg font-semibold shrink-0">
                          {isEs ? 'Activo' : 'Active'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#5C6F68] truncate mt-0.5 flex items-center gap-2">
                      <span>{ws.clientName || 'Vectra Systems'}</span>
                      <span>•</span>
                      <span className="font-mono tabular-nums">
                        {ws.credits.toLocaleString()} {isEs ? 'créditos' : 'credits'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(ws)}
                    className="p-1.5 text-[#5C6F68] hover:text-[#14213D] hover:bg-white rounded-lg transition cursor-pointer"
                    title={isEs ? 'Editar nombre' : 'Edit name'}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {workspaces.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDelete(ws.id)}
                      className="p-1.5 text-[#5C6F68] hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title={isEs ? 'Eliminar espacio' : 'Delete workspace'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
          )}
        </div>

        {/* Create New Workspace Accordion */}
        {isCreating ? (
          <form
            onSubmit={handleCreate}
            className="p-4 bg-[#EEF3F0]/60 border border-[#DCE3DF] rounded-xl space-y-3"
          >
            <h3 className="text-xs font-bold text-[#14213D] flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-[#14213D]" />
              <span>{isEs ? 'Nuevo Espacio de Trabajo' : 'New Workspace'}</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-[#5C6F68] font-semibold uppercase">
                  {isEs ? 'Nombre del Espacio' : 'Workspace Name'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isEs ? 'Ej: Campañas Inmobiliarias' : 'e.g. FinTech Outbound'}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full mt-1 bg-[#F4F7F5] border border-[#DCE3DF] rounded-lg px-3 py-1.5 text-xs text-[#14213D] placeholder-[#A1B0AB] focus:outline-none focus:border-[#14213D]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#5C6F68] font-semibold uppercase">
                  {isEs ? 'Cliente u Organización' : 'Client or Organization'}
                </label>
                <input
                  type="text"
                  placeholder={isEs ? 'Ej: Cliente ABC' : 'e.g. Acme Corp'}
                  value={newClient}
                  onChange={(e) => setNewClient(e.target.value)}
                  className="w-full mt-1 bg-[#F4F7F5] border border-[#DCE3DF] rounded-lg px-3 py-1.5 text-xs text-[#14213D] placeholder-[#A1B0AB] focus:outline-none focus:border-[#14213D]"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-[#5C6F68] font-semibold uppercase block mb-1.5">
                {isEs ? 'Plan SaaS Inicial (7d prueba)' : 'Initial SaaS Plan (7d trial)'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['starter', 'growth', 'agency'] as WorkspacePlan[]).map((p) => {
                  const cfg = SAAS_PLANS[p];
                  const selected = newPlan === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewPlan(p)}
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                        selected
                          ? 'bg-[#D5ECD4]/50 border-[#14213D] text-[#14213D]'
                          : 'bg-[#F4F7F5] border-[#DCE3DF] text-[#5C6F68] hover:border-[#A1B0AB]'
                      }`}
                    >
                      <div className="text-xs font-bold text-[#14213D]">{cfg.name}</div>
                      <div className="text-[10px] text-[#5C6F68] font-mono tabular-nums">
                        ${cfg.monthlyPriceUsd}/m
                      </div>
                      <div className="text-[9px] text-emerald-700 font-semibold font-mono tabular-nums mt-0.5">
                        {cfg.maxAccounts === 999 ? '∞' : cfg.maxAccounts}{' '}
                        {isEs ? 'casillas' : 'mailboxes'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs text-[#5C6F68] hover:text-[#14213D] cursor-pointer"
              >
                {isEs ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-[#14213D] hover:bg-[#1E3158] text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting
                  ? isEs
                    ? 'Creando...'
                    : 'Creating...'
                  : isEs
                    ? 'Crear Espacio'
                    : 'Create Workspace'}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="w-full py-2.5 px-4 bg-[#F4F7F5] hover:bg-[#EEF3F0] border border-dashed border-[#A1B0AB] hover:border-[#14213D] rounded-xl text-xs font-semibold text-[#5C6F68] hover:text-[#14213D] flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#14213D]" />
            <span>
              {isEs ? 'Crear Nuevo Espacio de Trabajo' : 'Create New Workspace'}
            </span>
          </button>
        )}

        <div className="pt-2 border-t border-[#DCE3DF] flex items-center justify-between text-[11px] text-[#5C6F68]">
          <span className="font-mono tabular-nums">
            {workspaces.length} {isEs ? 'espacios configurados' : 'workspaces'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] text-[#14213D] rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            {isEs ? 'Cerrar' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
