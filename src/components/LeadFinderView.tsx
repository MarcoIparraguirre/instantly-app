'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Flag
} from 'lucide-react';
import { Campaign, Lead, LeadStatus, ROLE_PERMISSIONS, normalizeRole } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';
import EditLeadModal from './EditLeadModal';
import LeadImportModal from './LeadImportModal';

interface LeadFinderViewProps {
  campaigns: Campaign[];
  leads?: Lead[];
  onLeadsInjected: () => void;
}

export default function LeadFinderView(props: LeadFinderViewProps) {
  const { user, currentWorkspace } = useAuth();
  const isReadOnly = ROLE_PERMISSIONS[normalizeRole(user?.role)].isReadOnly;

  return (
    <LeadFinderViewContent
      key={currentWorkspace.id}
      workspaceId={currentWorkspace.id}
      isReadOnly={isReadOnly}
      {...props}
    />
  );
}

interface LeadFinderViewContentProps extends LeadFinderViewProps {
  workspaceId: string;
  isReadOnly: boolean;
}

function LeadFinderViewContent({
  workspaceId,
  isReadOnly,
  campaigns,
  leads: propLeads,
  onLeadsInjected
}: LeadFinderViewContentProps) {
  const { language } = useLanguage();
  const { showToast } = useFeedback();

  const [fetchedLeads, setFetchedLeads] = useState<Lead[]>([]);
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const allLeads = propLeads ?? fetchedLeads;

  const refreshLeads = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/leads?workspaceId=${encodeURIComponent(workspaceId)}`, {
        cache: 'no-store'
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setFetchedLeads(data);
      }
      onLeadsInjected();
    } catch (err) {
      console.error(err);
      showToast({
        title: language === 'es' ? 'Error al actualizar contactos' : 'Failed to refresh leads',
        variant: 'error'
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [workspaceId, onLeadsInjected, showToast, language]);

  useEffect(() => {
    if (propLeads !== undefined) return;
    let active = true;
    fetch(`/api/leads?workspaceId=${encodeURIComponent(workspaceId)}`, {
      cache: 'no-store'
    })
      .then((res) => res.json())
      .then((data) => {
        if (active && Array.isArray(data)) {
          setFetchedLeads(data);
        }
      })
      .catch((err) => {
        console.error(err);
      });
    return () => {
      active = false;
    };
  }, [propLeads, workspaceId]);

  const getCampaignName = (campId: string) => {
    return (
      campaigns.find((c) => c.id === campId)?.name ||
      (language === 'es' ? 'Grupo General' : 'General Group')
    );
  };

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case 'sent':
        return {
          label: language === 'es' ? 'Enviado' : 'Sent',
          cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          Icon: CheckCircle2
        };
      case 'opened':
        return {
          label: language === 'es' ? 'Abierto' : 'Opened',
          cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
          Icon: Eye
        };
      case 'replied':
        return {
          label: language === 'es' ? 'Respondido' : 'Replied',
          cls: 'bg-[#E85D2A]/15 text-[#E85D2A] border-[#E85D2A]/30',
          Icon: MessageSquare
        };
      case 'bounced':
        return {
          label: language === 'es' ? 'Rebotado' : 'Bounced',
          cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          Icon: AlertTriangle
        };
      case 'completed':
        return {
          label: language === 'es' ? 'Secuencia Completa' : 'Completed',
          cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
          Icon: Flag
        };
      case 'pending':
      default:
        return {
          label: language === 'es' ? 'Pendiente' : 'Pending',
          cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          Icon: Clock
        };
    }
  };

  // Filter leads by Campaign Group, Status, and Search Query
  const filteredLeads = allLeads.filter((lead) => {
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
      const inCustom = Object.values(lead.customVariables || {}).some((v) =>
        String(v || '').toLowerCase().includes(q)
      );
      if (!inBasic && !inCustom) return false;
    }
    return true;
  });

  // Extract dynamic columns across filtered leads
  const dynamicColumns = Array.from(
    new Set(filteredLeads.flatMap((l) => Object.keys(l.customVariables || {})))
  );

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === filteredLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map((l) => l.id));
    }
  };

  const handleBulkStatusChange = async (newStatus: LeadStatus) => {
    if (isReadOnly || selectedLeadIds.length === 0) return;
    setIsRefreshing(true);
    try {
      const selectedSet = new Set(selectedLeadIds);
      const toUpdate = allLeads.filter((l) => selectedSet.has(l.id));
      for (const lead of toUpdate) {
        const nextCustom = lead.customVariables ? { ...lead.customVariables } : {};
        if ('ESTADO' in nextCustom) {
          nextCustom.ESTADO =
            newStatus === 'pending' ? 'Pendiente' : newStatus === 'sent' ? 'Enviado' : newStatus;
        }
        const res = await fetch('/api/leads', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_lead',
            workspaceId,
            lead: {
              ...lead,
              workspaceId: lead.workspaceId || workspaceId,
              status: newStatus,
              customVariables: nextCustom
            }
          })
        });
        if (!res.ok) {
          throw new Error('Failed to update lead status');
        }
      }
      setSelectedLeadIds([]);
      await refreshLeads();
      showToast({
        title:
          language === 'es'
            ? `${toUpdate.length} contacto(s) actualizados`
            : `${toUpdate.length} contact(s) updated`,
        variant: 'success'
      });
    } catch (e) {
      console.error(e);
      showToast({
        title:
          language === 'es'
            ? 'Error al actualizar estado de contactos'
            : 'Failed to update contact statuses',
        variant: 'error'
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const activeCampaignIdForImport =
    selectedCampaignFilter !== 'all'
      ? selectedCampaignFilter
      : campaigns[0]?.id || 'campaign-1';

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-[#0A0C10] text-[#F3F5F8]">
      {/* Left Sidebar: Lead Groups (By Campaign) & Status Filters */}
      <div className="w-72 bg-[#11141C] border-r border-[#1D2330] p-5 overflow-y-auto space-y-6 shrink-0">
        {/* Search Box */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#E85D2A]" />
            <h2 className="text-xs font-bold text-[#F3F5F8] uppercase tracking-wider">
              {language === 'es' ? 'Buscador y Grupos' : 'Search & Lead Groups'}
            </h2>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#949EB0] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === 'es'
                  ? 'Buscar email, dominio, variable...'
                  : 'Search email, domain, variable...'
              }
              className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg pl-8 pr-3 py-2 text-xs text-[#F3F5F8] placeholder-[#949EB0]/60 focus:outline-none"
            />
          </div>
        </div>

        {/* Groups by Campaign */}
        <div className="space-y-1.5 border-t border-[#1D2330] pt-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#949EB0] flex items-center gap-1.5 mb-2">
            <FolderKanban className="w-3.5 h-3.5 text-[#E85D2A]" />
            <span>{language === 'es' ? 'Grupos por Campaña' : 'Groups by Campaign'}</span>
          </div>

          <button
            type="button"
            onClick={() => setSelectedCampaignFilter('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
              selectedCampaignFilter === 'all'
                ? 'bg-[#E85D2A] text-white'
                : 'text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26]'
            }`}
          >
            <span className="truncate">
              {language === 'es' ? 'Todos los Contactos' : 'All Contacts'}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-lg font-mono tabular-nums ${
                selectedCampaignFilter === 'all'
                  ? 'bg-black/25 text-white'
                  : 'bg-[#0A0C10] border border-[#1D2330] text-[#949EB0]'
              }`}
            >
              {allLeads.length}
            </span>
          </button>

          {campaigns.map((camp) => {
            const count = allLeads.filter((l) => l.campaignId === camp.id).length;
            const active = selectedCampaignFilter === camp.id;
            return (
              <button
                key={camp.id}
                type="button"
                onClick={() => setSelectedCampaignFilter(camp.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                  active
                    ? 'bg-[#E85D2A] text-white'
                    : 'text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26]'
                }`}
              >
                <span className="truncate pr-2">{camp.name}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-lg font-mono tabular-nums shrink-0 ${
                    active
                      ? 'bg-black/25 text-white'
                      : 'bg-[#0A0C10] border border-[#1D2330] text-[#949EB0]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter by Contact Status */}
        <div className="space-y-1.5 border-t border-[#1D2330] pt-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#949EB0] mb-2">
            {language === 'es' ? 'Filtrar por Estado de Envío' : 'Filter by Dispatch Status'}
          </div>

          {[
            {
              id: 'all',
              label: language === 'es' ? 'Todos los estados' : 'All statuses',
              icon: Users,
              color: 'text-[#949EB0]'
            },
            {
              id: 'pending',
              label: language === 'es' ? 'Pendientes' : 'Pending',
              icon: Clock,
              color: 'text-amber-400'
            },
            {
              id: 'sent',
              label: language === 'es' ? 'Enviados' : 'Sent',
              icon: CheckCircle2,
              color: 'text-emerald-400'
            },
            {
              id: 'opened',
              label: language === 'es' ? 'Abiertos' : 'Opened',
              icon: Eye,
              color: 'text-sky-400'
            },
            {
              id: 'replied',
              label: language === 'es' ? 'Respondidos' : 'Replied',
              icon: MessageSquare,
              color: 'text-[#E85D2A]'
            },
            {
              id: 'bounced',
              label: language === 'es' ? 'Rebotados' : 'Bounced',
              icon: AlertTriangle,
              color: 'text-rose-400'
            }
          ].map((st) => {
            const StatusFilterIcon = st.icon;
            const count = allLeads.filter((l) => {
              const matchCamp =
                selectedCampaignFilter === 'all' || l.campaignId === selectedCampaignFilter;
              const matchStatus = st.id === 'all' || l.status === st.id;
              return matchCamp && matchStatus;
            }).length;
            const active = selectedStatusFilter === st.id;

            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStatusFilter(st.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                  active
                    ? 'bg-[#171B26] text-[#F3F5F8] border border-[#232938]'
                    : 'text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26]/60'
                }`}
              >
                <span className={`flex items-center gap-2 truncate ${active ? 'text-[#F3F5F8]' : st.color}`}>
                  <StatusFilterIcon className={`w-3.5 h-3.5 shrink-0 ${st.color}`} />
                  <span className="truncate">{st.label}</span>
                </span>
                <span className="text-[10px] bg-[#0A0C10] border border-[#1D2330] px-2 py-0.5 rounded-lg font-mono tabular-nums text-[#949EB0] shrink-0">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Panel: Lead Group Table & Editor */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Action Bar */}
        <div className="h-16 px-6 border-b border-[#1D2330] flex items-center justify-between bg-[#11141C] shrink-0">
          <div>
            <h1 className="text-base font-bold text-[#F3F5F8] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#E85D2A]" />
              <span>
                {language === 'es'
                  ? 'Visor y Editor de Grupos de Leads'
                  : 'Lead Groups Viewer & Editor'}
              </span>
            </h1>
            <p className="text-[11px] text-[#949EB0] mt-0.5">
              <span className="font-mono tabular-nums font-semibold text-[#F3F5F8]">
                {filteredLeads.length}
              </span>{' '}
              {language === 'es'
                ? 'contactos en vista • Haz clic en "Editar" en cualquier fila para modificar sus datos o estado'
                : 'contacts in view • Click "Edit" on any row to modify data or status'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {!isReadOnly && selectedLeadIds.length > 0 && (
              <div className="flex items-center gap-2 bg-[#171B26] border border-[#232938] px-3 py-1.5 rounded-lg text-xs">
                <span className="text-[#F3F5F8] font-semibold font-mono tabular-nums">
                  {selectedLeadIds.length}{' '}
                  {language === 'es' ? 'seleccionados:' : 'selected:'}
                </span>
                <button
                  type="button"
                  onClick={() => handleBulkStatusChange('pending')}
                  className="text-amber-400 hover:underline font-semibold cursor-pointer"
                >
                  {language === 'es' ? 'Marcar Pendiente' : 'Mark Pending'}
                </button>
                <span className="text-[#232938]">|</span>
                <button
                  type="button"
                  onClick={() => handleBulkStatusChange('sent')}
                  className="text-emerald-400 hover:underline font-semibold cursor-pointer"
                >
                  {language === 'es' ? 'Marcar Enviado' : 'Mark Sent'}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={refreshLeads}
              className="p-2 rounded-lg bg-[#171B26] hover:bg-[#1D2330] text-[#949EB0] hover:text-[#F3F5F8] border border-[#232938] transition cursor-pointer"
              title={language === 'es' ? 'Actualizar lista' : 'Refresh list'}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#E85D2A]' : ''}`} />
            </button>

            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white text-xs font-semibold px-4 py-2 rounded-lg transition cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>
                  {language === 'es'
                    ? 'Importar / Sincronizar (Sheets o CSV)'
                    : 'Import / Sync (Sheets or CSV)'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-[#11141C] border border-[#1D2330] rounded-xl overflow-hidden">
            <div className="overflow-x-auto w-full max-w-full">
              <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
                <thead className="bg-[#171B26] text-[#949EB0] uppercase tracking-wider text-[10px] border-b border-[#1D2330]">
                  <tr>
                    <th className="py-3.5 px-4 w-12 sticky left-0 z-20 bg-[#171B26]">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-[#949EB0] hover:text-[#F3F5F8] cursor-pointer"
                      >
                        {selectedLeadIds.length > 0 &&
                        selectedLeadIds.length === filteredLeads.length ? (
                          <CheckSquare className="w-4 h-4 text-[#E85D2A]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#F3F5F8] w-36 min-w-[144px] sticky left-12 z-20 bg-[#171B26]">
                      {language === 'es' ? 'Nombre' : 'Name'}
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#F3F5F8] min-w-[200px] sticky left-[192px] z-20 bg-[#171B26] border-r border-[#232938] shadow-[2px_0_6px_rgba(0,0,0,0.4)]">
                      Email
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#F3F5F8]">
                      {language === 'es' ? 'Estado' : 'Status'}
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#F3F5F8]">
                      {language === 'es' ? 'Acción' : 'Action'}
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#F3F5F8]">
                      {language === 'es' ? 'Grupo / Campaña' : 'Group / Campaign'}
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#F3F5F8]">
                      {language === 'es' ? 'Último Envío' : 'Last Contacted'}
                    </th>
                    {dynamicColumns.map((col) => (
                      <th
                        key={col}
                        className="py-3.5 px-4 text-sky-400 bg-sky-500/10 border-l border-[#1D2330] font-mono font-bold"
                      >
                        {`{{${col}}}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D2330] text-[#F3F5F8]">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7 + dynamicColumns.length}
                        className="py-12 text-center text-[#949EB0]"
                      >
                        {language === 'es'
                          ? 'No hay contactos que coincidan con este filtro.'
                          : 'No contacts match the selected filter.'}
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => {
                      const isSelected = selectedLeadIds.includes(lead.id);
                      const badge = getStatusBadge(lead.status);
                      const StatusIcon = badge.Icon;
                      const stickyBg = isSelected
                        ? 'bg-[#1D2330]'
                        : 'bg-[#11141C] group-hover:bg-[#171B26]';
                      return (
                        <tr
                          key={lead.id}
                          className={`group transition ${
                            isSelected ? 'bg-[#E85D2A]/10' : 'hover:bg-[#171B26]/70'
                          }`}
                        >
                          <td className={`py-3 px-4 w-12 sticky left-0 z-10 ${stickyBg}`}>
                            <button
                              type="button"
                              onClick={() => toggleSelectLead(lead.id)}
                              className="cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#E85D2A]" />
                              ) : (
                                <Square className="w-4 h-4 text-[#949EB0]" />
                              )}
                            </button>
                          </td>
                          <td
                            className={`py-3 px-4 text-[#F3F5F8]/90 w-36 min-w-[144px] max-w-[144px] truncate sticky left-12 z-10 ${stickyBg}`}
                          >
                            {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || '-'}
                          </td>
                          <td
                            className={`py-3 px-4 font-mono text-[#F3F5F8] font-semibold min-w-[200px] sticky left-[192px] z-10 border-r border-[#232938] shadow-[2px_0_6px_rgba(0,0,0,0.4)] ${stickyBg}`}
                          >
                            {lead.email}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border ${badge.cls}`}
                            >
                              <StatusIcon className="w-3 h-3 shrink-0" />
                              <span>{badge.label}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => setEditingLead(lead)}
                              className="flex items-center gap-1.5 bg-[#171B26] hover:bg-[#E85D2A] text-[#F3F5F8] hover:text-white px-2.5 py-1 rounded-lg border border-[#232938] hover:border-[#E85D2A] text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{language === 'es' ? 'Editar' : 'Edit'}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-[#949EB0]">
                            <span className="bg-[#171B26] border border-[#232938] px-2 py-0.5 rounded-lg text-[11px] text-[#F3F5F8]">
                              {getCampaignName(lead.campaignId)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[11px] text-[#949EB0] font-mono tabular-nums">
                            {lead.lastContactedAt
                              ? new Date(lead.lastContactedAt).toLocaleString([], {
                                  dateStyle: 'short',
                                  timeStyle: 'short'
                                })
                              : '-'}
                          </td>
                          {dynamicColumns.map((col) => (
                            <td
                              key={col}
                              className="py-3 px-4 font-mono text-[#949EB0] border-l border-[#1D2330] bg-[#0A0C10]/30 max-w-xs truncate"
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
          void refreshLeads();
        }}
      />

      {/* Import / Sync Modal */}
      <LeadImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        campaignId={activeCampaignIdForImport}
        onImportSuccess={() => {
          void refreshLeads();
        }}
      />
    </div>
  );
}
