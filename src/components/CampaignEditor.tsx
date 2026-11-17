'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, Layers, Clock, Settings, Plus, Trash2, Send, Play, Pause, 
  AlertTriangle, CheckCircle, CheckCircle2, Sparkles, Eye, ShieldCheck, RefreshCw, 
  FileSpreadsheet, Upload, CheckSquare, Square, Tag, Mail, Edit3
} from 'lucide-react';
import { Campaign, SequenceStep, StepVariant, Lead, SenderAccount, LeadStatus } from '@/types';
import { checkSpamWords, applySpamFixes } from '@/lib/spamDetector';
import { resolveSpintax, generateSpintax, hasSpintax, resolveVariations } from '@/lib/spintax';
import { useLanguage } from '@/context/LanguageContext';
import { v4 as uuidv4 } from 'uuid';
import LeadImportModal from './LeadImportModal';
import SendTestEmailModal from './SendTestEmailModal';
import EditLeadModal from './EditLeadModal';

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
  const [isTestEmailModalOpen, setIsTestEmailModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAccounts(data);
          const currentIds = campaign.senderAccountIds || [];
          const validIds = currentIds.filter(id => data.some(a => a.id === id));
          if (validIds.length === 0) {
            const autoSelected = [data[0].id];
            const updated = { ...campaign, senderAccountIds: autoSelected };
            onUpdateCampaign(updated);
            saveToServer(updated);
          }
        }
      })
      .catch(() => {});
  }, [campaign.id]);

  const handleToggleAccount = (accountId: string) => {
    const current = campaign.senderAccountIds || [];
    let updatedIds: string[];
    if (current.includes(accountId)) {
      if (current.length === 1) return;
      updatedIds = current.filter(id => id !== accountId);
    } else {
      updatedIds = [...current, accountId];
    }
    const updated = { ...campaign, senderAccountIds: updatedIds };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const activeStep = campaign.steps[activeStepIndex] || campaign.steps[0];
  const activeVariant = activeStep?.variants[activeVariantIndex] || activeStep?.variants[0];

  // Live Spam Check on Active Variant supporting English & Spanish
  const subjectSpam = activeVariant ? checkSpamWords(activeVariant.subject, language) : [];
  const bodySpam = activeVariant ? checkSpamWords(activeVariant.body, language) : [];
  const totalSpamWords = [...subjectSpam, ...bodySpam];

  const campaignLeads = leads.filter(l => l.campaignId === campaign.id);
  const allRelevantLeads = campaignLeads.length > 0 ? campaignLeads : leads;

  // Extract detected unique variables from campaign leads' customVariables
  const detectedVariables = Array.from(
    new Set(
      allRelevantLeads.flatMap(l => Object.keys(l.customVariables || {}))
    )
  );

  // If the user imported a sheet/CSV and selected specific columns, show ONLY those selected columns.
  const availableTags =
    detectedVariables.length > 0
      ? detectedVariables
      : ['firstName', 'lastName', 'companyName', 'email'];

  const [isResettingLeads, setIsResettingLeads] = useState(false);
  const handleResetLeads = async () => {
    const confirmMsg = language === 'es'
      ? '¿Deseas reiniciar todos los leads de esta campaña a estado "Pendiente"? Esto te permitirá volver a enviar la campaña o probarla.'
      : 'Reset all leads in this campaign to "Pending" status to re-test sending?';
    if (!confirm(confirmMsg)) return;

    setIsResettingLeads(true);
    try {
      await fetch(`/api/leads?campaignId=${campaign.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_status' })
      });
      if (onRefreshLeads) onRefreshLeads();
    } catch (e) {
      console.error(e);
    } finally {
      setIsResettingLeads(false);
    }
  };

  const handleClearLeads = async () => {
    if (!confirm(language === 'es' ? '¿Deseas vaciar los leads de esta campaña?' : 'Clear leads in this campaign?')) return;
    try {
      await fetch(`/api/leads?campaignId=${campaign.id}`, { method: 'DELETE' });
      if (onRefreshLeads) onRefreshLeads();
    } catch (e) {}
  };

  const saveToServer = async (updated: Campaign) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/campaigns/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Failed to auto-save campaign:', err);
      setSaveStatus('error');
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

  const handleDeleteVariant = (variantIndex: number) => {
    if (!activeStep || activeStep.variants.length <= 1) return;
    const confirmMsg = language === 'es'
      ? '¿Estás seguro de eliminar esta variante de prueba A/B?'
      : 'Are you sure you want to delete this test variant?';
    if (!confirm(confirmMsg)) return;

    const newSteps = [...campaign.steps];
    newSteps[activeStepIndex].variants = newSteps[activeStepIndex].variants.filter((_, idx) => idx !== variantIndex);
    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
    setActiveVariantIndex(Math.max(0, variantIndex - 1));
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
    const body = activeVariant.body || '';
    const samples = resolveVariations(body, 3);
    setSpintaxPreviews(samples);
    setPreviewSpintaxModal(true);
  };

  const toggleCampaignStatus = async () => {
    const nextStatus = campaign.status === 'active' ? 'paused' : 'active';
    const updated = { ...campaign, status: nextStatus as any };
    onUpdateCampaign(updated);
    await saveToServer(updated);
    if (nextStatus === 'active') {
      await handleRunCampaign(false, true);
    }
  };

  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null);

  const handleRunCampaign = async (
    simulationOnly: boolean = false,
    respectSchedule: boolean = false
  ) => {
    setIsSending(true);
    setDispatchResult(null);
    const pendingTotal = campaignLeads.filter(l => l.status === 'pending').length;
    setSendProgress({ sent: 0, total: pendingTotal });

    try {
      const batchSize = simulationOnly ? 50 : 5;
      let cumulativeSent = 0;
      let cumulativeProcessed = 0;
      const allLogs: any[] = [];
      let safetyIterations = 0;

      while (safetyIterations < 200) {
        safetyIterations++;
        const res = await fetch(`/api/campaigns/${campaign.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ simulationOnly, batchSize, respectSchedule })
        });
        const data = await res.json();

        if (!res.ok || data.error) {
          setDispatchResult({ error: data.error || 'Error enviando lote de campaña' });
          break;
        }

        if (data.outsideScheduleWindow) {
          setDispatchResult({
            scheduledNotice:
              language === 'es'
                ? `⏰ Campaña activada en espera: se enviará automáticamente en tu franja programada (${data.scheduledWindow}).`
                : `⏰ Campaign armed: emails will automatically dispatch within your scheduled window (${data.scheduledWindow}).`
          });
          break;
        }

        cumulativeSent += data.sentCount || 0;
        cumulativeProcessed += data.processed || 0;
        if (Array.isArray(data.logs)) {
          allLogs.push(...data.logs);
        }

        const totalTarget = Math.max(pendingTotal, cumulativeSent + (data.remainingPending || 0));
        setSendProgress({ sent: cumulativeSent, total: totalTarget });

        if (!data.remainingPending || data.remainingPending <= 0 || data.sentCount === 0) {
          const firstErrorLog = allLogs.find(l => l.status === 'error');
          if (cumulativeSent === 0 && firstErrorLog?.error) {
            setDispatchResult({ error: `Fallo SMTP: ${firstErrorLog.error}` });
          } else {
            setDispatchResult({
              campaignId: campaign.id,
              totalPending: pendingTotal,
              processed: cumulativeProcessed,
              sentCount: cumulativeSent,
              logs: allLogs
            });
          }
          break;
        }
      }

      const refreshed = await fetch(`/api/campaigns/${campaign.id}`).then(r => r.json());
      onUpdateCampaign(refreshed);
      if (onRefreshLeads) onRefreshLeads();
    } catch (err: any) {
      console.error(err);
      setDispatchResult({ error: err.message || 'Error de red durante el envío' });
    } finally {
      setIsSending(false);
      setSendProgress(null);
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
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0b0f17]">
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

          {/* Auto-save status badge */}
          <div className="flex items-center gap-1.5 text-[11px] font-medium transition">
            {saveStatus === 'saved' && (
              <span className="text-emerald-400/90 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {language === 'es' ? 'Guardado en Supabase' : 'Saved to Supabase'}
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                <RefreshCw className="w-3 h-3 animate-spin" />
                {language === 'es' ? 'Guardando...' : 'Saving...'}
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-rose-400 flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                {language === 'es' ? 'Error al guardar' : 'Save Error'}
              </span>
            )}
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTestEmailModalOpen(true)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-blue-400 border border-slate-700 hover:border-blue-500/40 text-xs font-semibold px-3.5 py-2 rounded-xl transition cursor-pointer shadow-sm"
            title={language === 'es' ? 'Enviar un correo de prueba real a tu dirección' : 'Send a test email to your address'}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>{language === 'es' ? 'Prueba Real a mi casilla' : 'Test Email'}</span>
          </button>

          <button
            onClick={() => handleRunCampaign(true)}
            disabled={isSending}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
            {t('campaignWizard.runColdRun')}
          </button>

          <button
            onClick={() => handleRunCampaign(false, false)}
            disabled={isSending}
            title={
              language === 'es'
                ? 'Envía todos los correos pendientes ahora mismo sin esperar el horario programado'
                : 'Send all pending emails immediately without waiting for schedule'
            }
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-blue-600/30 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{language === 'es' ? 'Enviar Ahora (Inmediato)' : 'Send Now (Immediate)'}</span>
          </button>

          <button
            onClick={toggleCampaignStatus}
            title={
              campaign.status === 'active'
                ? language === 'es'
                  ? 'Pausar campaña programada'
                  : 'Pause scheduled campaign'
                : language === 'es'
                ? `Activar campaña según horario (${campaign.schedule?.timing?.from || '09:00'} - ${campaign.schedule?.timing?.to || '17:00'})`
                : 'Activate campaign on schedule'
            }
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              campaign.status === 'active'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            {campaign.status === 'active' ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>{language === 'es' ? 'Pausar Horario' : 'Pause Schedule'}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>
                  {language === 'es'
                    ? `Activar Horario (${campaign.schedule?.timing?.from || '09:00'})`
                    : 'Activate Schedule'}
                </span>
              </>
            )}
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
      <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {/* PHASE 1: LEADS */}
        {activePhase === 'leads' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
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
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl shadow-md transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{language === 'es' ? 'Importar (Google Sheets / CSV)' : 'Import (Google Sheets / CSV)'}</span>
                </button>

                {campaignLeads.length > 0 && (
                  <>
                    <button
                      onClick={handleResetLeads}
                      disabled={isResettingLeads}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-950/40 text-slate-300 hover:text-indigo-300 border border-slate-700/80 transition text-xs font-semibold cursor-pointer"
                      title={language === 'es' ? 'Reiniciar estado de leads a pendiente para reenviar o probar' : 'Reset leads status to pending'}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isResettingLeads ? 'animate-spin' : ''}`} />
                      <span>{language === 'es' ? 'Reiniciar a Pendiente' : 'Reset to Pending'}</span>
                    </button>

                    <button
                      onClick={handleClearLeads}
                      className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/80 transition cursor-pointer"
                      title={language === 'es' ? 'Vaciar leads' : 'Clear leads'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}

                <div className="text-xs text-slate-400 font-mono pl-2 border-l border-slate-800">
                  {campaignLeads.length} leads
                </div>
              </div>
            </div>

            {/* Campaign Leads Status Banner */}
            {campaignLeads.length > 0 && (
              <div className="flex items-center justify-between p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl text-xs">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-slate-400">{language === 'es' ? 'Enviados:' : 'Sent:'}</span>
                    <span className="font-bold text-white font-mono">{campaignLeads.filter(l => l.status === 'sent').length}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-slate-400">{language === 'es' ? 'Pendientes:' : 'Pending:'}</span>
                    <span className="font-bold text-white font-mono">{campaignLeads.filter(l => l.status === 'pending').length}</span>
                  </div>
                </div>

                {campaignLeads.filter(l => l.status === 'pending').length === 0 && campaignLeads.length > 0 && (
                  <span className="text-[11px] text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl">
                    {language === 'es' ? '✅ Todos los correos fueron despachados' : '✅ All emails dispatched'}
                  </span>
                )}
              </div>
            )}

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{t('campaignWizard.deduplicationNotice')}</span>
              </span>
              {detectedVariables.length > 0 && (
                <span className="text-[11px] text-blue-400 font-medium bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20 shrink-0">
                  {detectedVariables.length} {language === 'es' ? 'columnas detectadas' : 'sheet columns detected'}
                </span>
              )}
            </div>

            {/* Leads Table Preview with Full Horizontal Scroll and Dynamic Sheet Columns */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto w-full max-w-full">
                <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 font-bold text-white w-12 sticky left-0 z-20 bg-slate-950 shadow-sm">#</th>
                      <th className="py-3 px-4 font-bold text-white sticky left-12 z-20 bg-slate-950 border-r border-slate-800 shadow-[2px_0_6px_rgba(0,0,0,0.4)]">Email</th>
                      <th className="py-3 px-4 font-bold text-white">Estado / Status</th>
                      <th className="py-3 px-4 font-bold text-white">Acción</th>
                      <th className="py-3 px-4 font-bold text-white">Nombre / Name</th>
                      <th className="py-3 px-4 font-bold text-white">Empresa / Company</th>
                      {detectedVariables.map((col) => (
                        <th key={col} className="py-3 px-4 text-blue-400 bg-blue-950/30 border-l border-slate-800/80 font-mono font-bold">
                          &#123;&#123;{col}&#125;&#125;
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {campaignLeads.length === 0 ? (
                      <tr>
                        <td colSpan={6 + detectedVariables.length} className="py-8 text-center text-slate-500">
                          {language === 'es' ? 'No hay destinatarios cargados en esta campaña.' : 'No leads loaded in this campaign.'}
                        </td>
                      </tr>
                    ) : (
                      campaignLeads.map((l, i) => {
                        const statusLabelMap: Record<LeadStatus, { text: string; cls: string }> = {
                          pending: {
                            text: language === 'es' ? '⏳ Pendiente' : '⏳ Pending',
                            cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          },
                          sent: {
                            text: language === 'es' ? '✅ Enviado' : '✅ Sent',
                            cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          },
                          opened: {
                            text: language === 'es' ? '👁️ Abierto' : '👁️ Opened',
                            cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                          },
                          replied: {
                            text: language === 'es' ? '💬 Respondido' : '💬 Replied',
                            cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                          },
                          bounced: {
                            text: language === 'es' ? '⚠️ Rebotado' : '⚠️ Bounced',
                            cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          },
                          unsubscribed: {
                            text: language === 'es' ? '🚫 Baja' : '🚫 Unsubscribed',
                            cls: 'bg-slate-700 text-slate-300 border-slate-600'
                          },
                          completed: {
                            text: language === 'es' ? '🏁 Completo' : '🏁 Completed',
                            cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                          }
                        };
                        const st = statusLabelMap[l.status] || statusLabelMap.pending;

                        return (
                          <tr key={l.id} className="group hover:bg-slate-800/40 transition">
                            <td className="py-2.5 px-4 text-slate-500 font-mono text-[10px] w-12 sticky left-0 z-10 bg-[#090d16] group-hover:bg-slate-900 transition">{i + 1}</td>
                            <td className="py-2.5 px-4 font-mono text-white font-medium sticky left-12 z-10 bg-[#090d16] group-hover:bg-slate-900 border-r border-slate-800 shadow-[2px_0_6px_rgba(0,0,0,0.4)] transition">{l.email}</td>
                            <td className="py-2.5 px-4">
                              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${st.cls}`}>
                                {st.text}
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              <button
                                type="button"
                                onClick={() => setEditingLead(l)}
                                className="flex items-center gap-1 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700 hover:border-blue-500 text-[10px] font-semibold transition cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>{language === 'es' ? 'Editar' : 'Edit'}</span>
                              </button>
                            </td>
                            <td className="py-2.5 px-4 text-slate-300">{l.firstName} {l.lastName}</td>
                            <td className="py-2.5 px-4 text-slate-400">{l.companyName || '-'}</td>
                            {detectedVariables.map((col) => (
                              <td 
                                key={col} 
                                className="py-2.5 px-4 font-mono text-slate-300 border-l border-slate-800/60 bg-slate-950/20 max-w-xs truncate" 
                                title={String(l.customVariables?.[col] ?? '')}
                              >
                                {l.customVariables?.[col] !== undefined ? String(l.customVariables[col]) : '-'}
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
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
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">
                  A/Z Testing:
                </span>
                {activeStep.variants.map((v, vIdx) => (
                  <div
                    key={v.id}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      activeVariantIndex === vIdx
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveVariantIndex(vIdx)}
                      className="focus:outline-none cursor-pointer"
                    >
                      {v.name}
                    </button>
                    {activeStep.variants.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVariant(vIdx);
                        }}
                        className="ml-1 text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 p-0.5 rounded transition cursor-pointer"
                        title={language === 'es' ? 'Eliminar variante' : 'Delete variant'}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}

                {activeStep.variants.length < 5 && (
                  <button
                    onClick={handleAddVariantToStep}
                    className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer"
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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  {t('campaignWizard.subjectLine')}
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500 mr-1">{t('campaignWizard.insertTag')}</span>
                  {availableTags.map((tag) => {
                    const isCustomSheet = detectedVariables.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertVariable(tag, 'subject')}
                        className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${
                          isCustomSheet
                            ? 'bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 font-mono font-medium shadow-sm'
                            : 'bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700'
                        }`}
                        title={isCustomSheet ? (language === 'es' ? 'Columna de tu Hoja de Leads' : 'Sheet Column Tag') : 'Campo de contacto'}
                      >
                        +{tag}
                      </button>
                    );
                  })}
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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  {t('campaignWizard.emailBody')}
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleAddSpintaxToBody}
                    className="text-[11px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                    title={language === 'es' ? 'Aplicar Spintax automático' : 'Apply Auto Spintax'}
                  >
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    {t('campaignWizard.autoSpintax')}
                  </button>

                  <button
                    onClick={handlePreviewSpintax}
                    className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                    title={language === 'es' ? 'Previsualizar variaciones' : 'Preview variations'}
                  >
                    <Eye className="w-3 h-3 text-slate-400" />
                    {t('campaignWizard.previewSpintax')}
                  </button>

                  <div className="h-4 w-px bg-slate-800 hidden sm:block" />

                  <div className="flex items-center gap-1 flex-wrap">
                    {availableTags.map((tag) => {
                      const isCustomSheet = detectedVariables.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => insertVariable(tag, 'body')}
                          className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${
                            isCustomSheet
                              ? 'bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 font-mono font-medium shadow-sm'
                              : 'bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700'
                          }`}
                          title={isCustomSheet ? (language === 'es' ? 'Columna de tu Hoja de Leads' : 'Sheet Column Tag') : 'Campo de contacto'}
                        >
                          +{tag}
                        </button>
                      );
                    })}
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
              {/* Sender Accounts / Inbox Selection */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-400" />
                      <span>{language === 'es' ? 'Casillas de Correo Remitentes (Sender Accounts)' : t('campaignWizard.inboxRotationTitle')}</span>
                    </h4>
                    <p className="text-slate-400 mt-0.5">
                      {language === 'es' 
                        ? 'Selecciona las cuentas de correo desde las cuales se enviarán los mensajes de esta campaña.'
                        : t('campaignWizard.inboxRotationDesc')}
                    </p>
                  </div>
                </div>

                {accounts.length === 0 ? (
                  <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl text-amber-300 text-xs">
                    {language === 'es' ? 'No tienes casillas de correo conectadas.' : 'No sender accounts connected.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {accounts.map((acc) => {
                      const isSelected = (campaign.senderAccountIds || []).includes(acc.id);
                      return (
                        <div
                          key={acc.id}
                          onClick={() => handleToggleAccount(acc.id)}
                          className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-blue-600/10 border-blue-500/60 shadow-sm'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold uppercase shrink-0 ${
                              isSelected ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {acc.provider === 'google' ? 'G' : acc.provider === 'microsoft' ? 'M' : 'SMTP'}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-white truncate text-xs flex items-center gap-2">
                                <span>{acc.name || acc.email}</span>
                                {isSelected && (
                                  <span className="text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.2 rounded font-semibold uppercase">
                                    {language === 'es' ? 'Activa' : 'Active'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono truncate">{acc.email}</div>
                              <div className="text-[10px] text-emerald-400 font-medium">
                                ✓ {language === 'es' ? 'Conectada' : 'Connected'} • {acc.dailyLimit || 50}/día
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isSelected ? (
                              <CheckCircle2 className="w-5 h-5 text-blue-400" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-slate-700" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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

        {/* Live Batch Sending Progress Bar */}
        {isSending && sendProgress && (
          <div className="mt-6 bg-slate-900 border border-blue-500/40 rounded-xl p-4 space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold text-blue-300">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                <span>
                  {language === 'es'
                    ? 'Despachando correos por lotes seguros (Conexión SMTP persistente)...'
                    : 'Dispatching emails in safe batches (Persistent SMTP pool)...'}
                </span>
              </div>
              <span className="font-mono font-bold text-white">
                {sendProgress.sent} / {sendProgress.total || '?'}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-300"
                style={{
                  width: `${
                    sendProgress.total > 0
                      ? Math.min(100, Math.round((sendProgress.sent / sendProgress.total) * 100))
                      : 15
                  }%`
                }}
              />
            </div>
          </div>
        )}

        {/* Live Dispatch Logs Modal / Panel */}
        {dispatchResult && (
          dispatchResult.scheduledNotice ? (
            <div className="mt-6 bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-5 shadow-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-emerald-300 text-xs">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>{language === 'es' ? 'Programación Activada' : 'Schedule Armed'}</span>
                </div>
                <button
                  onClick={() => setDispatchResult(null)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  {t('common.close')}
                </button>
              </div>
              <p className="text-xs text-emerald-200">{dispatchResult.scheduledNotice}</p>
            </div>
          ) : dispatchResult.error ? (
            <div className="mt-6 bg-rose-950/40 border border-rose-500/40 rounded-xl p-5 shadow-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-rose-300 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>{language === 'es' ? 'Aviso de Envío' : 'Dispatch Notice'}</span>
                </div>
                <button
                  onClick={() => setDispatchResult(null)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  {t('common.close')}
                </button>
              </div>
              <p className="text-xs text-rose-200">{dispatchResult.error}</p>
            </div>
          ) : (
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
                  <div className="text-lg font-bold text-white mt-1">{dispatchResult.processed || 0}</div>
                </div>
                <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700">
                  <div className="text-[10px] text-slate-400 uppercase">Emails Dispatched</div>
                  <div className="text-lg font-bold text-emerald-400 mt-1">{dispatchResult.sentCount || 0}</div>
                </div>
                <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700">
                  <div className="text-[10px] text-slate-400 uppercase">Dispatch Mode</div>
                  <div className="text-sm font-medium text-blue-400 mt-1">
                    {dispatchResult.logs?.[0]?.status === 'simulated' ? 'Test Simulation' : 'Live SMTP'}
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* Spintax Preview Modal */}
        {previewSpintaxModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0e1422] border border-slate-800 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {language === 'es' ? 'Variaciones Spintax' : 'Spintax Variations'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {language === 'es' 
                        ? 'Simula las diferentes versiones únicas que recibirá cada prospecto' 
                        : 'Preview distinct randomized variations sent to each prospect'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewSpintaxModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  ✕
                </button>
              </div>

              {!hasSpintax(activeVariant?.body || '') ? (
                <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-2xl space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-amber-300">
                        {language === 'es' ? 'No se detectó sintaxis Spintax en este correo' : 'No Spintax syntax detected'}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {language === 'es'
                          ? 'El Spintax te permite alternar saludos y frases para que cada correo enviado sea único y no caiga en spam. Por ejemplo: {Hola|Qué tal|Espero que todo vaya bien}.'
                          : 'Spintax lets you randomize greetings and sentences so each email is unique. For example: {Hi|Hello|Hey}.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        handleAddSpintaxToBody();
                        if (activeVariant) {
                          const newBody = generateSpintax(activeVariant.body, language);
                          setSpintaxPreviews(resolveVariations(newBody, 3));
                        }
                      }}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{language === 'es' ? 'Aplicar Spintax Automático a este correo' : 'Apply Auto Spintax Now'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {spintaxPreviews.map((sample, i) => (
                    <div key={i} className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-indigo-400 font-mono font-semibold uppercase">
                          {language === 'es' ? `Variación #${i + 1}:` : `Variation #${i + 1}:`}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {language === 'es' ? 'Muestra generada' : 'Generated sample'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">{sample}</p>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-[11px] text-slate-500 font-mono">
                      {language === 'es' ? 'Sintaxis: {opción 1|opción 2|opción 3}' : 'Syntax: {option 1|option 2}'}
                    </span>
                    <button
                      onClick={() => {
                        if (activeVariant) {
                          setSpintaxPreviews(resolveVariations(activeVariant.body, 3));
                        }
                      }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>{language === 'es' ? 'Generar otras muestras aleatorias' : 'Re-roll variations'}</span>
                    </button>
                  </div>
                </div>
              )}
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

        {/* Send Real Test Email Modal */}
        <SendTestEmailModal
          isOpen={isTestEmailModalOpen}
          onClose={() => setIsTestEmailModalOpen(false)}
          campaignId={campaign.id}
        />

        {/* Edit Lead Modal */}
        <EditLeadModal
          isOpen={Boolean(editingLead)}
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSaved={() => {
            if (onRefreshLeads) onRefreshLeads();
          }}
        />
      </div>
    </div>
  );
}
