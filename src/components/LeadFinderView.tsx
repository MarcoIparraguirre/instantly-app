'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle2,
  Filter,
  CheckSquare,
  Square,
  Users,
  Edit3,
  FileSpreadsheet,
  RefreshCw,
  FolderKanban,
  Clock,
  AlertTriangle,
  MessageSquare,
  Eye,
  Send
} from 'lucide-react';
import { Campaign, Lead, LeadStatus } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import EditLeadModal from './EditLeadModal';
import LeadImportModal from './LeadImportModal';

interface LeadFinderViewProps {
  campaigns: Campaign[];
  leads?: Lead[];
  onLeadsInjected: () => void;
}

export default function LeadFinderView({
  campaigns,
  leads: propLeads,
  onLeadsInjected
}: LeadFinderViewProps) {
  const { language } = useLanguage();
  const [allLeads, setAllLeads] = useState<Lead[]>(propLeads || []);
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (propLeads) {
      setAllLeads(propLeads);
    } else {
      refreshLeads();
    }
  }, [propLeads]);

  const refreshLeads = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      if (Array.isArray(data)) {
        setAllLeads(data);
      }
      onLeadsInjected();
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getCampaignName = (campId: string) => {
    return campaigns.find(c => c.id === campId)?.name || 'Grupo General';
  };

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case 'sent':
        return {
          label: language === 'es' ? '✅ Enviado' : '✅ Sent',
          cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
        };
      case 'opened':
        return {
          label: language === 'es' ? '👁️ Abierto' : '👁️ Opened',
          cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
        };
      case 'replied':
        return {
          label: language === 'es' ? '💬 Respondido' : '💬 Replied',
          cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30'
        };
      case 'bounced':
        return {
          label: language === 'es' ? '⚠️ Rebotado' : '⚠️ Bounced',
          cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
        };
      case 'completed':
        return {
          label: language === 'es' ? '🏁 Secuencia Completa' : '🏁 Completed',
          cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30'
        };
      case 'pending':
      default:
        return {
          label: language === 'es' ? '⏳ Pendiente' : '⏳ Pending',
          cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        };
    }
  };

  // Filter leads by Campaign Group, Status, and Search Query
  const filteredLeads = allLeads.filter(lead => {
    if (selectedCampaignFilter !== 'all' && lead.campaignId !== selectedCampaignFilter) {
      return false;
    }
    if (selectedStatusFilter !== 'all' && lead.status !== selectedStatusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const inBasic =
        (lead.email || '').toLowerCase().includes(q) ||
        (lead.firstName || '').toLowerCase().includes(q) ||
        (lead.lastName || '').toLowerCase().includes(q) ||
        (lead.companyName || '').toLowerCase().includes(q);
      const inCustom = Object.values(lead.customVariables || {}).some(v =>
        String(v || '').toLowerCase().includes(q)
      );
      if (!inBasic && !inCustom) return false;
    }
    return true;
  });

  // Extract dynamic columns across filtered leads
  const dynamicColumns = Array.from(
    new Set(filteredLeads.flatMap(l => Object.keys(l.customVariables || {})))
  );

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === filteredLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map(l => l.id));
    }
  };

  const handleBulkStatusChange = async (newStatus: LeadStatus) => {
    if (selectedLeadIds.length === 0) return;
    setIsRefreshing(true);
    try {
      const selectedSet = new Set(selectedLeadIds);
      const toUpdate = allLeads.filter(l => selectedSet.has(l.id));
      for (const lead of toUpdate) {
        const nextCustom = lead.customVariables ? { ...lead.customVariables } : {};
        if ('ESTADO' in nextCustom) {
          nextCustom.ESTADO = newStatus === 'pending' ? 'Pendiente' : newStatus === 'sent' ? 'Enviado' : newStatus;
        }
        await fetch('/api/leads', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_lead',
            lead: { ...lead, status: newStatus, customVariables: nextCustom }
          })
        });
      }
      setSelectedLeadIds([]);
      await refreshLeads();
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const activeCampaignIdForImport =
    selectedCampaignFilter !== 'all'
      ? selectedCampaignFilter
      : campaigns[0]?.id || 'campaign-1';

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0b0f17]">
      {/* Left Sidebar: Lead Groups (By Campaign) & Status Filters */}
      <div className="w-72 bg-[#090d16] border-r border-slate-800/80 p-5 overflow-y-auto space-y-6 shrink-0">
        {/* Search Box */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              {language === 'es' ? 'Buscador y Grupos' : 'Search & Lead Groups'}
            </h2>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === 'es'
                  ? 'Buscar email, dominio, variable...'
                  : 'Search email, domain, variable...'
              }
              className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Groups by Campaign */}
        <div className="space-y-1.5 border-t border-slate-800/80 pt-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
            <FolderKanban className="w-3.5 h-3.5 text-indigo-400" />
            <span>{language === 'es' ? 'Grupos por Campaña' : 'Groups by Campaign'}</span>
          </div>

          <button
            onClick={() => setSelectedCampaignFilter('all')}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
              selectedCampaignFilter === 'all'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span className="truncate">
              {language === 'es' ? 'Todos los Contactos' : 'All Contacts'}
            </span>
            <span className="text-[10px] bg-slate-950/60 px-2 py-0.5 rounded-full font-mono">
              {allLeads.length}
            </span>
          </button>

          {campaigns.map(camp => {
            const count = allLeads.filter(l => l.campaignId === camp.id).length;
            const active = selectedCampaignFilter === camp.id;
            return (
              <button
                key={camp.id}
                onClick={() => setSelectedCampaignFilter(camp.id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <span className="truncate pr-2">{camp.name}</span>
                <span className="text-[10px] bg-slate-950/60 px-2 py-0.5 rounded-full font-mono shrink-0">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter by Contact Status */}
        <div className="space-y-1.5 border-t border-slate-800/80 pt-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            {language === 'es' ? 'Filtrar por Estado de Envío' : 'Filter by Dispatch Status'}
          </div>

          {[
            { id: 'all', label: language === 'es' ? 'Todos los estados' : 'All statuses', icon: Users, color: 'text-slate-300' },
            { id: 'pending', label: language === 'es' ? '⏳ Pendientes' : '⏳ Pending', icon: Clock, color: 'text-amber-400' },
            { id: 'sent', label: language === 'es' ? '✅ Enviados' : '✅ Sent', icon: Send, color: 'text-emerald-400' },
            { id: 'opened', label: language === 'es' ? '👁️ Abiertos' : '👁️ Opened', icon: Eye, color: 'text-cyan-400' },
            { id: 'replied', label: language === 'es' ? '💬 Respondidos' : '💬 Replied', icon: MessageSquare, color: 'text-purple-400' },
            { id: 'bounced', label: language === 'es' ? '⚠️ Rebotados' : '⚠️ Bounced', icon: AlertTriangle, color: 'text-rose-400' }
          ].map(st => {
            const count = allLeads.filter(l => {
              const matchCamp =
                selectedCampaignFilter === 'all' || l.campaignId === selectedCampaignFilter;
              const matchStatus = st.id === 'all' || l.status === st.id;
              return matchCamp && matchStatus;
            }).length;
            const active = selectedStatusFilter === st.id;

            return (
              <button
                key={st.id}
                onClick={() => setSelectedStatusFilter(st.id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                  active
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <span className={active ? 'text-white' : st.color}>{st.label}</span>
                <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded-full font-mono text-slate-400">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Panel: Lead Group Table & Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Action Bar */}
        <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span>
                {language === 'es'
                  ? 'Visor y Editor de Grupos de Leads'
                  : 'Lead Groups Viewer & Editor'}
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {filteredLeads.length}{' '}
              {language === 'es'
                ? 'contactos en vista • Haz clic en "Editar" en cualquier fila para modificar sus datos o estado'
                : 'contacts in view • Click "Edit" on any row to modify data or status'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {selectedLeadIds.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-xl text-xs">
                <span className="text-slate-300 font-semibold">
                  {selectedLeadIds.length} seleccionados:
                </span>
                <button
                  onClick={() => handleBulkStatusChange('pending')}
                  className="text-amber-400 hover:underline font-semibold cursor-pointer"
                >
                  Marcar Pendiente
                </button>
                <span className="text-slate-700">|</span>
                <button
                  onClick={() => handleBulkStatusChange('sent')}
                  className="text-emerald-400 hover:underline font-semibold cursor-pointer"
                >
                  Marcar Enviado
                </button>
              </div>
            )}

            <button
              onClick={refreshLeads}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
              title={language === 'es' ? 'Actualizar lista' : 'Refresh list'}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>
                {language === 'es'
                  ? 'Importar / Sincronizar (Sheets o CSV)'
                  : 'Import / Sync (Sheets or CSV)'}
              </span>
            </button>
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto w-full max-w-full">
              <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
                <thead className="bg-slate-950/90 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 w-12 sticky left-0 z-20 bg-slate-950 shadow-sm">
                      <button
                        onClick={toggleSelectAll}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        {selectedLeadIds.length > 0 &&
                        selectedLeadIds.length === filteredLeads.length ? (
                          <CheckSquare className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3.5 px-4 font-bold text-white sticky left-12 z-20 bg-slate-950 border-r border-slate-800 shadow-[2px_0_6px_rgba(0,0,0,0.4)]">Email</th>
                    <th className="py-3.5 px-4 font-bold text-white">Estado</th>
                    <th className="py-3.5 px-4 font-bold text-white">Acción</th>
                    <th className="py-3.5 px-4 font-bold text-white">Grupo / Campaña</th>
                    <th className="py-3.5 px-4 font-bold text-white">Último Envío</th>
                    {dynamicColumns.map(col => (
                      <th
                        key={col}
                        className="py-3.5 px-4 text-blue-400 bg-blue-950/20 border-l border-slate-800/80 font-mono font-bold"
                      >
                        {`{{${col}}}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6 + dynamicColumns.length}
                        className="py-12 text-center text-slate-500"
                      >
                        {language === 'es'
                          ? 'No hay contactos que coincidan con este filtro.'
                          : 'No contacts match the selected filter.'}
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map(lead => {
                      const isSelected = selectedLeadIds.includes(lead.id);
                      const badge = getStatusBadge(lead.status);
                      const stickyBg = isSelected ? 'bg-[#14233c]' : 'bg-[#0b0f17] group-hover:bg-slate-900';
                      return (
                        <tr
                          key={lead.id}
                          className={`group transition ${
                            isSelected ? 'bg-blue-600/10' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className={`py-3 px-4 w-12 sticky left-0 z-10 ${stickyBg}`}>
                            <button
                              onClick={() => toggleSelectLead(lead.id)}
                              className="cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-500" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500" />
                              )}
                            </button>
                          </td>
                          <td className={`py-3 px-4 font-mono text-white font-semibold sticky left-12 z-10 border-r border-slate-800 shadow-[2px_0_6px_rgba(0,0,0,0.4)] ${stickyBg}`}>
                            {lead.email}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => setEditingLead(lead)}
                              className="flex items-center gap-1.5 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700 hover:border-blue-500 text-[11px] font-semibold transition cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{language === 'es' ? 'Editar' : 'Edit'}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            <span className="bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-lg text-[11px]">
                              {getCampaignName(lead.campaignId)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[11px] text-slate-400 font-mono">
                            {lead.lastContactedAt
                              ? new Date(lead.lastContactedAt).toLocaleString([], {
                                  dateStyle: 'short',
                                  timeStyle: 'short'
                                })
                              : '-'}
                          </td>
                          {dynamicColumns.map(col => (
                            <td
                              key={col}
                              className="py-3 px-4 font-mono text-slate-300 border-l border-slate-800/60 bg-slate-950/20 max-w-xs truncate"
                              title={String(lead.customVariables?.[col] ?? '')}
                            >
                              {lead.customVariables?.[col] !== undefined
                                ? String(lead.customVariables[col])
                                : '-'}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Lead Modal */}
      <EditLeadModal
        isOpen={Boolean(editingLead)}
        lead={editingLead}
        onClose={() => setEditingLead(null)}
        onSaved={() => {
          refreshLeads();
        }}
      />

      {/* Import / Sync Modal */}
      <LeadImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        campaignId={activeCampaignIdForImport}
        onImportSuccess={() => {
          refreshLeads();
        }}
      />
    </div>
  );
}
