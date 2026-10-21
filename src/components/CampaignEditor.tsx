'use client';

import React, { useState } from 'react';
import { 
  Users, Layers, Clock, Settings, Plus, Trash2, Send, Play, Pause, 
  AlertTriangle, CheckCircle, Sparkles, Eye, ShieldCheck, RefreshCw, 
  FileSpreadsheet, Upload, CheckSquare, Square
} from 'lucide-react';
import { Campaign, SequenceStep, StepVariant, Lead } from '@/types';
import { checkSpamWords, applySpamFixes } from '@/lib/spamDetector';
import { resolveSpintax, generateSpintax } from '@/lib/spintax';
import { useLanguage } from '@/context/LanguageContext';
import { v4 as uuidv4 } from 'uuid';
import LeadImportModal from './LeadImportModal';

interface CampaignEditorProps {
  campaign: Campaign;
  onUpdateCampaign: (updated: Campaign) => void;
  openCopilot: () => void;
  leads?: Lead[];
  onRefreshLeads?: () => void;
}

export default function CampaignEditor({
  campaign,
  onUpdateCampaign,
  openCopilot,
  leads = [],
  onRefreshLeads
}: CampaignEditorProps) {
  const { t, language } = useLanguage();
  const [activePhase, setActivePhase] = useState<'leads' | 'sequences' | 'schedule' | 'options'>('sequences');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [previewSpintaxModal, setPreviewSpintaxModal] = useState(false);
  const [spintaxPreviews, setSpintaxPreviews] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<any | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const activeStep = campaign.steps[activeStepIndex] || campaign.steps[0];
  const activeVariant = activeStep?.variants[activeVariantIndex] || activeStep?.variants[0];

  // Live Spam Check on Active Variant supporting English & Spanish
  const subjectSpam = activeVariant ? checkSpamWords(activeVariant.subject, language) : [];
  const bodySpam = activeVariant ? checkSpamWords(activeVariant.body, language) : [];
  const totalSpamWords = [...subjectSpam, ...bodySpam];

  const campaignLeads = leads.filter(l => l.campaignId === campaign.id);

  // Extract detected unique variables from campaign leads' customVariables
  const detectedVariables = Array.from(
    new Set(
      campaignLeads.flatMap(l => Object.keys(l.customVariables || {}))
    )
  );

  const availableTags = Array.from(
    new Set([
      'firstName',
      'lastName',
      'companyName',
      'email',
      ...detectedVariables
    ])
  );

  const handleClearLeads = async () => {
    if (!confirm(language === 'es' ? '¿Deseas vaciar los leads de esta campaña?' : 'Clear leads in this campaign?')) return;
    try {
      await fetch(`/api/leads?campaignId=${campaign.id}`, { method: 'DELETE' });
      if (onRefreshLeads) onRefreshLeads();
    } catch (e) {}
  };

  const saveToServer = async (updated: Campaign) => {
    try {
      await fetch(`/api/campaigns/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.error('Failed to auto-save campaign:', err);
    }
  };

  const handleUpdateActiveVariant = (updates: Partial<StepVariant>) => {
    if (!activeStep || !activeVariant) return;

    const newSteps = [...campaign.steps];
    const step = newSteps[activeStepIndex];
    const variant = step.variants[activeVariantIndex];

    Object.assign(variant, updates);

    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const handleUpdateWaitDays = (days: number) => {
    if (!activeStep) return;
    const newSteps = [...campaign.steps];
    newSteps[activeStepIndex].waitDays = days;
    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const handleAddStep = () => {
    const nextStepNum = campaign.steps.length + 1;
    const isEs = language === 'es';
    const newStep: SequenceStep = {
      id: uuidv4(),
      stepNumber: nextStepNum,
      waitDays: 3,
      variants: [
        {
          id: uuidv4(),
          name: isEs ? 'Variante A' : 'Variant A',
          subject: isEs ? 'Re: Consulta breve sobre {{companyName}}' : 'Re: Quick question regarding {{companyName}}',
          body: isEs
            ? 'Hola {{firstName}},\n\nTe escribo brevemente por si no viste mi correo anterior. ¿Tendrías 5 minutos para hablar esta semana?\n\nUn saludo,\nAlex'
            : 'Hi {{firstName}},\n\nJust checking in on my previous email. Let me know if you would be open to a quick call.\n\nBest,\nAlex'
        }
      ]
    };
    const updated = { ...campaign, steps: [...campaign.steps, newStep] };
    onUpdateCampaign(updated);
    saveToServer(updated);
    setActiveStepIndex(campaign.steps.length);
    setActiveVariantIndex(0);
  };

  const handleAddVariantToStep = () => {
    if (!activeStep) return;
    const alphabet = ['A', 'B', 'C', 'D', 'E'];
    const nextLetter = alphabet[activeStep.variants.length] || `V${activeStep.variants.length + 1}`;
    const newVariant: StepVariant = {
      id: uuidv4(),
      name: `Variant ${nextLetter}`,
      subject: activeVariant?.subject || 'Quick question',
      body: activeVariant?.body || 'Hi {{firstName}}...'
    };

    const newSteps = [...campaign.steps];
    newSteps[activeStepIndex].variants.push(newVariant);
    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
    setActiveVariantIndex(newSteps[activeStepIndex].variants.length - 1);
  };

  const handleDeleteStep = (index: number) => {
    if (campaign.steps.length <= 1) return;
    const newSteps = campaign.steps.filter((_, i) => i !== index);
    newSteps.forEach((s, i) => (s.stepNumber = i + 1));
    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
    setActiveStepIndex(Math.max(0, index - 1));
  };

  const handleQuickCleanSpam = () => {
    if (!activeVariant) return;
    const cleanSub = applySpamFixes(activeVariant.subject, language);
    const cleanBody = applySpamFixes(activeVariant.body, language);
    handleUpdateActiveVariant({ subject: cleanSub, body: cleanBody });
  };

  const handleAddSpintaxToBody = () => {
    if (!activeVariant) return;
    const spintaxBody = generateSpintax(activeVariant.body, language);
    handleUpdateActiveVariant({ body: spintaxBody });
  };

  const handlePreviewSpintax = () => {
    if (!activeVariant) return;
    const samples = [
      resolveSpintax(activeVariant.body),
      resolveSpintax(activeVariant.body),
      resolveSpintax(activeVariant.body)
    ];
    setSpintaxPreviews(samples);
    setPreviewSpintaxModal(true);
  };

  const toggleCampaignStatus = async () => {
    const nextStatus = campaign.status === 'active' ? 'paused' : 'active';
    const updated = { ...campaign, status: nextStatus as any };
    onUpdateCampaign(updated);
    await saveToServer(updated);
  };

  const handleRunCampaign = async (simulationOnly: boolean = false) => {
    setIsSending(true);
    setDispatchResult(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationOnly })
      });
      const data = await res.json();
      setDispatchResult(data);
      const refreshed = await fetch(`/api/campaigns/${campaign.id}`).then(r => r.json());
      onUpdateCampaign(refreshed);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const insertVariable = (variable: string, field: 'subject' | 'body') => {
    if (!activeVariant) return;
    if (field === 'subject') {
      handleUpdateActiveVariant({ subject: `${activeVariant.subject} {{${variable}}}` });
    } else {
      handleUpdateActiveVariant({ body: `${activeVariant.body} {{${variable}}}` });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0b0f17]">
      {/* Top Header with Campaign Name, Status and Controls */}
      <div className="h-16 px-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={campaign.name}
            onChange={(e) => {
              const updated = { ...campaign, name: e.target.value };
              onUpdateCampaign(updated);
              saveToServer(updated);
            }}
            className="text-base font-bold text-white bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none px-1 py-0.5 transition"
          />

          <span
            className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
              campaign.status === 'active'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : campaign.status === 'paused'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                : 'bg-slate-700/40 text-slate-400 border border-slate-700'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                campaign.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
              }`}
            />
            {campaign.status}
          </span>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleRunCampaign(true)}
            disabled={isSending}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
            {t('campaignWizard.runColdRun')}
          </button>

          <button
            onClick={() => handleRunCampaign(false)}
            disabled={isSending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-blue-600/30 transition"
          >
            <Send className="w-3.5 h-3.5" />
            {t('campaignWizard.sendCampaign')}
          </button>

          <button
            onClick={toggleCampaignStatus}
            className={`p-2 rounded-xl border text-xs font-medium transition ${
              campaign.status === 'active'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            {campaign.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 4-Phase Wizard Navigation Bar */}
      <div className="bg-[#090d16] border-b border-slate-800 px-8 flex items-center justify-center gap-2 py-2 shrink-0">
        {[
          { id: 'leads', label: t('campaignWizard.wizardPhase1'), icon: Users },
          { id: 'sequences', label: t('campaignWizard.wizardPhase2'), icon: Layers },
          { id: 'schedule', label: t('campaignWizard.wizardPhase3'), icon: Clock },
          { id: 'options', label: t('campaignWizard.wizardPhase4'), icon: Settings },
        ].map((phase, idx) => {
          const Icon = phase.icon;
          const active = activePhase === phase.id;
          return (
            <React.Fragment key={phase.id}>
              {idx > 0 && <div className="w-6 h-px bg-slate-800" />}
              <button
                onClick={() => setActivePhase(phase.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span>{phase.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
        {/* PHASE 1: LEADS */}
        {activePhase === 'leads' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  {t('campaignWizard.wizardPhase1')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{t('campaignWizard.leadsPhaseDesc')}</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl shadow-md transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{language === 'es' ? 'Importar (Google Sheets / CSV)' : 'Import (Google Sheets / CSV)'}</span>
                </button>

                {campaignLeads.length > 0 && (
                  <button
                    onClick={handleClearLeads}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/80 transition"
                    title={language === 'es' ? 'Vaciar leads' : 'Clear leads'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                <div className="text-xs text-slate-400 font-mono pl-2 border-l border-slate-800">
                  {campaignLeads.length} leads
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{t('campaignWizard.deduplicationNotice')}</span>
            </div>

            {/* Leads Table Preview */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {campaignLeads.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono text-white">{l.email}</td>
                      <td className="py-2.5 px-4 text-slate-300">{l.firstName} {l.lastName}</td>
                      <td className="py-2.5 px-4 text-slate-400">{l.companyName}</td>
                      <td className="py-2.5 px-4">
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PHASE 2: SEQUENCES */}
        {activePhase === 'sequences' && (
          <div className="space-y-6">
            {/* Step Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
              {campaign.steps.map((step, idx) => (
                <button
                  key={step.id}
                  onClick={() => {
                    setActiveStepIndex(idx);
                    setActiveVariantIndex(0);
                  }}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                    activeStepIndex === idx
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <span>{idx === 0 ? t('campaignWizard.stepInitial') : `${t('campaignWizard.stepFollowUp')} ${step.stepNumber} (+${step.waitDays}d)`}</span>
                  {campaign.steps.length > 1 && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteStep(idx);
                      }}
                      className="hover:text-rose-400 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </span>
                  )}
                </button>
              ))}

              <button
                onClick={handleAddStep}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-3 py-1.5 rounded-xl transition"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('campaignWizard.addStep')}
              </button>
            </div>

            {/* Delay Settings if Follow-up */}
            {activeStepIndex > 0 && activeStep && (
              <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 px-4 py-2.5 rounded-xl text-xs">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300">{t('campaignWizard.wait')}</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={activeStep.waitDays}
                  onChange={(e) => handleUpdateWaitDays(parseInt(e.target.value) || 1)}
                  className="w-14 bg-slate-800 border border-slate-700 text-white text-xs px-2 py-1 rounded text-center focus:outline-none"
                />
                <span className="text-slate-300">{t('campaignWizard.daysIfNoReply')}</span>
              </div>
            )}

            {/* A/Z Testing Variant Tabs */}
            {activeStep && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">
                  A/Z Testing:
                </span>
                {activeStep.variants.map((v, vIdx) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveVariantIndex(vIdx)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      activeVariantIndex === vIdx
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {v.name}
                  </button>
                ))}

                {activeStep.variants.length < 5 && (
                  <button
                    onClick={handleAddVariantToStep}
                    className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1 transition"
                  >
                    <Plus className="w-3 h-3" />
                    {t('campaignWizard.addVariant')}
                  </button>
                )}
              </div>
            )}

            {/* Spam Detection Banner */}
            {totalSpamWords.length > 0 ? (
              <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-rose-300">
                      {t('campaignWizard.spamWarningTitle')} {totalSpamWords.length} {t('campaignWizard.spamWarningDetected')}
                    </div>
                    <div className="text-[11px] text-rose-200/70 mt-0.5 flex flex-wrap gap-1">
                      {totalSpamWords.map((w, i) => (
                        <span key={i} className="font-mono bg-rose-500/20 px-1 rounded text-rose-200">
                          {w.word}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleQuickCleanSpam}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 shadow"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {t('campaignWizard.cleanSpamAi')}
                </button>
              </div>
            ) : (
              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-xs text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                <span>{t('campaignWizard.spamSafeBadge')}</span>
              </div>
            )}

            {/* Subject Line Input */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  {t('campaignWizard.subjectLine')}
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500 mr-1">{t('campaignWizard.insertTag')}</span>
                  {availableTags.slice(0, 6).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertVariable(tag, 'subject')}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 px-2 py-0.5 rounded transition"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="text"
                value={activeVariant?.subject || ''}
                onChange={(e) => handleUpdateActiveVariant({ subject: e.target.value })}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            {/* Email Body Input */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  {t('campaignWizard.emailBody')}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddSpintaxToBody}
                    className="text-[11px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-lg transition flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    {t('campaignWizard.autoSpintax')}
                  </button>

                  <button
                    onClick={handlePreviewSpintax}
                    className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg transition flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3 text-slate-400" />
                    {t('campaignWizard.previewSpintax')}
                  </button>

                  <div className="h-4 w-px bg-slate-800" />

                  <div className="flex items-center gap-1 flex-wrap">
                    {availableTags.slice(0, 8).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertVariable(tag, 'body')}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 px-2 py-0.5 rounded transition"
                      >
                        +{tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <textarea
                rows={9}
                value={activeVariant?.body || ''}
                onChange={(e) => handleUpdateActiveVariant({ body: e.target.value })}
                placeholder={t('campaignWizard.bodyPlaceholder')}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg p-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition leading-relaxed font-sans"
              />
            </div>
          </div>
        )}

        {/* PHASE 3: SCHEDULE */}
        {activePhase === 'schedule' && (
          <div className="space-y-6">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                {t('campaignWizard.wizardPhase3')}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">{t('campaignWizard.schedulePhaseDesc')}</p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  {t('campaignWizard.timezoneLabel')}
                </label>
                <select
                  value={campaign.schedule.timezone}
                  onChange={(e) => {
                    const updated = { ...campaign, schedule: { ...campaign.schedule, timezone: e.target.value } };
                    onUpdateCampaign(updated);
                    saveToServer(updated);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  <option value="America/New_York">America/New_York (EST / EDT)</option>
                  <option value="Europe/Madrid">Europe/Madrid (CET / CEST)</option>
                  <option value="America/Mexico_City">America/Mexico_City (CST)</option>
                  <option value="America/Buenos_Aires">America/Buenos_Aires (ART)</option>
                  <option value="Europe/London">Europe/London (GMT / BST)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">{t('campaignWizard.windowFrom')}</label>
                  <input
                    type="time"
                    value={campaign.schedule.timing.from}
                    onChange={(e) => {
                      const updated = { ...campaign, schedule: { ...campaign.schedule, timing: { ...campaign.schedule.timing, from: e.target.value } } };
                      onUpdateCampaign(updated);
                      saveToServer(updated);
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">{t('campaignWizard.windowTo')}</label>
                  <input
                    type="time"
                    value={campaign.schedule.timing.to}
                    onChange={(e) => {
                      const updated = { ...campaign, schedule: { ...campaign.schedule, timing: { ...campaign.schedule.timing, to: e.target.value } } };
                      onUpdateCampaign(updated);
                      saveToServer(updated);
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PHASE 4: OPTIONS */}
        {activePhase === 'options' && (
          <div className="space-y-6">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-400" />
                {t('campaignWizard.wizardPhase4')}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">{t('campaignWizard.optionsPhaseDesc')}</p>
            </div>

            <div className="space-y-4">
              {/* Inbox Rotation */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2 text-xs">
                <h4 className="font-bold text-white text-sm">{t('campaignWizard.inboxRotationTitle')}</h4>
                <p className="text-slate-400">{t('campaignWizard.inboxRotationDesc')}</p>
              </div>

              {/* Toggles */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campaign.options?.stopOnReply ?? true}
                    onChange={(e) => {
                      const updated = { ...campaign, options: { ...(campaign.options || { stopOnDomainReply: true, plainTextMode: false, openTracking: true, clickTracking: true }), stopOnReply: e.target.checked } };
                      onUpdateCampaign(updated);
                      saveToServer(updated);
                    }}
                    className="mt-0.5 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <div className="font-semibold text-white">{t('campaignWizard.stopOnReply')}</div>
                    <div className="text-[11px] text-slate-400">{t('campaignWizard.stopOnReplyDesc')}</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campaign.options?.stopOnDomainReply ?? true}
                    onChange={(e) => {
                      const updated = { ...campaign, options: { ...(campaign.options || { stopOnReply: true, plainTextMode: false, openTracking: true, clickTracking: true }), stopOnDomainReply: e.target.checked } };
                      onUpdateCampaign(updated);
                      saveToServer(updated);
                    }}
                    className="mt-0.5 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <div className="font-semibold text-white">{t('campaignWizard.stopOnDomainReply')}</div>
                    <div className="text-[11px] text-slate-400">{t('campaignWizard.stopOnDomainReplyDesc')}</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campaign.options?.plainTextMode ?? false}
                    onChange={(e) => {
                      const updated = { ...campaign, options: { ...(campaign.options || { stopOnReply: true, stopOnDomainReply: true, openTracking: true, clickTracking: true }), plainTextMode: e.target.checked } };
                      onUpdateCampaign(updated);
                      saveToServer(updated);
                    }}
                    className="mt-0.5 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <div className="font-semibold text-white">{t('campaignWizard.plainTextMode')}</div>
                    <div className="text-[11px] text-slate-400">{t('campaignWizard.plainTextModeDesc')}</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Live Dispatch Logs Modal / Panel */}
        {dispatchResult && (
          <div className="mt-6 bg-slate-900 border border-blue-500/40 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold text-white">{t('campaignWizard.reportTitle')}</span>
              </div>
              <button
                onClick={() => setDispatchResult(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                {t('common.close')}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700">
                <div className="text-[10px] text-slate-400 uppercase">Leads Targeted</div>
                <div className="text-lg font-bold text-white mt-1">{dispatchResult.processed}</div>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700">
                <div className="text-[10px] text-slate-400 uppercase">Emails Dispatched</div>
                <div className="text-lg font-bold text-emerald-400 mt-1">{dispatchResult.sentCount}</div>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700">
                <div className="text-[10px] text-slate-400 uppercase">Dispatch Mode</div>
                <div className="text-sm font-medium text-blue-400 mt-1">
                  {dispatchResult.logs[0]?.status === 'simulated' ? 'Test Simulation' : 'Live SMTP'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Spintax Preview Modal */}
        {previewSpintaxModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  <span className="text-base font-bold text-white">Spintax Variations</span>
                </div>
                <button
                  onClick={() => setPreviewSpintaxModal(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {spintaxPreviews.map((sample, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-1">
                    <div className="text-[10px] text-indigo-400 font-mono">Variation #{i + 1}:</div>
                    <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{sample}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* Lead Import Modal (Google Sheets / CSV) */}
        <LeadImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          campaignId={campaign.id}
          onImportSuccess={() => {
            if (onRefreshLeads) onRefreshLeads();
          }}
        />
      </div>
    </div>
  );
}
