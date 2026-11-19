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
  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(null);
  const [expandedInSession, setExpandedInSession] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'true') {
          setManualCollapsed(true);
        } else if (saved === 'false') {
          setManualCollapsed(false);
        }
      } catch {}
    });
  }, []);

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

  const isCollapsed = progressPct === 100 ? !expandedInSession : manualCollapsed === true;

  const toggleCollapsed = () => {
    const nextCollapsed = !isCollapsed;
    setManualCollapsed(nextCollapsed);
    if (progressPct === 100) {
      setExpandedInSession(!nextCollapsed);
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(nextCollapsed));
    } catch {}
  };

  if (isCollapsed) {
    return (
      <div className="min-h-[36px] px-5 py-1.5 bg-white border-b border-[#DCE3DF] text-[#14213D] flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-bold text-[#14213D] flex items-center gap-1.5">
            {progressPct === 100 ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-[#5C6F68]" />
            ) : (
              <Rocket className="w-3.5 h-3.5 text-[#14213D]" />
            )}
            <span>
              {progressPct === 100
                ? isEs
                  ? 'Motor Listo'
                  : 'Engine Ready'
                : isEs
                  ? 'Primeros Pasos'
                  : 'Quick Setup'}
            </span>
          </span>

          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-[#EEF3F0] border border-[#DCE3DF] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  progressPct === 100 ? 'bg-[#5C6F68]' : 'bg-[#14213D]'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[11px] font-mono tabular-nums font-semibold text-[#14213D]">
              {completedCount}/{milestones.length} ({progressPct}%)
            </span>
          </div>

          {nextPending && (
            <button
              type="button"
              onClick={() => onNavigate(nextPending.targetTab)}
              className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold text-[#14213D] hover:text-[#1E3158] transition cursor-pointer"
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#D5ECD4] hover:bg-[#C3DAC3] border border-[#C3DAC3] text-[#14213D] text-[11px] font-semibold transition cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{isEs ? 'Iniciar Tour Guiado' : 'Start Guided Tour'}</span>
          </button>

          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] text-[#5C6F68] hover:text-[#14213D] text-[11px] font-semibold transition cursor-pointer"
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
      className="px-5 py-3.5 bg-white border-b border-[#DCE3DF] text-[#14213D] shrink-0 space-y-3"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#EEF3F0] border border-[#DCE3DF] flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4 text-[#14213D]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-[#14213D]">
                {progressPct === 100
                  ? isEs
                    ? 'Tu motor outbound está listo para escalar'
                    : 'Your outbound engine is ready to scale'
                  : isEs
                    ? 'Checklist de Puesta en Marcha'
                    : 'Launch Readiness Checklist'}
              </h2>
              <span
                className={`text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-lg border ${
                  progressPct === 100
                    ? 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
                    : 'bg-[#EEF3F0] text-[#14213D] border-[#DCE3DF]'
                }`}
              >
                {completedCount}/{milestones.length} • {progressPct}%
              </span>
            </div>
            <p className="text-[11px] text-[#5C6F68]">
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D5ECD4] hover:bg-[#C3DAC3] border border-[#C3DAC3] text-[#14213D] text-xs font-bold transition cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{isEs ? 'Iniciar Tour Guiado' : 'Start Guided Tour'}</span>
          </button>

          <button
            type="button"
            onClick={toggleCollapsed}
            title={isEs ? 'Minimizar checklist' : 'Minimize checklist'}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] text-[#5C6F68] hover:text-[#14213D] text-xs font-semibold transition cursor-pointer"
          >
            <span className="hidden sm:inline">{isEs ? 'Minimizar' : 'Minimize'}</span>
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-[#EEF3F0] border border-[#DCE3DF] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            progressPct === 100 ? 'bg-[#5C6F68]' : 'bg-[#14213D]'
          }`}
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
                  ? 'bg-[#D5ECD4]/45 border-[#C3DAC3]'
                  : 'bg-[#F4F7F5] border-[#DCE3DF] hover:border-[#A1B0AB]'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                {item.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-[#5C6F68] shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-4 h-4 text-[#A1B0AB] shrink-0 mt-0.5" />
                )}
                <div
                  className={`text-xs font-semibold leading-snug flex items-start gap-1.5 min-w-0 ${
                    item.completed
                      ? 'text-[#5C6F68] line-through decoration-[#5C6F68]/50'
                      : 'text-[#14213D]'
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
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[#D5ECD4] hover:bg-[#C3DAC3] text-[#14213D] border border-[#C3DAC3] transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{isEs ? 'Completado' : 'Completed'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate(item.targetTab)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#14213D] hover:bg-[#1E3158] text-white text-[11px] font-semibold transition cursor-pointer"
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
