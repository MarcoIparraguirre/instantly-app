'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, Mail, Send, Inbox, Kanban, BarChart3, Bot, Zap, Flame, Sparkles,
  PanelLeftClose, PanelLeftOpen, ChevronLeft, ChevronRight
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('misender_sidebar_collapsed');
      if (saved === 'true') {
        setIsCollapsed(true);
      }
    } catch (e) {}
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('misender_sidebar_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

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
    <aside 
      className={`${
        isCollapsed ? 'w-16' : 'w-60'
      } bg-[#0c121e] border-r border-slate-800 flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none transition-all duration-300 ease-in-out z-20`}
    >
      <div>
        {/* Brand Header */}
        <div className={`h-14 flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'} border-b border-slate-800/80`}>
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
                  <Zap className="w-4 h-4 text-white fill-white" />
                </div>
                <div className="truncate">
                  <div className="font-bold text-white text-xs tracking-wide flex items-center gap-1.5">
                    MiSender <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">PRO</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium truncate">
                    {mode === 'simple' ? (language === 'es' ? 'Modo Simple' : 'Simple Mode') : 'Outbound Scale'}
                  </div>
                </div>
              </div>

              <button
                onClick={toggleCollapsed}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title={language === 'es' ? 'Replegar menú' : 'Collapse sidebar'}
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={toggleCollapsed}
              className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-blue-400 flex items-center justify-center border border-slate-800 hover:border-slate-700 transition"
              title={language === 'es' ? 'Desplegar menú' : 'Expand sidebar'}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dynamic Navigation Items */}
        <nav className={`p-2 space-y-1 mt-2`}>
          {currentNavItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;

            if (isCollapsed) {
              return (
                <div key={item.id} className="relative group flex justify-center">
                  <button
                    onClick={() => setCurrentTab(item.id)}
                    className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all relative ${
                      active
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                    title={item.label}
                  >
                    <Icon className="w-4 h-4" />
                    {item.count !== undefined && item.count > 0 && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400" />
                    )}
                    {item.flame && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </button>

                  {/* Tooltip on Hover */}
                  <div className="absolute left-full ml-2 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded-lg shadow-xl border border-slate-800 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    {item.label}
                  </div>
                </div>
              );
            }

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
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>

                {item.flame && (
                  <Flame className="w-3.5 h-3.5 ml-auto text-amber-400 animate-pulse shrink-0" />
                )}

                {item.badge && (
                  <span className="ml-auto text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-mono shrink-0">
                    {item.badge}
                  </span>
                )}

                {item.count !== undefined && item.count > 0 && (
                  <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-bold shrink-0">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Area: Switch Mode & Copilot */}
      <div className={`${isCollapsed ? 'p-2' : 'p-3'} border-t border-slate-800/80 space-y-2`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center space-y-2">
            {/* Collapsed Mode Switcher */}
            <button
              onClick={() => setMode(mode === 'simple' ? 'pro' : 'simple')}
              className="w-11 h-11 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm flex items-center justify-center transition"
              title={mode === 'simple' ? 'Cambiar a Modo Pro' : 'Cambiar a Modo Simple'}
            >
              {mode === 'simple' ? '⚡' : '🐣'}
            </button>

            {/* Collapsed Copilot */}
            <button
              onClick={openCopilot}
              className={`w-11 h-11 rounded-xl flex items-center justify-center border transition ${
                isCopilotOpen
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-inner'
                  : 'bg-slate-900/60 hover:bg-indigo-950/40 text-slate-300 hover:text-indigo-300 border-slate-800 hover:border-indigo-500/40'
              }`}
              title={t('nav.copilot')}
            >
              <Bot className="w-4 h-4 text-indigo-400" />
            </button>

            {/* Pulse dot for health */}
            <div 
              className="w-3 h-3 rounded-full bg-emerald-400/20 flex items-center justify-center"
              title={t('common.engineActive')}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </aside>
  );
}
