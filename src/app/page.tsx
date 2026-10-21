'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
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
import { initialWorkspaces } from '@/core/storage/mockData';
import { Campaign, Workspace, Lead } from '@/types';
import { useViewMode } from '@/context/ViewModeContext';
import { useLanguage } from '@/context/LanguageContext';

export default function Home() {
  const { mode } = useViewMode();
  const { language } = useLanguage();
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace>(initialWorkspaces[0]);
  const [currentTab, setCurrentTab] = useState<string>('campaigns');
  const [campaignViewMode, setCampaignViewMode] = useState<'list' | 'detail'>('list');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isCreateCampaignModalOpen, setIsCreateCampaignModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load workspaces from localStorage
  useEffect(() => {
    try {
      const savedWs = localStorage.getItem('misender_workspaces');
      if (savedWs) {
        const parsed = JSON.parse(savedWs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWorkspaces(parsed);
          const savedCurrentId = localStorage.getItem('misender_current_workspace_id');
          const found = parsed.find((w: Workspace) => w.id === savedCurrentId);
          setCurrentWorkspace(found || parsed[0]);
        }
      }
    } catch (e) {}
  }, []);

  const handleUpdateWorkspaces = (updated: Workspace[]) => {
    setWorkspaces(updated);
    try {
      localStorage.setItem('misender_workspaces', JSON.stringify(updated));
    } catch (e) {}
  };

  const handleSelectWorkspace = (ws: Workspace) => {
    setCurrentWorkspace(ws);
    try {
      localStorage.setItem('misender_current_workspace_id', ws.id);
    } catch (e) {}
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [campRes, leadsRes] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/leads')
      ]);

      const campData = await campRes.json();
      const leadsData = await leadsRes.json();

      if (Array.isArray(campData) && campData.length > 0) {
        setAllCampaigns(campData);
        setCampaign(campData[0]);
      }

      if (Array.isArray(leadsData)) {
        setLeads(leadsData);
      }
    } catch (err) {
      console.error('Error fetching initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCampaignUpdated = (updated: Campaign) => {
    setCampaign(updated);
    setAllCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const handleLeadsUpdated = async () => {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      if (Array.isArray(data)) {
        setLeads(data);
      }
    } catch (e) {}
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0b0f17] text-slate-100 font-sans">
      {/* Onboarding Mode Selection Modal (First-time user or on-demand switch) */}
      <ModeSelectionModal />

      {/* Sidebar with Dynamic Modules based on Simple vs Pro */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        openCopilot={() => setIsCopilotOpen(true)}
        isCopilotOpen={isCopilotOpen}
        unreadCount={1}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Global Topbar: Workspace Switcher, Global Search, Credits, Language & Simple/Pro Toggle */}
        <Topbar
          currentWorkspace={currentWorkspace}
          workspaces={workspaces}
          onSelectWorkspace={handleSelectWorkspace}
          onUpdateWorkspaces={handleUpdateWorkspaces}
          openCopilot={() => setIsCopilotOpen(true)}
        />

        {/* View Switcher: Conditionally Renders Simple vs Pro Views */}
        <main className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden relative">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* CAMPAIGNS: List View vs Detail View (Simple / Pro) */}
              {currentTab === 'campaigns' && (
                campaignViewMode === 'detail' && campaign ? (
                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                    {/* Top Campaign Switcher & Management Subbar */}
                    <div className="h-11 px-5 border-b border-slate-800 bg-[#0c121e] flex items-center justify-between shrink-0 select-none">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setCampaignViewMode('list')}
                          className="flex items-center gap-1.5 text-slate-400 hover:text-white px-2.5 py-1 rounded-xl text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>{language === 'es' ? 'Todas las Campañas' : 'All Campaigns'}</span>
                        </button>

                        <div className="h-4 w-[1px] bg-slate-800" />

                        {/* Campaign Selector Dropdown */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 font-medium">
                            {language === 'es' ? 'Campaña:' : 'Campaign:'}
                          </span>
                          <select
                            value={campaign.id}
                            onChange={(e) => {
                              const found = allCampaigns.find(c => c.id === e.target.value);
                              if (found) setCampaign(found);
                            }}
                            className="bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-xl px-2.5 py-1 text-xs text-white font-semibold focus:outline-none transition max-w-[240px] cursor-pointer"
                          >
                            {allCampaigns.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.status})
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          onClick={async () => {
                            const nextStatus = campaign.status === 'active' ? 'paused' : 'active';
                            const updated = { ...campaign, status: nextStatus as any };
                            handleCampaignUpdated(updated);
                            try {
                              await fetch(`/api/campaigns/${campaign.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(updated)
                              });
                            } catch (e) {}
                          }}
                          className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-xl uppercase border transition cursor-pointer shadow-sm ${
                            campaign.status === 'active'
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40 hover:bg-emerald-900/60'
                              : campaign.status === 'paused'
                              ? 'bg-amber-950/60 text-amber-400 border-amber-500/40 hover:bg-amber-900/60'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                          title={language === 'es' ? 'Haz clic para cambiar estado (Activa / Pausada)' : 'Click to toggle status'}
                        >
                          {campaign.status === 'active' ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>{language === 'es' ? 'Activa' : 'Active'}</span>
                            </>
                          ) : (
                            <>
                              <span className="text-[9px]">▶</span>
                              <span>{language === 'es' ? 'Activar' : 'Activate'}</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsCreateCampaignModalOpen(true)}
                          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1 rounded-xl text-xs shadow-sm transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{language === 'es' ? 'Nueva Campaña' : 'New Campaign'}</span>
                        </button>
                      </div>
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
              {currentTab === 'accounts' && (
                mode === 'simple' ? (
                  <SimpleAccountsView />
                ) : (
                  <AccountsView />
                )
              )}

              {/* LEAD FINDER: B2B Search and direct campaign injection */}
              {currentTab === 'finder' && (
                <LeadFinderView
                  campaigns={allCampaigns}
                  onLeadsInjected={handleLeadsUpdated}
                />
              )}

              {/* UNIBOX: Master-Detail 3-Panel with AI Sentiments */}
              {currentTab === 'unibox' && (
                <UniboxView onPromoteToCrm={() => setCurrentTab('crm')} />
              )}

              {/* CRM: Kanban Dealflow Pipeline */}
              {currentTab === 'crm' && <CrmView />}

              {/* ANALYTICS: Macro Funnel & Micro Mailbox Breakdown */}
              {currentTab === 'analytics' && <AnalyticsView campaign={campaign} />}
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
