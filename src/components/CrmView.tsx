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
          setDeals(data);
        } else {
          setDeals([]);
        }
      } catch {
        if (!active) return;
        setDeals([]);
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
      { id: 'positive', label: t('crm.stagePositive'), dotColor: 'bg-sky-600' },
      { id: 'demo', label: t('crm.stageDemo'), dotColor: 'bg-[#14213D]' },
      { id: 'proposal', label: t('crm.stageProposal'), dotColor: 'bg-amber-500' },
      { id: 'won', label: t('crm.stageWon'), dotColor: 'bg-emerald-600' },
      { id: 'lost', label: t('crm.stageLost'), dotColor: 'bg-[#A1B0AB]' }
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
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#F4F7F5] text-[#14213D]">
      {/* Header */}
      <div className="h-16 px-8 border-b border-[#DCE3DF] flex items-center justify-between bg-white shrink-0">
        <div>
          <h1 className="text-base font-bold text-[#14213D] flex items-center gap-2.5">
            <Kanban className="w-5 h-5 text-[#14213D]" />
            <span>{t('crm.title')}</span>
            {isReadOnly && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-800">
                <Eye className="w-3 h-3" />
                <span>{language === 'es' ? 'Solo Lectura' : 'Read Only'}</span>
              </span>
            )}
          </h1>
          <p className="text-xs text-[#5C6F68] mt-0.5">{t('crm.subtitle')}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] px-3 py-1.5 rounded-xl text-xs font-bold">
            <DollarSign className="w-4 h-4 text-[#14213D]" />
            <span className="font-mono tabular-nums text-[#14213D]">
              ${totalValue.toLocaleString()} USD
            </span>
            <span className="text-[10px] text-[#5C6F68] font-normal">
              {language === 'es' ? 'Pipeline Activo' : 'Active Pipeline'}
            </span>
          </div>

          {!isReadOnly && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 bg-[#14213D] hover:bg-[#1E3158] text-white text-xs font-semibold px-4 py-2 rounded-lg transition cursor-pointer shadow-sm"
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
              className={`w-72 bg-[#EEF3F0] border rounded-xl flex flex-col shrink-0 min-h-0 overflow-hidden transition ${
                isDragTarget
                  ? 'border-[#14213D] ring-2 ring-[#14213D]/20 bg-[#D5ECD4]/40'
                  : 'border-[#DCE3DF]'
              }`}
            >
              {/* Column Header */}
              <div className="p-3.5 border-b border-[#DCE3DF] flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${stage.dotColor}`} />
                  <span className="font-bold text-xs text-[#14213D] truncate">{stage.label}</span>
                  <span className="text-[10px] bg-[#EEF3F0] border border-[#DCE3DF] text-[#5C6F68] px-1.5 py-0.5 rounded-lg font-mono tabular-nums">
                    {stageDeals.length}
                  </span>
                </div>
                <span className="text-[11px] font-mono tabular-nums font-bold text-[#14213D]">
                  ${stageTotal.toLocaleString()}
                </span>
              </div>

              {/* Column Deal Cards */}
              <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-3">
                {isLoading ? (
                  <div className="h-24 rounded-xl bg-white/80 border border-[#DCE3DF] animate-pulse" />
                ) : stageDeals.length === 0 ? (
                  <div
                    className={`h-28 border border-dashed rounded-xl flex items-center justify-center text-[11px] transition ${
                      isDragTarget
                        ? 'border-[#14213D] text-[#14213D] bg-[#D5ECD4]/50'
                        : 'border-[#A1B0AB]/60 text-[#5C6F68]'
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
                        className={`p-3.5 rounded-xl border space-y-2.5 shadow-sm transition ${
                          isReadOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
                        } ${
                          isInactive
                            ? 'bg-rose-50 border-rose-200 hover:border-rose-300'
                            : 'bg-white border-[#DCE3DF] hover:border-[#A1B0AB]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-[#14213D] leading-snug">
                              {deal.title}
                            </div>
                            <div className="text-[11px] text-[#5C6F68] flex items-center gap-1 mt-0.5 truncate">
                              <Building2 className="w-3 h-3 text-[#5C6F68] shrink-0" />
                              <span className="truncate">{deal.companyName}</span>
                            </div>
                          </div>

                          <span className="text-xs font-mono tabular-nums font-bold text-[#14213D] bg-[#D5ECD4] px-2 py-0.5 rounded-lg border border-[#C3DAC3] shrink-0">
                            ${deal.value.toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#DCE3DF]">
                          <span className="text-[#5C6F68] truncate max-w-[130px]">
                            {deal.contactName}
                          </span>

                          {isInactive ? (
                            <span className="flex items-center gap-1 text-[10px] text-rose-700 font-semibold font-mono tabular-nums bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded-lg">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>
                                {deal.daysInactive}d {language === 'es' ? 'inactivo' : 'inactive'}
                              </span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-[#5C6F68] font-mono tabular-nums">
                              <Clock className="w-3 h-3" />
                              <span>{language === 'es' ? 'Activo' : 'Active'}</span>
                            </span>
                          )}
                        </div>

                        {!isReadOnly && stage.id !== 'won' && stage.id !== 'lost' && (
                          <button
                            type="button"
                            onClick={() => moveDealNext(deal.id)}
                            className="w-full mt-1 bg-[#F4F7F5] hover:bg-[#14213D] hover:text-white hover:border-[#14213D] text-[#14213D] text-[10px] font-semibold py-1.5 rounded-lg transition flex items-center justify-center gap-1 border border-[#DCE3DF] cursor-pointer"
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
            className="bg-white border border-[#DCE3DF] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl text-[#14213D]"
          >
            <div className="flex items-center justify-between border-b border-[#DCE3DF] pb-3">
              <h2 className="text-base font-bold text-[#14213D] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#14213D]" />
                <span>{t('crm.modalAddTitle')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label={t('common.close')}
                className="p-1.5 rounded-lg text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddDeal} className="space-y-3">
              <div>
                <label className="text-xs text-[#5C6F68] font-medium">
                  {t('crm.contactNameLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  className="w-full mt-1 bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="text-xs text-[#5C6F68] font-medium">
                  {t('crm.companyLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full mt-1 bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none"
                  placeholder="e.g. Acme Corp"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#5C6F68] font-medium">
                    {t('crm.dealValueLabel')}
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className="w-full mt-1 bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-[#14213D] focus:outline-none"
                    placeholder="5000"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#5C6F68] font-medium">
                    {t('crm.stageLabel')}
                  </label>
                  <select
                    value={formData.stage}
                    onChange={(e) =>
                      setFormData({ ...formData, stage: e.target.value as DealStage })
                    }
                    className="w-full mt-1 bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3 py-2 text-xs text-[#14213D] focus:outline-none"
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
                  className="px-4 py-2 bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] text-[#14213D] text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingDeal}
                  className="px-4 py-2 bg-[#14213D] hover:bg-[#1E3158] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
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
