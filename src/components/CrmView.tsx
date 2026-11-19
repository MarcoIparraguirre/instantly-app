'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Kanban,
  Plus,
  DollarSign,
  Clock,
  AlertTriangle,
  Building2,
  ChevronRight,
  Eye,
  X
} from 'lucide-react';
import { Deal, DealStage, ROLE_PERMISSIONS, normalizeRole } from '@/types';
import { initialDeals } from '@/core/storage/mockData';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';

export default function CrmView() {
  const { user, currentWorkspace } = useAuth();
  const isReadOnly = ROLE_PERMISSIONS[normalizeRole(user?.role)].isReadOnly;

  return (
    <CrmViewContent
      key={currentWorkspace.id}
      workspaceId={currentWorkspace.id}
      isReadOnly={isReadOnly}
    />
  );
}

function CrmViewContent({
  workspaceId,
  isReadOnly
}: {
  workspaceId: string;
  isReadOnly: boolean;
}) {
  const { t, language } = useLanguage();
  const { showToast } = useFeedback();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSavingDeal, setIsSavingDeal] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);

  const [formData, setFormData] = useState({
    contactName: '',
    contactEmail: '',
    companyName: '',
    title: '',
    value: '5000',
    stage: 'positive' as DealStage
  });

  useEffect(() => {
    if (!showAddModal || isReadOnly) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAddModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddModal, isReadOnly]);

  useEffect(() => {
    let active = true;
    const wsId = workspaceId;

    const loadDeals = async () => {
      try {
        const res = await fetch(`/api/deals?workspaceId=${encodeURIComponent(wsId)}`, {
          cache: 'no-store'
        });
        const data = await res.json();
        if (!active) return;

        if (res.ok && Array.isArray(data)) {
          if (data.length > 0) {
            setDeals(data);
          } else {
            setDeals(wsId === 'ws-primary' ? initialDeals : []);
          }
        } else {
          setDeals(wsId === 'ws-primary' ? initialDeals : []);
        }
      } catch {
        if (!active) return;
        setDeals(wsId === 'ws-primary' ? initialDeals : []);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadDeals();

    return () => {
      active = false;
    };
  }, [workspaceId]);

  const stages: { id: DealStage; label: string; dotColor: string }[] = useMemo(
    () => [
      { id: 'positive', label: t('crm.stagePositive'), dotColor: 'bg-sky-400' },
      { id: 'demo', label: t('crm.stageDemo'), dotColor: 'bg-[#E85D2A]' },
      { id: 'proposal', label: t('crm.stageProposal'), dotColor: 'bg-amber-400' },
      { id: 'won', label: t('crm.stageWon'), dotColor: 'bg-emerald-400' },
      { id: 'lost', label: t('crm.stageLost'), dotColor: 'bg-[#949EB0]' }
    ],
    [t]
  );

  const updateDealStage = useCallback(
    async (dealId: string, targetStage: DealStage) => {
      if (isReadOnly) return;

      const currentDeal = deals.find((d) => d.id === dealId);
      if (!currentDeal || currentDeal.stage === targetStage) return;

      const updatedDeal: Deal = {
        ...currentDeal,
        workspaceId: currentDeal.workspaceId || workspaceId,
        stage: targetStage,
        daysInactive: 0
      };

      setDeals((prev) => prev.map((d) => (d.id === dealId ? updatedDeal : d)));

      try {
        const res = await fetch('/api/deals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...updatedDeal,
            workspaceId
          })
        });
        if (!res.ok) {
          throw new Error('Failed to update deal');
        }
        const stageLabel = stages.find((s) => s.id === targetStage)?.label || targetStage;
        showToast({
          title:
            language === 'es'
              ? `Trato movido a "${stageLabel}"`
              : `Deal moved to "${stageLabel}"`,
          variant: 'success'
        });
      } catch (err) {
        console.error('Error persisting deal stage update:', err);
        setDeals((prev) => prev.map((d) => (d.id === dealId ? currentDeal : d)));
        showToast({
          title:
            language === 'es'
              ? 'No se pudo actualizar la etapa del trato'
              : 'Failed to update deal stage',
          variant: 'error'
        });
      }
    },
    [deals, isReadOnly, language, showToast, stages, workspaceId]
  );

  const handleDropDeal = async (dealId: string, targetStage: DealStage) => {
    if (isReadOnly) return;
    await updateDealStage(dealId, targetStage);
  };

  const moveDealNext = async (dealId: string) => {
    if (isReadOnly) return;
    const stageOrder: DealStage[] = ['positive', 'demo', 'proposal', 'won'];
    const currentDeal = deals.find((d) => d.id === dealId);
    if (!currentDeal) return;

    const currentIdx = stageOrder.indexOf(currentDeal.stage);
    if (currentIdx >= 0 && currentIdx < stageOrder.length - 1) {
      await updateDealStage(dealId, stageOrder[currentIdx + 1]);
    }
  };

  const handleAddDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    setIsSavingDeal(true);
    const newDealPayload = {
      workspaceId,
      contactName: formData.contactName.trim(),
      contactEmail: formData.contactEmail.trim(),
      companyName: formData.companyName.trim(),
      title:
        formData.title.trim() ||
        `${formData.companyName.trim() || formData.contactName.trim()} Deal`,
      stage: formData.stage,
      value: Number(formData.value) || 0
    };

    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDealPayload)
      });
      const created = await res.json();
      if (!res.ok) {
        throw new Error(created?.error || 'Failed to create deal');
      }
      setDeals((prev) => [created, ...prev]);
      setFormData({
        contactName: '',
        contactEmail: '',
        companyName: '',
        title: '',
        value: '5000',
        stage: 'positive'
      });
      setShowAddModal(false);
      showToast({
        title: language === 'es' ? 'Trato creado en el pipeline' : 'Deal created in pipeline',
        description: created.title,
        variant: 'success'
      });
    } catch (err) {
      console.error('Error creating deal:', err);
      showToast({
        title: language === 'es' ? 'Error al crear el trato' : 'Failed to create deal',
        description: err instanceof Error ? err.message : undefined,
        variant: 'error'
      });
    } finally {
      setIsSavingDeal(false);
    }
  };

  const totalValue = deals
    .filter((d) => d.stage !== 'lost')
    .reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#0A0C10] text-[#F3F5F8]">
      {/* Header */}
      <div className="h-16 px-8 border-b border-[#1D2330] flex items-center justify-between bg-[#11141C] shrink-0">
        <div>
          <h1 className="text-base font-bold text-[#F3F5F8] flex items-center gap-2.5">
            <Kanban className="w-5 h-5 text-[#E85D2A]" />
            <span>{t('crm.title')}</span>
            {isReadOnly && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#171B26] border border-[#232938] text-[10px] font-semibold text-amber-400">
                <Eye className="w-3 h-3" />
                <span>{language === 'es' ? 'Solo Lectura' : 'Read Only'}</span>
              </span>
            )}
          </h1>
          <p className="text-xs text-[#949EB0] mt-0.5">{t('crm.subtitle')}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#171B26] border border-[#232938] text-[#F3F5F8] px-3 py-1.5 rounded-xl text-xs font-bold">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="font-mono tabular-nums text-emerald-400">
              ${totalValue.toLocaleString()} USD
            </span>
            <span className="text-[10px] text-[#949EB0] font-normal">
              {language === 'es' ? 'Pipeline Activo' : 'Active Pipeline'}
            </span>
          </div>

          {!isReadOnly && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 bg-[#E85D2A] hover:bg-[#F26B3A] text-white text-xs font-semibold px-4 py-2 rounded-lg transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t('crm.addDealBtn')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Kanban Board Columns with Drag & Drop */}
      <div className="flex-1 min-h-0 p-6 overflow-x-auto flex gap-4">
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage.id);
          const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0);
          const isDragTarget = !isReadOnly && dragOverStage === stage.id;

          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                if (isReadOnly) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDragEnter={() => {
                if (isReadOnly) return;
                setDragOverStage(stage.id);
              }}
              onDragLeave={(e) => {
                if (isReadOnly) return;
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverStage(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                if (isReadOnly) return;
                const dealId = e.dataTransfer.getData('text/plain');
                if (dealId) {
                  void handleDropDeal(dealId, stage.id);
                }
              }}
              className={`w-72 bg-[#11141C] border rounded-xl flex flex-col shrink-0 min-h-0 overflow-hidden transition ${
                isDragTarget
                  ? 'border-[#E85D2A] ring-2 ring-[#E85D2A]/25 bg-[#E85D2A]/5'
                  : 'border-[#1D2330]'
              }`}
            >
              {/* Column Header */}
              <div className="p-3.5 border-b border-[#1D2330] flex items-center justify-between bg-[#171B26]/70 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${stage.dotColor}`} />
                  <span className="font-bold text-xs text-[#F3F5F8] truncate">{stage.label}</span>
                  <span className="text-[10px] bg-[#0A0C10] border border-[#232938] text-[#949EB0] px-1.5 py-0.5 rounded-lg font-mono tabular-nums">
                    {stageDeals.length}
                  </span>
                </div>
                <span className="text-[11px] font-mono tabular-nums font-bold text-[#F3F5F8]">
                  ${stageTotal.toLocaleString()}
                </span>
              </div>

              {/* Column Deal Cards */}
              <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-3">
                {isLoading ? (
                  <div className="h-24 rounded-xl bg-[#171B26]/50 border border-[#1D2330] animate-pulse" />
                ) : stageDeals.length === 0 ? (
                  <div
                    className={`h-28 border border-dashed rounded-xl flex items-center justify-center text-[11px] transition ${
                      isDragTarget
                        ? 'border-[#E85D2A]/60 text-[#E85D2A] bg-[#E85D2A]/5'
                        : 'border-[#232938] text-[#949EB0]/60'
                    }`}
                  >
                    {isReadOnly
                      ? language === 'es'
                        ? 'Sin tratos en esta etapa'
                        : 'No deals in stage'
                      : language === 'es'
                      ? 'Soltar trato aquí'
                      : 'Drop deal here'}
                  </div>
                ) : (
                  stageDeals.map((deal) => {
                    const isInactive = deal.daysInactive >= 3;
                    return (
                      <div
                        key={deal.id}
                        draggable={!isReadOnly}
                        onDragStart={(e) => {
                          if (isReadOnly) {
                            e.preventDefault();
                            return;
                          }
                          e.dataTransfer.setData('text/plain', deal.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        className={`p-3.5 rounded-xl border space-y-2.5 transition ${
                          isReadOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
                        } ${
                          isInactive
                            ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400'
                            : 'bg-[#171B26] border-[#232938] hover:border-[#343D52]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-[#F3F5F8] leading-snug">
                              {deal.title}
                            </div>
                            <div className="text-[11px] text-[#949EB0] flex items-center gap-1 mt-0.5 truncate">
                              <Building2 className="w-3 h-3 text-[#949EB0] shrink-0" />
                              <span className="truncate">{deal.companyName}</span>
                            </div>
                          </div>

                          <span className="text-xs font-mono tabular-nums font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/25 shrink-0">
                            ${deal.value.toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#232938]">
                          <span className="text-[#949EB0] truncate max-w-[130px]">
                            {deal.contactName}
                          </span>

                          {isInactive ? (
                            <span className="flex items-center gap-1 text-[10px] text-rose-400 font-semibold font-mono tabular-nums bg-rose-500/10 px-1.5 py-0.5 rounded-lg">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>
                                {deal.daysInactive}d {language === 'es' ? 'inactivo' : 'inactive'}
                              </span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-[#949EB0] font-mono tabular-nums">
                              <Clock className="w-3 h-3" />
                              <span>{language === 'es' ? 'Activo' : 'Active'}</span>
                            </span>
                          )}
                        </div>

                        {!isReadOnly && stage.id !== 'won' && stage.id !== 'lost' && (
                          <button
                            type="button"
                            onClick={() => moveDealNext(deal.id)}
                            className="w-full mt-1 bg-[#11141C] hover:bg-[#E85D2A] hover:text-white hover:border-[#E85D2A] text-[#949EB0] text-[10px] font-semibold py-1.5 rounded-lg transition flex items-center justify-center gap-1 border border-[#232938] cursor-pointer"
                          >
                            <span>{language === 'es' ? 'Avanzar Etapa' : 'Advance Stage'}</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Deal Modal */}
      {showAddModal && !isReadOnly && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowAddModal(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#11141C] border border-[#232938] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#1D2330] pb-3">
              <h2 className="text-base font-bold text-[#F3F5F8] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#E85D2A]" />
                <span>{t('crm.modalAddTitle')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label={t('common.close')}
                className="p-1.5 rounded-lg text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddDeal} className="space-y-3">
              <div>
                <label className="text-xs text-[#949EB0] font-medium">
                  {t('crm.contactNameLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="text-xs text-[#949EB0] font-medium">
                  {t('crm.companyLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none"
                  placeholder="e.g. Acme Corp"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#949EB0] font-medium">
                    {t('crm.dealValueLabel')}
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-[#F3F5F8] focus:outline-none"
                    placeholder="5000"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#949EB0] font-medium">
                    {t('crm.stageLabel')}
                  </label>
                  <select
                    value={formData.stage}
                    onChange={(e) =>
                      setFormData({ ...formData, stage: e.target.value as DealStage })
                    }
                    className="w-full mt-1 bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none"
                  >
                    {stages.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] text-[#949EB0] hover:text-[#F3F5F8] text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingDeal}
                  className="px-4 py-2 bg-[#E85D2A] hover:bg-[#F26B3A] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  {isSavingDeal
                    ? language === 'es'
                      ? 'Guardando...'
                      : 'Saving...'
                    : language === 'es'
                    ? 'Guardar Trato'
                    : 'Save Deal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
