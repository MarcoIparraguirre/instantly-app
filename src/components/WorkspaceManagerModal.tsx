'use client';

import React, { useState } from 'react';
import { 
  Building2, Plus, Edit2, Trash2, Check, X, Sparkles, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { Workspace } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

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
  onUpdateWorkspaces
}: WorkspaceManagerModalProps) {
  const { language } = useLanguage();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editClient, setEditClient] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');

  if (!isOpen) return null;

  const handleStartEdit = (ws: Workspace) => {
    setEditingId(ws.id);
    setEditName(ws.name);
    setEditClient(ws.clientName || '');
  };

  const handleSaveEdit = (wsId: string) => {
    if (!editName.trim()) return;
    const updated = workspaces.map(w => 
      w.id === wsId ? { ...w, name: editName.trim(), clientName: editClient.trim() || 'Internal' } : w
    );
    onUpdateWorkspaces(updated);
    setEditingId(null);

    // If currently active was edited, keep current updated
    if (currentWorkspace.id === wsId) {
      const active = updated.find(w => w.id === wsId);
      if (active) onSelectWorkspace(active);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newWs: Workspace = {
      id: `ws-${Date.now()}`,
      name: newName.trim(),
      clientName: newClient.trim() || (language === 'es' ? 'Interno' : 'Internal'),
      credits: 2000
    };

    const updated = [...workspaces, newWs];
    onUpdateWorkspaces(updated);
    onSelectWorkspace(newWs);
    setNewName('');
    setNewClient('');
    setIsCreating(false);
  };

  const handleDelete = (wsId: string) => {
    if (workspaces.length <= 1) {
      alert(language === 'es' 
        ? 'Debes tener al menos un espacio de trabajo activo.' 
        : 'You must have at least one active workspace.');
      return;
    }

    const confirmMsg = language === 'es'
      ? '¿Estás seguro de eliminar este espacio de trabajo? Sus configuraciones se archivarán.'
      : 'Are you sure you want to delete this workspace?';

    if (!confirm(confirmMsg)) return;

    const updated = workspaces.filter(w => w.id !== wsId);
    onUpdateWorkspaces(updated);

    if (currentWorkspace.id === wsId) {
      onSelectWorkspace(updated[0]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#0e1422] border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {language === 'es' ? 'Gestión de Espacios de Trabajo' : 'Workspace Management'}
              </h2>
              <p className="text-xs text-slate-400">
                {language === 'es'
                  ? 'Organiza tus clientes, marcas o campañas en entornos separados'
                  : 'Separate clients, brands or outbound campaigns'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Workspace List */}
        <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
          {workspaces.map((ws) => {
            const isActive = currentWorkspace.id === ws.id;
            const isEditing = editingId === ws.id;

            if (isEditing) {
              return (
                <div key={ws.id} className="p-3 bg-slate-900 border border-blue-500/50 rounded-2xl space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">
                        {language === 'es' ? 'Nombre del Espacio' : 'Workspace Name'}
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">
                        {language === 'es' ? 'Cliente / Organización' : 'Client / Org'}
                      </label>
                      <input
                        type="text"
                        value={editClient}
                        onChange={(e) => setEditClient(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      {language === 'es' ? 'Cancelar' : 'Cancel'}
                    </button>
                    <button
                      onClick={() => handleSaveEdit(ws.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
                    >
                      {language === 'es' ? 'Guardar' : 'Save'}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={ws.id}
                className={`p-3.5 rounded-2xl border transition flex items-center justify-between ${
                  isActive
                    ? 'bg-blue-950/30 border-blue-500/40 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div 
                  onClick={() => onSelectWorkspace(ws)}
                  className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                    isActive ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {ws.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white truncate">{ws.name}</span>
                      {isActive && (
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.2 rounded-full font-semibold">
                          {language === 'es' ? 'Activo' : 'Active'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {ws.clientName || 'Vectra Systems'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleStartEdit(ws)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                    title={language === 'es' ? 'Editar nombre' : 'Edit name'}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {workspaces.length > 1 && (
                    <button
                      onClick={() => handleDelete(ws.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
                      title={language === 'es' ? 'Eliminar espacio' : 'Delete workspace'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Create New Workspace Accordion */}
        {isCreating ? (
          <form onSubmit={handleCreate} className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-blue-400" />
              {language === 'es' ? 'Nuevo Espacio de Trabajo' : 'New Workspace'}
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-slate-400 font-semibold uppercase">
                  {language === 'es' ? 'Nombre del Espacio' : 'Workspace Name'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Campañas Inmobiliarias"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold uppercase">
                  {language === 'es' ? 'Cliente u Organización' : 'Client or Organization'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cliente ABC"
                  value={newClient}
                  onChange={(e) => setNewClient(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/30"
              >
                {language === 'es' ? 'Crear Espacio' : 'Create Workspace'}
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full py-2.5 px-4 bg-slate-900/60 hover:bg-slate-900 border border-dashed border-slate-700 hover:border-blue-500/50 rounded-2xl text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-2 transition"
          >
            <Plus className="w-4 h-4 text-blue-400" />
            <span>{language === 'es' ? '+ Crear Nuevo Espacio de Trabajo' : '+ Create New Workspace'}</span>
          </button>
        )}

        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
          <span>{workspaces.length} {language === 'es' ? 'espacios configurados' : 'workspaces'}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
          >
            {language === 'es' ? 'Cerrar' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
