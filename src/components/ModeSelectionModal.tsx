'use client';

import React, { useEffect } from 'react';
import {
  Sparkles,
  Check,
  ArrowRight,
  Layers,
  Sliders,
  Lightbulb,
  X,
} from 'lucide-react';
import { useViewMode } from '@/context/ViewModeContext';
import { useLanguage } from '@/context/LanguageContext';

export default function ModeSelectionModal() {
  const { isModePickerOpen, closeModePicker, setMode, mode } = useViewMode();
  const { language } = useLanguage();
  const isEs = language === 'es';

  useEffect(() => {
    if (!isModePickerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModePicker();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModePickerOpen, closeModePicker]);

  if (!isModePickerOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEs ? 'Selección de modo de trabajo' : 'Select experience mode'}
      onClick={closeModePicker}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#11141C] border border-[#232938] rounded-2xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative space-y-6"
      >
        {/* Close button if user already had a mode */}
        <button
          type="button"
          onClick={closeModePicker}
          aria-label={isEs ? 'Cerrar' : 'Close'}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26] transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-2 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-xl bg-[#171B26] text-[#E85D2A] border border-[#232938] flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-[#F3F5F8] tracking-tight">
            {isEs ? '¿Cómo prefieres usar MiSender?' : 'How would you like to use MiSender?'}
          </h2>
          <p className="text-xs text-[#949EB0] leading-relaxed">
            {isEs
              ? 'Diseñado tanto para quienes dan sus primeros pasos como para agencias de alto volumen. Puedes alternar en cualquier momento con 1 clic.'
              : 'Designed for beginners launching their first campaign and for agencies scaling high volume. Switch anytime with 1 click.'}
          </p>
        </div>

        {/* 2 Mode Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Simple Mode */}
          <div
            onClick={() => setMode('simple')}
            className={`p-5 rounded-xl border cursor-pointer transition flex flex-col justify-between space-y-4 hover:border-[#E85D2A]/60 ${
              mode === 'simple'
                ? 'bg-[#E85D2A]/10 border-[#E85D2A]/60'
                : 'bg-[#171B26] border-[#232938]'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#11141C] border border-[#232938] flex items-center justify-center text-emerald-400">
                  <Layers className="w-4 h-4" />
                </div>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-lg font-bold uppercase tracking-wider">
                  {isEs ? 'Recomendado para novatos' : 'Beginner Friendly'}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-base text-[#F3F5F8]">
                  {isEs ? 'Modo Simple' : 'Simple Mode'}
                </h3>
                <p className="text-xs text-[#949EB0] mt-1 leading-relaxed">
                  {isEs
                    ? 'Interfaz limpia y guiada. Escribe tu correo con plantillas probadas y deja que el sistema configure la parte técnica automáticamente.'
                    : 'Clean and guided interface. Draft emails with tested templates and let the system configure technical delivery automatically.'}
                </p>
              </div>

              <ul className="text-xs text-[#F3F5F8]/90 space-y-2 pt-2 border-t border-[#232938]">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isEs ? '3 Plantillas comerciales listas' : '3 High-impact ready templates'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isEs ? 'Horarios y rotación automática' : 'Auto-pilot schedules & safe sending'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isEs ? 'Semáforo de entrega (sin tecnicismos)' : 'Traffic-light health (no jargon)'}</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode('simple');
              }}
              className={`w-full text-xs font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                mode === 'simple'
                  ? 'bg-[#E85D2A] hover:bg-[#F26B3A] text-white'
                  : 'bg-[#11141C] hover:bg-[#1D2330] text-[#F3F5F8] border border-[#232938]'
              }`}
            >
              <span>{isEs ? 'Elegir Modo Simple' : 'Choose Simple Mode'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: Pro Mode */}
          <div
            onClick={() => setMode('pro')}
            className={`p-5 rounded-xl border cursor-pointer transition flex flex-col justify-between space-y-4 hover:border-[#E85D2A]/60 ${
              mode === 'pro'
                ? 'bg-[#E85D2A]/10 border-[#E85D2A]/60'
                : 'bg-[#171B26] border-[#232938]'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#11141C] border border-[#232938] flex items-center justify-center text-[#E85D2A]">
                  <Sliders className="w-4 h-4" />
                </div>
                <span className="text-[10px] bg-[#E85D2A]/15 text-[#E85D2A] border border-[#E85D2A]/30 px-2 py-0.5 rounded-lg font-bold uppercase tracking-wider">
                  {isEs ? 'Expertos & Agencias' : 'For Power Users'}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-base text-[#F3F5F8]">
                  {isEs ? 'Modo Pro (Avanzado)' : 'Pro Mode (Advanced)'}
                </h3>
                <p className="text-xs text-[#949EB0] mt-1 leading-relaxed">
                  {isEs
                    ? 'Todo el poder del motor: auditoría DNS (SPF, DKIM, DMARC), pruebas A/Z con 5 variantes, Spintax y CRM Dealflow.'
                    : 'Full engine capabilities: deep DNS checker (SPF, DKIM, DMARC), 5 A/Z testing variants, Spintax syntax and CRM Dealflow.'}
                </p>
              </div>

              <ul className="text-xs text-[#F3F5F8]/90 space-y-2 pt-2 border-t border-[#232938]">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#E85D2A] shrink-0" />
                  <span>{isEs ? '6 Módulos completos con CRM' : 'Full 6 enterprise modules with CRM'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#E85D2A] shrink-0" />
                  <span>{isEs ? 'Auditor DNS y rampa de Warmup' : 'Live DNS auditor & warmup curve'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#E85D2A] shrink-0" />
                  <span>{isEs ? 'Pruebas A/Z & sintaxis Spintax' : 'A/Z tests & Spintax syntax'}</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode('pro');
              }}
              className={`w-full text-xs font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                mode === 'pro'
                  ? 'bg-[#E85D2A] hover:bg-[#F26B3A] text-white'
                  : 'bg-[#11141C] hover:bg-[#1D2330] text-[#F3F5F8] border border-[#232938]'
              }`}
            >
              <span>{isEs ? 'Elegir Modo Pro' : 'Choose Pro Mode'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-[11px] text-center text-[#949EB0] flex items-center justify-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            {isEs
              ? 'Podrás alternar entre Modo Simple y Modo Pro en cualquier momento desde la barra superior.'
              : 'You can switch between Simple Mode and Pro Mode anytime from the top bar.'}
          </span>
        </p>
      </div>
    </div>
  );
}
