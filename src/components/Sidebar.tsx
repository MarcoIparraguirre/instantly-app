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
  LogOut,
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
  const { user, signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const userRole = normalizeRole(user?.role);
  const isSuperAdmin = userRole === 'super_admin';

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
            type="button"
            onClick={() => setCurrentTab(item.id)}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all relative cursor-pointer ${
              active
                ? 'bg-[#D5ECD4] text-[#14213D] shadow-sm'
                : 'text-[#A1B0AB] hover:text-white hover:bg-white/8'
            }`}
            title={item.label}
            aria-label={item.label}
          >
            <Icon className="w-4 h-4" />
            {item.count !== undefined && item.count > 0 && (
              <span
                className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                  active ? 'bg-[#14213D]' : 'bg-[#D5ECD4]'
                }`}
              />
            )}
            {item.flame && (
              <span
                className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                  active ? 'bg-[#14213D]' : 'bg-amber-300'
                }`}
              />
            )}
          </button>
        </div>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setCurrentTab(item.id)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
          active
            ? 'bg-white/12 text-white border border-[#D5ECD4]/30'
            : 'border border-transparent text-[#A1B0AB] hover:text-white hover:bg-white/8'
        }`}
      >
        <Icon
          className={`w-4 h-4 shrink-0 ${
            active
              ? 'text-[#D5ECD4]'
              : item.id === 'backoffice'
                ? 'text-[#D5ECD4]'
                : 'text-[#A1B0AB]'
          }`}
        />
        <span className="truncate">{item.label}</span>

        {item.flame && (
          <Flame className="w-3.5 h-3.5 ml-auto text-[#D5ECD4] shrink-0" />
        )}

        {item.badge && (
          <span
            className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-lg font-mono tabular-nums shrink-0 border ${
              item.id === 'backoffice'
                ? 'bg-[#D5ECD4]/15 text-[#D5ECD4] border-[#D5ECD4]/30'
                : 'bg-white/10 text-[#A1B0AB] border-white/15'
            }`}
          >
            {item.badge}
          </span>
        )}

        {item.count !== undefined && item.count > 0 && (
          <span className="ml-auto text-[10px] bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3] px-1.5 py-0.5 rounded-lg font-mono tabular-nums font-bold shrink-0">
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
      } bg-[#14213D] text-white border-r border-[#0E182E] flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none transition-all duration-300 ease-in-out z-20`}
    >
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
        {/* Brand Header */}
        <div
          className={`h-14 flex items-center ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          } border-b border-white/10 shrink-0`}
        >
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandMark size="sm" className="border-[#D5ECD4]/35" />
                <div className="truncate">
                  <div className="font-bold text-white text-xs tracking-wide flex items-center gap-1.5">
                    <span>MiSender</span>
                    <span className="text-[9px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-lg bg-[#D5ECD4]/15 text-[#D5ECD4] border border-[#D5ECD4]/30">
                      PRO
                    </span>
                  </div>
                  <div className="text-[10px] text-[#A1B0AB] font-medium truncate">
                    {mode === 'simple'
                      ? language === 'es'
                        ? 'Modo Simple'
                        : 'Simple Mode'
                      : 'Outbound Scale'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleCollapsed}
                className="p-1.5 rounded-lg text-[#A1B0AB] hover:text-white hover:bg-white/10 transition cursor-pointer"
                title={language === 'es' ? 'Replegar menú' : 'Collapse sidebar'}
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/15 text-[#D5ECD4] flex items-center justify-center border border-white/15 transition cursor-pointer"
              title={language === 'es' ? 'Desplegar menú' : 'Expand sidebar'}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dynamic Navigation Items */}
        <nav className="p-2.5 space-y-3 overflow-y-auto overflow-x-hidden flex-1">
          {operationsItems.length > 0 && (
            <div className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#A1B0AB]/75">
                  {language === 'es' ? 'Operaciones' : 'Operations'}
                </div>
              )}
              {operationsItems.map(renderNavItem)}
            </div>
          )}

          {administrationItems.length > 0 && (
            <div className="pt-3 border-t border-white/10 space-y-1">
              {!isCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#A1B0AB]/75">
                  {language === 'es' ? 'Administración' : 'Administration'}
                </div>
              )}
              {administrationItems.map(renderNavItem)}
            </div>
          )}
        </nav>
      </div>

      {/* Footer Area: Copilot (Operational roles), Engine Health & Sign Out */}
      <div className={`${isCollapsed ? 'p-2' : 'p-3'} border-t border-white/10 space-y-2 shrink-0`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center space-y-2">
            {/* Collapsed Copilot (Operational roles only) */}
            {!isSuperAdmin && (
              <button
                type="button"
                onClick={openCopilot}
                className={`w-10 h-10 rounded-lg flex items-center justify-center border transition cursor-pointer ${
                  isCopilotOpen
                    ? 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
                    : 'bg-white/10 hover:bg-white/15 text-[#D5ECD4] border-white/15'
                }`}
                title={t('nav.copilot')}
              >
                <Bot className="w-4 h-4" />
              </button>
            )}

            {/* Pulse dot for health */}
            <div
              className="w-3 h-3 rounded-full bg-[#D5ECD4]/20 flex items-center justify-center"
              title={t('common.engineActive')}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#D5ECD4] animate-pulse" />
            </div>

            {/* Collapsed Sign Out */}
            {user && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-[#A1B0AB] hover:text-white hover:bg-white/10 transition cursor-pointer"
                title={language === 'es' ? 'Cerrar Sesión' : 'Sign Out'}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <>
            {!isSuperAdmin && (
              <button
                type="button"
                onClick={openCopilot}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                  isCopilotOpen
                    ? 'bg-white/15 text-white border-[#D5ECD4]/40'
                    : 'bg-white/10 hover:bg-white/15 text-[#D5ECD4] border-white/15'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#D5ECD4]" />
                  <span>{t('nav.copilot')}</span>
                </div>
                <span className="text-[10px] bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3] px-1.5 py-0.5 rounded-lg font-mono font-bold">
                  AI
                </span>
              </button>
            )}

            {/* System Health Badge */}
            <div className="bg-white/5 rounded-xl p-2.5 border border-white/10 text-left">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#D5ECD4] animate-pulse" />
                <span className="text-[11px] font-semibold text-white">
                  {isSuperAdmin
                    ? language === 'es'
                      ? 'Backoffice SaaS Activo'
                      : 'SaaS Backoffice Active'
                    : t('common.engineActive')}
                </span>
              </div>
              <p className="text-[10px] text-[#A1B0AB] mt-0.5">
                {isSuperAdmin
                  ? language === 'es'
                    ? 'Control de agencias y usuarios'
                    : 'Agencies & user provisioning'
                  : t('common.engineDesc')}
              </p>
            </div>

            {/* Bottom Sign Out */}
            {user && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#A1B0AB] hover:text-white hover:bg-white/8 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>{language === 'es' ? 'Cerrar Sesión' : 'Sign Out'}</span>
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
