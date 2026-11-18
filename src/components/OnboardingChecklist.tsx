'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Compass,
  Server,
  Users,
  FileEdit,
  Rocket,
} from 'lucide-react';
import { AppTab, Campaign, Lead, SenderAccount } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface OnboardingChecklistProps {
  accounts: SenderAccount[];
  campaigns: Campaign[];
  leads: Lead[];
  onNavigate: (tab: AppTab) => void;
  onOpenTour?: () => void;
}

const STORAGE_KEY = 'misender_onboarding_collapsed';

export default function OnboardingChecklist({
  accounts,
  campaigns,
  leads,
  onNavigate,
  onOpenTour,
}: OnboardingChecklistProps) {
  const { language } = useLanguage();
  const isEs = language === 'es';
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'true') {
          setIsCollapsed(true);
        }
      } catch {}
    });
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const triggerTour = () => {
    onOpenTour?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('misender:open-tour'));
    }
  };

  const milestones = [
    {
      id: 'connect-mailbox',
      completed: accounts.length > 0,
      targetTab: 'accounts' as AppTab,
      icon: Server,
      titleEs: 'Conectar primera casilla de correo',
      titleEn: 'Connect first sending mailbox',
      ctaEs: 'Conectar casilla',
      ctaEn: 'Connect mailbox',
    },
    {
      id: 'import-leads',
      completed: leads.length > 0,
      targetTab: 'finder' as AppTab,
      icon: Users,
      titleEs: 'Importar lista de prospectos',
      titleEn: 'Import prospect list',
      ctaEs: 'Importar leads',
      ctaEn: 'Import leads',
    },
    {
      id: 'design-sequence',
      completed: campaigns.some(
        (c) => (c.steps?.length || 0) > 0 && Boolean(c.steps[0]?.variants?.[0]?.body?.trim())
      ),
      targetTab: 'campaigns' as AppTab,
      icon: FileEdit,
      titleEs: 'Diseñar secuencia de correo con variables',
      titleEn: 'Design email sequence with variables',
      ctaEs: 'Editar secuencia',
      ctaEn: 'Edit sequence',
    },
    {
      id: 'activate-campaign',
      completed: campaigns.some((c) => c.status === 'active' || (c.stats?.sent || 0) > 0),
      targetTab: 'campaigns' as AppTab,
      icon: Rocket,
      titleEs: 'Activar o lanzar primera campaña',
      titleEn: 'Activate or launch first campaign',
      ctaEs: 'Activar campaña',
      ctaEn: 'Activate campaign',
    },
  ];

  const completedCount = milestones.filter((m) => m.completed).length;
  const progressPct = Math.round((completedCount / milestones.length) * 100);
  const nextPending = milestones.find((m) => !m.completed);

  if (isCollapsed) {
    return (
      <div className="px-5 py-2 bg-[#0c121e]/95 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Rocket className="w-3.5 h-3.5 text-blue-400" />
            <span>{isEs ? 'Primeros Pasos' : 'Quick Setup'}</span>
          </span>

          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-semibold text-slate-300">
              {completedCount}/{milestones.length} ({progressPct}%)
            </span>
          </div>

          {nextPending && (
            <button
              type="button"
              onClick={() => onNavigate(nextPending.targetTab)}
              className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition cursor-pointer"
            >
              <span>
                {isEs ? 'Siguiente:' : 'Next:'}{' '}
                {isEs ? nextPending.titleEs : nextPending.titleEn}
              </span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={triggerTour}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[11px] font-semibold transition cursor-pointer"
          >
            <span>🎯 {isEs ? 'Iniciar Tour Guiado' : 'Start Guided Tour'}</span>
          </button>

          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold transition cursor-pointer"
          >
            <span>{isEs ? 'Expandir' : 'Expand'}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label={isEs ? 'Checklist de configuración inicial' : 'Onboarding setup checklist'}
      className="px-5 py-3.5 bg-gradient-to-r from-[#0d1424] via-[#0e172a] to-[#0d1424] border-b border-slate-800 shrink-0 space-y-3"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-white">
                {progressPct === 100
                  ? isEs
                    ? '¡Tu motor outbound está listo para escalar!'
                    : 'Your outbound engine is ready to scale!'
                  : isEs
                    ? 'Checklist de Puesta en Marcha'
                    : 'Launch Readiness Checklist'}
              </h2>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                  progressPct === 100
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                }`}
              >
                {completedCount}/4 • {progressPct}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isEs
                ? 'Completa estos 4 hitos reales para comenzar a enviar campañas con máxima entregabilidad.'
                : 'Complete these 4 live milestones to start sending campaigns with peak deliverability.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={triggerTour}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600/25 to-teal-600/25 hover:from-emerald-600/40 hover:to-teal-600/40 border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-sm transition cursor-pointer"
          >
            <span>🎯 {isEs ? 'Iniciar Tour Guiado' : 'Start Guided Tour'}</span>
          </button>

          <button
            type="button"
            onClick={toggleCollapsed}
            title={isEs ? 'Minimizar checklist' : 'Minimize checklist'}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
          >
            <span className="hidden sm:inline">{isEs ? 'Minimizar' : 'Minimize'}</span>
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-800/90 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* 4 Real Milestones Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        {milestones.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`flex flex-col justify-between gap-2 p-3 rounded-xl border transition ${
                item.completed
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-slate-900/75 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                {item.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                )}
                <div
                  className={`text-xs font-semibold leading-snug flex items-start gap-1.5 min-w-0 ${
                    item.completed ? 'text-emerald-200 line-through decoration-emerald-500/50' : 'text-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-80" />
                  <span>{isEs ? item.titleEs : item.titleEn}</span>
                </div>
              </div>

              <div className="flex items-center justify-end">
                {item.completed ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(item.targetTab)}
                    className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition cursor-pointer"
                  >
                    {isEs ? 'Completado ✓' : 'Completed ✓'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate(item.targetTab)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-[11px] font-semibold transition cursor-pointer"
                  >
                    <span>{isEs ? item.ctaEs : item.ctaEn}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
