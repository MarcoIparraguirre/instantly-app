'use client';

import React, { useState } from 'react';
import {
  Send,
  Plus,
  Search,
  Play,
  Pause,
  Trash2,
  Edit3,
  Mail,
  Users,
  BarChart3,
  Copy,
  Eye,
} from 'lucide-react';
import { Campaign, Lead, ROLE_PERMISSIONS, normalizeRole } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';

interface CampaignsListViewProps {
  campaigns: Campaign[];
  leads: Lead[];
  onSelectCampaign: (campaign: Campaign) => void;
  onCreateCampaign: () => void;
  onRefreshCampaigns: () => void;
}

export default function CampaignsListView({
  campaigns,
  leads,
  onSelectCampaign,
  onCreateCampaign,
  onRefreshCampaigns,
}: CampaignsListViewProps) {
  const { language } = useLanguage();
  const { user, currentWorkspace } = useAuth();
  const { showToast, confirm } = useFeedback();
  const isEs = language === 'es';
  const isReadOnly = ROLE_PERMISSIONS[normalizeRole(user?.role)].isReadOnly;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalSent = campaigns.reduce((acc, c) => acc + (c.stats?.sent || 0), 0);
  const totalOpened = campaigns.reduce((acc, c) => acc + (c.stats?.opened || 0), 0);
  const totalReplied = campaigns.reduce((acc, c) => acc + (c.stats?.replied || 0), 0);
  const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0.0';
  const replyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : '0.0';

  const handleToggleStatus = async (c: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;

    const nextStatus = c.status === 'active' ? 'paused' : 'active';
    setActionLoadingId(c.id);
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...c,
          workspaceId: c.workspaceId || currentWorkspace.id,
          status: nextStatus,
        }),
      });
      if (!res.ok) {
        throw new Error(isEs ? 'No se pudo actualizar el estado' : 'Failed to update status');
      }
      onRefreshCampaigns();
      showToast({
        title:
          nextStatus === 'active'
            ? isEs
              ? 'Campaña activada'
              : 'Campaign activated'
            : isEs
              ? 'Campaña pausada'
              : 'Campaign paused',
        description: c.name,
        variant: 'success',
      });
    } catch (err) {
      console.error('Error toggling campaign status:', err);
      showToast({
        title: isEs ? 'Error al cambiar estado de la campaña' : 'Failed to update campaign status',
        variant: 'error',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (c: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;

    const confirmed = await confirm({
      title: isEs ? 'Eliminar campaña' : 'Delete campaign',
      description: isEs
        ? `¿Seguro que deseas eliminar la campaña "${c.name}"? Esta acción no se puede deshacer.`
        : `Are you sure you want to delete "${c.name}"? This action cannot be undone.`,
      confirmLabel: isEs ? 'Eliminar' : 'Delete',
      cancelLabel: isEs ? 'Cancelar' : 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    setActionLoadingId(c.id);
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(isEs ? 'No se pudo eliminar la campaña' : 'Failed to delete campaign');
      }
      onRefreshCampaigns();
      showToast({
        title: isEs ? 'Campaña eliminada' : 'Campaign deleted',
        description: c.name,
        variant: 'success',
      });
    } catch (err) {
      console.error('Error deleting campaign:', err);
      showToast({
        title: isEs ? 'Error al eliminar campaña' : 'Failed to delete campaign',
        variant: 'error',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDuplicate = async (c: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;

    setActionLoadingId(c.id);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...c,
          id: undefined,
          workspaceId: currentWorkspace.id,
          name: `${c.name} (${isEs ? 'Copia' : 'Copy'})`,
          status: 'draft',
          stats: { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
        }),
      });
      if (!res.ok) {
        throw new Error(isEs ? 'No se pudo duplicar la campaña' : 'Failed to duplicate campaign');
      }
      onRefreshCampaigns();
      showToast({
        title: isEs ? 'Campaña duplicada' : 'Campaign duplicated',
        description: `${c.name} (${isEs ? 'Copia' : 'Copy'})`,
        variant: 'success',
      });
    } catch (err) {
      console.error('Error duplicating campaign:', err);
      showToast({
        title: isEs ? 'Error al duplicar campaña' : 'Failed to duplicate campaign',
        variant: 'error',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F4F7F5] text-[#14213D] overflow-y-auto p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#14213D] tracking-tight flex items-center gap-2.5">
            <Send className="w-6 h-6 text-[#14213D]" />
            <span>{isEs ? 'Campañas de Correo' : 'Email Campaigns'}</span>
          </h1>
          <p className="text-xs text-[#5C6F68] mt-1">
            {isEs
              ? 'Gestiona, carga y monitorea tus secuencias de prospección automatizada en frío.'
              : 'Manage, load, and monitor your automated cold outreach sequences.'}
          </p>
        </div>

        {isReadOnly ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DCE3DF] shadow-sm text-xs font-semibold text-[#5C6F68] shrink-0">
            <Eye className="w-3.5 h-3.5 text-[#14213D]" />
            <span>{isEs ? 'Modo Solo Lectura' : 'Read-Only Mode'}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onCreateCampaign}
            className="flex items-center gap-2 bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold px-4 py-2.5 rounded-lg text-xs transition cursor-pointer shrink-0 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{isEs ? 'Nueva Campaña' : 'New Campaign'}</span>
          </button>
        )}
      </div>

      {/* Metric Cards Summary (Signature 4-Tone KPI Row) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-[#5C6F68] uppercase tracking-wider">
              {isEs ? 'Total Campañas' : 'Total Campaigns'}
            </div>
            <div className="text-2xl font-bold text-[#14213D] mt-1 font-mono tabular-nums">
              {campaigns.length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-white/75 border border-[#C3DAC3] text-[#14213D] flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#C3DAC3] border border-[#A1B0AB]/50 text-[#14213D] rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-[#14213D]/75 uppercase tracking-wider">
              {isEs ? 'Correos Enviados' : 'Emails Sent'}
            </div>
            <div className="text-2xl font-bold text-[#14213D] mt-1 font-mono tabular-nums">
              {totalSent.toLocaleString()}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-white/70 border border-[#A1B0AB]/40 text-[#14213D] flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#A1B0AB] border border-[#5C6F68]/30 text-[#14213D] rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-[#14213D]/80 uppercase tracking-wider">
              {isEs ? 'Tasa de Apertura' : 'Open Rate'}
            </div>
            <div className="text-2xl font-bold text-[#14213D] mt-1 font-mono tabular-nums">
              {openRate}%
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-white/60 border border-[#5C6F68]/25 text-[#14213D] flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#5C6F68] border border-[#5C6F68] text-white rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">
              {isEs ? 'Tasa de Respuesta' : 'Reply Rate'}
            </div>
            <div className="text-2xl font-bold text-white mt-1 font-mono tabular-nums">
              {replyRate}%
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-white/15 border border-white/25 text-white flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-[#DCE3DF] shadow-sm p-3 rounded-xl">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#5C6F68] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isEs ? 'Buscar campañas...' : 'Search campaigns...'}
            className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#14213D] placeholder-[#5C6F68]/70 focus:outline-none transition"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#14213D] text-white'
                : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
            }`}
          >
            {isEs ? 'Todas' : 'All'} (
            <span className="font-mono tabular-nums">{campaigns.length}</span>)
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]'
                : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
            }`}
          >
            {isEs ? 'Activas' : 'Active'} (
            <span className="font-mono tabular-nums">
              {campaigns.filter((c) => c.status === 'active').length}
            </span>
            )
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('paused')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'paused'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
            }`}
          >
            {isEs ? 'Pausadas' : 'Paused'} (
            <span className="font-mono tabular-nums">
              {campaigns.filter((c) => c.status === 'paused').length}
            </span>
            )
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('draft')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'draft'
                ? 'bg-[#14213D] text-white'
                : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
            }`}
          >
            {isEs ? 'Borradores' : 'Drafts'} (
            <span className="font-mono tabular-nums">
              {campaigns.filter((c) => c.status === 'draft').length}
            </span>
            )
          </button>
        </div>
      </div>

      {/* Campaigns Cards List or Empty State */}
      {filteredCampaigns.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white border border-dashed border-[#A1B0AB] shadow-sm rounded-xl text-center">
          <div className="w-16 h-16 rounded-xl bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] flex items-center justify-center mb-4">
            <Mail className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[#14213D]">
            {isEs ? 'No se encontraron campañas' : 'No campaigns found'}
          </h3>
          <p className="text-xs text-[#5C6F68] max-w-sm mt-1 mb-5">
            {isReadOnly
              ? isEs
                ? 'No hay campañas disponibles en este espacio de trabajo todavía.'
                : 'There are no campaigns available in this workspace yet.'
              : isEs
                ? 'Crea tu primera campaña para configurar la secuencia de correos, importar leads de Google Sheets y comenzar a prospectar.'
                : 'Create your first campaign to set up sequences, import leads, and start prospecting.'}
          </p>
          {!isReadOnly && (
            <button
              type="button"
              onClick={onCreateCampaign}
              className="flex items-center gap-2 bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold px-4 py-2 rounded-lg text-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isEs ? 'Crear Primera Campaña' : 'Create First Campaign'}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredCampaigns.map((camp) => {
            const campLeads = leads.filter((l) => l.campaignId === camp.id);
            const stepsCount = camp.steps?.length || 0;
            const sent = camp.stats?.sent || 0;
            const opened = camp.stats?.opened || 0;
            const replied = camp.stats?.replied || 0;
            const campOpenRate = sent > 0 ? ((opened / sent) * 100).toFixed(0) : '0';
            const campReplyRate = sent > 0 ? ((replied / sent) * 100).toFixed(0) : '0';

            return (
              <div
                key={camp.id}
                onClick={() => onSelectCampaign(camp)}
                className="group bg-white hover:bg-[#F4F7F5] border border-[#DCE3DF] hover:border-[#A1B0AB] shadow-sm rounded-xl p-4 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Left: Name and Status */}
                <div className="flex items-start gap-3.5">
                  <button
                    type="button"
                    onClick={(e) => handleToggleStatus(camp, e)}
                    disabled={isReadOnly || actionLoadingId === camp.id}
                    title={
                      isReadOnly
                        ? isEs
                          ? 'Modo Solo Lectura'
                          : 'Read-Only Mode'
                        : camp.status === 'active'
                          ? isEs
                            ? 'Pausar Campaña'
                            : 'Pause'
                          : isEs
                            ? 'Activar Campaña'
                            : 'Activate'
                    }
                    className={`mt-1 w-7 h-7 rounded-lg flex items-center justify-center transition shrink-0 ${
                      isReadOnly
                        ? 'opacity-50 cursor-not-allowed bg-[#EEF3F0] text-[#5C6F68] border border-[#DCE3DF]'
                        : camp.status === 'active'
                          ? 'bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3] hover:bg-[#C3DAC3] cursor-pointer'
                          : camp.status === 'paused'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer'
                            : 'bg-[#EEF3F0] text-[#5C6F68] border border-[#DCE3DF] hover:bg-[#DCE3DF] cursor-pointer'
                    }`}
                  >
                    {camp.status === 'active' ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 ml-0.5" />
                    )}
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#14213D] group-hover:text-[#1E3158] transition">
                        {camp.name}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase border ${
                          camp.status === 'active'
                            ? 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
                            : camp.status === 'paused'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-[#EEF3F0] text-[#5C6F68] border-[#DCE3DF]'
                        }`}
                      >
                        {camp.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[#5C6F68] mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-[#5C6F68]/80" />
                        <span className="font-mono tabular-nums text-[#14213D] font-medium">
                          {stepsCount}
                        </span>
                        <span>{isEs ? 'Pasos' : 'Steps'}</span>
                      </span>
                      <span className="text-[#A1B0AB]">•</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-[#5C6F68]/80" />
                        <span className="font-mono tabular-nums text-[#14213D] font-medium">
                          {campLeads.length}
                        </span>
                        <span>Leads</span>
                      </span>
                      <span className="text-[#A1B0AB]">•</span>
                      <span className="text-[11px] text-[#5C6F68]">
                        {isEs ? 'Límite diario:' : 'Daily limit:'}{' '}
                        <span className="font-mono tabular-nums text-[#14213D] font-medium">
                          {camp.schedule?.dailyLimit || 50}
                        </span>
                        /día
                      </span>
                    </div>
                  </div>
                </div>

                {/* Center: Quick Stats */}
                <div className="flex items-center gap-6 sm:px-4 py-2 sm:py-0 border-y sm:border-y-0 sm:border-x border-[#DCE3DF] text-center">
                  <div>
                    <div className="text-xs font-bold text-[#14213D] font-mono tabular-nums">
                      {sent.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[#5C6F68]">{isEs ? 'Enviados' : 'Sent'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#14213D] font-mono tabular-nums">
                      {campOpenRate}%
                    </div>
                    <div className="text-[10px] text-[#5C6F68]">{isEs ? 'Aperturas' : 'Opens'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#5C6F68] font-mono tabular-nums">
                      {campReplyRate}%
                    </div>
                    <div className="text-[10px] text-[#5C6F68]">{isEs ? 'Respuestas' : 'Replies'}</div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCampaign(camp);
                    }}
                    className="flex items-center gap-1.5 bg-[#D5ECD4] hover:bg-[#14213D] text-[#14213D] hover:text-white border border-[#C3DAC3] hover:border-[#14213D] px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    {isReadOnly ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                    <span>
                      {isReadOnly
                        ? isEs
                          ? 'Ver Campaña'
                          : 'View Campaign'
                        : isEs
                          ? 'Cargar / Editar'
                          : 'Load / Edit'}
                    </span>
                  </button>

                  {!isReadOnly && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleDuplicate(camp, e)}
                        disabled={actionLoadingId === camp.id}
                        title={isEs ? 'Duplicar campaña' : 'Duplicate'}
                        className="p-1.5 text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0] border border-transparent hover:border-[#DCE3DF] rounded-lg transition cursor-pointer disabled:opacity-50"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDelete(camp, e)}
                        disabled={actionLoadingId === camp.id}
                        title={isEs ? 'Eliminar campaña' : 'Delete'}
                        className="p-1.5 text-[#5C6F68] hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
