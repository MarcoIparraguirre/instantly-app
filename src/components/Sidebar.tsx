'use client';

import React from 'react';
import { 
  Search, Mail, Send, Inbox, Kanban, BarChart3, Bot, Zap, Flame, Sparkles
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useViewMode } from '@/context/ViewModeContext';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  openCopilot: () => void;
  isCopilotOpen: boolean;
  unreadCount?: number;
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  openCopilot,
  isCopilotOpen,
  unreadCount = 1
}: SidebarProps) {
  const { t, language } = useLanguage();
  const { mode, setMode } = useViewMode();

  // Navigation Items according to active mode
  const proNavItems = [
    { id: 'finder', label: t('nav.finder'), icon: Search, badge: 'B2B' },
    { id: 'accounts', label: t('nav.accounts'), icon: Mail, flame: true },
    { id: 'campaigns', label: t('nav.campaigns'), icon: Send },
    { id: 'unibox', label: t('nav.unibox'), icon: Inbox, count: unreadCount },
    { id: 'crm', label: t('nav.crm'), icon: Kanban },
    { id: 'analytics', label: t('nav.analytics'), icon: BarChart3 },
  ];

  const simpleNavItems = [
    {
      id: 'campaigns',
      label: language === 'es' ? 'Mis Campañas' : 'My Campaigns',
      icon: Send,
      desc: language === 'es' ? 'Crear y redactar correos' : 'Draft & send'
    },
    {
      id: 'accounts',
      label: language === 'es' ? 'Cuentas & Entrega' : 'Email Accounts',
      icon: Mail,
      flame: true,
      desc: language === 'es' ? 'Protección de casillas' : 'Inbox health'
    },
    {
      id: 'unibox',
      label: language === 'es' ? 'Mis Respuestas' : 'My Replies',
      icon: Inbox,
      count: unreadCount,
      desc: language === 'es' ? 'Leads interesados' : 'Engaged prospects'
    },
    {
      id: 'finder',
      label: language === 'es' ? 'Buscar Prospectos' : 'Find Leads',
      icon: Search,
      badge: 'B2B',
      desc: language === 'es' ? 'Contactos calificados' : 'Verified B2B'
    }
  ];

  const currentNavItems = mode === 'simple' ? simpleNavItems : proNavItems;

  return (
    <aside className="w-60 bg-[#0c121e] border-r border-slate-800 flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none">
      <div>
        {/* Brand Header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-4 h-4 text-white fill-white" />
            </div>
            <div>
              <div className="font-bold text-white text-sm tracking-wide flex items-center gap-1.5">
                MiSender <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">PRO</span>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                {mode === 'simple' ? (language === 'es' ? 'Modo Simple' : 'Simple Mode') : 'Outbound Scale'}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Navigation Items */}
        <nav className="p-3 space-y-1 mt-2">
          {currentNavItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>

                {item.flame && (
                  <Flame className="w-3.5 h-3.5 ml-auto text-amber-400 animate-pulse" />
                )}

                {item.badge && (
                  <span className="ml-auto text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-mono">
                    {item.badge}
                  </span>
                )}

                {item.count !== undefined && item.count > 0 && (
                  <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-bold">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Area: Switch Mode & Copilot */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        {/* Simple vs Pro Quick Switcher Button */}
        {mode === 'simple' ? (
          <button
            onClick={() => setMode('pro')}
            className="w-full flex items-center justify-between bg-slate-900 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/30 px-3 py-2 rounded-xl text-[11px] text-slate-300 transition"
          >
            <div className="flex items-center gap-1.5">
              <span>⚡</span>
              <span className="font-semibold">{language === 'es' ? 'Ver Modo Pro (Avanzado)' : 'Open Pro Mode'}</span>
            </div>
            <span className="text-[10px] text-indigo-400">→</span>
          </button>
        ) : (
          <button
            onClick={() => setMode('simple')}
            className="w-full flex items-center justify-between bg-slate-900 hover:bg-blue-950/40 border border-slate-800 hover:border-blue-500/30 px-3 py-2 rounded-xl text-[11px] text-slate-300 transition"
          >
            <div className="flex items-center gap-1.5">
              <span>🐣</span>
              <span className="font-semibold">{language === 'es' ? 'Volver a Modo Simple' : 'Back to Simple Mode'}</span>
            </div>
            <span className="text-[10px] text-blue-400">→</span>
          </button>
        )}

        <button
          onClick={openCopilot}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition border ${
            isCopilotOpen
              ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-inner'
              : 'bg-slate-900/60 hover:bg-indigo-950/40 text-slate-300 hover:text-indigo-300 border-slate-800 hover:border-indigo-500/40'
          }`}
        >
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-400" />
            <span>{t('nav.copilot')}</span>
          </div>
          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded font-mono">
            AI
          </span>
        </button>

        {/* System Health Badge */}
        <div className="bg-slate-900/90 rounded-xl p-2.5 border border-slate-800/90 text-left">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-slate-300">{t('common.engineActive')}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">{t('common.engineDesc')}</p>
        </div>
      </div>
    </aside>
  );
}
