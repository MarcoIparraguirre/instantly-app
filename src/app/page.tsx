'use client';

import React, { useState, useEffect } from 'react';
import Topbar from '@/components/Topbar';
import Sidebar from '@/components/Sidebar';
import LeadFinderView from '@/components/LeadFinderView';
import AccountsView from '@/components/AccountsView';
import CampaignEditor from '@/components/CampaignEditor';
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

export default function Home() {
  const { mode } = useViewMode();
  const [workspaces] = useState<Workspace[]>(initialWorkspaces);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace>(initialWorkspaces[0]);
  const [currentTab, setCurrentTab] = useState<string>('campaigns');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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
          onSelectWorkspace={setCurrentWorkspace}
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
              {/* CAMPAIGNS: Simple Mode (2-step guided) vs Pro Mode (4-phase wizard) */}
              {currentTab === 'campaigns' && campaign && (
                mode === 'simple' ? (
                  <SimpleCampaignView
                    campaign={campaign}
                    onUpdateCampaign={handleCampaignUpdated}
                    openCopilot={() => setIsCopilotOpen(true)}
                    leads={leads}
                  />
                ) : (
                  <CampaignEditor
                    campaign={campaign}
                    onUpdateCampaign={handleCampaignUpdated}
                    openCopilot={() => setIsCopilotOpen(true)}
                    leads={leads}
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
        </main>
      </div>
    </div>
  );
}
