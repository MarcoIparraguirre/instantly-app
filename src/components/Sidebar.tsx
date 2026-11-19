'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Mail,
  Send,
  Inbox,
  Kanban,
  BarChart3,
  Bot,
  Flame,
  PanelLeftClose,
  PanelLeftOpen,
  CreditCard,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useViewMode } from '@/context/ViewModeContext';
import { useAuth } from '@/context/AuthContext';
import { AppTab, canAccessTab, normalizeRole } from '@/types';
import { BrandMark } from '@/components/ui/BrandMark';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  openCopilot: () => void;
  isCopilotOpen: boolean;
  unreadCount?: number;
}

interface SidebarNavItem {
  id: AppTab;
  group: 'operations' | 'administration';
  label: string;
  icon: React.ElementType;
  badge?: string;
  flame?: boolean;
  count?: number;
  desc?: string;
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  openCopilot,
  isCopilotOpen,
  unreadCount = 0,
}: SidebarProps) {
  const { t, language } = useLanguage();
  const { mode } = useViewMode();
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const userRole = normalizeRole(user?.role);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem('misender_sidebar_collapsed');
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
        localStorage.setItem('misender_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Navigation items ordered operationally: Operaciones -> Administración, filtered by RBAC
  const proNavItems: SidebarNavItem[] = [
    { id: 'campaigns', group: 'operations', label: t('nav.campaigns'), icon: Send },
    { id: 'finder', group: 'operations', label: t('nav.finder'), icon: Search, badge: 'B2B' },
    { id: 'accounts', group: 'operations', label: t('nav.accounts'), icon: Mail, flame: true },
    { id: 'unibox', group: 'operations', label: t('nav.unibox'), icon: Inbox, count: unreadCount },
    { id: 'crm', group: 'operations', label: t('nav.crm'), icon: Kanban },
    { id: 'analytics', group: 'operations', label: t('nav.analytics'), icon: BarChart3 },
    {
      id: 'team',
      group: 'administration',
      label: language === 'es' ? 'Mi Equipo' : 'My Team',
      icon: Users,
    },
    {
      id: 'billing',
      group: 'administration',
      label: language === 'es' ? 'Facturación y Planes' : 'Billing & Plans',
      icon: CreditCard,
    },
    {
      id: 'backoffice',
      group: 'administration',
      label: language === 'es' ? 'Backoffice SaaS' : 'SaaS Backoffice',
      icon: ShieldCheck,
      badge: 'ADMIN',
    },
  ];

  const simpleNavItems: SidebarNavItem[] = [
    {
      id: 'campaigns',
      group: 'operations',
      label: language === 'es' ? 'Mis Campañas' : 'My Campaigns',
      icon: Send,
      desc: language === 'es' ? 'Crear y redactar correos' : 'Draft & send',
    },
    {
      id: 'finder',
      group: 'operations',
      label: language === 'es' ? 'Grupos de Leads' : 'Lead Groups',
      icon: Search,
      badge: 'LEADS',
      desc: language === 'es' ? 'Ver y editar contactos' : 'View & edit leads',
    },
    {
      id: 'accounts',
      group: 'operations',
      label: language === 'es' ? 'Cuentas & Entrega' : 'Email Accounts',
      icon: Mail,
      flame: true,
      desc: language === 'es' ? 'Protección de casillas' : 'Inbox health',
    },
    {
      id: 'unibox',
      group: 'operations',
      label: language === 'es' ? 'Mis Respuestas' : 'My Replies',
      icon: Inbox,
      count: unreadCount,
      desc: language === 'es' ? 'Leads interesados' : 'Engaged prospects',
    },
    {
      id: 'team',
      group: 'administration',
      label: language === 'es' ? 'Mi Equipo' : 'My Team',
      icon: Users,
      desc: language === 'es' ? 'Usuarios y roles' : 'Team & roles',
    },
    {
      id: 'billing',
      group: 'administration',
      label: language === 'es' ? 'Facturación y Planes' : 'Billing & Plans',
      icon: CreditCard,
      desc: language === 'es' ? 'Tu plan y límites' : 'Plan & limits',
    },
    {
      id: 'backoffice',
      group: 'administration',
      label: language === 'es' ? 'Backoffice SaaS' : 'SaaS Backoffice',
      icon: ShieldCheck,
      badge: 'ADMIN',
      desc: language === 'es' ? 'Gestión de agencias' : 'Agency management',
    },
  ];

  const rawNavItems = mode === 'simple' ? simpleNavItems : proNavItems;
  const visibleItems = rawNavItems.filter((item) => canAccessTab(userRole, item.id));
  const operationsItems = visibleItems.filter((item) => item.group === 'operations');
  const administrationItems = visibleItems.filter((item) => item.group === 'administration');

  const renderNavItem = (item: SidebarNavItem) => {
    const Icon = item.icon;
    const active = currentTab === item.id;

    if (isCollapsed) {
      return (
        <div key={item.id} className="relative group flex justify-center">
          <button
            onClick={() => setCurrentTab(item.id)}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all relative cursor-pointer ${
              active
                ? 'bg-[#E85D2A] text-white shadow-sm'
                : 'text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26]'
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
          <div className="absolute left-full ml-2 px-2.5 py-1 bg-[#171B26] text-[#F3F5F8] text-[11px] font-semibold rounded-lg shadow-xl border border-[#232938] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            {item.label}
          </div>
        </div>
      );
    }

    return (
      <button
        key={item.id}
        onClick={() => setCurrentTab(item.id)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
          active
            ? 'bg-[#E85D2A]/15 text-[#F3F5F8] border border-[#E85D2A]/40'
            : 'border border-transparent text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26]'
        }`}
      >
        <Icon
          className={`w-4 h-4 shrink-0 ${
            active
              ? 'text-[#E85D2A]'
              : item.id === 'backoffice'
                ? 'text-amber-400'
                : 'text-[#949EB0]'
          }`}
        />
        <span className="truncate">{item.label}</span>

        {item.flame && (
          <Flame className="w-3.5 h-3.5 ml-auto text-amber-400 shrink-0" />
        )}

        {item.badge && (
          <span
            className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-lg font-mono tabular-nums shrink-0 border ${
              item.id === 'backoffice'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-[#171B26] text-[#949EB0] border-[#232938]'
            }`}
          >
            {item.badge}
          </span>
        )}

        {item.count !== undefined && item.count > 0 && (
          <span className="ml-auto text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-lg font-mono tabular-nums font-bold shrink-0">
            {item.count}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`${
        isCollapsed ? 'w-16' : 'w-60'
      } bg-[#11141C] border-r border-[#1D2330] flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none transition-all duration-300 ease-in-out z-20`}
    >
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
        {/* Brand Header */}
        <div
          className={`h-14 flex items-center ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          } border-b border-[#1D2330] shrink-0`}
        >
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandMark size="sm" />
                <div className="truncate">
                  <div className="font-bold text-[#F3F5F8] text-xs tracking-wide flex items-center gap-1.5">
                    <span>MiSender</span>
                    <span className="text-[9px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-lg bg-[#E85D2A]/15 text-[#E85D2A] border border-[#E85D2A]/30">
                      PRO
                    </span>
                  </div>
                  <div className="text-[10px] text-[#949EB0] font-medium truncate">
                    {mode === 'simple'
                      ? language === 'es'
                        ? 'Modo Simple'
                        : 'Simple Mode'
                      : 'Outbound Scale'}
                  </div>
                </div>
              </div>

              <button
                onClick={toggleCollapsed}
                className="p-1.5 rounded-lg text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26] transition cursor-pointer"
                title={language === 'es' ? 'Replegar menú' : 'Collapse sidebar'}
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={toggleCollapsed}
              className="w-9 h-9 rounded-lg bg-[#171B26] hover:bg-[#1D2330] text-[#E85D2A] flex items-center justify-center border border-[#232938] transition cursor-pointer"
              title={language === 'es' ? 'Desplegar menú' : 'Expand sidebar'}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dynamic Navigation Items */}
        <nav className="p-2.5 space-y-3 overflow-y-auto flex-1">
          {operationsItems.length > 0 && (
            <div className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#949EB0]/70">
                  {language === 'es' ? 'Operaciones' : 'Operations'}
                </div>
              )}
              {operationsItems.map(renderNavItem)}
            </div>
          )}

          {administrationItems.length > 0 && (
            <div className="pt-3 border-t border-[#1D2330] space-y-1">
              {!isCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#949EB0]/70">
                  {language === 'es' ? 'Administración' : 'Administration'}
                </div>
              )}
              {administrationItems.map(renderNavItem)}
            </div>
          )}
        </nav>
      </div>

      {/* Footer Area: Copilot & Health */}
      <div className={`${isCollapsed ? 'p-2' : 'p-3'} border-t border-[#1D2330] space-y-2 shrink-0`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center space-y-2">
            {/* Collapsed Copilot */}
            <button
              onClick={openCopilot}
              className={`w-10 h-10 rounded-lg flex items-center justify-center border transition cursor-pointer ${
                isCopilotOpen
                  ? 'bg-[#E85D2A]/15 text-[#E85D2A] border-[#E85D2A]/40'
                  : 'bg-[#171B26] hover:bg-[#1D2330] text-[#949EB0] hover:text-[#F3F5F8] border-[#232938]'
              }`}
              title={t('nav.copilot')}
            >
              <Bot className="w-4 h-4 text-[#E85D2A]" />
            </button>

            {/* Pulse dot for health */}
            <div
              className="w-3 h-3 rounded-full bg-emerald-500/20 flex items-center justify-center"
              title={t('common.engineActive')}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={openCopilot}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                isCopilotOpen
                  ? 'bg-[#E85D2A]/15 text-[#F3F5F8] border-[#E85D2A]/40'
                  : 'bg-[#171B26] hover:bg-[#1D2330] text-[#F3F5F8] border-[#232938]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#E85D2A]" />
                <span>{t('nav.copilot')}</span>
              </div>
              <span className="text-[10px] bg-[#E85D2A]/15 text-[#E85D2A] border border-[#E85D2A]/30 px-1.5 py-0.5 rounded-lg font-mono">
                AI
              </span>
            </button>

            {/* System Health Badge */}
            <div className="bg-[#171B26] rounded-xl p-2.5 border border-[#1D2330] text-left">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-semibold text-[#F3F5F8]">
                  {t('common.engineActive')}
                </span>
              </div>
              <p className="text-[10px] text-[#949EB0] mt-0.5">{t('common.engineDesc')}</p>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
