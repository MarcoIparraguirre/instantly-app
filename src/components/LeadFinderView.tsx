'use client';

import React, { useState } from 'react';
import { 
  Search, ShieldCheck, CheckCircle2, Building, MapPin, 
  Globe, ArrowRight, Sparkles, Filter, CheckSquare, Square
} from 'lucide-react';
import { B2BLead, Campaign } from '@/types';
import { initialB2BLeads } from '@/core/storage/mockData';
import { useLanguage } from '@/context/LanguageContext';

interface LeadFinderViewProps {
  campaigns: Campaign[];
  onLeadsInjected: () => void;
}

export default function LeadFinderView({ campaigns, onLeadsInjected }: LeadFinderViewProps) {
  const { t } = useLanguage();
  const [leads] = useState<B2BLead[]>(initialB2BLeads);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>(['b2b-1', 'b2b-2']);
  const [showInjectModal, setShowInjectModal] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id || 'campaign-1');
  const [isInjecting, setIsInjecting] = useState(false);
  const [injectSuccessMsg, setInjectSuccessMsg] = useState('');

  // Filters State
  const [searchTitle, setSearchTitle] = useState('');
  const [selectedSeniority, setSelectedSeniority] = useState('all');
  const [selectedIndustry, setSelectedIndustry] = useState('all');
  const [verifiedOnly, setVerifiedOnly] = useState(true);

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map(l => l.id));
    }
  };

  const handleInjectToCampaign = async () => {
    setIsInjecting(true);
    const leadsToTransfer = leads.filter(l => selectedLeadIds.includes(l.id));

    const payload = leadsToTransfer.map(l => ({
      campaignId: selectedCampaignId,
      email: l.email,
      firstName: l.firstName,
      lastName: l.lastName,
      companyName: l.companyName,
      website: l.domain,
      customVariables: {
        title: l.title,
        industry: l.industry,
        location: l.location
      }
    }));

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setInjectSuccessMsg(`🎉 ${leadsToTransfer.length} ${t('finder.injectSuccess')}`);
        onLeadsInjected();
        setTimeout(() => {
          setShowInjectModal(false);
          setInjectSuccessMsg('');
          setSelectedLeadIds([]);
        }, 1500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsInjecting(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0b0f17]">
      {/* Left Panel: Faceted Search Filters */}
      <div className="w-72 bg-[#090d16] border-r border-slate-800/80 p-5 overflow-y-auto space-y-5 shrink-0">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Filter className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            {t('finder.filtersTitle')}
          </h2>
        </div>

        {/* Job Title Filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">{t('finder.jobTitle')}</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTitle}
              onChange={(e) => setSearchTitle(e.target.value)}
              placeholder={t('finder.jobTitlePlaceholder')}
              className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Seniority Filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">{t('finder.seniority')}</label>
          <select
            value={selectedSeniority}
            onChange={(e) => setSelectedSeniority(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">{t('finder.seniorityAll')}</option>
            <option value="clevel">{t('finder.seniorityClevel')}</option>
            <option value="vp">{t('finder.seniorityVp')}</option>
            <option value="manager">{t('finder.seniorityManager')}</option>
          </select>
        </div>

        {/* Industry Filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">{t('finder.industry')}</label>
          <select
            value={selectedIndustry}
            onChange={(e) => setSelectedIndustry(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">{t('finder.industryAll')}</option>
            <option value="saas">{t('finder.industrySaas')}</option>
            <option value="fintech">{t('finder.industryFintech')}</option>
            <option value="healthcare">{t('finder.industryHealthcare')}</option>
            <option value="ecommerce">{t('finder.industryEcommerce')}</option>
          </select>
        </div>

        {/* Verified Only Checkbox */}
        <div className="pt-2 border-t border-slate-800/80">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
            />
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              {t('finder.verifiedOnly')}
            </span>
          </label>
        </div>

        <button className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2.5 rounded-xl shadow-md shadow-blue-600/30 transition flex items-center justify-center gap-2">
          <Search className="w-3.5 h-3.5" />
          {t('finder.searchBtn')}
        </button>
      </div>

      {/* Main Area: Lead Finder Database Results */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sub-header */}
        <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              {t('finder.title')}
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {leads.length} {t('finder.resultsCount')} • B2B Graph v2.4
            </p>
          </div>

          <div className="flex items-center gap-3">
            {selectedLeadIds.length > 0 && (
              <button
                onClick={() => setShowInjectModal(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-blue-600/30 transition"
              >
                <span>{t('finder.injectToCampaign')} ({selectedLeadIds.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Leads Table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-white">
                      {selectedLeadIds.length === leads.length ? (
                        <CheckSquare className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">{t('finder.colName')}</th>
                  <th className="py-3 px-4">{t('finder.colCompany')}</th>
                  <th className="py-3 px-4">{t('finder.colLocation')}</th>
                  <th className="py-3 px-4">{t('finder.colTech')}</th>
                  <th className="py-3 px-4">{t('finder.colEmail')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {leads.map((lead) => {
                  const isSelected = selectedLeadIds.includes(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => toggleSelectLead(lead.id)}
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-blue-600/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleSelectLead(lead.id)}>
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          {lead.firstName} {lead.lastName}
                          <a
                            href={lead.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-400 hover:text-blue-300"
                            title="LinkedIn Profile"
                          >
                            <Globe className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <div className="text-[11px] text-slate-400">{lead.title}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <div>
                            <div className="font-medium text-slate-200">{lead.companyName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{lead.domain} • {lead.headcount} emp</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-500" />
                          {lead.location}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {lead.techStack.slice(0, 3).map((tech, i) => (
                            <span key={i} className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded">
                              {tech}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {lead.email}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Inject Directly to Campaign Modal */}
      {showInjectModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              {t('finder.injectModalTitle')}
            </h2>

            <p className="text-xs text-slate-400">
              Transfer <span className="font-bold text-white">{selectedLeadIds.length} verified B2B leads</span> straight into your sequence without CSV downloads:
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('finder.selectCampaign')}
              </label>
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </select>
            </div>

            {injectSuccessMsg && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl font-medium">
                {injectSuccessMsg}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowInjectModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={isInjecting}
                onClick={handleInjectToCampaign}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg shadow transition"
              >
                {t('finder.confirmInject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
