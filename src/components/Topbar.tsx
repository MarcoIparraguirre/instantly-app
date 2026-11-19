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
  campaigns = [],
}: TopbarProps) {
  const { t, language } = useLanguage();
  const { mode, setMode } = useViewMode();
  const { profile, setIsProfileModalOpen } = useAdminProfile();
  const { user, openAuthModal, signOut, switchRole } = useAuth();
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
      <div className="w-5 h-5 rounded-lg bg-[#E85D2A]/15 text-[#E85D2A] flex items-center justify-center font-bold shrink-0">
        <Building2 className="w-3.5 h-3.5" />
      </div>
      <div className="text-left">
        <div className="text-[#F3F5F8] leading-tight font-medium max-w-[120px] 2xl:max-w-[175px] truncate">
          {currentWorkspace.name}
        </div>
        <div className="text-[10px] text-[#949EB0] font-normal max-w-[120px] 2xl:max-w-[175px] truncate">
          {currentWorkspace.clientName}
        </div>
      </div>
    </>
  );

  return (
    <header className="h-14 border-b border-[#1D2330] bg-[#11141C] px-3 2xl:px-5 flex items-center justify-between gap-2 shrink-0 select-none z-30 min-w-0">
      {/* Left Area: Workspace Selector */}
      <div className="flex items-center gap-2 2xl:gap-3 min-w-0 shrink-0">
        <div ref={workspaceMenuRef} className="relative shrink-0">
          {canSwitchOrManageWorkspaces ? (
            <button
              type="button"
              onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 bg-[#171B26] hover:bg-[#1D2330] text-[#F3F5F8] border border-[#232938] px-2.5 py-1.5 rounded-lg transition text-xs font-semibold shadow-sm cursor-pointer"
            >
              {workspaceBadgeContent}
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#949EB0] shrink-0 transition-transform ${
                  isWorkspaceMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-[#171B26] text-[#F3F5F8] border border-[#232938] px-2.5 py-1.5 rounded-lg text-xs font-semibold">
              {workspaceBadgeContent}
            </div>
          )}

          {/* Dropdown Menu */}
          {canSwitchOrManageWorkspaces && isWorkspaceMenuOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-[#11141C] border border-[#232938] rounded-xl shadow-2xl p-2 z-50 space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-[#949EB0] uppercase tracking-wider">
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
                        ? 'bg-[#E85D2A]/15 text-[#F3F5F8] border border-[#E85D2A]/40'
                        : 'text-[#949EB0] hover:bg-[#171B26] hover:text-[#F3F5F8] border border-transparent'
                    }`}
                  >
                    <div className="text-left truncate pr-2">
                      <div className="font-semibold text-[#F3F5F8] flex items-center gap-1.5">
                        <span className="truncate">{ws.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-lg bg-[#171B26] text-[#949EB0] border border-[#232938] font-mono shrink-0">
                          {wsPlan}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#949EB0]">{ws.clientName}</div>
                    </div>
                    {currentWorkspace.id === ws.id && (
                      <Check className="w-4 h-4 text-[#E85D2A] shrink-0" />
                    )}
                  </button>
                );
              })}

              {perms.canManageWorkspaces ? (
                <div className="pt-1.5 border-t border-[#1D2330]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsWorkspaceMenuOpen(false);
                      setIsWorkspaceManagerOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#E85D2A] hover:text-[#F26B3A] hover:bg-[#171B26] rounded-lg transition cursor-pointer"
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
                <div className="pt-2 px-3 py-1.5 border-t border-[#1D2330] text-[10px] text-[#949EB0]">
                  {language === 'es'
                    ? 'Solo el Admin de la Agencia crea Workspaces.'
                    : 'Only Agency Admins manage workspaces.'}
                </div>
              )}
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
          className="relative w-28 2xl:w-56 cursor-pointer shrink-0"
        >
          <Search className="w-3.5 h-3.5 text-[#949EB0] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            readOnly
            placeholder={language === 'es' ? 'Buscar' : 'Search'}
            className="w-full bg-[#171B26] border border-[#232938] hover:border-[#343D52] rounded-lg pl-8 pr-9 py-1.5 text-xs text-[#F3F5F8] placeholder-[#949EB0]/70 focus:outline-none transition cursor-pointer"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#949EB0] bg-[#11141C] px-1 py-0.5 rounded border border-[#232938] font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Area: Experience Switcher (Simple / Pro), Credits, Language, Profile */}
      <div className="flex items-center gap-1.5 2xl:gap-2.5 shrink-0">
        {/* Experience Mode Toggle Pill */}
        <div className="flex items-center gap-0.5 bg-[#171B26] border border-[#232938] rounded-lg p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('simple')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition font-bold text-xs cursor-pointer ${
              mode === 'simple'
                ? 'bg-[#E85D2A] text-white shadow-sm'
                : 'text-[#949EB0] hover:text-[#F3F5F8]'
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
                ? 'bg-[#E85D2A] text-white shadow-sm'
                : 'text-[#949EB0] hover:text-[#F3F5F8]'
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
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : subStatus === 'past_due'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
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
          className="flex items-center gap-1 bg-[#171B26] border border-[#232938] text-[#F3F5F8] px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0"
        >
          <Zap className="w-3.5 h-3.5 text-[#E85D2A] shrink-0" />
          <span className="font-mono tabular-nums">
            {currentWorkspace.credits.toLocaleString()}
          </span>
          <span className="hidden 2xl:inline text-[10px] text-[#949EB0] font-normal">
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
          className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer shrink-0"
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
          className="flex items-center gap-1 bg-[#E85D2A] hover:bg-[#F26B3A] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-sm transition cursor-pointer shrink-0"
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
            className="flex items-center gap-1 bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] text-[#F3F5F8] px-2 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0"
          >
            <LogIn className="w-3.5 h-3.5 text-[#E85D2A] shrink-0" />
            <span className="hidden 2xl:inline">
              {language === 'es' ? 'Acceder' : 'Sign In'}
            </span>
          </button>
        )}

        {/* User Profile / Auth Avatar */}
        <div ref={profileMenuRef} className="relative flex items-center pl-1.5 border-l border-[#1D2330]">
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            title={
              user
                ? `${user.fullName || user.email} (${user.email})`
                : `${profile.name} (${profile.role}) - ${profile.initials}`
            }
            className="w-8 h-8 rounded-lg bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] hover:border-[#E85D2A]/60 flex items-center justify-center text-[#F3F5F8] font-bold text-xs transition cursor-pointer"
          >
            {user ? user.avatarInitials : profile.initials}
          </button>

          {isProfileMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-[#11141C] border border-[#232938] rounded-xl shadow-2xl p-3.5 z-50 space-y-2.5">
              <div className="border-b border-[#1D2330] pb-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-[#F3F5F8] text-xs truncate max-w-[140px]">
                    {user ? user.fullName || user.email : profile.name}
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-lg uppercase font-semibold shrink-0 border ${
                      userRole === 'super_admin'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : userRole === 'admin'
                          ? 'bg-[#E85D2A]/15 text-[#E85D2A] border-[#E85D2A]/35'
                          : userRole === 'campaign_manager'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-[#171B26] text-[#949EB0] border-[#232938]'
                    }`}
                  >
                    {roleLabel}
                  </span>
                </div>
                <div className="text-[11px] text-[#949EB0] font-mono truncate mt-0.5">
                  {user ? user.email : profile.email}
                </div>
                <div className="text-[10px] text-[#949EB0] mt-1">
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
                  className="w-full flex items-center justify-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
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
                      className="w-full flex items-center justify-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
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
                      className="w-full flex items-center justify-center gap-2 bg-[#171B26] hover:bg-[#1D2330] text-[#F3F5F8] border border-[#232938] rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-[#E85D2A]" />
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
                      className="w-full flex items-center justify-center gap-2 bg-[#171B26] hover:bg-[#1D2330] text-[#F3F5F8] border border-[#232938] rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
                    >
                      <Building2 className="w-3.5 h-3.5 text-emerald-400" />
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
                  className="w-full flex items-center justify-center gap-2 bg-[#171B26] hover:bg-[#1D2330] text-[#F3F5F8] border border-[#232938] rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-[#949EB0]" />
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
                className="w-full flex items-center justify-center gap-2 bg-[#171B26] hover:bg-[#1D2330] text-[#F3F5F8] border border-[#232938] rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-[#949EB0]" />
                <span>
                  {language === 'es' ? 'Mi Perfil y Permisos' : 'My Profile & Role'}
                </span>
              </button>

              {/* Quick Role Switcher reserved exclusively for Founder account */}
              {user?.email?.toLowerCase() === 'marcos@vectrasystems.com.ar' && (
                <div className="pt-2 border-t border-[#1D2330] space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#949EB0]">
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
                            ? 'bg-[#E85D2A] text-white border-[#E85D2A]'
                            : 'bg-[#171B26] text-[#949EB0] border-[#232938] hover:text-[#F3F5F8]'
                        }`}
                      >
                        {language === 'es'
                          ? ROLE_PERMISSIONS[r].labelEs
                          : ROLE_PERMISSIONS[r].labelEn}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {user && (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    signOut();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg py-2 text-xs font-semibold transition cursor-pointer"
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
            className="bg-[#11141C] border border-[#232938] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Search Input */}
            <div className="px-4 py-3.5 border-b border-[#1D2330] flex items-center gap-3 bg-[#171B26]">
              <Search className="w-4 h-4 text-[#949EB0] shrink-0" />
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
                className="flex-1 bg-transparent text-sm text-[#F3F5F8] placeholder-[#949EB0]/70 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setIsCommandPaletteOpen(false);
                  setSearchQuery('');
                }}
                className="text-[#949EB0] hover:text-[#F3F5F8] p-1 rounded-lg hover:bg-[#1D2330] transition cursor-pointer"
              >
                <kbd className="text-[10px] text-[#949EB0] bg-[#11141C] px-1.5 py-0.5 rounded border border-[#232938] font-mono">
                  ESC
                </kbd>
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-96 overflow-y-auto p-2 space-y-3">
              {selectableItems.length === 0 ? (
                <div className="py-12 text-center text-[#949EB0] text-xs">
                  <Search className="w-6 h-6 mx-auto mb-2 text-[#949EB0]/50" />
                  <p className="font-medium text-[#F3F5F8]">
                    {language === 'es'
                      ? 'No se encontraron vistas ni comandos'
                      : 'No views or commands found'}
                  </p>
                  <p className="text-[11px] text-[#949EB0] mt-1 font-mono">
                    &quot;{searchQuery}&quot;
                  </p>
                </div>
              ) : (
                <>
                  {/* Navigation Items */}
                  {filteredNavItems.length > 0 && (
                    <div className="space-y-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#949EB0]/70">
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
                                ? 'bg-[#E85D2A]/15 border border-[#E85D2A]/40 text-[#F3F5F8]'
                                : 'hover:bg-[#171B26] text-[#949EB0] border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                                  isSelected
                                    ? 'bg-[#E85D2A] text-white'
                                    : 'bg-[#171B26] text-[#E85D2A] border border-[#232938]'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div
                                  className={`text-xs font-semibold ${
                                    isSelected ? 'text-[#F3F5F8]' : 'text-[#F3F5F8]/90'
                                  }`}
                                >
                                  {item.label}
                                </div>
                                <div className="text-[11px] text-[#949EB0]">{item.desc}</div>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-lg ${
                                isSelected
                                  ? 'bg-[#E85D2A]/20 text-[#E85D2A] font-semibold'
                                  : 'text-[#949EB0]/70'
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
                    <div className="space-y-1 pt-1 border-t border-[#1D2330]">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#949EB0]/70">
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
                                ? 'bg-emerald-500/15 border border-emerald-500/40 text-[#F3F5F8]'
                                : 'hover:bg-[#171B26] text-[#949EB0] border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                                }`}
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div
                                  className={`text-xs font-semibold ${
                                    isSelected ? 'text-[#F3F5F8]' : 'text-[#F3F5F8]/90'
                                  }`}
                                >
                                  {camp.name}
                                </div>
                                <div className="text-[10px] text-[#949EB0] font-mono tabular-nums">
                                  {camp.status} • {camp.steps.length}{' '}
                                  {language === 'es' ? 'pasos' : 'steps'}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-lg ${
                                isSelected
                                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                                  : 'text-[#949EB0]/70'
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
                    <div className="space-y-1 pt-1 border-t border-[#1D2330]">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#949EB0]/70">
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
                                ? 'bg-[#E85D2A]/15 border border-[#E85D2A]/40 text-[#F3F5F8]'
                                : 'hover:bg-[#171B26] text-[#949EB0] border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                                  isSelected
                                    ? 'bg-[#E85D2A] text-white'
                                    : 'bg-[#171B26] text-[#E85D2A] border border-[#232938]'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div
                                  className={`text-xs font-semibold ${
                                    isSelected ? 'text-[#F3F5F8]' : 'text-[#F3F5F8]/90'
                                  }`}
                                >
                                  {action.label}
                                </div>
                                <div className="text-[11px] text-[#949EB0]">{action.desc}</div>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-lg ${
                                isSelected
                                  ? 'bg-[#E85D2A]/20 text-[#E85D2A] font-semibold'
                                  : 'text-[#949EB0]/70'
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
            <div className="px-4 py-2 bg-[#0A0C10] border-t border-[#1D2330] flex items-center justify-between text-[11px] text-[#949EB0] font-mono">
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
