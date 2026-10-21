'use client';

import React, { useState } from 'react';
import { 
  Kanban, Plus, DollarSign, Clock, AlertTriangle, Building2, 
  ChevronRight, ArrowRight, CheckCircle2
} from 'lucide-react';
import { Deal, DealStage } from '@/types';
import { initialDeals } from '@/core/storage/mockData';
import { useLanguage } from '@/context/LanguageContext';

export default function CrmView() {
  const { t, language } = useLanguage();
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [showAddModal, setShowAddModal] = useState(false);

  const [formData, setFormData] = useState({
    contactName: '',
    contactEmail: '',
    companyName: '',
    title: '',
    value: '5000',
    stage: 'positive' as DealStage
  });

  const stages: { id: DealStage; label: string; color: string }[] = [
    { id: 'positive', label: t('crm.stagePositive'), color: 'border-blue-500/40 text-blue-400' },
    { id: 'demo', label: t('crm.stageDemo'), color: 'border-purple-500/40 text-purple-400' },
    { id: 'proposal', label: t('crm.stageProposal'), color: 'border-amber-500/40 text-amber-400' },
    { id: 'won', label: t('crm.stageWon'), color: 'border-emerald-500/40 text-emerald-400' },
    { id: 'lost', label: t('crm.stageLost'), color: 'border-slate-700 text-slate-400' },
  ];

  const totalValue = deals
    .filter(d => d.stage !== 'lost')
    .reduce((sum, d) => sum + d.value, 0);

  const moveDealNext = (dealId: string) => {
    const stageOrder: DealStage[] = ['positive', 'demo', 'proposal', 'won'];
    setDeals(prev =>
      prev.map(d => {
        if (d.id !== dealId) return d;
        const currentIdx = stageOrder.indexOf(d.stage);
        if (currentIdx >= 0 && currentIdx < stageOrder.length - 1) {
          return { ...d, stage: stageOrder[currentIdx + 1], daysInactive: 0 };
        }
        return d;
      })
    );
  };

  const handleAddDeal = (e: React.FormEvent) => {
    e.preventDefault();
    const newDeal: Deal = {
      id: `deal-${Date.now()}`,
      leadId: `lead-${Date.now()}`,
      contactName: formData.contactName,
      contactEmail: formData.contactEmail,
      companyName: formData.companyName,
      title: formData.title || `${formData.companyName} Deal`,
      stage: formData.stage,
      value: Number(formData.value) || 0,
      daysInactive: 0,
      createdAt: new Date().toISOString()
    };
    setDeals([...deals, newDeal]);
    setShowAddModal(false);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0b0f17]">
      {/* Header */}
      <div className="h-16 px-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
        <div>
          <h1 className="text-base font-bold text-white flex items-center gap-2.5">
            <Kanban className="w-5 h-5 text-blue-500" />
            {t('crm.title')}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('crm.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>${totalValue.toLocaleString()} USD</span>
            <span className="text-[10px] text-emerald-400/80 font-normal">Active Pipeline</span>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            {t('crm.addDealBtn')}
          </button>
        </div>
      </div>

      {/* Kanban Board Columns */}
      <div className="flex-1 p-6 overflow-x-auto flex gap-4">
        {stages.map((stage) => {
          const stageDeals = deals.filter(d => d.stage === stage.id);
          const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0);

          return (
            <div
              key={stage.id}
              className="w-72 bg-[#090d16] border border-slate-800/80 rounded-2xl flex flex-col shrink-0 overflow-hidden"
            >
              {/* Column Header */}
              <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${stage.id === 'won' ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                  <span className="font-bold text-xs text-white">{stage.label}</span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-mono">
                    {stageDeals.length}
                  </span>
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-300">
                  ${stageTotal.toLocaleString()}
                </span>
              </div>

              {/* Column Deal Cards */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {stageDeals.length === 0 ? (
                  <div className="h-28 border border-dashed border-slate-800/80 rounded-xl flex items-center justify-center text-slate-600 text-[11px]">
                    {language === 'es' ? 'Sin oportunidades' : 'No deals yet'}
                  </div>
                ) : (
                  stageDeals.map((deal) => {
                  const isInactive = deal.daysInactive >= 3;
                  return (
                    <div
                      key={deal.id}
                      className={`p-3.5 rounded-xl border space-y-2.5 transition shadow-sm ${
                        isInactive
                          ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-xs text-white leading-snug">
                            {deal.title}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            {deal.companyName}
                          </div>
                        </div>

                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          ${deal.value.toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80">
                        <span className="text-slate-400 truncate max-w-[130px]">
                          {deal.contactName}
                        </span>

                        {isInactive ? (
                          <span className="flex items-center gap-1 text-[10px] text-rose-400 font-semibold bg-rose-500/10 px-1.5 py-0.5 rounded">
                            <AlertTriangle className="w-3 h-3" />
                            {deal.daysInactive}d inactive
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                            <Clock className="w-3 h-3" />
                            Active
                          </span>
                        )}
                      </div>

                      {stage.id !== 'won' && stage.id !== 'lost' && (
                        <button
                          onClick={() => moveDealNext(deal.id)}
                          className="w-full mt-1 bg-slate-800/80 hover:bg-blue-600 hover:text-white text-slate-300 text-[10px] font-semibold py-1.5 rounded-lg transition flex items-center justify-center gap-1 border border-slate-700"
                        >
                          <span>Advance Stage</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                }))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Deal Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-400" />
              {t('crm.modalAddTitle')}
            </h2>

            <form onSubmit={handleAddDeal} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-medium">{t('crm.contactNameLabel')}</label>
                <input
                  type="text"
                  required
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">{t('crm.companyLabel')}</label>
                <input
                  type="text"
                  required
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder="e.g. Acme Corp"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">{t('crm.dealValueLabel')}</label>
                <input
                  type="number"
                  required
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  placeholder="5000"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition"
                >
                  Save Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
