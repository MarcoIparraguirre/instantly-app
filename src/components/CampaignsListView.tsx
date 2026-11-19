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
    <div className="flex-1 flex flex-col h-full bg-[#0A0C10] text-[#F3F5F8] overflow-y-auto p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#F3F5F8] tracking-tight flex items-center gap-2.5">
            <Send className="w-6 h-6 text-[#E85D2A]" />
            <span>{isEs ? 'Campañas de Correo' : 'Email Campaigns'}</span>
          </h1>
          <p className="text-xs text-[#949EB0] mt-1">
            {isEs
              ? 'Gestiona, carga y monitorea tus secuencias de prospección automatizada en frío.'
              : 'Manage, load, and monitor your automated cold outreach sequences.'}
          </p>
        </div>

        {isReadOnly ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#11141C] border border-[#232938] text-xs font-semibold text-[#949EB0] shrink-0">
            <Eye className="w-3.5 h-3.5 text-[#E85D2A]" />
            <span>{isEs ? 'Modo Solo Lectura' : 'Read-Only Mode'}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onCreateCampaign}
            className="flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white font-semibold px-4 py-2.5 rounded-lg text-xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{isEs ? 'Nueva Campaña' : 'New Campaign'}</span>
          </button>
        )}
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[#949EB0] uppercase tracking-wider">
              {isEs ? 'Total Campañas' : 'Total Campaigns'}
            </div>
            <div className="text-2xl font-bold text-[#F3F5F8] mt-1 font-mono tabular-nums">
              {campaigns.length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#171B26] border border-[#232938] text-[#E85D2A] flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[#949EB0] uppercase tracking-wider">
              {isEs ? 'Correos Enviados' : 'Emails Sent'}
            </div>
            <div className="text-2xl font-bold text-[#F3F5F8] mt-1 font-mono tabular-nums">
              {totalSent.toLocaleString()}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#171B26] border border-[#232938] text-[#F3F5F8] flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[#949EB0] uppercase tracking-wider">
              {isEs ? 'Tasa de Apertura' : 'Open Rate'}
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono tabular-nums">
              {openRate}%
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#171B26] border border-[#232938] text-emerald-400 flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[#949EB0] uppercase tracking-wider">
              {isEs ? 'Tasa de Respuesta' : 'Reply Rate'}
            </div>
            <div className="text-2xl font-bold text-[#E85D2A] mt-1 font-mono tabular-nums">
              {replyRate}%
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#171B26] border border-[#232938] text-amber-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#11141C] border border-[#1D2330] p-3 rounded-xl">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#949EB0] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isEs ? 'Buscar campañas...' : 'Search campaigns...'}
            className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#F3F5F8] placeholder-[#949EB0]/60 focus:outline-none transition"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#E85D2A] text-white'
                : 'text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26]'
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
                ? 'bg-emerald-600 text-white'
                : 'text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26]'
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
                ? 'bg-amber-600 text-white'
                : 'text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26]'
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
                ? 'bg-[#232938] text-[#F3F5F8]'
                : 'text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26]'
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
        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-[#11141C] border border-dashed border-[#232938] rounded-xl text-center">
          <div className="w-16 h-16 rounded-xl bg-[#171B26] border border-[#232938] text-[#E85D2A] flex items-center justify-center mb-4">
            <Mail className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[#F3F5F8]">
            {isEs ? 'No se encontraron campañas' : 'No campaigns found'}
          </h3>
          <p className="text-xs text-[#949EB0] max-w-sm mt-1 mb-5">
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
              className="flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white font-semibold px-4 py-2 rounded-lg text-xs transition cursor-pointer"
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
                className="group bg-[#11141C] hover:bg-[#171B26]/80 border border-[#1D2330] hover:border-[#232938] rounded-xl p-4 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
                        ? 'opacity-50 cursor-not-allowed bg-[#171B26] text-[#949EB0] border border-[#232938]'
                        : camp.status === 'active'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 cursor-pointer'
                          : camp.status === 'paused'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 cursor-pointer'
                            : 'bg-[#171B26] text-[#949EB0] border border-[#232938] hover:bg-[#1D2330] cursor-pointer'
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
                      <span className="text-sm font-bold text-[#F3F5F8] group-hover:text-[#E85D2A] transition">
                        {camp.name}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase border ${
                          camp.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : camp.status === 'paused'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-[#171B26] text-[#949EB0] border-[#232938]'
                        }`}
                      >
                        {camp.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[#949EB0] mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-[#949EB0]/70" />
                        <span className="font-mono tabular-nums">{stepsCount}</span>
                        <span>{isEs ? 'Pasos' : 'Steps'}</span>
                      </span>
                      <span className="text-[#232938]">•</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-[#949EB0]/70" />
                        <span className="font-mono tabular-nums">{campLeads.length}</span>
                        <span>Leads</span>
                      </span>
                      <span className="text-[#232938]">•</span>
                      <span className="text-[11px] text-[#949EB0]">
                        {isEs ? 'Límite diario:' : 'Daily limit:'}{' '}
                        <span className="font-mono tabular-nums text-[#F3F5F8]">
                          {camp.schedule?.dailyLimit || 50}
                        </span>
                        /día
                      </span>
                    </div>
                  </div>
                </div>

                {/* Center: Quick Stats */}
                <div className="flex items-center gap-6 sm:px-4 py-2 sm:py-0 border-y sm:border-y-0 sm:border-x border-[#1D2330] text-center">
                  <div>
                    <div className="text-xs font-bold text-[#F3F5F8] font-mono tabular-nums">
                      {sent.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[#949EB0]">{isEs ? 'Enviados' : 'Sent'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-400 font-mono tabular-nums">
                      {campOpenRate}%
                    </div>
                    <div className="text-[10px] text-[#949EB0]">{isEs ? 'Aperturas' : 'Opens'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#E85D2A] font-mono tabular-nums">
                      {campReplyRate}%
                    </div>
                    <div className="text-[10px] text-[#949EB0]">{isEs ? 'Respuestas' : 'Replies'}</div>
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
                    className="flex items-center gap-1.5 bg-[#171B26] hover:bg-[#E85D2A] text-[#F3F5F8] border border-[#232938] hover:border-[#E85D2A] px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
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
                        className="p-1.5 text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26] border border-transparent hover:border-[#232938] rounded-lg transition cursor-pointer disabled:opacity-50"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDelete(camp, e)}
                        disabled={actionLoadingId === camp.id}
                        title={isEs ? 'Eliminar campaña' : 'Delete'}
                        className="p-1.5 text-[#949EB0] hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 rounded-lg transition cursor-pointer disabled:opacity-50"
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
