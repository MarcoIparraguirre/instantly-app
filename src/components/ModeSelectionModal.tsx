'use client';

import React from 'react';
import { 
  Sparkles, Zap, Check, ArrowRight, ShieldCheck, Mail, Send, Layers, X
} from 'lucide-react';
import { useViewMode } from '@/context/ViewModeContext';
import { useLanguage } from '@/context/LanguageContext';

export default function ModeSelectionModal() {
  const { isModePickerOpen, closeModePicker, setMode, mode } = useViewMode();
  const { t, language } = useLanguage();

  if (!isModePickerOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0e1422] border border-slate-800 rounded-3xl p-8 max-w-2xl w-full shadow-2xl relative space-y-6">
        {/* Close button if user already had a mode */}
        <button
          onClick={closeModePicker}
          className="absolute top-6 right-6 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-2 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {language === 'es' ? '¿Cómo prefieres usar Instantly?' : 'How would you like to use Instantly?'}
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {language === 'es'
              ? 'Diseñado tanto para quienes dan sus primeros pasos como para agencias de alto volumen. Puedes alternar en cualquier momento con 1 clic.'
              : 'Designed for beginners launching their first campaign and for agencies scaling high volume. Switch anytime with 1 click.'}
          </p>
        </div>

        {/* 2 Mode Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Simple Mode */}
          <div
            onClick={() => setMode('simple')}
            className={`p-6 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-4 hover:border-blue-500 hover:bg-slate-900/80 ${
              mode === 'simple'
                ? 'bg-blue-950/20 border-blue-500/60 ring-1 ring-blue-500/30'
                : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">🐣</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  {language === 'es' ? 'Recomendado para novatos' : 'Beginner Friendly'}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-base text-white">
                  {language === 'es' ? 'Modo Simple' : 'Simple Mode'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {language === 'es'
                    ? 'Interfaz limpia y guiada. Escribe tu correo con plantillas probadas y deja que el sistema configure la parte técnica automáticamente.'
                    : 'Clean and guided interface. Draft emails with tested templates and let the system configure technical delivery automatically.'}
                </p>
              </div>

              <ul className="text-xs text-slate-300 space-y-2 pt-2 border-t border-slate-800/80">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{language === 'es' ? '3 Plantillas comerciales listas' : '3 High-impact ready templates'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{language === 'es' ? 'Horarios y rotación automática' : 'Auto-pilot schedules & safe sending'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{language === 'es' ? 'Semáforo de entrega (sin tecnicismos)' : 'Traffic-light health (no jargon)'}</span>
                </li>
              </ul>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setMode('simple');
              }}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2.5 rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              <span>{language === 'es' ? 'Elegir Modo Simple' : 'Choose Simple Mode'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: Pro Mode */}
          <div
            onClick={() => setMode('pro')}
            className={`p-6 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-4 hover:border-indigo-500 hover:bg-slate-900/80 ${
              mode === 'pro'
                ? 'bg-indigo-950/20 border-indigo-500/60 ring-1 ring-indigo-500/30'
                : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">⚡</span>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  {language === 'es' ? 'Expertos & Agencias' : 'For Power Users'}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-base text-white">
                  {language === 'es' ? 'Modo Pro (Avanzado)' : 'Pro Mode (Advanced)'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {language === 'es'
                    ? 'Todo el poder del motor: auditoría DNS (SPF, DKIM, DMARC), pruebas A/Z con 5 variantes, Spintax y CRM Dealflow.'
                    : 'Full engine capabilities: deep DNS checker (SPF, DKIM, DMARC), 5 A/Z testing variants, Spintax syntax and CRM Dealflow.'}
                </p>
              </div>

              <ul className="text-xs text-slate-300 space-y-2 pt-2 border-t border-slate-800/80">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>{language === 'es' ? '6 Módulos completos con CRM' : 'Full 6 enterprise modules with CRM'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>{language === 'es' ? 'Auditor DNS y rampa de Warmup' : 'Live DNS auditor & warmup curve'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>{language === 'es' ? 'Pruebas A/Z & sintaxis Spintax' : 'A/Z tests & Spintax syntax'}</span>
                </li>
              </ul>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setMode('pro');
              }}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2.5 rounded-xl border border-slate-700 transition flex items-center justify-center gap-2"
            >
              <span>{language === 'es' ? 'Elegir Modo Pro' : 'Choose Pro Mode'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-[11px] text-center text-slate-500">
          {language === 'es'
            ? '💡 Podrás alternar entre Modo Simple y Modo Pro en cualquier momento desde la barra superior.'
            : '💡 You can switch between Simple Mode and Pro Mode anytime from the top bar.'}
        </p>
      </div>
    </div>
  );
}
