'use client';

import React, { useState, useEffect } from 'react';
import { 
  Building2, Search, Zap, ChevronDown, Check, Sparkles, Settings,
  Mail, Users, Inbox, Server, Kanban, BarChart3, Flame,
  CreditCard, LogIn, LogOut, Plus, Crown, Compass
} from 'lucide-react';
import { Workspace, Campaign, SAAS_PLANS, normalizePlan } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useViewMode } from '@/context/ViewModeContext';
import { useAdminProfile } from '@/context/AdminProfileContext';
import { useAuth } from '@/context/AuthContext';
import LanguageToggle from './LanguageToggle';
import AdminProfileModal from './AdminProfileModal';
import WorkspaceManagerModal from './WorkspaceManagerModal';

interface TopbarProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  onUpdateWorkspaces?: (workspaces: Workspace[]) => void;
  openCopilot: () => void;
  onOpenTour?: () => void;
  onNavigate?: (tab: string, campaignId?: string) => void;
  campaigns?: Campaign[];
}

export default function Topbar({
  currentWorkspace,
  workspaces,
  onSelectWorkspace,
  onUpdateWorkspaces,
  openCopilot,
  onOpenTour,
  onNavigate,
  campaigns = []
}: TopbarProps) {
  const { t, language } = useLanguage();
  const { mode, setMode } = useViewMode();
  const { profile, setIsProfileModalOpen } = useAdminProfile();
  const { user, openAuthModal, signOut } = useAuth();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isWorkspaceManagerOpen, setIsWorkspaceManagerOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number>(7);

  const activePlan = normalizePlan(currentWorkspace.plan);
  const planConfig = SAAS_PLANS[activePlan];
  const subStatus = currentWorkspace.subscriptionStatus || 'trialing';

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!currentWorkspace.trialEndsAt) {
        setTrialDaysLeft(7);
        return;
      }
      const diff = new Date(currentWorkspace.trialEndsAt).getTime() - Date.now();
      setTrialDaysLeft(Number.isNaN(diff) ? 7 : Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24))));
    }, 0);
    return () => clearTimeout(timer);
  }, [currentWorkspace.trialEndsAt]);

  // Global shortcut (Cmd+K / Ctrl+K) and Escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => {
          if (!prev) {
            setSearchQuery('');
            setSelectedIndex(0);
          }
          return !prev;
        });
      } else if (e.key === 'Escape' && isCommandPaletteOpen) {
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen]);

  const navItems = [
    { 
      id: 'campaigns', 
      tab: 'campaigns', 
      label: language === 'es' ? 'Campañas' : 'Campaigns', 
      icon: Mail, 
      desc: language === 'es' ? 'Gestionar secuencias y envíos outbound' : 'Manage sequences & outbound outreach' 
    },
    { 
      id: 'leads', 
      tab: 'finder', 
      label: language === 'es' ? 'Leads' : 'Leads', 
      icon: Users, 
      desc: language === 'es' ? 'Buscador B2B, importación y base de prospectos' : 'B2B search, CSV import & prospect database' 
    },
    { 
      id: 'accounts', 
      tab: 'accounts', 
      label: language === 'es' ? 'Casillas' : 'Mailboxes', 
      icon: Server, 
      desc: language === 'es' ? 'Casillas de correo SMTP, límites y auditor DNS' : 'SMTP mailboxes, daily limits & DNS audit' 
    },
    { 
      id: 'unibox', 
      tab: 'unibox', 
      label: language === 'es' ? 'Unibox' : 'Unibox', 
      icon: Inbox, 
      desc: language === 'es' ? 'Bandeja centralizada y respuestas con IA' : 'Unified inbox & AI reply sentiments' 
    },
    { 
      id: 'crm', 
      tab: 'crm', 
      label: language === 'es' ? 'CRM' : 'CRM', 
      icon: Kanban, 
      desc: language === 'es' ? 'Pipeline y flujo de tratos comerciales' : 'Sales pipeline & dealflow kanban' 
    },
    { 
      id: 'warmup', 
      tab: 'accounts', 
      label: language === 'es' ? 'Calentamiento' : 'Warmup', 
      icon: Flame, 
      desc: language === 'es' ? 'Red P2P de reputación y warmup de casillas' : 'P2P network warmup & deliverability reputation' 
    },
    { 
      id: 'analytics', 
      tab: 'analytics', 
      label: language === 'es' ? 'Analíticas' : 'Analytics', 
      icon: BarChart3, 
      desc: language === 'es' ? 'Métricas de aperturas, clics y entregabilidad' : 'Open rates, clicks & deliverability metrics' 
    },
    { 
      id: 'billing', 
      tab: 'billing', 
      label: language === 'es' ? 'Facturación y Planes' : 'Billing & Plans', 
      icon: CreditCard, 
      desc: language === 'es' ? 'Plan SaaS activo, límites de casillas, Stripe y MercadoPago' : 'Active SaaS plan, usage limits, Stripe & MercadoPago' 
    },
  ];

  const filteredNavItems = navItems.filter(item => 
    !searchQuery.trim() || 
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCampaigns = (campaigns || []).filter(c =>
    !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTriggerTour = () => {
    onOpenTour?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('misender:open-tour'));
    }
  };

  const actionItems = [
    {
      id: 'action-tour',
      label: language === 'es' ? '🎯 Iniciar Tour Guiado Interactivo' : '🎯 Start Interactive Guided Tour',
      desc: language === 'es' ? 'Recorrido paso a paso por las 7 estaciones de MiSender' : 'Step-by-step walkthrough across all 7 MiSender stations',
      icon: Compass,
      onSelect: () => {
        handleTriggerTour();
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      }
    },
    {
      id: 'action-copilot',
      label: language === 'es' ? 'Abrir MiSender Copilot con IA' : 'Open MiSender Copilot AI',
      desc: language === 'es' ? 'Consultar optimizaciones o crear secuencias' : 'Ask optimizations or draft sequences',
      icon: Sparkles,
      onSelect: () => {
        openCopilot();
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      }
    },
    {
      id: 'action-mode',
      label: mode === 'simple'
        ? (language === 'es' ? 'Cambiar a Modo Pro ⚡' : 'Switch to Pro Mode ⚡')
        : (language === 'es' ? 'Cambiar a Modo Simple 🐣' : 'Switch to Simple Mode 🐣'),
      desc: language === 'es' ? 'Alternar interfaz de trabajo' : 'Toggle experience mode',
      icon: Zap,
      onSelect: () => {
        setMode(mode === 'simple' ? 'pro' : 'simple');
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      }
    },
    {
      id: 'action-auth',
      label: user
        ? (language === 'es' ? 'Crear Nuevo Workspace (Agencia)' : 'Create New Workspace (Agency)')
        : (language === 'es' ? 'Iniciar Sesión / Prueba 7 días gratis' : 'Sign In / 7-Day Free Trial'),
      desc: language === 'es' ? 'Autenticación SaaS y aislamiento multi-cliente' : 'SaaS authentication & multi-client isolation',
      icon: user ? Building2 : LogIn,
      onSelect: () => {
        openAuthModal(user ? 'workspace' : 'signin');
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      }
    }
  ];

  const filteredActions = actionItems.filter(a =>
    !searchQuery.trim() ||
    a.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Unified list of selectable items for keyboard navigation (ArrowUp / ArrowDown / Enter)
  const selectableItems = [
    ...filteredNavItems.map(item => ({
      id: `nav-${item.id}`,
      onSelect: () => {
        if (onNavigate) onNavigate(item.tab);
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      }
    })),
    ...filteredCampaigns.slice(0, 5).map(camp => ({
      id: `camp-${camp.id}`,
      onSelect: () => {
        if (onNavigate) onNavigate('campaigns', camp.id);
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      }
    })),
    ...filteredActions.map(action => ({
      id: action.id,
      onSelect: action.onSelect
    }))
  ];

  return (
    <header className="h-14 border-b border-slate-800 bg-[#090d16] px-5 flex items-center justify-between shrink-0 select-none z-30">
      {/* Left Area: Workspace Selector */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
            className="flex items-center gap-2.5 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-xl transition text-xs font-semibold shadow-sm"
          >
            <div className="w-5 h-5 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
              <Building2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <div className="text-white leading-tight font-medium max-w-[180px] truncate">
                {currentWorkspace.name}
              </div>
              <div className="text-[10px] text-slate-400 font-normal">
                {currentWorkspace.clientName}
              </div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isWorkspaceMenuOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {t('topbar.switchWorkspace')}
              </div>
              {workspaces.map((ws) => {
                const wsPlan = SAAS_PLANS[normalizePlan(ws.plan)].name;
                return (
                  <button
                    key={ws.id}
                    onClick={() => {
                      onSelectWorkspace(ws);
                      setIsWorkspaceMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                      currentWorkspace.id === ws.id
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="text-left truncate pr-2">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <span className="truncate">{ws.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono shrink-0">
                          {wsPlan}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">{ws.clientName}</div>
                    </div>
                    {currentWorkspace.id === ws.id && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                  </button>
                );
              })}

              <div className="pt-1 border-t border-slate-800/80 space-y-1">
                <button
                  onClick={() => {
                    setIsWorkspaceMenuOpen(false);
                    openAuthModal('workspace');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 rounded-xl transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{language === 'es' ? 'Nuevo Workspace (Agencia)...' : 'New Workspace (Agency)...'}</span>
                </button>
                <button
                  onClick={() => {
                    setIsWorkspaceMenuOpen(false);
                    setIsWorkspaceManagerOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-950/30 rounded-xl transition cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{language === 'es' ? 'Gestionar Espacios de Trabajo...' : 'Manage Workspaces...'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Global Search / Command Palette Trigger */}
        <div 
          onClick={() => {
            setIsCommandPaletteOpen(true);
            setSearchQuery('');
            setSelectedIndex(0);
          }}
          className="relative w-44 lg:w-56 xl:w-72 cursor-pointer"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            readOnly
            placeholder={language === 'es' ? 'Buscar o comando (⌘K / Ctrl+K)...' : 'Search or command (⌘K / Ctrl+K)...'}
            className="w-full bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 rounded-xl pl-9 pr-16 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition cursor-pointer"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60 font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Area: Experience Switcher (Simple / Pro), Credits, Language, Profile */}
      <div className="flex items-center gap-3">
        {/* Experience Mode Toggle Pill */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setMode('simple')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition font-bold text-xs ${
              mode === 'simple'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Switch to Simple Mode (Beginner friendly)"
          >
            <span>🐣</span>
            <span>{language === 'es' ? 'Simple' : 'Simple'}</span>
          </button>

          <button
            onClick={() => setMode('pro')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition font-bold text-xs ${
              mode === 'pro'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Switch to Pro Mode (Advanced tools)"
          >
            <span>⚡</span>
            <span>{language === 'es' ? 'Pro' : 'Pro'}</span>
          </button>
        </div>

        {/* Clickable Plan / Trial Badge */}
        <button
          type="button"
          onClick={() => onNavigate?.('billing')}
          title={language === 'es' ? 'Ver Facturación y Planes SaaS' : 'View SaaS Billing & Plans'}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition cursor-pointer ${
            subStatus === 'active'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50'
              : subStatus === 'past_due'
                ? 'bg-rose-950/40 border-rose-500/30 text-rose-300 hover:bg-rose-900/50'
                : 'bg-amber-950/40 border-amber-500/30 text-amber-300 hover:bg-amber-900/50'
          }`}
        >
          <Crown className="w-3.5 h-3.5 shrink-0" />
          <span>{planConfig.name}</span>
          <span className="text-[10px] opacity-85 font-mono">
            {subStatus === 'trialing'
              ? `• Trial ${trialDaysLeft}d`
              : subStatus === 'active'
                ? (language === 'es' ? '• Activo' : '• Active')
                : subStatus === 'past_due'
                  ? '• Past Due'
                  : '• Canceled'}
          </span>
        </button>

        {/* Verification Credits Badge */}
        <div className="flex items-center gap-1.5 bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 px-3 py-1 rounded-xl text-xs font-semibold shadow-sm">
          <Zap className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400" />
          <span>{currentWorkspace.credits.toLocaleString()}</span>
          <span className="hidden lg:inline text-[10px] text-indigo-400/80 font-normal">{t('topbar.creditsAvailable')}</span>
        </div>

        {/* Permanent Guided Tour Trigger */}
        <button
          type="button"
          onClick={handleTriggerTour}
          title={language === 'es' ? 'Abrir Tour Guiado Interactivo (7 Estaciones)' : 'Open Interactive Guided Tour (7 Stations)'}
          className="flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-sm transition cursor-pointer shrink-0"
        >
          <span>🎯 {language === 'es' ? 'Tour Guiado' : 'Guided Tour'}</span>
        </button>

        {/* MiSender Copilot Trigger */}
        <button
          onClick={openCopilot}
          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl shadow-md shadow-indigo-600/20 transition cursor-pointer shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Copilot</span>
        </button>

        {/* Language Switcher */}
        <LanguageToggle />

        {/* Auth / Sign In Button when unauthenticated */}
        {!user && (
          <button
            type="button"
            onClick={() => openAuthModal('signin')}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">{language === 'es' ? 'Acceder' : 'Sign In'}</span>
          </button>
        )}

        {/* User Profile / Auth Avatar */}
        <div className="relative flex items-center gap-2 pl-2 border-l border-slate-800">
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            title={
              user
                ? `${user.fullName || user.email} (${user.email})`
                : `${profile.name} (${profile.role}) - ${profile.initials}`
            }
            className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 hover:scale-105 active:scale-95 flex items-center justify-center text-white font-black text-xs shadow-md transition cursor-pointer"
          >
            {user ? user.avatarInitials : profile.initials}
          </button>

          {isProfileMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3.5 z-50 space-y-2.5 animate-in fade-in">
              <div className="border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-white text-xs truncate max-w-[140px]">
                    {user ? (user.fullName || user.email) : profile.name}
                  </div>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded uppercase font-semibold shrink-0">
                    {user ? (user.isDemo ? 'Demo SaaS' : 'SaaS Auth') : profile.role}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                  {user ? user.email : profile.email}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {language === 'es'
                    ? `Workspace: ${currentWorkspace.name}`
                    : `Workspace: ${currentWorkspace.name}`}
                </div>
              </div>

              {!user ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    openAuthModal('signin');
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl py-2 text-xs font-semibold transition cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{language === 'es' ? 'Iniciar Sesión / Crear Cuenta' : 'Sign In / Create Account'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    openAuthModal('workspace');
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl py-2 text-xs font-semibold transition cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{language === 'es' ? 'Nuevo Workspace (Agencia)' : 'New Workspace (Agency)'}</span>
                </button>
              )}

              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  onNavigate?.('billing');
                }}
                className="w-full flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl py-2 text-xs font-semibold transition cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                <span>{language === 'es' ? 'Facturación y Planes' : 'Billing & Plans'}</span>
              </button>

              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  setIsProfileModalOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-xl py-2 text-xs font-semibold transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{language === 'es' ? 'Gestionar Mi Perfil Admin' : 'Manage Admin Profile'}</span>
              </button>

              {user && (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    signOut();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-rose-950/30 hover:bg-rose-900/40 text-rose-400 border border-rose-500/30 rounded-xl py-2 text-xs font-semibold transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{language === 'es' ? 'Cerrar Sesión' : 'Sign Out'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Admin Profile Edit Modal */}
      <AdminProfileModal />

      {/* Workspace Management Modal */}
      <WorkspaceManagerModal
        isOpen={isWorkspaceManagerOpen}
        onClose={() => setIsWorkspaceManagerOpen(false)}
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        onSelectWorkspace={onSelectWorkspace}
        onUpdateWorkspaces={(updated) => {
          if (onUpdateWorkspaces) {
            onUpdateWorkspaces(updated);
          }
        }}
      />

      {/* Command Palette Modal (⌘K / Ctrl+K) */}
      {isCommandPaletteOpen && (
        <div 
          onClick={() => {
            setIsCommandPaletteOpen(false);
            setSearchQuery('');
          }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Search Input */}
            <div className="px-4 py-3.5 border-b border-slate-800 flex items-center gap-3 bg-slate-900/90">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (selectableItems.length > 0) {
                      setSelectedIndex(prev => (prev + 1) % selectableItems.length);
                    }
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (selectableItems.length > 0) {
                      setSelectedIndex(prev => (prev - 1 + selectableItems.length) % selectableItems.length);
                    }
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (selectableItems[selectedIndex]) {
                      selectableItems[selectedIndex].onSelect();
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsCommandPaletteOpen(false);
                    setSearchQuery('');
                  }
                }}
                placeholder={language === 'es' ? 'Escribe o busca una vista (Campañas, Leads, Casillas, Unibox, CRM, Calentamiento)...' : 'Type or search a view (Campaigns, Leads, Mailboxes, Unibox, CRM, Warmup)...'}
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
              />
              <button
                onClick={() => {
                  setIsCommandPaletteOpen(false);
                  setSearchQuery('');
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <kbd className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 font-mono">ESC</kbd>
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-96 overflow-y-auto p-2 space-y-3">
              {selectableItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <Search className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                  <p className="font-medium text-slate-300">
                    {language === 'es' ? 'No se encontraron vistas ni comandos' : 'No views or commands found'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 font-mono">
                    &quot;{searchQuery}&quot;
                  </p>
                </div>
              ) : (
                <>
                  {/* Navigation Items */}
                  {filteredNavItems.length > 0 && (
                    <div className="space-y-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {language === 'es' ? 'Vistas Principales' : 'Main Views'}
                      </div>
                      {filteredNavItems.map((item, idx) => {
                        const Icon = item.icon;
                        const isSelected = selectedIndex === idx;
                        return (
                          <button
                            key={item.id}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onClick={() => {
                              if (onNavigate) onNavigate(item.tab);
                              setIsCommandPaletteOpen(false);
                              setSearchQuery('');
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600/20 border border-blue-500/40 text-white shadow-sm ring-1 ring-blue-500/20'
                                : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-blue-500/10 text-blue-400'
                              }`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                  {item.label}
                                </div>
                                <div className="text-[11px] text-slate-400">{item.desc}</div>
                              </div>
                            </div>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isSelected ? 'bg-blue-500/20 text-blue-300 font-semibold' : 'text-slate-500'
                            }`}>
                              {language === 'es' ? 'Ir a vista ↵' : 'Go to view ↵'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Campaigns */}
                  {filteredCampaigns.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-slate-800/60">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {language === 'es' ? 'Campañas' : 'Campaigns'}
                      </div>
                      {filteredCampaigns.slice(0, 5).map((camp, idx) => {
                        const itemIdx = filteredNavItems.length + idx;
                        const isSelected = selectedIndex === itemIdx;
                        return (
                          <button
                            key={camp.id}
                            onMouseEnter={() => setSelectedIndex(itemIdx)}
                            onClick={() => {
                              if (onNavigate) onNavigate('campaigns', camp.id);
                              setIsCommandPaletteOpen(false);
                              setSearchQuery('');
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-600/20 border border-emerald-500/40 text-white shadow-sm ring-1 ring-emerald-500/20'
                                : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-emerald-500/10 text-emerald-400'
                              }`}>
                                <Mail className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                  {camp.name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {camp.status} • {camp.steps.length} {language === 'es' ? 'pasos' : 'steps'}
                                </div>
                              </div>
                            </div>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isSelected ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-slate-500'
                            }`}>
                              {language === 'es' ? 'Abrir ↵' : 'Open ↵'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Actions */}
                  {filteredActions.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-slate-800/60">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {language === 'es' ? 'Acciones' : 'Actions'}
                      </div>
                      {filteredActions.map((action, idx) => {
                        const itemIdx = filteredNavItems.length + filteredCampaigns.slice(0, 5).length + idx;
                        const isSelected = selectedIndex === itemIdx;
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.id}
                            onMouseEnter={() => setSelectedIndex(itemIdx)}
                            onClick={() => action.onSelect()}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600/20 border border-indigo-500/40 text-white shadow-sm ring-1 ring-indigo-500/20'
                                : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                                isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-indigo-500/10 text-indigo-400'
                              }`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                  {action.label}
                                </div>
                                <div className="text-[11px] text-slate-400">{action.desc}</div>
                              </div>
                            </div>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isSelected ? 'bg-indigo-500/20 text-indigo-300 font-semibold' : 'text-slate-500'
                            }`}>
                              {language === 'es' ? 'Acción ↵' : 'Action ↵'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span className="flex items-center gap-2">
                <span>↑↓ Navegar</span>
                <span>•</span>
                <span>↵ Seleccionar</span>
                <span>•</span>
                <span>ESC Cerrar</span>
              </span>
              <span>MiSender Command v2.0</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
