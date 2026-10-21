'use client';

import React, { useState } from 'react';
import { 
  Send, Plus, Search, Play, Pause, Trash2, Edit3, 
  CheckCircle2, Clock, Mail, Users, BarChart3, Copy
} from 'lucide-react';
import { Campaign, Lead } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

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
  onRefreshCampaigns
}: CampaignsListViewProps) {
  const { language } = useLanguage();
  const isEs = language === 'es';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const filteredCampaigns = campaigns.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalSent = campaigns.reduce((acc, c) => acc + (c.stats?.sent || 0), 0);
  const totalOpened = campaigns.reduce((acc, c) => acc + (c.stats?.opened || 0), 0);
  const totalReplied = campaigns.reduce((acc, c) => acc + (c.stats?.replied || 0), 0);
  const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0';
  const replyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : '0';

  const handleToggleStatus = async (c: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = c.status === 'active' ? 'paused' : 'active';
    setActionLoadingId(c.id);
    try {
      await fetch(`/api/campaigns/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...c, status: nextStatus })
      });
      onRefreshCampaigns();
    } catch (err) {
      console.error('Error toggling campaign status:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(isEs ? '¿Seguro que deseas eliminar esta campaña?' : 'Are you sure you want to delete this campaign?')) {
      return;
    }
    setActionLoadingId(id);
    try {
      await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      onRefreshCampaigns();
    } catch (err) {
      console.error('Error deleting campaign:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDuplicate = async (c: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoadingId(c.id);
    try {
      await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...c,
          id: undefined,
          name: `${c.name} (${isEs ? 'Copia' : 'Copy'})`,
          status: 'draft',
          stats: { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 }
        })
      });
      onRefreshCampaigns();
    } catch (err) {
      console.error('Error duplicating campaign:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f17] text-slate-100 overflow-y-auto p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Send className="w-6 h-6 text-blue-500" />
            <span>{isEs ? 'Campañas de Correo' : 'Email Campaigns'}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isEs
              ? 'Gestiona, carga y monitorea tus secuencias de prospección automatizada en frío.'
              : 'Manage, load, and monitor your automated cold outreach sequences.'}
          </p>
        </div>

        <button
          onClick={onCreateCampaign}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-4 py-2.5 rounded-2xl text-xs shadow-lg shadow-blue-600/20 transition cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{isEs ? 'Nueva Campaña' : 'New Campaign'}</span>
        </button>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {isEs ? 'Total Campañas' : 'Total Campaigns'}
            </div>
            <div className="text-2xl font-black text-white mt-1">{campaigns.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {isEs ? 'Correos Enviados' : 'Emails Sent'}
            </div>
            <div className="text-2xl font-black text-white mt-1">{totalSent.toLocaleString()}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {isEs ? 'Tasa de Apertura' : 'Open Rate'}
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{openRate}%</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {isEs ? 'Tasa de Respuesta' : 'Reply Rate'}
            </div>
            <div className="text-2xl font-black text-purple-400 mt-1">{replyRate}%</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 border border-slate-800/80 p-3 rounded-2xl">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isEs ? 'Buscar campañas...' : 'Search campaigns...'}
            className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {isEs ? 'Todas' : 'All'} ({campaigns.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'active'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {isEs ? 'Activas' : 'Active'} ({campaigns.filter(c => c.status === 'active').length})
          </button>
          <button
            onClick={() => setStatusFilter('paused')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'paused'
                ? 'bg-amber-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {isEs ? 'Pausadas' : 'Paused'} ({campaigns.filter(c => c.status === 'paused').length})
          </button>
          <button
            onClick={() => setStatusFilter('draft')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'draft'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {isEs ? 'Borradores' : 'Drafts'} ({campaigns.filter(c => c.status === 'draft').length})
          </button>
        </div>
      </div>

      {/* Campaigns Cards List or Empty State */}
      {filteredCampaigns.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl text-center">
          <div className="w-16 h-16 rounded-3xl bg-blue-600/10 text-blue-400 flex items-center justify-center mb-4">
            <Mail className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white">
            {isEs ? 'No se encontraron campañas' : 'No campaigns found'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1 mb-5">
            {isEs
              ? 'Crea tu primera campaña para configurar la secuencia de correos, importar leads de Google Sheets y comenzar a prospectar.'
              : 'Create your first campaign to set up sequences, import leads, and start prospecting.'}
          </p>
          <button
            onClick={onCreateCampaign}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>{isEs ? 'Crear Primera Campaña' : 'Create First Campaign'}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredCampaigns.map((camp) => {
            const campLeads = leads.filter(l => l.campaignId === camp.id);
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
                className="group bg-slate-900/50 hover:bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4.5 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
              >
                {/* Left: Name and Status */}
                <div className="flex items-start gap-3.5">
                  <button
                    onClick={(e) => handleToggleStatus(camp, e)}
                    disabled={actionLoadingId === camp.id}
                    title={camp.status === 'active' ? (isEs ? 'Pausar Campaña' : 'Pause') : (isEs ? 'Activar Campaña' : 'Activate')}
                    className={`mt-1 w-7 h-7 rounded-xl flex items-center justify-center transition shrink-0 ${
                      camp.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                        : camp.status === 'paused'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
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
                      <span className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        {camp.name}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                          camp.status === 'active'
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                            : camp.status === 'paused'
                            ? 'bg-amber-950/40 text-amber-400 border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {camp.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                        <span>{stepsCount} {isEs ? 'Pasos' : 'Steps'}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>{campLeads.length} {isEs ? 'Leads' : 'Leads'}</span>
                      </span>
                      <span>•</span>
                      <span className="text-[11px] text-slate-500">
                        {isEs ? 'Límite diario:' : 'Daily limit:'} {camp.schedule?.dailyLimit || 50}/día
                      </span>
                    </div>
                  </div>
                </div>

                {/* Center: Quick Stats */}
                <div className="flex items-center gap-6 sm:px-4 py-2 sm:py-0 border-y sm:border-y-0 sm:border-x border-slate-800 text-center">
                  <div>
                    <div className="text-xs font-bold text-white">{sent}</div>
                    <div className="text-[10px] text-slate-400">{isEs ? 'Enviados' : 'Sent'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-400">{campOpenRate}%</div>
                    <div className="text-[10px] text-slate-400">{isEs ? 'Aperturas' : 'Opens'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-purple-400">{campReplyRate}%</div>
                    <div className="text-[10px] text-slate-400">{isEs ? 'Respuestas' : 'Replies'}</div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => onSelectCampaign(camp)}
                    className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isEs ? 'Cargar / Editar' : 'Load / Edit'}</span>
                  </button>

                  <button
                    onClick={(e) => handleDuplicate(camp, e)}
                    disabled={actionLoadingId === camp.id}
                    title={isEs ? 'Duplicar campaña' : 'Duplicate'}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => handleDelete(camp.id, e)}
                    disabled={actionLoadingId === camp.id}
                    title={isEs ? 'Eliminar campaña' : 'Delete'}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-xl transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
