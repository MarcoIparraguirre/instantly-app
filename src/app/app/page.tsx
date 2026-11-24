'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Plus, Play, Eye } from 'lucide-react';
import Topbar from '@/components/Topbar';
import Sidebar from '@/components/Sidebar';
import LeadFinderView from '@/components/LeadFinderView';
import AccountsView from '@/components/AccountsView';
import CampaignEditor from '@/components/CampaignEditor';
import CampaignsListView from '@/components/CampaignsListView';
import CreateCampaignModal from '@/components/CreateCampaignModal';
import UniboxView from '@/components/UniboxView';
import CrmView from '@/components/CrmView';
import AnalyticsView from '@/components/AnalyticsView';
import CopilotDrawer from '@/components/CopilotDrawer';
import ModeSelectionModal from '@/components/ModeSelectionModal';
import SimpleCampaignView from '@/components/simple/SimpleCampaignView';
import SimpleAccountsView from '@/components/simple/SimpleAccountsView';
import BillingView from '@/components/BillingView';
import AuthModal from '@/components/AuthModal';
import GuidedTourModal from '@/components/GuidedTourModal';
import OnboardingChecklist from '@/components/OnboardingChecklist';
import LoginGateView from '@/components/LoginGateView';
import TeamManagementView from '@/components/TeamManagementView';
import FounderBackofficeView from '@/components/FounderBackofficeView';
import {
  AppTab,
  Campaign,
  Lead,
  SenderAccount,
  UserRole,
  ROLE_PERMISSIONS,
  canAccessTab,
  getDefaultTabForRole,
  normalizeRole,
} from '@/types';
import { useViewMode } from '@/context/ViewModeContext';
import { useLanguage } from '@/context/LanguageContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';

function HomeContent() {
  const { mode } = useViewMode();
  const { language } = useLanguage();
  const {
    user,
    loading: authLoading,
    visibleWorkspaces,
    currentWorkspace,
    switchWorkspace,
    updateWorkspaces,
    refreshWorkspaces,
    openAuthModal,
  } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('campaigns');

  const userRole: UserRole = normalizeRole(user?.role);
  const rolePerms = ROLE_PERMISSIONS[userRole];
  const defaultTab = getDefaultTabForRole(userRole);
  const effectiveTab = canAccessTab(userRole, currentTab) ? currentTab : defaultTab;
  const [campaignViewMode, setCampaignViewMode] = useState<'list' | 'detail'>('list');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [uniboxUnreadCount, setUniboxUnreadCount] = useState<number>(0);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isCreateCampaignModalOpen, setIsCreateCampaignModalOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const hasMountedTabSync = useRef(false);
  const currentWorkspaceIdRef = useRef<string>(currentWorkspace.id);

  const fetchInitialData = useCallback(async () => {
    const targetWsId = currentWorkspace.id;
    if (!targetWsId || userRole === 'super_admin') {
      setAllCampaigns([]);
      setCampaign(null);
      setLeads([]);
      setAccounts([]);
      setLoadedWorkspaceId(targetWsId);
      setLoading(false);
      return;
    }

    const wsId = encodeURIComponent(targetWsId);
    try {
      const [campRes, leadsRes, accRes] = await Promise.all([
        fetch(`/api/campaigns?workspaceId=${wsId}`),
        fetch(`/api/leads?workspaceId=${wsId}`),
        fetch(`/api/accounts?workspaceId=${wsId}`),
      ]);

      const campData = await campRes.json().catch(() => []);
      const leadsData = await leadsRes.json().catch(() => []);
      const accData = await accRes.json().catch(() => []);

      if (currentWorkspaceIdRef.current !== targetWsId) {
        return;
      }

      if (Array.isArray(campData) && campData.length > 0) {
        setAllCampaigns(campData);
        setCampaign((prev) => {
          if (prev && prev.workspaceId === targetWsId) {
            const match = campData.find((c: Campaign) => c.id === prev.id);
            if (match) return match;
          }
          return campData[0];
        });
      } else {
        setAllCampaigns([]);
        setCampaign(null);
      }

      setLeads(Array.isArray(leadsData) ? leadsData : []);
      setAccounts(Array.isArray(accData) ? accData : []);
      setLoadedWorkspaceId(targetWsId);
    } catch (err) {
      console.error('Error fetching initial data:', err);
    } finally {
      if (currentWorkspaceIdRef.current === targetWsId) {
        setLoading(false);
      }
    }
  }, [currentWorkspace.id, userRole]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('billing') === 'success') {
          setCurrentTab('billing');
          void refreshWorkspaces();
        }
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshWorkspaces]);

  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspace.id;
    const timer = setTimeout(() => {
      const skipLoadingMask = !currentWorkspace.id || userRole === 'super_admin';
      setLoading(!skipLoadingMask);
      setAllCampaigns([]);
      setCampaign(null);
      setLeads([]);
      setAccounts([]);
      setUniboxUnreadCount(0);
      setCampaignViewMode('list');
      if (skipLoadingMask) {
        setLoadedWorkspaceId(currentWorkspace.id);
      } else {
        void fetchInitialData();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [currentWorkspace.id, userRole, fetchInitialData]);

  // Listen to global custom event to open the interactive Guided Tour
  useEffect(() => {
    const handleOpenTour = () => setIsTourOpen(true);
    window.addEventListener('misender:open-tour', handleOpenTour);
    return () => window.removeEventListener('misender:open-tour', handleOpenTour);
  }, []);

  // Refresh accounts lightly when switching tabs so OnboardingChecklist reflects live mailbox state
  useEffect(() => {
    if (!hasMountedTabSync.current) {
      hasMountedTabSync.current = true;
      return;
    }
    if (!currentWorkspace.id || userRole === 'super_admin') {
      return;
    }
    let active = true;
    const targetWsId = currentWorkspace.id;
    fetch(`/api/accounts?workspaceId=${encodeURIComponent(targetWsId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (active && currentWorkspaceIdRef.current === targetWsId && Array.isArray(data)) {
          setAccounts(data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [currentTab, currentWorkspace.id, userRole]);

  const handleCampaignUpdated = (updated: Campaign) => {
    setCampaign(updated);
    setAllCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const handleLeadsUpdated = async () => {
    const targetWsId = currentWorkspace.id;
    if (!targetWsId) return;
    try {
      const res = await fetch(`/api/leads?workspaceId=${encodeURIComponent(targetWsId)}`);
      const data = await res.json();
      if (currentWorkspaceIdRef.current === targetWsId && Array.isArray(data)) {
        setLeads(data);
      }
    } catch {}
  };

  // Background Auto-Scheduler: checks active campaigns every 25s and dispatches when inside scheduled window
  useEffect(() => {
    if (!user || rolePerms.isReadOnly || !currentWorkspace.id || userRole === 'super_admin') return;
    const timer = setInterval(async () => {
      const activeCamps = allCampaigns.filter(c => c.status === 'active');
      if (activeCamps.length === 0) return;

      for (const camp of activeCamps) {
        const pendingForCamp = leads.filter(
          l => l.campaignId === camp.id && l.status === 'pending'
        );
        if (pendingForCamp.length === 0) continue;

        try {
          const res = await fetch(`/api/campaigns/${camp.id}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              simulationOnly: false,
              respectSchedule: true,
              batchSize: 5
            })
          });
          const data = await res.json();
          if (res.ok && data.sentCount > 0) {
            fetchInitialData();
          }
        } catch {}
      }
    }, 25000);

    return () => clearInterval(timer);
  }, [user, userRole, rolePerms.isReadOnly, currentWorkspace.id, allCampaigns, leads, fetchInitialData]);

  const handleNavigateTab = useCallback(
    (tab: AppTab) => {
      if (canAccessTab(userRole, tab)) {
        setCurrentTab(tab);
      } else {
        setCurrentTab(getDefaultTabForRole(userRole));
      }
    },
    [userRole]
  );

  // Automatically redirect to the role's default tab if active role loses access to currentTab
  useEffect(() => {
    if (!canAccessTab(userRole, currentTab)) {
      const timer = setTimeout(() => {
        setCurrentTab(getDefaultTabForRole(userRole));
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [userRole, currentTab]);

  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#F4F7F5] text-[#14213D]">
        <div className="w-8 h-8 border-4 border-[#14213D] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginGateView />;
  }

  const isOperationalRole = userRole !== 'super_admin';
  const isWorkspaceSwitching =
    isOperationalRole &&
    Boolean(currentWorkspace.id) &&
    loadedWorkspaceId !== null &&
    loadedWorkspaceId !== currentWorkspace.id;
  const isWorkspaceLoading = isOperationalRole && (loading || isWorkspaceSwitching);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F4F7F5] text-[#14213D] font-sans">
      {/* Onboarding Mode Selection Modal (Operational roles only) */}
      {isOperationalRole && <ModeSelectionModal />}

      {/* Interactive 7-Station Guided Tour Modal */}
      {isTourOpen && (
        <GuidedTourModal
          isOpen={isTourOpen}
          onClose={() => setIsTourOpen(false)}
          onNavigateTab={handleNavigateTab}
        />
      )}

      {/* Sidebar with Dynamic Modules based on Simple vs Pro and RBAC */}
      <Sidebar
        currentTab={effectiveTab}
        setCurrentTab={(tab) => {
          if (canAccessTab(userRole, tab)) {
            setCurrentTab(tab);
          }
        }}
        openCopilot={() => setIsCopilotOpen(true)}
        isCopilotOpen={isCopilotOpen}
        unreadCount={uniboxUnreadCount}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {/* Global Topbar: Workspace Switcher, Global Search, Credits, Language & Simple/Pro Toggle */}
        <Topbar
          currentWorkspace={currentWorkspace}
          workspaces={visibleWorkspaces}
          onSelectWorkspace={switchWorkspace}
          onUpdateWorkspaces={updateWorkspaces}
          openCopilot={() => setIsCopilotOpen(true)}
          onOpenTour={() => setIsTourOpen(true)}
          onNavigate={(tab, campId) => {
            if (canAccessTab(userRole, tab)) {
              setCurrentTab(tab);
            } else {
              setCurrentTab('campaigns');
            }
            if (campId) {
              const targetCamp = allCampaigns.find(c => c.id === campId);
              if (targetCamp) {
                setCampaign(targetCamp);
                setCampaignViewMode('detail');
              }
            }
          }}
          campaigns={allCampaigns}
        />

        {/* Read-Only Client Banner for Viewer role */}
        {rolePerms.isReadOnly && (
          <div className="bg-[#D5ECD4] border-b border-[#C3DAC3] px-4 py-2 text-xs text-[#14213D] flex items-center justify-center gap-2 shrink-0">
            <Eye className="w-3.5 h-3.5 text-[#14213D] shrink-0" />
            <span>
              <strong className="font-semibold text-[#14213D]">
                {language === 'es' ? 'Modo Solo Lectura (Vista Cliente)' : 'Read-Only Mode (Client View)'}
              </strong>
              {' — '}
              {language === 'es'
                ? 'Estás visualizando reportes, campañas y CRM. La edición y configuración están reservadas a tu agencia.'
                : 'You are viewing reports, campaigns, and CRM. Editing and settings are managed by your agency.'}
            </span>
          </div>
        )}

        {/* View Switcher: Conditionally Renders Simple vs Pro Views */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          {isWorkspaceLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-[#14213D] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isOperationalRole && !currentWorkspace.id ? (
            <div className="flex-1 flex items-center justify-center p-8 bg-[#F4F7F5] text-[#14213D]">
              <div className="max-w-md w-full bg-white border border-[#DCE3DF] shadow-sm rounded-2xl p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] flex items-center justify-center mx-auto font-bold">
                  <Plus className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-base font-bold text-[#14213D]">
                    {language === 'es'
                      ? 'Todavía no tienes un Workspace asignado'
                      : 'No Workspace assigned yet'}
                  </h2>
                  <p className="text-xs text-[#5C6F68] leading-relaxed">
                    {rolePerms.canManageWorkspaces
                      ? language === 'es'
                        ? 'Crea el primer Workspace de cliente para tu agencia y comienza a conectar casillas, importar leads y lanzar campañas.'
                        : 'Create your agency first client workspace to start connecting mailboxes, importing leads, and launching campaigns.'
                      : language === 'es'
                        ? 'Solicita al Administrador de tu Agencia que te asigne visibilidad a al menos un Workspace.'
                        : 'Ask your Agency Admin to grant you visibility to at least one Workspace.'}
                  </p>
                </div>
                {rolePerms.canManageWorkspaces && (
                  <button
                    type="button"
                    onClick={() => openAuthModal('workspace')}
                    className="inline-flex items-center justify-center gap-2 bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold px-5 py-2.5 rounded-lg text-xs transition cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {language === 'es' ? 'Crear Primer Workspace' : 'Create First Workspace'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Live Onboarding Readiness Checklist (only in Campaigns tab and non-readonly roles) */}
              {!rolePerms.isReadOnly && effectiveTab === 'campaigns' && (
                <OnboardingChecklist
                  accounts={accounts}
                  campaigns={allCampaigns}
                  leads={leads}
                  onNavigate={(tab) => {
                    if (canAccessTab(userRole, tab)) {
                      setCurrentTab(tab);
                    }
                    if (tab === 'campaigns') {
                      if (allCampaigns.length > 0 && campaign) {
                        setCampaignViewMode('detail');
                      } else {
                        setCampaignViewMode('list');
                      }
                    }
                  }}
                  onOpenTour={() => setIsTourOpen(true)}
                />
              )}

              <div className="flex-1 min-h-0 flex flex-col overflow-hidden [&>*]:max-h-full">
              {/* CAMPAIGNS: List View vs Detail View (Simple / Pro) */}
              {effectiveTab === 'campaigns' && (
                campaignViewMode === 'detail' && campaign ? (
                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                    {/* Top Campaign Switcher & Management Subbar */}
                    <div className="h-11 px-5 border-b border-[#DCE3DF] bg-white text-[#14213D] flex items-center justify-between shrink-0 select-none">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setCampaignViewMode('list')}
                          className="flex items-center gap-1.5 text-[#5C6F68] hover:text-[#14213D] px-2.5 py-1 rounded-lg text-xs font-semibold hover:bg-[#EEF3F0] transition cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>{language === 'es' ? 'Todas las Campañas' : 'All Campaigns'}</span>
                        </button>

                        <div className="h-4 w-px bg-[#DCE3DF]" />

                        {/* Campaign Selector Dropdown */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#5C6F68] font-medium">
                            {language === 'es' ? 'Campaña:' : 'Campaign:'}
                          </span>
                          <select
                            value={campaign.id}
                            onChange={(e) => {
                              const found = allCampaigns.find(c => c.id === e.target.value);
                              if (found) setCampaign(found);
                            }}
                            className="bg-[#F4F7F5] border border-[#DCE3DF] hover:border-[#A1B0AB] focus:border-[#14213D] rounded-lg px-2.5 py-1 text-xs text-[#14213D] font-semibold focus:outline-none transition max-w-[240px] cursor-pointer"
                          >
                            {allCampaigns.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.status})
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          disabled={rolePerms.isReadOnly}
                          onClick={async () => {
                            if (rolePerms.isReadOnly) return;
                            const nextStatus: Campaign['status'] = campaign.status === 'active' ? 'paused' : 'active';
                            const updated: Campaign = { ...campaign, status: nextStatus };
                            handleCampaignUpdated(updated);
                            try {
                              await fetch(`/api/campaigns/${campaign.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(updated)
                              });
                            } catch {}
                          }}
                          className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase border transition shadow-sm ${
                            rolePerms.isReadOnly ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'
                          } ${
                            campaign.status === 'active'
                              ? 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3] hover:bg-[#C3DAC3]'
                              : campaign.status === 'paused'
                              ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                              : 'bg-[#EEF3F0] text-[#5C6F68] border-[#DCE3DF] hover:bg-[#DCE3DF] hover:text-[#14213D]'
                          }`}
                          title={
                            rolePerms.isReadOnly
                              ? (language === 'es' ? 'Solo lectura para clientes' : 'Read-only view')
                              : (language === 'es' ? 'Haz clic para cambiar estado (Activa / Pausada)' : 'Click to toggle status')
                          }
                        >
                          {campaign.status === 'active' ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                              <span>{language === 'es' ? 'Activa' : 'Active'}</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 fill-current" />
                              <span>{language === 'es' ? 'Activar' : 'Activate'}</span>
                            </>
                          )}
                        </button>
                      </div>

                      {!rolePerms.isReadOnly && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setIsCreateCampaignModalOpen(true)}
                            className="flex items-center gap-1.5 bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold px-3 py-1.5 rounded-lg text-xs shadow-sm transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{language === 'es' ? 'Nueva Campaña' : 'New Campaign'}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Active Campaign View: Simple Mode vs Pro Mode */}
                    <div className="flex-1 overflow-hidden">
                      {mode === 'simple' ? (
                        <SimpleCampaignView
                          campaign={campaign}
                          onUpdateCampaign={handleCampaignUpdated}
                          openCopilot={() => setIsCopilotOpen(true)}
                          leads={leads}
                          onRefreshLeads={handleLeadsUpdated}
                        />
                      ) : (
                        <CampaignEditor
                          campaign={campaign}
                          onUpdateCampaign={handleCampaignUpdated}
                          openCopilot={() => setIsCopilotOpen(true)}
                          leads={leads}
                          onRefreshLeads={handleLeadsUpdated}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <CampaignsListView
                    campaigns={allCampaigns}
                    leads={leads}
                    onSelectCampaign={(c) => {
                      setCampaign(c);
                      setCampaignViewMode('detail');
                    }}
                    onCreateCampaign={() => setIsCreateCampaignModalOpen(true)}
                    onRefreshCampaigns={fetchInitialData}
                  />
                )
              )}

              {/* ACCOUNTS: Simple Mode (Traffic light health) vs Pro Mode (High-density table + DNS drawer) */}
              {effectiveTab === 'accounts' && (
                mode === 'simple' ? (
                  <SimpleAccountsView />
                ) : (
                  <AccountsView />
                )
              )}

              {/* LEAD FINDER / GROUPS VIEWER: View, filter and edit lead groups */}
              {effectiveTab === 'finder' && (
                <LeadFinderView
                  campaigns={allCampaigns}
                  leads={leads}
                  onLeadsInjected={handleLeadsUpdated}
                />
              )}

              {/* UNIBOX: Master-Detail 3-Panel with AI Sentiments & Real IMAP Sync */}
              {effectiveTab === 'unibox' && (
                <UniboxView
                  onPromoteToCrm={() => setCurrentTab('crm')}
                  onUnreadCountChange={setUniboxUnreadCount}
                  onLeadsSynced={fetchInitialData}
                />
              )}

              {/* CRM: Kanban Dealflow Pipeline */}
              {effectiveTab === 'crm' && <CrmView />}

              {/* ANALYTICS: Macro Funnel & Micro Mailbox Breakdown */}
              {effectiveTab === 'analytics' && (
                <AnalyticsView
                  campaign={campaign}
                  leads={leads}
                  onRefreshData={fetchInitialData}
                />
              )}

              {/* TEAM & ROLE MANAGEMENT (Admin / Super Admin) */}
              {effectiveTab === 'team' && <TeamManagementView />}

              {/* BILLING & SAAS PLANS (Admin / Super Admin) */}
              {effectiveTab === 'billing' && <BillingView />}

              {/* FOUNDER BACKOFFICE (Super Admin only) */}
              {effectiveTab === 'backoffice' && (
                <FounderBackofficeView
                  onOpenWorkspace={() => setCurrentTab('campaigns')}
                />
              )}
              </div>
            </>
          )}

          {/* Slide-in Copilot Drawer */}
          <CopilotDrawer
            isOpen={isCopilotOpen}
            onClose={() => setIsCopilotOpen(false)}
            campaign={campaign}
            onCampaignUpdated={handleCampaignUpdated}
          />

          {/* Create Campaign Modal */}
          <CreateCampaignModal
            isOpen={isCreateCampaignModalOpen}
            onClose={() => setIsCreateCampaignModalOpen(false)}
            onCreated={(newCamp) => {
              setAllCampaigns(prev => [newCamp, ...prev]);
              setCampaign(newCamp);
              setCampaignViewMode('detail');
            }}
          />
        </main>

        {/* Persistent Slim Vectra Systems Footer */}
        <footer className="h-8 px-5 border-t border-[#DCE3DF] bg-white flex items-center justify-between text-[11px] text-[#5C6F68] shrink-0 select-none">
          <span>MiSender · Outbound OS</span>
          <span>
            {language === 'es'
              ? 'Software creado por Vectra Systems · '
              : 'Software created by Vectra Systems · '}
            <a
              href="https://www.vectrasystems.com.ar"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-semibold text-[#14213D] hover:underline"
            >
              www.vectrasystems.com.ar
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <HomeContent />
      <AuthModal />
    </AuthProvider>
  );
}
