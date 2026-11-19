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
          cls: 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]',
          Icon: CheckCircle2
        };
      case 'opened':
        return {
          label: language === 'es' ? 'Abierto' : 'Opened',
          cls: 'bg-sky-50 text-sky-800 border-sky-200',
          Icon: Eye
        };
      case 'replied':
        return {
          label: language === 'es' ? 'Respondido' : 'Replied',
          cls: 'bg-[#14213D] text-white border-[#14213D]',
          Icon: MessageSquare
        };
      case 'bounced':
        return {
          label: language === 'es' ? 'Rebotado' : 'Bounced',
          cls: 'bg-rose-50 text-rose-700 border-rose-200',
          Icon: AlertTriangle
        };
      case 'completed':
        return {
          label: language === 'es' ? 'Secuencia Completa' : 'Completed',
          cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          Icon: Flag
        };
      case 'pending':
      default:
        return {
          label: language === 'es' ? 'Pendiente' : 'Pending',
          cls: 'bg-amber-50 text-amber-800 border-amber-200',
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
    <div className="flex-1 flex min-h-0 overflow-hidden bg-[#F4F7F5] text-[#14213D]">
      {/* Left Sidebar: Lead Groups (By Campaign) & Status Filters */}
      <div className="w-72 bg-white border-r border-[#DCE3DF] p-5 overflow-y-auto space-y-6 shrink-0">
        {/* Search Box */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#14213D]" />
            <h2 className="text-xs font-bold text-[#14213D] uppercase tracking-wider">
              {language === 'es' ? 'Buscador y Grupos' : 'Search & Lead Groups'}
            </h2>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#5C6F68] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === 'es'
                  ? 'Buscar email, dominio, variable...'
                  : 'Search email, domain, variable...'
              }
              className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg pl-8 pr-3 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none"
            />
          </div>
        </div>

        {/* Groups by Campaign */}
        <div className="space-y-1.5 border-t border-[#DCE3DF] pt-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#5C6F68] flex items-center gap-1.5 mb-2">
            <FolderKanban className="w-3.5 h-3.5 text-[#14213D]" />
            <span>{language === 'es' ? 'Grupos por Campaña' : 'Groups by Campaign'}</span>
          </div>

          <button
            type="button"
            onClick={() => setSelectedCampaignFilter('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
              selectedCampaignFilter === 'all'
                ? 'bg-[#14213D] text-white'
                : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
            }`}
          >
            <span className="truncate">
              {language === 'es' ? 'Todos los Contactos' : 'All Contacts'}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-lg font-mono tabular-nums ${
                selectedCampaignFilter === 'all'
                  ? 'bg-white/15 text-white'
                  : 'bg-[#EEF3F0] border border-[#DCE3DF] text-[#5C6F68]'
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
                    ? 'bg-[#14213D] text-white'
                    : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
                }`}
              >
                <span className="truncate pr-2">{camp.name}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-lg font-mono tabular-nums shrink-0 ${
                    active
                      ? 'bg-white/15 text-white'
                      : 'bg-[#EEF3F0] border border-[#DCE3DF] text-[#5C6F68]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter by Contact Status */}
        <div className="space-y-1.5 border-t border-[#DCE3DF] pt-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#5C6F68] mb-2">
            {language === 'es' ? 'Filtrar por Estado de Envío' : 'Filter by Dispatch Status'}
          </div>

          {[
            {
              id: 'all',
              label: language === 'es' ? 'Todos los estados' : 'All statuses',
              icon: Users,
              color: 'text-[#5C6F68]'
            },
            {
              id: 'pending',
              label: language === 'es' ? 'Pendientes' : 'Pending',
              icon: Clock,
              color: 'text-amber-600'
            },
            {
              id: 'sent',
              label: language === 'es' ? 'Enviados' : 'Sent',
              icon: CheckCircle2,
              color: 'text-emerald-700'
            },
            {
              id: 'opened',
              label: language === 'es' ? 'Abiertos' : 'Opened',
              icon: Eye,
              color: 'text-sky-700'
            },
            {
              id: 'replied',
              label: language === 'es' ? 'Respondidos' : 'Replied',
              icon: MessageSquare,
              color: 'text-[#14213D]'
            },
            {
              id: 'bounced',
              label: language === 'es' ? 'Rebotados' : 'Bounced',
              icon: AlertTriangle,
              color: 'text-rose-600'
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
                    ? 'bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]'
                    : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
                }`}
              >
                <span className={`flex items-center gap-2 truncate ${active ? 'text-[#14213D]' : st.color}`}>
                  <StatusFilterIcon className={`w-3.5 h-3.5 shrink-0 ${st.color}`} />
                  <span className="truncate">{st.label}</span>
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-lg font-mono tabular-nums shrink-0 border ${
                    active
                      ? 'bg-white text-[#14213D] border-[#C3DAC3]'
                      : 'bg-[#EEF3F0] border-[#DCE3DF] text-[#5C6F68]'
                  }`}
                >
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
        <div className="h-16 px-6 border-b border-[#DCE3DF] flex items-center justify-between bg-white shrink-0">
          <div>
            <h1 className="text-base font-bold text-[#14213D] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#14213D]" />
              <span>
                {language === 'es'
                  ? 'Visor y Editor de Grupos de Leads'
                  : 'Lead Groups Viewer & Editor'}
              </span>
            </h1>
            <p className="text-[11px] text-[#5C6F68] mt-0.5">
              <span className="font-mono tabular-nums font-semibold text-[#14213D]">
                {filteredLeads.length}
              </span>{' '}
              {language === 'es'
                ? 'contactos en vista • Haz clic en "Editar" en cualquier fila para modificar sus datos o estado'
                : 'contacts in view • Click "Edit" on any row to modify data or status'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {!isReadOnly && selectedLeadIds.length > 0 && (
              <div className="flex items-center gap-2 bg-[#EEF3F0] border border-[#DCE3DF] px-3 py-1.5 rounded-lg text-xs">
                <span className="text-[#14213D] font-semibold font-mono tabular-nums">
                  {selectedLeadIds.length}{' '}
                  {language === 'es' ? 'seleccionados:' : 'selected:'}
                </span>
                <button
                  type="button"
                  onClick={() => handleBulkStatusChange('pending')}
                  className="text-amber-700 hover:underline font-semibold cursor-pointer"
                >
                  {language === 'es' ? 'Marcar Pendiente' : 'Mark Pending'}
                </button>
                <span className="text-[#A1B0AB]">|</span>
                <button
                  type="button"
                  onClick={() => handleBulkStatusChange('sent')}
                  className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                >
                  {language === 'es' ? 'Marcar Enviado' : 'Mark Sent'}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={refreshLeads}
              className="p-2 rounded-lg bg-[#EEF3F0] hover:bg-[#DCE3DF] text-[#5C6F68] hover:text-[#14213D] border border-[#DCE3DF] transition cursor-pointer"
              title={language === 'es' ? 'Actualizar lista' : 'Refresh list'}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#14213D]' : ''}`} />
            </button>

            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 bg-[#14213D] hover:bg-[#1E3158] text-white text-xs font-semibold px-4 py-2 rounded-lg transition cursor-pointer shadow-sm"
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
          <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl overflow-hidden">
            <div className="overflow-x-auto w-full max-w-full">
              <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
                <thead className="bg-[#EEF3F0] text-[#5C6F68] uppercase tracking-wider text-[10px] border-b border-[#DCE3DF]">
                  <tr>
                    <th className="py-3.5 px-4 w-12 sticky left-0 z-20 bg-[#EEF3F0]">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-[#5C6F68] hover:text-[#14213D] cursor-pointer"
                      >
                        {selectedLeadIds.length > 0 &&
                        selectedLeadIds.length === filteredLeads.length ? (
                          <CheckSquare className="w-4 h-4 text-[#14213D]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#14213D] w-36 min-w-[144px] sticky left-12 z-20 bg-[#EEF3F0]">
                      {language === 'es' ? 'Nombre' : 'Name'}
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#14213D] min-w-[200px] sticky left-[192px] z-20 bg-[#EEF3F0] border-r border-[#DCE3DF] shadow-[2px_0_6px_rgba(20,33,61,0.06)]">
                      Email
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#14213D]">
                      {language === 'es' ? 'Estado' : 'Status'}
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#14213D]">
                      {language === 'es' ? 'Acción' : 'Action'}
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#14213D]">
                      {language === 'es' ? 'Grupo / Campaña' : 'Group / Campaign'}
                    </th>
                    <th className="py-3.5 px-4 font-bold text-[#14213D]">
                      {language === 'es' ? 'Último Envío' : 'Last Contacted'}
                    </th>
                    {dynamicColumns.map((col) => (
                      <th
                        key={col}
                        className="py-3.5 px-4 text-[#14213D] bg-[#D5ECD4]/60 border-l border-[#DCE3DF] font-mono font-bold"
                      >
                        {`{{${col}}}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3DF] text-[#14213D]">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7 + dynamicColumns.length}
                        className="py-12 text-center text-[#5C6F68]"
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
                        ? 'bg-[#EBF5EB]'
                        : 'bg-white group-hover:bg-[#F4F7F5]';
                      return (
                        <tr
                          key={lead.id}
                          className={`group transition ${
                            isSelected ? 'bg-[#EBF5EB]' : 'bg-white hover:bg-[#F4F7F5]'
                          }`}
                        >
                          <td className={`py-3 px-4 w-12 sticky left-0 z-10 ${stickyBg}`}>
                            <button
                              type="button"
                              onClick={() => toggleSelectLead(lead.id)}
                              className="cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#14213D]" />
                              ) : (
                                <Square className="w-4 h-4 text-[#A1B0AB]" />
                              )}
                            </button>
                          </td>
                          <td
                            className={`py-3 px-4 text-[#14213D] w-36 min-w-[144px] max-w-[144px] truncate sticky left-12 z-10 ${stickyBg}`}
                          >
                            {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || '-'}
                          </td>
                          <td
                            className={`py-3 px-4 font-mono text-[#14213D] font-semibold min-w-[200px] sticky left-[192px] z-10 border-r border-[#DCE3DF] shadow-[2px_0_6px_rgba(20,33,61,0.06)] ${stickyBg}`}
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
                              className="flex items-center gap-1.5 bg-[#EEF3F0] hover:bg-[#14213D] text-[#14213D] hover:text-white px-2.5 py-1 rounded-lg border border-[#DCE3DF] hover:border-[#14213D] text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{language === 'es' ? 'Editar' : 'Edit'}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-[#5C6F68]">
                            <span className="bg-[#EEF3F0] border border-[#DCE3DF] px-2 py-0.5 rounded-lg text-[11px] text-[#14213D]">
                              {getCampaignName(lead.campaignId)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[11px] text-[#5C6F68] font-mono tabular-nums">
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
                              className="py-3 px-4 font-mono text-[#5C6F68] border-l border-[#DCE3DF] bg-[#F4F7F5]/60 max-w-xs truncate"
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
