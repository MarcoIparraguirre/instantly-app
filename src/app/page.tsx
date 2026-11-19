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
  } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('campaigns');

  const userRole: UserRole = normalizeRole(user?.role);
  const rolePerms = ROLE_PERMISSIONS[userRole];
  const effectiveTab = canAccessTab(userRole, currentTab) ? currentTab : 'campaigns';
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
          if (prev && (prev.workspaceId || 'ws-primary') === targetWsId) {
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
  }, [currentWorkspace.id]);

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
      setLoading(true);
      setAllCampaigns([]);
      setCampaign(null);
      setLeads([]);
      setAccounts([]);
      setUniboxUnreadCount(0);
      setCampaignViewMode('list');
      void fetchInitialData();
    }, 0);
    return () => clearTimeout(timer);
  }, [currentWorkspace.id, fetchInitialData]);

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
  }, [currentTab, currentWorkspace.id]);

  const handleCampaignUpdated = (updated: Campaign) => {
    setCampaign(updated);
    setAllCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const handleLeadsUpdated = async () => {
    const targetWsId = currentWorkspace.id;
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
    if (!user || rolePerms.isReadOnly) return;
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
  }, [user, rolePerms.isReadOnly, allCampaigns, leads, fetchInitialData]);

  const handleNavigateTab = useCallback(
    (tab: AppTab) => {
      if (canAccessTab(userRole, tab)) {
        setCurrentTab(tab);
      } else {
        setCurrentTab('campaigns');
      }
    },
    [userRole]
  );

  // Automatically redirect to 'campaigns' if active role loses access to currentTab
  useEffect(() => {
    if (!canAccessTab(userRole, currentTab)) {
      const timer = setTimeout(() => {
        setCurrentTab('campaigns');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [userRole, currentTab]);

  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0A0C10] text-[#F3F5F8]">
        <div className="w-8 h-8 border-4 border-[#E85D2A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginGateView />;
  }

  const isWorkspaceSwitching = loadedWorkspaceId !== null && loadedWorkspaceId !== currentWorkspace.id;
  const isWorkspaceLoading = loading || isWorkspaceSwitching;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0A0C10] text-[#F3F5F8] font-sans">
      {/* Onboarding Mode Selection Modal (First-time user or on-demand switch) */}
      <ModeSelectionModal />

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
          <div className="bg-[#171B26] border-b border-[#232938] px-4 py-2 text-xs text-[#949EB0] flex items-center justify-center gap-2 shrink-0">
            <Eye className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong className="font-semibold text-[#F3F5F8]">
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
              <div className="w-8 h-8 border-4 border-[#E85D2A] border-t-transparent rounded-full animate-spin" />
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
                    <div className="h-11 px-5 border-b border-[#1D2330] bg-[#11141C] flex items-center justify-between shrink-0 select-none">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setCampaignViewMode('list')}
                          className="flex items-center gap-1.5 text-[#949EB0] hover:text-[#F3F5F8] px-2.5 py-1 rounded-lg text-xs font-semibold hover:bg-[#171B26] transition cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>{language === 'es' ? 'Todas las Campañas' : 'All Campaigns'}</span>
                        </button>

                        <div className="h-4 w-px bg-[#1D2330]" />

                        {/* Campaign Selector Dropdown */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#949EB0] font-medium">
                            {language === 'es' ? 'Campaña:' : 'Campaign:'}
                          </span>
                          <select
                            value={campaign.id}
                            onChange={(e) => {
                              const found = allCampaigns.find(c => c.id === e.target.value);
                              if (found) setCampaign(found);
                            }}
                            className="bg-[#171B26] border border-[#232938] hover:border-[#343D52] focus:border-[#E85D2A] rounded-lg px-2.5 py-1 text-xs text-[#F3F5F8] font-semibold focus:outline-none transition max-w-[240px] cursor-pointer"
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
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35 hover:bg-emerald-500/25'
                              : campaign.status === 'paused'
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/35 hover:bg-amber-500/25'
                              : 'bg-[#171B26] text-[#949EB0] border-[#232938] hover:bg-[#1D2330] hover:text-[#F3F5F8]'
                          }`}
                          title={
                            rolePerms.isReadOnly
                              ? (language === 'es' ? 'Solo lectura para clientes' : 'Read-only view')
                              : (language === 'es' ? 'Haz clic para cambiar estado (Activa / Pausada)' : 'Click to toggle status')
                          }
                        >
                          {campaign.status === 'active' ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
                            className="flex items-center gap-1.5 bg-[#E85D2A] hover:bg-[#F26B3A] text-white font-semibold px-3 py-1.5 rounded-lg text-xs shadow-sm transition cursor-pointer"
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
