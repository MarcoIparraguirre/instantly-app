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
import { useAuth } from '@/context/AuthContext';
import { normalizeRole } from '@/types';

export default function ModeSelectionModal() {
  const { isModePickerOpen, closeModePicker, setMode, mode } = useViewMode();
  const { language } = useLanguage();
  const { user } = useAuth();
  const isEs = language === 'es';
  const isSuperAdmin = normalizeRole(user?.role) === 'super_admin';

  useEffect(() => {
    if (!isModePickerOpen || !user || isSuperAdmin) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModePicker();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModePickerOpen, closeModePicker, user, isSuperAdmin]);

  if (!user || isSuperAdmin || !isModePickerOpen) return null;

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
        className="bg-white border border-[#DCE3DF] text-[#14213D] rounded-2xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative space-y-6"
      >
        {/* Close button if user already had a mode */}
        <button
          type="button"
          onClick={closeModePicker}
          aria-label={isEs ? 'Cerrar' : 'Close'}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0] transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-2 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-xl bg-[#D5ECD4]/60 text-[#14213D] border border-[#C3DAC3] flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-[#14213D] tracking-tight">
            {isEs ? '¿Cómo prefieres usar MiSender?' : 'How would you like to use MiSender?'}
          </h2>
          <p className="text-xs text-[#5C6F68] leading-relaxed">
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
            className={`p-5 rounded-xl border cursor-pointer transition flex flex-col justify-between space-y-4 hover:border-[#14213D]/60 ${
              mode === 'simple'
                ? 'bg-[#D5ECD4]/45 border-[#14213D] shadow-sm'
                : 'bg-[#F4F7F5] border-[#DCE3DF]'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#D5ECD4] border border-[#C3DAC3] flex items-center justify-center text-[#14213D]">
                  <Layers className="w-4 h-4" />
                </div>
                <span className="text-[10px] bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3] px-2 py-0.5 rounded-lg font-bold uppercase tracking-wider">
                  {isEs ? 'Recomendado para novatos' : 'Beginner Friendly'}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-base text-[#14213D]">
                  {isEs ? 'Modo Simple' : 'Simple Mode'}
                </h3>
                <p className="text-xs text-[#5C6F68] mt-1 leading-relaxed">
                  {isEs
                    ? 'Interfaz limpia y guiada. Escribe tu correo con plantillas probadas y deja que el sistema configure la parte técnica automáticamente.'
                    : 'Clean and guided interface. Draft emails with tested templates and let the system configure technical delivery automatically.'}
                </p>
              </div>

              <ul className="text-xs text-[#14213D] space-y-2 pt-2 border-t border-[#DCE3DF]">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#5C6F68] shrink-0" />
                  <span>{isEs ? '3 Plantillas comerciales listas' : '3 High-impact ready templates'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#5C6F68] shrink-0" />
                  <span>{isEs ? 'Horarios y rotación automática' : 'Auto-pilot schedules & safe sending'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#5C6F68] shrink-0" />
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
                  ? 'bg-[#14213D] hover:bg-[#1E3158] text-white'
                  : 'bg-[#D5ECD4] hover:bg-[#C3DAC3] text-[#14213D] border border-[#C3DAC3]'
              }`}
            >
              <span>{isEs ? 'Elegir Modo Simple' : 'Choose Simple Mode'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: Pro Mode */}
          <div
            onClick={() => setMode('pro')}
            className={`p-5 rounded-xl border cursor-pointer transition flex flex-col justify-between space-y-4 hover:border-[#14213D]/60 ${
              mode === 'pro'
                ? 'bg-[#D5ECD4]/45 border-[#14213D] shadow-sm'
                : 'bg-[#F4F7F5] border-[#DCE3DF]'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#14213D] border border-[#14213D] flex items-center justify-center text-white">
                  <Sliders className="w-4 h-4" />
                </div>
                <span className="text-[10px] bg-[#14213D] text-white px-2 py-0.5 rounded-lg font-bold uppercase tracking-wider">
                  {isEs ? 'Expertos & Agencias' : 'For Power Users'}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-base text-[#14213D]">
                  {isEs ? 'Modo Pro (Avanzado)' : 'Pro Mode (Advanced)'}
                </h3>
                <p className="text-xs text-[#5C6F68] mt-1 leading-relaxed">
                  {isEs
                    ? 'Todo el poder del motor: auditoría DNS (SPF, DKIM, DMARC), pruebas A/Z con 5 variantes, Spintax y CRM Dealflow.'
                    : 'Full engine capabilities: deep DNS checker (SPF, DKIM, DMARC), 5 A/Z testing variants, Spintax syntax and CRM Dealflow.'}
                </p>
              </div>

              <ul className="text-xs text-[#14213D] space-y-2 pt-2 border-t border-[#DCE3DF]">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#14213D] shrink-0" />
                  <span>{isEs ? '6 Módulos completos con CRM' : 'Full 6 enterprise modules with CRM'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#14213D] shrink-0" />
                  <span>{isEs ? 'Auditor DNS y rampa de Warmup' : 'Live DNS auditor & warmup curve'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#14213D] shrink-0" />
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
                  ? 'bg-[#14213D] hover:bg-[#1E3158] text-white'
                  : 'bg-white hover:bg-[#EEF3F0] text-[#14213D] border border-[#DCE3DF]'
              }`}
            >
              <span>{isEs ? 'Elegir Modo Pro' : 'Choose Pro Mode'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-[11px] text-center text-[#5C6F68] flex items-center justify-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-[#5C6F68] shrink-0" />
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
