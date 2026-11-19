'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Search,
  Zap,
  ChevronDown,
  Check,
  Sparkles,
  Settings,
  Mail,
  Users,
  Inbox,
  Server,
  Kanban,
  BarChart3,
  Flame,
  CreditCard,
  LogIn,
  LogOut,
  Crown,
  Compass,
  ShieldCheck,
  Layers,
  Sliders,
  RotateCcw,
} from 'lucide-react';
import {
  Workspace,
  Campaign,
  SAAS_PLANS,
  UserRole,
  ROLE_PERMISSIONS,
  normalizePlan,
  normalizeRole,
  canAccessTab,
} from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useViewMode } from '@/context/ViewModeContext';
import { useAdminProfile } from '@/context/AdminProfileContext';
import { useAuth, isFounderEmail } from '@/context/AuthContext';
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
  campaigns = [],
}: TopbarProps) {
  const { t, language } = useLanguage();
  const { mode, setMode } = useViewMode();
  const { profile, setIsProfileModalOpen } = useAdminProfile();
  const {
    user,
    openAuthModal,
    signOut,
    switchRole,
    isFounderSession,
    restoreFounderSession,
  } = useAuth();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isWorkspaceManagerOpen, setIsWorkspaceManagerOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number>(7);

  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const userRole: UserRole = normalizeRole(user?.role);
  const perms = ROLE_PERMISSIONS[userRole];
  const roleLabel = language === 'es' ? perms.labelEs : perms.labelEn;
  const canSwitchOrManageWorkspaces = perms.canManageWorkspaces || workspaces.length > 1;
  const isFounder = isFounderSession || isFounderEmail(user?.email);

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
      setTrialDaysLeft(
        Number.isNaN(diff) ? 7 : Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [currentWorkspace.trialEndsAt]);

  // Close dropdown menus when clicking outside
  useEffect(() => {
    if (!isWorkspaceMenuOpen && !isProfileMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        isWorkspaceMenuOpen &&
        workspaceMenuRef.current &&
        !workspaceMenuRef.current.contains(target)
      ) {
        setIsWorkspaceMenuOpen(false);
      }
      if (
        isProfileMenuOpen &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target)
      ) {
        setIsProfileMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isWorkspaceMenuOpen, isProfileMenuOpen]);

  // Global shortcut (Cmd+K / Ctrl+K) and Escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => {
          if (!prev) {
            setSearchQuery('');
            setSelectedIndex(0);
          }
          return !prev;
        });
      } else if (e.key === 'Escape') {
        if (isCommandPaletteOpen) {
          setIsCommandPaletteOpen(false);
          setSearchQuery('');
        }
        if (isWorkspaceMenuOpen) setIsWorkspaceMenuOpen(false);
        if (isProfileMenuOpen) setIsProfileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, isWorkspaceMenuOpen, isProfileMenuOpen]);

  const navItems = [
    {
      id: 'campaigns',
      tab: 'campaigns',
      label: language === 'es' ? 'Campañas' : 'Campaigns',
      icon: Mail,
      desc:
        language === 'es'
          ? 'Gestionar secuencias y envíos outbound'
          : 'Manage sequences & outbound outreach',
    },
    {
      id: 'leads',
      tab: 'finder',
      label: language === 'es' ? 'Leads' : 'Leads',
      icon: Users,
      desc:
        language === 'es'
          ? 'Buscador B2B, importación y base de prospectos'
          : 'B2B search, CSV import & prospect database',
    },
    {
      id: 'accounts',
      tab: 'accounts',
      label: language === 'es' ? 'Casillas' : 'Mailboxes',
      icon: Server,
      desc:
        language === 'es'
          ? 'Casillas de correo SMTP, límites y auditor DNS'
          : 'SMTP mailboxes, daily limits & DNS audit',
    },
    {
      id: 'unibox',
      tab: 'unibox',
      label: language === 'es' ? 'Unibox' : 'Unibox',
      icon: Inbox,
      desc:
        language === 'es'
          ? 'Bandeja centralizada y respuestas con IA'
          : 'Unified inbox & AI reply sentiments',
    },
    {
      id: 'crm',
      tab: 'crm',
      label: language === 'es' ? 'CRM' : 'CRM',
      icon: Kanban,
      desc:
        language === 'es'
          ? 'Pipeline y flujo de tratos comerciales'
          : 'Sales pipeline & dealflow kanban',
    },
    {
      id: 'warmup',
      tab: 'accounts',
      label: language === 'es' ? 'Calentamiento' : 'Warmup',
      icon: Flame,
      desc:
        language === 'es'
          ? 'Red P2P de reputación y warmup de casillas'
          : 'P2P network warmup & deliverability reputation',
    },
    {
      id: 'analytics',
      tab: 'analytics',
      label: language === 'es' ? 'Analíticas' : 'Analytics',
      icon: BarChart3,
      desc:
        language === 'es'
          ? 'Métricas de aperturas, clics y entregabilidad'
          : 'Open rates, clicks & deliverability metrics',
    },
    {
      id: 'team',
      tab: 'team',
      label: language === 'es' ? 'Mi Equipo' : 'My Team',
      icon: Users,
      desc:
        language === 'es'
          ? 'Usuarios de la agencia y roles (SDR / Cliente)'
          : 'Agency users & role permissions',
    },
    {
      id: 'billing',
      tab: 'billing',
      label: language === 'es' ? 'Facturación y Planes' : 'Billing & Plans',
      icon: CreditCard,
      desc:
        language === 'es'
          ? 'Plan SaaS activo, límites de casillas, Stripe y MercadoPago'
          : 'Active SaaS plan, usage limits, Stripe & MercadoPago',
    },
    {
      id: 'backoffice',
      tab: 'backoffice',
      label: language === 'es' ? 'Backoffice SaaS' : 'Founder Backoffice',
      icon: ShieldCheck,
      desc:
        language === 'es'
          ? 'Panel Super Admin para dar de alta agencias y planes'
          : 'Super Admin backoffice to onboard agencies & plans',
    },
  ];

  const filteredNavItems = navItems.filter(
    (item) =>
      canAccessTab(userRole, item.tab) &&
      (!searchQuery.trim() ||
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.desc.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredCampaigns = (campaigns || []).filter(
    (c) => !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.toLowerCase())
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
      label:
        language === 'es'
          ? 'Iniciar Tour Guiado Interactivo'
          : 'Start Interactive Guided Tour',
      desc:
        language === 'es'
          ? 'Recorrido paso a paso por las 7 estaciones de MiSender'
          : 'Step-by-step walkthrough across all 7 MiSender stations',
      icon: Compass,
      onSelect: () => {
        handleTriggerTour();
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      },
    },
    {
      id: 'action-copilot',
      label:
        language === 'es'
          ? 'Abrir MiSender Copilot con IA'
          : 'Open MiSender Copilot AI',
      desc:
        language === 'es'
          ? 'Consultar optimizaciones o crear secuencias'
          : 'Ask optimizations or draft sequences',
      icon: Sparkles,
      onSelect: () => {
        openCopilot();
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      },
    },
    {
      id: 'action-mode',
      label:
        mode === 'simple'
          ? language === 'es'
            ? 'Cambiar a Modo Pro'
            : 'Switch to Pro Mode'
          : language === 'es'
            ? 'Cambiar a Modo Simple'
            : 'Switch to Simple Mode',
      desc:
        language === 'es'
          ? 'Alternar interfaz de trabajo'
          : 'Toggle experience mode',
      icon: mode === 'simple' ? Sliders : Layers,
      onSelect: () => {
        setMode(mode === 'simple' ? 'pro' : 'simple');
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      },
    },
    ...(user && !perms.canManageWorkspaces
      ? []
      : [
          {
            id: 'action-workspace-or-auth',
            label: user
              ? language === 'es'
                ? 'Gestionar / Crear Workspaces'
                : 'Manage / Create Workspaces'
              : language === 'es'
                ? 'Iniciar Sesión / Prueba 7 días gratis'
                : 'Sign In / 7-Day Free Trial',
            desc:
              language === 'es'
                ? 'Espacios multi-cliente y configuración de agencia'
                : 'Multi-client spaces & agency workspace management',
            icon: user ? Building2 : LogIn,
            onSelect: () => {
              if (user) {
                setIsWorkspaceManagerOpen(true);
              } else {
                openAuthModal('signin');
              }
              setIsCommandPaletteOpen(false);
              setSearchQuery('');
            },
          },
        ]),
  ];

  const filteredActions = actionItems.filter(
    (a) =>
      !searchQuery.trim() ||
      a.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectableItems = [
    ...filteredNavItems.map((item) => ({
      id: `nav-${item.id}`,
      onSelect: () => {
        if (onNavigate) onNavigate(item.tab);
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      },
    })),
    ...filteredCampaigns.slice(0, 5).map((camp) => ({
      id: `camp-${camp.id}`,
      onSelect: () => {
        if (onNavigate) onNavigate('campaigns', camp.id);
        setIsCommandPaletteOpen(false);
        setSearchQuery('');
      },
    })),
    ...filteredActions.map((action) => ({
      id: action.id,
      onSelect: action.onSelect,
    })),
  ];

  const workspaceBadgeContent = (
    <>
      <div className="w-5 h-5 rounded-lg bg-[#D5ECD4] text-[#14213D] flex items-center justify-center font-bold shrink-0">
        <Building2 className="w-3.5 h-3.5" />
      </div>
      <div className="text-left">
        <div className="text-[#14213D] leading-tight font-semibold max-w-[120px] 2xl:max-w-[175px] truncate">
          {currentWorkspace.name}
        </div>
        <div className="text-[10px] text-[#5C6F68] font-normal max-w-[120px] 2xl:max-w-[175px] truncate">
          {currentWorkspace.clientName}
        </div>
      </div>
    </>
  );

  return (
    <header className="h-14 border-b border-[#DCE3DF] bg-white text-[#14213D] px-3 2xl:px-5 flex items-center justify-between gap-2 shrink-0 select-none z-30 min-w-0">
      {/* Left Area: Workspace Selector & Prussian Blue Search Pill */}
      <div className="flex items-center gap-2 2xl:gap-3 min-w-0 shrink-0">
        <div ref={workspaceMenuRef} className="relative shrink-0">
          {canSwitchOrManageWorkspaces ? (
            <button
              type="button"
              onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 bg-[#F4F7F5] hover:bg-[#EEF3F0] text-[#14213D] border border-[#DCE3DF] px-2.5 py-1.5 rounded-lg transition text-xs font-semibold shadow-sm cursor-pointer"
            >
              {workspaceBadgeContent}
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#5C6F68] shrink-0 transition-transform ${
                  isWorkspaceMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-[#F4F7F5] text-[#14213D] border border-[#DCE3DF] px-2.5 py-1.5 rounded-lg text-xs font-semibold">
              {workspaceBadgeContent}
            </div>
          )}

          {/* Dropdown Menu */}
          {canSwitchOrManageWorkspaces && isWorkspaceMenuOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-[#DCE3DF] rounded-xl shadow-xl p-2 z-50 space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-[#5C6F68] uppercase tracking-wider">
                {t('topbar.switchWorkspace')}
              </div>
              {workspaces.map((ws) => {
                const wsPlan = SAAS_PLANS[normalizePlan(ws.plan)].name;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      onSelectWorkspace(ws);
                      setIsWorkspaceMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition cursor-pointer ${
                      currentWorkspace.id === ws.id
                        ? 'bg-[#D5ECD4]/65 text-[#14213D] border border-[#C3DAC3]'
                        : 'text-[#5C6F68] hover:bg-[#F4F7F5] hover:text-[#14213D] border border-transparent'
                    }`}
                  >
                    <div className="text-left truncate pr-2">
                      <div className="font-semibold text-[#14213D] flex items-center gap-1.5">
                        <span className="truncate">{ws.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-lg bg-[#EEF3F0] text-[#5C6F68] border border-[#DCE3DF] font-mono shrink-0">
                          {wsPlan}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#5C6F68]">{ws.clientName}</div>
                    </div>
                    {currentWorkspace.id === ws.id && (
                      <Check className="w-4 h-4 text-[#14213D] shrink-0" />
                    )}
                  </button>
                );
              })}

              {perms.canManageWorkspaces ? (
                <div className="pt-1.5 border-t border-[#DCE3DF]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsWorkspaceMenuOpen(false);
                      setIsWorkspaceManagerOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#14213D] hover:bg-[#EEF3F0] rounded-lg transition cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>
                      {language === 'es'
                        ? 'Gestionar Espacios de Trabajo...'
                        : 'Manage Workspaces...'}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="pt-2 px-3 py-1.5 border-t border-[#DCE3DF] text-[10px] text-[#5C6F68]">
                  {language === 'es'
                    ? 'Solo el Admin de la Agencia crea Workspaces.'
                    : 'Only Agency Admins manage workspaces.'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Global Search / Command Palette Trigger — Prussian Blue Dark Pill */}
        <div
          onClick={() => {
            setIsCommandPaletteOpen(true);
            setSearchQuery('');
            setSelectedIndex(0);
          }}
          className="relative w-32 2xl:w-56 cursor-pointer shrink-0"
        >
          <Search className="w-3.5 h-3.5 text-[#D5ECD4] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            readOnly
            placeholder={language === 'es' ? 'Buscar' : 'Search'}
            className="w-full bg-[#14213D] hover:bg-[#1E3158] border border-[#14213D] rounded-full pl-8 pr-10 py-1.5 text-xs text-white placeholder-[#A1B0AB] focus:outline-none transition cursor-pointer shadow-sm"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-white/15 text-[#D5ECD4] px-1.5 py-0.5 rounded-full border border-white/20 font-mono pointer-events-none">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Area: Experience Switcher (Simple / Pro), Credits, Language, Profile */}
      <div className="flex items-center gap-1.5 2xl:gap-2.5 shrink-0">
        {/* Experience Mode Toggle Pill */}
        <div className="flex items-center gap-0.5 bg-[#EEF3F0] border border-[#DCE3DF] rounded-lg p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('simple')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition font-bold text-xs cursor-pointer ${
              mode === 'simple'
                ? 'bg-[#14213D] text-white shadow-sm'
                : 'text-[#5C6F68] hover:text-[#14213D]'
            }`}
            title="Switch to Simple Mode (Beginner friendly)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Simple</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('pro')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition font-bold text-xs cursor-pointer ${
              mode === 'pro'
                ? 'bg-[#14213D] text-white shadow-sm'
                : 'text-[#5C6F68] hover:text-[#14213D]'
            }`}
            title="Switch to Pro Mode (Advanced tools)"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Pro</span>
          </button>
        </div>

        {/* Clickable Plan / Trial Badge (Visible only when role has billing access) */}
        {perms.canManageBilling && (
          <button
            type="button"
            onClick={() => onNavigate?.('billing')}
            title={`${planConfig.name} • ${
              subStatus === 'trialing'
                ? `Trial ${trialDaysLeft}d`
                : subStatus === 'active'
                  ? language === 'es'
                    ? 'Activo'
                    : 'Active'
                  : subStatus
            }`}
            className={`hidden md:flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer shrink-0 ${
              subStatus === 'active'
                ? 'bg-[#D5ECD4] border-[#C3DAC3] text-[#14213D] hover:bg-[#C3DAC3]'
                : subStatus === 'past_due'
                  ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                  : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <Crown className="w-3.5 h-3.5 shrink-0" />
            <span>{planConfig.name}</span>
            <span className="hidden 2xl:inline text-[10px] opacity-85 font-mono tabular-nums">
              {subStatus === 'trialing'
                ? `• Trial ${trialDaysLeft}d`
                : subStatus === 'active'
                  ? language === 'es'
                    ? '• Activo'
                    : '• Active'
                  : subStatus === 'past_due'
                    ? '• Past Due'
                    : '• Canceled'}
            </span>
          </button>
        )}

        {/* Verification Credits Badge */}
        <div
          title={t('topbar.creditsAvailable')}
          className="flex items-center gap-1 bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0"
        >
          <Zap className="w-3.5 h-3.5 text-[#14213D] shrink-0" />
          <span className="font-mono tabular-nums">
            {currentWorkspace.credits.toLocaleString()}
          </span>
          <span className="hidden 2xl:inline text-[10px] text-[#5C6F68] font-normal">
            {t('topbar.creditsAvailable')}
          </span>
        </div>

        {/* Permanent Guided Tour Trigger */}
        <button
          type="button"
          onClick={handleTriggerTour}
          title={
            language === 'es'
              ? 'Abrir Tour Guiado Interactivo (7 Estaciones)'
              : 'Open Interactive Guided Tour (7 Stations)'
          }
          className="flex items-center gap-1.5 bg-[#EEF3F0] hover:bg-[#D5ECD4] border border-[#DCE3DF] hover:border-[#C3DAC3] text-[#14213D] text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer shrink-0"
        >
          <Compass className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden 2xl:inline">
            {language === 'es' ? 'Tour Guiado' : 'Guided Tour'}
          </span>
          <span className="2xl:hidden">Tour</span>
        </button>

        {/* MiSender Copilot Trigger */}
        <button
          type="button"
          onClick={openCopilot}
          title="MiSender Copilot IA"
          className="flex items-center gap-1 bg-[#14213D] hover:bg-[#1E3158] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-sm transition cursor-pointer shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>Copilot</span>
        </button>

        {/* Language Switcher */}
        <LanguageToggle />

        {/* Auth / Sign In Button when unauthenticated */}
        {!user && (
          <button
            type="button"
            onClick={() => openAuthModal('signin')}
            title={language === 'es' ? 'Iniciar Sesión / Registro' : 'Sign In / Sign Up'}
            className="flex items-center gap-1 bg-[#EEF3F0] hover:bg-[#D5ECD4] border border-[#DCE3DF] text-[#14213D] px-2 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0"
          >
            <LogIn className="w-3.5 h-3.5 text-[#14213D] shrink-0" />
            <span className="hidden 2xl:inline">
              {language === 'es' ? 'Acceder' : 'Sign In'}
            </span>
          </button>
        )}

        {/* User Profile / Auth Avatar + Founder Role Pill */}
        <div
          ref={profileMenuRef}
          className="relative flex items-center gap-1.5 pl-1.5 border-l border-[#DCE3DF]"
        >
          {user && isFounder && (
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen((prev) => !prev)}
              title={
                language === 'es'
                  ? 'Cambiar vista de rol (Modo Fundador)'
                  : 'Switch role preview (Founder Mode)'
              }
              className={`hidden xl:inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer shrink-0 ${
                !isFounderEmail(user.email)
                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  : 'bg-[#EEF3F0] text-[#14213D] border-[#DCE3DF] hover:bg-[#D5ECD4] hover:border-[#C3DAC3]'
              }`}
            >
              <ShieldCheck className="w-3 h-3 shrink-0" />
              <span className="max-w-[110px] truncate">{roleLabel}</span>
              <ChevronDown className="w-3 h-3 text-[#5C6F68] shrink-0" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            title={
              user
                ? `${user.fullName || user.email} (${user.email})`
                : `${profile.name} (${profile.role}) - ${profile.initials}`
            }
            className="w-8 h-8 rounded-lg bg-[#14213D] hover:bg-[#1E3158] border border-[#14213D] flex items-center justify-center text-white font-bold text-xs transition cursor-pointer"
          >
            {user ? user.avatarInitials : profile.initials}
          </button>

          {isProfileMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-[#DCE3DF] rounded-xl shadow-xl p-3.5 z-50 space-y-2.5 text-[#14213D]">
              <div className="border-b border-[#DCE3DF] pb-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-[#14213D] text-xs truncate max-w-[140px]">
                    {user ? user.fullName || user.email : profile.name}
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-lg uppercase font-semibold shrink-0 border ${
                      userRole === 'super_admin'
                        ? 'bg-[#14213D] text-white border-[#14213D]'
                        : userRole === 'admin'
                          ? 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
                          : userRole === 'campaign_manager'
                            ? 'bg-[#EEF3F0] text-[#14213D] border-[#DCE3DF]'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {roleLabel}
                  </span>
                </div>
                <div className="text-[11px] text-[#5C6F68] font-mono truncate mt-0.5">
                  {user ? user.email : profile.email}
                </div>
                <div className="text-[10px] text-[#5C6F68] mt-1">
                  {`Workspace: ${currentWorkspace.name}`}
                </div>
              </div>

              {!user ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    openAuthModal('signin');
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-[#14213D] hover:bg-[#1E3158] text-white rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>
                    {language === 'es'
                      ? 'Iniciar Sesión / Crear Cuenta'
                      : 'Sign In / Create Account'}
                  </span>
                </button>
              ) : (
                <>
                  {perms.canAccessBackoffice && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        onNavigate?.('backoffice');
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-[#14213D] hover:bg-[#1E3158] text-white rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#D5ECD4]" />
                      <span>
                        {language === 'es'
                          ? 'Backoffice SaaS (Agencias)'
                          : 'Founder Backoffice'}
                      </span>
                    </button>
                  )}

                  {perms.canManageTeam && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        onNavigate?.('team');
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-[#F4F7F5] hover:bg-[#EEF3F0] text-[#14213D] border border-[#DCE3DF] rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-[#14213D]" />
                      <span>
                        {language === 'es' ? 'Mi Equipo y Usuarios' : 'Team & Users'}
                      </span>
                    </button>
                  )}

                  {perms.canManageWorkspaces && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        setIsWorkspaceManagerOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-[#F4F7F5] hover:bg-[#EEF3F0] text-[#14213D] border border-[#DCE3DF] rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
                    >
                      <Building2 className="w-3.5 h-3.5 text-[#5C6F68]" />
                      <span>
                        {language === 'es'
                          ? 'Gestionar Workspaces'
                          : 'Manage Workspaces'}
                      </span>
                    </button>
                  )}
                </>
              )}

              {perms.canManageBilling && (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    onNavigate?.('billing');
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-[#F4F7F5] hover:bg-[#EEF3F0] text-[#14213D] border border-[#DCE3DF] rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-[#5C6F68]" />
                  <span>
                    {language === 'es' ? 'Facturación y Planes' : 'Billing & Plans'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  setIsProfileModalOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 bg-[#F4F7F5] hover:bg-[#EEF3F0] text-[#14213D] border border-[#DCE3DF] rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-[#5C6F68]" />
                <span>
                  {language === 'es' ? 'Mi Perfil y Permisos' : 'My Profile & Role'}
                </span>
              </button>

              {/* Post-login Role Switcher reserved exclusively for Founder session */}
              {user && isFounder && (
                <div className="pt-2 border-t border-[#DCE3DF] space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5C6F68]">
                    {language === 'es'
                      ? 'Vista de Rol (Modo Fundador)'
                      : 'Preview Role (Founder Mode)'}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      ['super_admin', 'admin', 'campaign_manager', 'viewer'] as UserRole[]
                    ).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => switchRole(r)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer truncate ${
                          userRole === r
                            ? 'bg-[#14213D] text-white border-[#14213D]'
                            : 'bg-[#F4F7F5] text-[#5C6F68] border-[#DCE3DF] hover:text-[#14213D] hover:bg-[#EEF3F0]'
                        }`}
                      >
                        {language === 'es'
                          ? ROLE_PERMISSIONS[r].labelEs
                          : ROLE_PERMISSIONS[r].labelEn}
                      </button>
                    ))}
                  </div>
                  {!isFounderEmail(user.email) && isFounderSession && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        void restoreFounderSession();
                      }}
                      className="w-full flex items-center justify-center gap-1.5 bg-[#D5ECD4] hover:bg-[#C3DAC3] text-[#14213D] border border-[#A1B0AB]/50 rounded-lg py-1.5 px-2 text-[11px] font-semibold transition cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 shrink-0" />
                      <span>
                        {language === 'es'
                          ? 'Volver a mi cuenta Super Admin'
                          : 'Return to Super Admin account'}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {user && (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    signOut();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
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
            className="bg-white border border-[#DCE3DF] text-[#14213D] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Search Input */}
            <div className="px-4 py-3.5 border-b border-[#DCE3DF] flex items-center gap-3 bg-[#F4F7F5]">
              <Search className="w-4 h-4 text-[#5C6F68] shrink-0" />
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
                      setSelectedIndex((prev) => (prev + 1) % selectableItems.length);
                    }
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (selectableItems.length > 0) {
                      setSelectedIndex(
                        (prev) => (prev - 1 + selectableItems.length) % selectableItems.length
                      );
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
                placeholder={
                  language === 'es'
                    ? 'Escribe o busca una vista (Campañas, Leads, Casillas, Unibox, CRM, Calentamiento)...'
                    : 'Type or search a view (Campaigns, Leads, Mailboxes, Unibox, CRM, Warmup)...'
                }
                className="flex-1 bg-transparent text-sm text-[#14213D] placeholder-[#5C6F68]/70 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setIsCommandPaletteOpen(false);
                  setSearchQuery('');
                }}
                className="text-[#5C6F68] hover:text-[#14213D] p-1 rounded-lg hover:bg-[#EEF3F0] transition cursor-pointer"
              >
                <kbd className="text-[10px] text-[#5C6F68] bg-white px-1.5 py-0.5 rounded border border-[#DCE3DF] font-mono">
                  ESC
                </kbd>
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-96 overflow-y-auto p-2 space-y-3">
              {selectableItems.length === 0 ? (
                <div className="py-12 text-center text-[#5C6F68] text-xs">
                  <Search className="w-6 h-6 mx-auto mb-2 text-[#A1B0AB]" />
                  <p className="font-medium text-[#14213D]">
                    {language === 'es'
                      ? 'No se encontraron vistas ni comandos'
                      : 'No views or commands found'}
                  </p>
                  <p className="text-[11px] text-[#5C6F68] mt-1 font-mono">
                    &quot;{searchQuery}&quot;
                  </p>
                </div>
              ) : (
                <>
                  {/* Navigation Items */}
                  {filteredNavItems.length > 0 && (
                    <div className="space-y-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5C6F68]">
                        {language === 'es' ? 'Vistas Principales' : 'Main Views'}
                      </div>
                      {filteredNavItems.map((item, idx) => {
                        const Icon = item.icon;
                        const isSelected = selectedIndex === idx;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onClick={() => {
                              if (onNavigate) onNavigate(item.tab);
                              setIsCommandPaletteOpen(false);
                              setSearchQuery('');
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#D5ECD4]/65 border border-[#C3DAC3] text-[#14213D]'
                                : 'hover:bg-[#F4F7F5] text-[#5C6F68] border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                                  isSelected
                                    ? 'bg-[#14213D] text-white'
                                    : 'bg-[#EEF3F0] text-[#14213D] border border-[#DCE3DF]'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-[#14213D]">
                                  {item.label}
                                </div>
                                <div className="text-[11px] text-[#5C6F68]">{item.desc}</div>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-lg ${
                                isSelected
                                  ? 'bg-[#14213D] text-white font-semibold'
                                  : 'text-[#5C6F68]'
                              }`}
                            >
                              {language === 'es' ? 'Ir a vista ↵' : 'Go to view ↵'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Campaigns */}
                  {filteredCampaigns.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-[#DCE3DF]">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5C6F68]">
                        {language === 'es' ? 'Campañas' : 'Campaigns'}
                      </div>
                      {filteredCampaigns.slice(0, 5).map((camp, idx) => {
                        const itemIdx = filteredNavItems.length + idx;
                        const isSelected = selectedIndex === itemIdx;
                        return (
                          <button
                            key={camp.id}
                            type="button"
                            onMouseEnter={() => setSelectedIndex(itemIdx)}
                            onClick={() => {
                              if (onNavigate) onNavigate('campaigns', camp.id);
                              setIsCommandPaletteOpen(false);
                              setSearchQuery('');
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#D5ECD4]/65 border border-[#C3DAC3] text-[#14213D]'
                                : 'hover:bg-[#F4F7F5] text-[#5C6F68] border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                                  isSelected
                                    ? 'bg-[#14213D] text-white'
                                    : 'bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]'
                                }`}
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-[#14213D]">
                                  {camp.name}
                                </div>
                                <div className="text-[10px] text-[#5C6F68] font-mono tabular-nums">
                                  {camp.status} • {camp.steps.length}{' '}
                                  {language === 'es' ? 'pasos' : 'steps'}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-lg ${
                                isSelected
                                  ? 'bg-[#14213D] text-white font-semibold'
                                  : 'text-[#5C6F68]'
                              }`}
                            >
                              {language === 'es' ? 'Abrir ↵' : 'Open ↵'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Actions */}
                  {filteredActions.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-[#DCE3DF]">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5C6F68]">
                        {language === 'es' ? 'Acciones' : 'Actions'}
                      </div>
                      {filteredActions.map((action, idx) => {
                        const itemIdx =
                          filteredNavItems.length +
                          filteredCampaigns.slice(0, 5).length +
                          idx;
                        const isSelected = selectedIndex === itemIdx;
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.id}
                            type="button"
                            onMouseEnter={() => setSelectedIndex(itemIdx)}
                            onClick={() => action.onSelect()}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#D5ECD4]/65 border border-[#C3DAC3] text-[#14213D]'
                                : 'hover:bg-[#F4F7F5] text-[#5C6F68] border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                                  isSelected
                                    ? 'bg-[#14213D] text-white'
                                    : 'bg-[#EEF3F0] text-[#14213D] border border-[#DCE3DF]'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-[#14213D]">
                                  {action.label}
                                </div>
                                <div className="text-[11px] text-[#5C6F68]">{action.desc}</div>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-lg ${
                                isSelected
                                  ? 'bg-[#14213D] text-white font-semibold'
                                  : 'text-[#5C6F68]'
                              }`}
                            >
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
            <div className="px-4 py-2 bg-[#F4F7F5] border-t border-[#DCE3DF] flex items-center justify-between text-[11px] text-[#5C6F68] font-mono">
              <span className="flex items-center gap-2">
                <span>↑↓ {language === 'es' ? 'Navegar' : 'Navigate'}</span>
                <span>•</span>
                <span>↵ {language === 'es' ? 'Seleccionar' : 'Select'}</span>
                <span>•</span>
                <span>ESC {language === 'es' ? 'Cerrar' : 'Close'}</span>
              </span>
              <span>MiSender Command v2.0</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
