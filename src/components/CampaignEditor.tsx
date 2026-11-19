'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Layers, Clock, Settings, Plus, Trash2, Send, Play, Pause,
  AlertTriangle, CheckCircle2, Sparkles, Eye, ShieldCheck, RefreshCw,
  FileSpreadsheet, Mail, Edit3, ChevronDown, Monitor, Smartphone,
  Dice5, MessageSquare, Flag, Ban, X
} from 'lucide-react';
import {
  Campaign, SequenceStep, StepVariant, Lead, SenderAccount, LeadStatus,
  ROLE_PERMISSIONS, normalizeRole
} from '@/types';
import { checkSpamWords, applySpamFixes } from '@/lib/spamDetector';
import { resolveSpintax, generateSpintax, hasSpintax, resolveVariations } from '@/lib/spintax';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';
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

interface DispatchLogItem {
  status?: string;
  error?: string;
}

interface DispatchResultState {
  scheduledNotice?: string;
  error?: string;
  campaignId?: string;
  totalPending?: number;
  processed?: number;
  sentCount?: number;
  logs?: DispatchLogItem[];
}

export default function CampaignEditor({
  campaign,
  onUpdateCampaign,
  openCopilot,
  leads = [],
  onRefreshLeads
}: CampaignEditorProps) {
  const { t, language } = useLanguage();
  const { user, currentWorkspace } = useAuth();
  const { showToast, confirm } = useFeedback();
  const isEs = language === 'es';
  const isReadOnly = ROLE_PERMISSIONS[normalizeRole(user?.role)].isReadOnly;

  const [activePhase, setActivePhase] = useState<'leads' | 'sequences' | 'schedule' | 'options'>('sequences');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [previewSpintaxModal, setPreviewSpintaxModal] = useState(false);
  const [spintaxPreviews, setSpintaxPreviews] = useState<string[]>([]);

  useEffect(() => {
    if (!previewSpintaxModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewSpintaxModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewSpintaxModal]);

  const [isSending, setIsSending] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResultState | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTestEmailModalOpen, setIsTestEmailModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isActionDropdownOpen, setIsActionDropdownOpen] = useState(false);
  const [sequenceMode, setSequenceMode] = useState<'editor' | 'preview'>('editor');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewLeadIndex, setPreviewLeadIndex] = useState(0);
  const [previewRandomSeed, setPreviewRandomSeed] = useState(0);

  const campaignRef = useRef(campaign);
  const onUpdateCampaignRef = useRef(onUpdateCampaign);
  const isReadOnlyRef = useRef(isReadOnly);

  useEffect(() => {
    campaignRef.current = campaign;
  }, [campaign]);

  useEffect(() => {
    onUpdateCampaignRef.current = onUpdateCampaign;
  }, [onUpdateCampaign]);

  useEffect(() => {
    isReadOnlyRef.current = isReadOnly;
  }, [isReadOnly]);

  useEffect(() => {
    let active = true;
    fetch(`/api/accounts?workspaceId=${encodeURIComponent(currentWorkspace.id)}`)
      .then(r => r.json())
      .then(data => {
        if (!active) return;
        if (Array.isArray(data)) {
          setAccounts(data);
          if (!isReadOnlyRef.current && data.length > 0) {
            const currentCampaign = campaignRef.current;
            const currentIds = currentCampaign.senderAccountIds || [];
            const validIds = currentIds.filter(id => data.some(a => a.id === id));
            if (validIds.length === 0) {
              const autoSelected = [data[0].id];
              const updated = { ...currentCampaign, senderAccountIds: autoSelected };
              onUpdateCampaignRef.current(updated);
              fetch(`/api/campaigns/${updated.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...updated,
                  workspaceId: updated.workspaceId || currentWorkspace.id
                })
              }).catch(() => {});
            }
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [campaign.id, currentWorkspace.id]);

  const handleToggleAccount = (accountId: string) => {
    if (isReadOnly) return;
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
  const availableLeads = allRelevantLeads;

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
    if (isReadOnly) return;
    const confirmed = await confirm({
      title: isEs ? 'Reiniciar estado de leads' : 'Reset leads status',
      description: isEs
        ? '¿Deseas reiniciar todos los leads de esta campaña a estado "Pendiente"? Esto te permitirá volver a enviar la campaña o probarla.'
        : 'Reset all leads in this campaign to "Pending" status to re-test sending?',
      confirmLabel: isEs ? 'Reiniciar' : 'Reset',
      cancelLabel: isEs ? 'Cancelar' : 'Cancel',
      variant: 'primary'
    });
    if (!confirmed) return;

    setIsResettingLeads(true);
    try {
      const res = await fetch(
        `/api/leads?campaignId=${encodeURIComponent(campaign.id)}&workspaceId=${encodeURIComponent(currentWorkspace.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset_status', workspaceId: currentWorkspace.id })
        }
      );
      if (!res.ok) throw new Error('Failed to reset leads');
      if (onRefreshLeads) onRefreshLeads();
      showToast({
        title: isEs ? 'Leads reiniciados a Pendiente' : 'Leads reset to Pending',
        variant: 'success'
      });
    } catch (e) {
      console.error(e);
      showToast({
        title: isEs ? 'Error al reiniciar leads' : 'Failed to reset leads',
        variant: 'error'
      });
    } finally {
      setIsResettingLeads(false);
    }
  };

  const handleClearLeads = async () => {
    if (isReadOnly) return;
    const confirmed = await confirm({
      title: isEs ? 'Vaciar leads de la campaña' : 'Clear campaign leads',
      description: isEs
        ? '¿Deseas vaciar todos los leads de esta campaña?'
        : 'Clear all leads in this campaign?',
      confirmLabel: isEs ? 'Vaciar' : 'Clear',
      cancelLabel: isEs ? 'Cancelar' : 'Cancel',
      variant: 'danger'
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/leads?campaignId=${encodeURIComponent(campaign.id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to clear leads');
      if (onRefreshLeads) onRefreshLeads();
      showToast({
        title: isEs ? 'Lista de leads vaciada' : 'Campaign leads cleared',
        variant: 'success'
      });
    } catch {
      showToast({
        title: isEs ? 'Error al vaciar leads' : 'Failed to clear leads',
        variant: 'error'
      });
    }
  };

  const saveToServer = async (updated: Campaign) => {
    if (isReadOnly) return;
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/campaigns/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updated,
          workspaceId: updated.workspaceId || currentWorkspace.id
        })
      });
      if (res.ok) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
        showToast({
          title: isEs ? 'Error al guardar cambios' : 'Failed to save changes',
          variant: 'error'
        });
      }
    } catch (err) {
      console.error('Failed to auto-save campaign:', err);
      setSaveStatus('error');
      showToast({
        title: isEs ? 'Error de red al guardar' : 'Network error while saving',
        variant: 'error'
      });
    }
  };

  const handleUpdateActiveVariant = (updates: Partial<StepVariant>) => {
    if (isReadOnly) return;
    if (!activeStep || !activeVariant) return;

    const newSteps = campaign.steps.map((step, sIdx) => {
      if (sIdx !== activeStepIndex) return step;
      return {
        ...step,
        variants: step.variants.map((variant, vIdx) =>
          vIdx === activeVariantIndex ? { ...variant, ...updates } : variant
        )
      };
    });

    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const handleUpdateWaitDays = (days: number) => {
    if (isReadOnly) return;
    if (!activeStep) return;
    const newSteps = campaign.steps.map((step, sIdx) =>
      sIdx === activeStepIndex ? { ...step, waitDays: days } : step
    );
    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const handleAddStep = () => {
    if (isReadOnly) return;
    const nextStepNum = campaign.steps.length + 1;
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
    if (isReadOnly) return;
    if (!activeStep) return;
    const alphabet = ['A', 'B', 'C', 'D', 'E'];
    const nextLetter = alphabet[activeStep.variants.length] || `V${activeStep.variants.length + 1}`;
    const newVariant: StepVariant = {
      id: uuidv4(),
      name: `Variant ${nextLetter}`,
      subject: activeVariant?.subject || 'Quick question',
      body: activeVariant?.body || 'Hi {{firstName}}...'
    };

    const newSteps = campaign.steps.map((step, sIdx) =>
      sIdx === activeStepIndex
        ? { ...step, variants: [...step.variants, newVariant] }
        : step
    );
    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
    setActiveVariantIndex(newSteps[activeStepIndex].variants.length - 1);
  };

  const handleDeleteVariant = async (variantIndex: number) => {
    if (isReadOnly) return;
    if (!activeStep || activeStep.variants.length <= 1) return;
    const confirmed = await confirm({
      title: isEs ? 'Eliminar variante' : 'Delete variant',
      description: isEs
        ? '¿Estás seguro de eliminar esta variante de prueba A/B?'
        : 'Are you sure you want to delete this test variant?',
      confirmLabel: isEs ? 'Eliminar' : 'Delete',
      cancelLabel: isEs ? 'Cancelar' : 'Cancel',
      variant: 'danger'
    });
    if (!confirmed) return;

    const newSteps = campaign.steps.map((step, sIdx) =>
      sIdx === activeStepIndex
        ? { ...step, variants: step.variants.filter((_, idx) => idx !== variantIndex) }
        : step
    );
    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
    setActiveVariantIndex(Math.max(0, variantIndex - 1));
    showToast({
      title: isEs ? 'Variante eliminada' : 'Variant deleted',
      variant: 'success'
    });
  };

  const handleDeleteStep = (index: number) => {
    if (isReadOnly) return;
    if (campaign.steps.length <= 1) return;
    const newSteps = campaign.steps
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, stepNumber: i + 1 }));
    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
    setActiveStepIndex(Math.max(0, index - 1));
  };

  const handleQuickCleanSpam = () => {
    if (isReadOnly) return;
    if (!activeVariant) return;
    const cleanSub = applySpamFixes(activeVariant.subject, language);
    const cleanBody = applySpamFixes(activeVariant.body, language);
    handleUpdateActiveVariant({ subject: cleanSub, body: cleanBody });
    showToast({
      title: isEs ? 'Texto limpio de disparadores de spam' : 'Spam triggers cleaned',
      variant: 'success'
    });
  };

  const handleAddSpintaxToBody = () => {
    if (isReadOnly) return;
    if (!activeVariant) return;
    const spintaxBody = generateSpintax(activeVariant.body, language);
    handleUpdateActiveVariant({ body: spintaxBody });
    showToast({
      title: isEs ? 'Spintax automático aplicado' : 'Auto Spintax applied',
      variant: 'success'
    });
  };

  const handlePreviewSpintax = () => {
    if (!activeVariant) return;
    const body = activeVariant.body || '';
    const samples = resolveVariations(body, 3);
    setSpintaxPreviews(samples);
    setPreviewSpintaxModal(true);
  };

  const toggleCampaignStatus = async () => {
    if (isReadOnly) return;
    const nextStatus: Campaign['status'] = campaign.status === 'active' ? 'paused' : 'active';
    const updated: Campaign = { ...campaign, status: nextStatus };
    onUpdateCampaign(updated);
    await saveToServer(updated);
    showToast({
      title:
        nextStatus === 'active'
          ? isEs
            ? 'Campaña activada'
            : 'Campaign activated'
          : isEs
            ? 'Campaña pausada'
            : 'Campaign paused',
      variant: 'success'
    });
    if (nextStatus === 'active') {
      await handleRunCampaign(false, true);
    }
  };

  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null);

  const handleRunCampaign = async (
    simulationOnly: boolean = false,
    respectSchedule: boolean = false
  ) => {
    if (isReadOnly) return;
    setIsSending(true);
    setDispatchResult(null);
    const pendingTotal = campaignLeads.filter(l => l.status === 'pending').length;
    setSendProgress({ sent: 0, total: pendingTotal });

    try {
      const batchSize = simulationOnly ? 50 : 5;
      let cumulativeSent = 0;
      let cumulativeProcessed = 0;
      const allLogs: DispatchLogItem[] = [];
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
          const errMsg = data.error || (isEs ? 'Error enviando lote de campaña' : 'Batch send error');
          setDispatchResult({ error: errMsg });
          showToast({
            title: isEs ? 'Error en envío' : 'Dispatch error',
            description: errMsg,
            variant: 'error'
          });
          break;
        }

        if (data.outsideScheduleWindow) {
          const notice = isEs
            ? `Campaña activada en espera: se enviará automáticamente en tu franja programada (${data.scheduledWindow}).`
            : `Campaign armed: emails will automatically dispatch within your scheduled window (${data.scheduledWindow}).`;
          setDispatchResult({ scheduledNotice: notice });
          showToast({
            title: isEs ? 'Campaña programada en espera' : 'Campaign scheduled',
            description: data.scheduledWindow,
            variant: 'info'
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
            showToast({
              title: isEs ? 'Fallo SMTP' : 'SMTP failure',
              description: firstErrorLog.error,
              variant: 'error'
            });
          } else {
            setDispatchResult({
              campaignId: campaign.id,
              totalPending: pendingTotal,
              processed: cumulativeProcessed,
              sentCount: cumulativeSent,
              logs: allLogs
            });
            showToast({
              title: simulationOnly
                ? isEs
                  ? 'Simulación completada'
                  : 'Simulation complete'
                : isEs
                  ? 'Envío completado'
                  : 'Dispatch complete',
              description: isEs
                ? `${cumulativeSent} correos procesados`
                : `${cumulativeSent} emails processed`,
              variant: 'success'
            });
          }
          break;
        }
      }

      const refreshed = await fetch(`/api/campaigns/${campaign.id}`).then(r => r.json());
      if (refreshed && refreshed.id) {
        onUpdateCampaign(refreshed);
      }
      if (onRefreshLeads) onRefreshLeads();
    } catch (err: unknown) {
      console.error(err);
      const errMsg =
        err instanceof Error
          ? err.message
          : isEs
            ? 'Error de red durante el envío'
            : 'Network error during dispatch';
      setDispatchResult({ error: errMsg });
      showToast({
        title: isEs ? 'Error de envío' : 'Dispatch error',
        description: errMsg,
        variant: 'error'
      });
    } finally {
      setIsSending(false);
      setSendProgress(null);
    }
  };

  const insertVariable = (variable: string, field: 'subject' | 'body') => {
    if (isReadOnly) return;
    if (!activeVariant) return;
    if (field === 'subject') {
      handleUpdateActiveVariant({ subject: `${activeVariant.subject} {{${variable}}}` });
    } else {
      handleUpdateActiveVariant({ body: `${activeVariant.body} {{${variable}}}` });
    }
  };

  void openCopilot;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F4F7F5] text-[#14213D]">
      {/* Top Header with Campaign Name, Status and Controls */}
      <div className="h-16 px-8 border-b border-[#DCE3DF] flex items-center justify-between bg-white shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <input
            type="text"
            disabled={isReadOnly}
            value={campaign.name}
            onChange={(e) => {
              if (isReadOnly) return;
              const updated = { ...campaign, name: e.target.value };
              onUpdateCampaign(updated);
              saveToServer(updated);
            }}
            className="text-base font-bold text-[#14213D] bg-transparent border-b border-transparent hover:border-[#DCE3DF] focus:border-[#14213D] focus:outline-none px-1 py-0.5 transition disabled:cursor-not-allowed min-w-0"
          />

          <span
            className={`text-[10px] px-2.5 py-0.5 rounded-lg font-semibold uppercase tracking-wider flex items-center gap-1.5 shrink-0 border ${
              campaign.status === 'active'
                ? 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
                : campaign.status === 'paused'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-[#EEF3F0] text-[#5C6F68] border-[#DCE3DF]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                campaign.status === 'active'
                  ? 'bg-emerald-600 animate-pulse'
                  : campaign.status === 'paused'
                    ? 'bg-amber-600'
                    : 'bg-[#5C6F68]'
              }`}
            />
            {campaign.status}
          </span>

          {isReadOnly ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#EEF3F0] border border-[#DCE3DF] text-[#5C6F68] shrink-0">
              <Eye className="w-3.5 h-3.5 text-[#14213D]" />
              <span>{isEs ? 'Modo Solo Lectura' : 'Read-Only Mode'}</span>
            </span>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] font-medium transition shrink-0">
              {saveStatus === 'saved' && (
                <span className="text-[#14213D] flex items-center gap-1 bg-[#D5ECD4]/70 px-2 py-0.5 rounded-lg border border-[#C3DAC3]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  {isEs ? 'Guardado en Supabase' : 'Saved to Supabase'}
                </span>
              )}
              {saveStatus === 'saving' && (
                <span className="text-amber-800 flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {isEs ? 'Guardando...' : 'Saving...'}
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-rose-700 flex items-center gap-1 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                  {isEs ? 'Error al guardar' : 'Save Error'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Global Action Controls: Schedule Toggle + Split-Button */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Schedule Status Toggle */}
          <button
            type="button"
            disabled={isReadOnly}
            onClick={toggleCampaignStatus}
            title={
              isReadOnly
                ? isEs
                  ? 'Modo Solo Lectura'
                  : 'Read-Only Mode'
                : campaign.status === 'active'
                  ? isEs
                    ? 'Pausar campaña programada'
                    : 'Pause scheduled campaign'
                  : isEs
                    ? `Activar campaña según horario (${campaign.schedule?.timing?.from || '09:00'} - ${campaign.schedule?.timing?.to || '17:00'})`
                    : 'Activate campaign on schedule'
            }
            className={`px-3.5 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
              isReadOnly
                ? 'opacity-50 cursor-not-allowed bg-[#EEF3F0] border-[#DCE3DF] text-[#5C6F68]'
                : campaign.status === 'active'
                  ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 cursor-pointer'
                  : 'bg-[#D5ECD4] hover:bg-[#C3DAC3] border-[#C3DAC3] text-[#14213D] cursor-pointer'
            }`}
          >
            {campaign.status === 'active' ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>{isEs ? 'Pausar Horario' : 'Pause Schedule'}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>
                  {isEs
                    ? `Activar Horario (${campaign.schedule?.timing?.from || '09:00'})`
                    : 'Activate Schedule'}
                </span>
              </>
            )}
          </button>

          {/* Unified Split-Button: Send Now + Dropdown */}
          <div className="relative inline-flex rounded-lg">
            <button
              type="button"
              onClick={() => handleRunCampaign(false, false)}
              disabled={isReadOnly || isSending}
              className="flex items-center gap-2 bg-[#14213D] hover:bg-[#1E3158] disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-semibold px-3.5 py-2 rounded-l-lg transition cursor-pointer border-r border-white/20"
              title={
                isReadOnly
                  ? isEs
                    ? 'Modo Solo Lectura'
                    : 'Read-Only Mode'
                  : isEs
                    ? 'Envía todos los correos pendientes ahora mismo'
                    : 'Send all pending emails immediately'
              }
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isSending
                  ? isEs
                    ? 'Enviando...'
                    : 'Sending...'
                  : isEs
                    ? 'Enviar Ahora'
                    : 'Send Now'}
              </span>
            </button>
            <button
              type="button"
              disabled={isReadOnly || isSending}
              onClick={() => !isReadOnly && setIsActionDropdownOpen(!isActionDropdownOpen)}
              className="bg-[#14213D] hover:bg-[#1E3158] disabled:opacity-45 disabled:cursor-not-allowed text-white px-2 py-2 rounded-r-lg transition cursor-pointer flex items-center justify-center"
              title={isEs ? 'Más opciones de envío' : 'More sending options'}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {isActionDropdownOpen && !isReadOnly && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setIsActionDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-[#DCE3DF] rounded-xl shadow-xl p-1.5 z-30 space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsActionDropdownOpen(false);
                      if (!isReadOnly) setIsTestEmailModalOpen(true);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0] rounded-lg transition cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#14213D]" />
                    <span>{isEs ? 'Prueba Real a mi casilla' : 'Test Email to My Mailbox'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsActionDropdownOpen(false);
                      handleRunCampaign(true);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0] rounded-lg transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#5C6F68]" />
                    <span>{t('campaignWizard.runColdRun')}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 4-Phase Wizard Navigation Bar */}
      <div className="bg-white border-b border-[#DCE3DF] px-8 flex items-center justify-center gap-2 py-2 shrink-0">
        {(
          [
            { id: 'leads', label: t('campaignWizard.wizardPhase1'), icon: Users },
            { id: 'sequences', label: t('campaignWizard.wizardPhase2'), icon: Layers },
            { id: 'schedule', label: t('campaignWizard.wizardPhase3'), icon: Clock },
            { id: 'options', label: t('campaignWizard.wizardPhase4'), icon: Settings },
          ] as const
        ).map((phase, idx) => {
          const Icon = phase.icon;
          const active = activePhase === phase.id;
          return (
            <React.Fragment key={phase.id}>
              {idx > 0 && <div className="w-6 h-px bg-[#DCE3DF]" />}
              <button
                type="button"
                onClick={() => setActivePhase(phase.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-[#14213D] text-white'
                    : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-[#5C6F68]'}`} />
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DCE3DF] pb-4">
              <div>
                <h3 className="text-sm font-bold text-[#14213D] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#14213D]" />
                  {t('campaignWizard.wizardPhase1')}
                </h3>
                <p className="text-xs text-[#5C6F68] mt-0.5">{t('campaignWizard.leadsPhaseDesc')}</p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => !isReadOnly && setIsImportModalOpen(true)}
                  className="flex items-center gap-2 bg-[#14213D] hover:bg-[#1E3158] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{isEs ? 'Importar (Google Sheets / CSV)' : 'Import (Google Sheets / CSV)'}</span>
                </button>

                {campaignLeads.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleResetLeads}
                      disabled={isReadOnly || isResettingLeads}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-[#EEF3F0] text-[#14213D] border border-[#DCE3DF] shadow-sm transition text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={
                        isEs
                          ? 'Reiniciar estado de leads a pendiente para reenviar o probar'
                          : 'Reset leads status to pending'
                      }
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isResettingLeads ? 'animate-spin' : ''}`} />
                      <span>{isEs ? 'Reiniciar a Pendiente' : 'Reset to Pending'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={handleClearLeads}
                      className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-[#5C6F68] hover:text-rose-700 border border-[#DCE3DF] hover:border-rose-200 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={isEs ? 'Vaciar leads' : 'Clear leads'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}

                <div className="text-xs text-[#5C6F68] font-mono tabular-nums pl-2 border-l border-[#DCE3DF]">
                  {campaignLeads.length} leads
                </div>
              </div>
            </div>

            {/* Campaign Leads Status Banner */}
            {campaignLeads.length > 0 && (
              <div className="flex items-center justify-between p-3.5 bg-white border border-[#DCE3DF] shadow-sm rounded-xl text-xs">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    <span className="text-[#5C6F68]">{isEs ? 'Enviados:' : 'Sent:'}</span>
                    <span className="font-bold text-[#14213D] font-mono tabular-nums">
                      {campaignLeads.filter((l) => l.status === 'sent').length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[#5C6F68]">{isEs ? 'Pendientes:' : 'Pending:'}</span>
                    <span className="font-bold text-[#14213D] font-mono tabular-nums">
                      {campaignLeads.filter((l) => l.status === 'pending').length}
                    </span>
                  </div>
                </div>

                {campaignLeads.filter((l) => l.status === 'pending').length === 0 &&
                  campaignLeads.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#14213D] font-medium bg-[#D5ECD4] border border-[#C3DAC3] px-3 py-1 rounded-lg">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#14213D]" />
                      <span>
                        {isEs
                          ? 'Todos los correos fueron despachados'
                          : 'All emails dispatched'}
                      </span>
                    </span>
                  )}
              </div>
            )}

            <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-3 text-xs text-[#5C6F68] flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#14213D] shrink-0" />
                <span>{t('campaignWizard.deduplicationNotice')}</span>
              </span>
              {detectedVariables.length > 0 && (
                <span className="text-[11px] text-[#14213D] font-medium bg-[#D5ECD4] px-2.5 py-0.5 rounded-lg border border-[#C3DAC3] shrink-0 font-mono tabular-nums">
                  {detectedVariables.length}{' '}
                  {isEs ? 'columnas detectadas' : 'sheet columns detected'}
                </span>
              )}
            </div>

            {/* Leads Table Preview with Full Horizontal Scroll and Dynamic Sheet Columns */}
            <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl overflow-hidden">
              <div className="overflow-x-auto w-full max-w-full">
                <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
                  <thead className="bg-[#EEF3F0] text-[#5C6F68] uppercase tracking-wider text-[10px] border-b border-[#DCE3DF]">
                    <tr>
                      <th className="py-3 px-4 font-bold text-[#14213D] w-12 sticky left-0 z-20 bg-[#EEF3F0]">
                        #
                      </th>
                      <th className="py-3 px-4 font-bold text-[#14213D] w-36 min-w-[144px] sticky left-12 z-20 bg-[#EEF3F0]">
                        {isEs ? 'Nombre' : 'Name'}
                      </th>
                      <th className="py-3 px-4 font-bold text-[#14213D] min-w-[200px] sticky left-[192px] z-20 bg-[#EEF3F0] border-r border-[#DCE3DF] shadow-[2px_0_6px_rgba(20,33,61,0.06)]">
                        Email
                      </th>
                      <th className="py-3 px-4 font-bold text-[#14213D]">Estado / Status</th>
                      <th className="py-3 px-4 font-bold text-[#14213D]">Acción</th>
                      <th className="py-3 px-4 font-bold text-[#14213D]">Empresa / Company</th>
                      {detectedVariables.map((col) => (
                        <th
                          key={col}
                          className="py-3 px-4 text-[#14213D] bg-[#D5ECD4]/45 border-l border-[#DCE3DF] font-mono font-bold"
                        >
                          &#123;&#123;{col}&#125;&#125;
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3DF] text-[#14213D]">
                    {campaignLeads.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6 + detectedVariables.length}
                          className="py-8 text-center text-[#5C6F68]"
                        >
                          {isEs
                            ? 'No hay destinatarios cargados en esta campaña.'
                            : 'No leads loaded in this campaign.'}
                        </td>
                      </tr>
                    ) : (
                      campaignLeads.map((l, i) => {
                        const statusLabelMap: Record<
                          LeadStatus,
                          {
                            text: string;
                            cls: string;
                            Icon: React.ComponentType<{ className?: string }>;
                          }
                        > = {
                          pending: {
                            text: isEs ? 'Pendiente' : 'Pending',
                            cls: 'bg-amber-50 text-amber-800 border-amber-200',
                            Icon: Clock,
                          },
                          sent: {
                            text: isEs ? 'Enviado' : 'Sent',
                            cls: 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]',
                            Icon: CheckCircle2,
                          },
                          opened: {
                            text: isEs ? 'Abierto' : 'Opened',
                            cls: 'bg-sky-50 text-sky-800 border-sky-200',
                            Icon: Eye,
                          },
                          replied: {
                            text: isEs ? 'Respondido' : 'Replied',
                            cls: 'bg-[#14213D] text-white border-[#14213D]',
                            Icon: MessageSquare,
                          },
                          bounced: {
                            text: isEs ? 'Rebotado' : 'Bounced',
                            cls: 'bg-rose-50 text-rose-700 border-rose-200',
                            Icon: AlertTriangle,
                          },
                          unsubscribed: {
                            text: isEs ? 'Baja' : 'Unsubscribed',
                            cls: 'bg-[#EEF3F0] text-[#5C6F68] border-[#DCE3DF]',
                            Icon: Ban,
                          },
                          completed: {
                            text: isEs ? 'Completo' : 'Completed',
                            cls: 'bg-[#14213D] text-white border-[#14213D]',
                            Icon: Flag,
                          },
                        };
                        const st = statusLabelMap[l.status] || statusLabelMap.pending;
                        const StatusIcon = st.Icon;

                        return (
                          <tr key={l.id} className="group hover:bg-[#EEF3F0] transition">
                            <td className="py-2.5 px-4 text-[#5C6F68] font-mono tabular-nums text-[10px] w-12 sticky left-0 z-10 bg-white group-hover:bg-[#EEF3F0] transition">
                              {i + 1}
                            </td>
                            <td className="py-2.5 px-4 text-[#14213D] w-36 min-w-[144px] max-w-[144px] truncate sticky left-12 z-10 bg-white group-hover:bg-[#EEF3F0] transition">
                              {[l.firstName, l.lastName].filter(Boolean).join(' ') || '-'}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-[#14213D] font-medium min-w-[200px] sticky left-[192px] z-10 bg-white group-hover:bg-[#EEF3F0] border-r border-[#DCE3DF] shadow-[2px_0_6px_rgba(20,33,61,0.06)] transition">
                              {l.email}
                            </td>
                            <td className="py-2.5 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${st.cls}`}
                              >
                                <StatusIcon className="w-3 h-3 shrink-0" />
                                <span>{st.text}</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              <button
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => !isReadOnly && setEditingLead(l)}
                                className="flex items-center gap-1 bg-[#EEF3F0] hover:bg-[#14213D] text-[#14213D] hover:text-white px-2.5 py-1 rounded-lg border border-[#DCE3DF] hover:border-[#14213D] text-[10px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>{isEs ? 'Editar' : 'Edit'}</span>
                              </button>
                            </td>
                            <td className="py-2.5 px-4 text-[#5C6F68]">{l.companyName || '-'}</td>
                            {detectedVariables.map((col) => (
                              <td
                                key={col}
                                className="py-2.5 px-4 font-mono text-[#5C6F68] border-l border-[#DCE3DF] bg-[#F4F7F5]/60 max-w-xs truncate"
                                title={String(l.customVariables?.[col] ?? '')}
                              >
                                {l.customVariables?.[col] !== undefined
                                  ? String(l.customVariables[col])
                                  : '-'}
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
            <div className="flex items-center gap-2 border-b border-[#DCE3DF] pb-3 overflow-x-auto">
              {campaign.steps.map((step, idx) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    setActiveStepIndex(idx);
                    setActiveVariantIndex(0);
                  }}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeStepIndex === idx
                      ? 'bg-[#14213D] text-white'
                      : 'bg-white text-[#5C6F68] hover:text-[#14213D] border border-[#DCE3DF]'
                  }`}
                >
                  <span>
                    {idx === 0
                      ? t('campaignWizard.stepInitial')
                      : `${t('campaignWizard.stepFollowUp')} ${step.stepNumber} (+${step.waitDays}d)`}
                  </span>
                  {campaign.steps.length > 1 && !isReadOnly && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteStep(idx);
                      }}
                      className="hover:text-rose-600 p-0.5 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </span>
                  )}
                </button>
              ))}

              <button
                type="button"
                disabled={isReadOnly}
                onClick={handleAddStep}
                className="flex items-center gap-1.5 text-xs font-medium text-[#14213D] bg-[#D5ECD4] hover:bg-[#C3DAC3] border border-[#A1B0AB]/50 px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('campaignWizard.addStep')}
              </button>
            </div>

            {/* Delay Settings if Follow-up */}
            {activeStepIndex > 0 && activeStep && (
              <div className="flex items-center gap-3 bg-white border border-[#DCE3DF] shadow-sm px-4 py-2.5 rounded-xl text-xs">
                <Clock className="w-4 h-4 text-[#5C6F68]" />
                <span className="text-[#5C6F68]">{t('campaignWizard.wait')}</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  disabled={isReadOnly}
                  value={activeStep.waitDays}
                  onChange={(e) => handleUpdateWaitDays(parseInt(e.target.value, 10) || 1)}
                  className="w-14 bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white text-[#14213D] font-mono tabular-nums text-xs px-2 py-1 rounded-lg text-center focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <span className="text-[#5C6F68]">{t('campaignWizard.daysIfNoReply')}</span>
              </div>
            )}

            {/* A/Z Testing Variant Tabs */}
            {activeStep && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="text-xs font-semibold text-[#5C6F68] uppercase tracking-wider mr-2">
                  A/Z Testing:
                </span>
                {activeStep.variants.map((v, vIdx) => (
                  <div
                    key={v.id}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      activeVariantIndex === vIdx
                        ? 'bg-[#14213D] text-white'
                        : 'bg-white border border-[#DCE3DF] text-[#5C6F68] hover:text-[#14213D]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveVariantIndex(vIdx)}
                      className="focus:outline-none cursor-pointer"
                    >
                      {v.name}
                    </button>
                    {activeStep.variants.length > 1 && !isReadOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVariant(vIdx);
                        }}
                        className={`ml-1 p-0.5 rounded transition cursor-pointer ${
                          activeVariantIndex === vIdx
                            ? 'text-white/75 hover:text-rose-200 hover:bg-white/10'
                            : 'text-[#5C6F68] hover:text-rose-700 hover:bg-rose-50'
                        }`}
                        title={isEs ? 'Eliminar variante' : 'Delete variant'}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}

                {activeStep.variants.length < 5 && (
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={handleAddVariantToStep}
                    className="text-xs font-medium text-[#14213D] bg-[#D5ECD4] hover:bg-[#C3DAC3] border border-[#A1B0AB]/50 px-2.5 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3 h-3" />
                    {t('campaignWizard.addVariant')}
                  </button>
                )}
              </div>
            )}

            {/* View Mode Toggle: Editor vs Live Preview */}
            <div className="flex items-center justify-between border-b border-[#DCE3DF] pb-3 flex-wrap gap-3">
              <div className="flex items-center bg-white border border-[#DCE3DF] shadow-sm p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSequenceMode('editor')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    sequenceMode === 'editor'
                      ? 'bg-[#14213D] text-white'
                      : 'text-[#5C6F68] hover:text-[#14213D]'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEs ? 'Editor de Contenido' : 'Content Editor'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSequenceMode('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    sequenceMode === 'preview'
                      ? 'bg-[#14213D] text-white'
                      : 'text-[#5C6F68] hover:text-[#14213D]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isEs ? 'Vista Previa en Vivo' : 'Live Preview'}</span>
                </button>
              </div>

              {sequenceMode === 'preview' && (
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Lead Selector for Preview */}
                  {availableLeads.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[#5C6F68]">{isEs ? 'Ver como:' : 'Preview as:'}</span>
                      <select
                        value={previewLeadIndex}
                        onChange={(e) => setPreviewLeadIndex(Number(e.target.value))}
                        className="bg-white border border-[#DCE3DF] text-[#14213D] rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-[#14213D] cursor-pointer"
                      >
                        {availableLeads.map((l, i) => {
                          const fullName = [l.firstName, l.lastName].filter(Boolean).join(' ');
                          return (
                            <option key={l.id || i} value={i}>
                              Lead #{i + 1}: {fullName ? `${fullName} (${l.email})` : l.email}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {/* Device Switcher */}
                  <div className="flex items-center bg-white border border-[#DCE3DF] p-0.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('desktop')}
                      className={`p-1.5 rounded-md transition cursor-pointer ${
                        previewDevice === 'desktop'
                          ? 'bg-[#14213D] text-white'
                          : 'text-[#5C6F68] hover:text-[#14213D]'
                      }`}
                      title={isEs ? 'Vista Escritorio (640px)' : 'Desktop View (640px)'}
                    >
                      <Monitor className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('mobile')}
                      className={`p-1.5 rounded-md transition cursor-pointer ${
                        previewDevice === 'mobile'
                          ? 'bg-[#14213D] text-white'
                          : 'text-[#5C6F68] hover:text-[#14213D]'
                      }`}
                      title={isEs ? 'Vista Móvil (375px)' : 'Mobile View (375px)'}
                    >
                      <Smartphone className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Re-roll Spintax Button */}
                  <button
                    type="button"
                    onClick={() => setPreviewRandomSeed((prev) => prev + 1)}
                    className="flex items-center gap-1.5 bg-white hover:bg-[#EEF3F0] text-[#14213D] text-xs font-medium px-2.5 py-1 rounded-lg border border-[#DCE3DF] transition cursor-pointer"
                    title={
                      isEs
                        ? 'Generar otra variante spintax aleatoria'
                        : 'Re-roll spintax variation'
                    }
                  >
                    <Dice5 className="w-3.5 h-3.5 text-[#14213D]" />
                    <span>{isEs ? 'Variar Spintax' : 'Re-roll Spintax'}</span>
                  </button>
                </div>
              )}
            </div>

            {sequenceMode === 'editor' ? (
              <>
                {/* Spam Detection Banner */}
                {totalSpamWords.length > 0 ? (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-rose-800">
                          {t('campaignWizard.spamWarningTitle')}{' '}
                          <span className="font-mono tabular-nums">{totalSpamWords.length}</span>{' '}
                          {t('campaignWizard.spamWarningDetected')}
                        </div>
                        <div className="text-[11px] text-rose-700 mt-0.5 flex flex-wrap gap-1">
                          {totalSpamWords.map((w, i) => (
                            <span
                              key={i}
                              className="font-mono bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded text-rose-800"
                            >
                              {w.word}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={handleQuickCleanSpam}
                      className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {t('campaignWizard.cleanSpamAi')}
                    </button>
                  </div>
                ) : (
                  <div className="bg-[#D5ECD4]/70 border border-[#C3DAC3] rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-xs text-[#14213D] font-medium">
                    <CheckCircle2 className="w-4 h-4 text-[#14213D]" />
                    <span>{t('campaignWizard.spamSafeBadge')}</span>
                  </div>
                )}

                {/* Subject Line Input */}
                <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-semibold text-[#14213D] uppercase tracking-wider">
                      {t('campaignWizard.subjectLine')}
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-[#5C6F68] mr-1">
                        {t('campaignWizard.insertTag')}
                      </span>
                      {availableTags.map((tag) => {
                        const isCustomSheet = detectedVariables.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => insertVariable(tag, 'subject')}
                            className={`text-[10px] px-2 py-0.5 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              isCustomSheet
                                ? 'bg-[#D5ECD4] hover:bg-[#C3DAC3] text-[#14213D] border border-[#A1B0AB]/50 font-mono font-medium'
                                : 'bg-[#EEF3F0] hover:bg-[#DCE3DF] text-[#14213D] border border-[#DCE3DF]'
                            }`}
                            title={
                              isCustomSheet
                                ? isEs
                                  ? 'Columna de tu Hoja de Leads'
                                  : 'Sheet Column Tag'
                                : 'Campo de contacto'
                            }
                          >
                            +{tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={activeVariant?.subject || ''}
                    onChange={(e) => handleUpdateActiveVariant({ subject: e.target.value })}
                    className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:bg-white rounded-lg px-4 py-2.5 text-sm text-[#14213D] placeholder-[#5C6F68]/70 focus:outline-none focus:border-[#14213D] transition disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Email Body Input */}
                <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-semibold text-[#14213D] uppercase tracking-wider">
                      {t('campaignWizard.emailBody')}
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={handleAddSpintaxToBody}
                        className="text-[11px] bg-[#D5ECD4] hover:bg-[#C3DAC3] text-[#14213D] border border-[#A1B0AB]/50 font-medium px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={isEs ? 'Aplicar Spintax automático' : 'Apply Auto Spintax'}
                      >
                        <Sparkles className="w-3 h-3 text-[#14213D]" />
                        {t('campaignWizard.autoSpintax')}
                      </button>

                      <button
                        type="button"
                        onClick={handlePreviewSpintax}
                        className="text-[11px] bg-[#EEF3F0] hover:bg-[#DCE3DF] text-[#14213D] border border-[#DCE3DF] px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                        title={isEs ? 'Previsualizar variaciones' : 'Preview variations'}
                      >
                        <Eye className="w-3 h-3 text-[#5C6F68]" />
                        {t('campaignWizard.previewSpintax')}
                      </button>

                      <div className="h-4 w-px bg-[#DCE3DF] hidden sm:block" />

                      <div className="flex items-center gap-1 flex-wrap">
                        {availableTags.map((tag) => {
                          const isCustomSheet = detectedVariables.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => insertVariable(tag, 'body')}
                              className={`text-[10px] px-2 py-0.5 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                isCustomSheet
                                  ? 'bg-[#D5ECD4] hover:bg-[#C3DAC3] text-[#14213D] border border-[#A1B0AB]/50 font-mono font-medium'
                                  : 'bg-[#EEF3F0] hover:bg-[#DCE3DF] text-[#14213D] border border-[#DCE3DF]'
                              }`}
                              title={
                                isCustomSheet
                                  ? isEs
                                    ? 'Columna de tu Hoja de Leads'
                                    : 'Sheet Column Tag'
                                  : 'Campo de contacto'
                              }
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
                    disabled={isReadOnly}
                    value={activeVariant?.body || ''}
                    onChange={(e) => handleUpdateActiveVariant({ body: e.target.value })}
                    placeholder={t('campaignWizard.bodyPlaceholder')}
                    className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:bg-white rounded-lg p-4 text-sm text-[#14213D] placeholder-[#5C6F68]/70 focus:outline-none focus:border-[#14213D] transition leading-relaxed font-sans disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </>
            ) : (
              /* Live Email Preview Container (Crisp Light Email Client) */
              <div className="flex flex-col items-center py-4 px-2 w-full">
                {(() => {
                  const safeLeadIndex = Math.min(
                    previewLeadIndex,
                    Math.max(0, availableLeads.length - 1)
                  );
                  const targetLead = availableLeads[safeLeadIndex] || {
                    firstName: 'Juan',
                    lastName: 'Pérez',
                    companyName: 'Acme Corp',
                    email: 'juan.perez@empresa.com',
                    customVariables: {
                      cargo: 'Director Comercial',
                      ciudad: 'Buenos Aires',
                      telefono: '+54 11 5555-0123',
                    },
                  };
                  const senderAcct =
                    accounts.find((a) => campaign.senderAccountIds?.includes(a.id)) ||
                    accounts[0] || {
                      name: 'Ventas Misender',
                      email: 'ventas@tudominio.com',
                    };

                  const renderLeadText = (text: string) => {
                    const withSpintax = resolveSpintax(text || '');
                    let res = withSpintax;
                    res = res.replace(
                      /\{\{\s*(firstName|nombre|primerNombre|primer_nombre)\s*\}\}/gi,
                      targetLead.firstName || 'Juan'
                    );
                    res = res.replace(
                      /\{\{\s*(lastName|apellido)\s*\}\}/gi,
                      targetLead.lastName || 'Pérez'
                    );
                    res = res.replace(
                      /\{\{\s*(companyName|empresa|compania|compañía|organizacion|organización)\s*\}\}/gi,
                      targetLead.companyName || 'Acme Corp'
                    );
                    res = res.replace(
                      /\{\{\s*(email|correo|mail)\s*\}\}/gi,
                      targetLead.email || 'juan.perez@empresa.com'
                    );
                    if (targetLead.website) {
                      res = res.replace(
                        /\{\{\s*(website|sitio|web)\s*\}\}/gi,
                        targetLead.website
                      );
                    }
                    if (targetLead.customVariables) {
                      for (const [k, v] of Object.entries(targetLead.customVariables)) {
                        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        res = res.replace(
                          new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, 'gi'),
                          String(v ?? '')
                        );
                      }
                    }
                    detectedVariables.forEach((v) => {
                      const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      res = res.replace(
                        new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, 'gi'),
                        String(targetLead.customVariables?.[v] ?? '')
                      );
                    });
                    return res;
                  };

                  const previewSubject = renderLeadText(activeVariant?.subject || '');
                  const previewBody = renderLeadText(activeVariant?.body || '');

                  return (
                    <div
                      key={previewRandomSeed}
                      className={`w-full bg-white border border-[#DCE3DF] text-[#14213D] rounded-xl shadow-md overflow-hidden transition-all duration-200 ${
                        previewDevice === 'mobile' ? 'max-w-[375px]' : 'max-w-[640px]'
                      }`}
                    >
                      {/* Window Header */}
                      <div className="bg-[#EEF3F0] px-4 py-3 border-b border-[#DCE3DF] flex items-center justify-between">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#5C6F68] truncate text-center px-2">
                          {previewDevice === 'mobile' ? (
                            <>
                              <Smartphone className="w-3.5 h-3.5" />
                              <span>Mobile Mail (375px)</span>
                            </>
                          ) : (
                            <>
                              <Monitor className="w-3.5 h-3.5" />
                              <span>Desktop Mail (640px)</span>
                            </>
                          )}
                        </span>
                        <div className="w-8 shrink-0" />
                      </div>

                      {/* Email Envelope Meta */}
                      <div className="p-4 bg-[#F4F7F5] border-b border-[#DCE3DF] text-xs space-y-2">
                        <div className="flex items-start sm:items-center gap-2">
                          <span className="text-[#5C6F68] font-medium w-12 text-right shrink-0">
                            De:
                          </span>
                          <div className="flex flex-wrap items-baseline gap-1.5 min-w-0">
                            <span className="text-[#14213D] font-medium truncate">
                              {senderAcct.name}
                            </span>
                            <span className="text-[#5C6F68] font-mono text-[11px] truncate">
                              &lt;{senderAcct.email}&gt;
                            </span>
                          </div>
                        </div>
                        <div className="flex items-start sm:items-center gap-2">
                          <span className="text-[#5C6F68] font-medium w-12 text-right shrink-0">
                            Para:
                          </span>
                          <div className="flex flex-wrap items-baseline gap-1.5 min-w-0">
                            <span className="text-[#14213D] font-medium truncate">
                              {targetLead.firstName} {targetLead.lastName}
                            </span>
                            <span className="text-[#5C6F68] font-mono text-[11px] truncate">
                              &lt;{targetLead.email}&gt;
                            </span>
                          </div>
                        </div>
                        <div className="flex items-start sm:items-center gap-2 pt-1 border-t border-[#DCE3DF]">
                          <span className="text-[#5C6F68] font-medium w-12 text-right shrink-0">
                            Asunto:
                          </span>
                          <span className="text-[#14213D] font-bold break-words min-w-0">
                            {previewSubject || '(Sin asunto)'}
                          </span>
                        </div>
                      </div>

                      {/* Email Body Content */}
                      <div className="p-5 sm:p-6 bg-white min-h-[220px]">
                        <div className="whitespace-pre-wrap font-sans text-sm text-[#14213D] leading-relaxed break-words">
                          {previewBody || (
                            <span className="text-[#5C6F68] italic">
                              {isEs
                                ? 'El cuerpo del correo está vacío.'
                                : 'Email body is empty.'}
                            </span>
                          )}
                        </div>

                        {/* Unsubscribe Simulation */}
                        <div className="mt-8 pt-4 border-t border-[#DCE3DF] text-[10px] text-[#5C6F68] font-sans leading-normal">
                          <p>
                            {isEs
                              ? 'Si no deseas recibir más comunicaciones sobre esta propuesta, responde "dar de baja" o '
                              : 'If you would prefer not to receive further emails, reply "unsubscribe" or '}
                            <span className="text-[#14213D] font-medium underline cursor-pointer">
                              {isEs ? 'haz clic aquí' : 'click here'}
                            </span>
                            .
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* PHASE 3: SCHEDULE */}
        {activePhase === 'schedule' && (
          <div className="space-y-6">
            <div className="border-b border-[#DCE3DF] pb-3">
              <h3 className="text-sm font-bold text-[#14213D] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#14213D]" />
                {t('campaignWizard.wizardPhase3')}
              </h3>
              <p className="text-xs text-[#5C6F68] mt-0.5">
                {t('campaignWizard.schedulePhaseDesc')}
              </p>
            </div>

            <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-6 space-y-4 text-xs">
              <div>
                <label className="text-[#14213D] font-semibold block mb-1">
                  {t('campaignWizard.timezoneLabel')}
                </label>
                <select
                  disabled={isReadOnly}
                  value={campaign.schedule.timezone}
                  onChange={(e) => {
                    if (isReadOnly) return;
                    const updated = {
                      ...campaign,
                      schedule: { ...campaign.schedule, timezone: e.target.value },
                    };
                    onUpdateCampaign(updated);
                    saveToServer(updated);
                  }}
                  className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3 py-2 text-[#14213D] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
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
                  <label className="text-[#14213D] font-semibold block mb-1">
                    {t('campaignWizard.windowFrom')}
                  </label>
                  <input
                    type="time"
                    disabled={isReadOnly}
                    value={campaign.schedule.timing.from}
                    onChange={(e) => {
                      if (isReadOnly) return;
                      const updated = {
                        ...campaign,
                        schedule: {
                          ...campaign.schedule,
                          timing: { ...campaign.schedule.timing, from: e.target.value },
                        },
                      };
                      onUpdateCampaign(updated);
                      saveToServer(updated);
                    }}
                    className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3 py-2 text-[#14213D] font-mono tabular-nums focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[#14213D] font-semibold block mb-1">
                    {t('campaignWizard.windowTo')}
                  </label>
                  <input
                    type="time"
                    disabled={isReadOnly}
                    value={campaign.schedule.timing.to}
                    onChange={(e) => {
                      if (isReadOnly) return;
                      const updated = {
                        ...campaign,
                        schedule: {
                          ...campaign.schedule,
                          timing: { ...campaign.schedule.timing, to: e.target.value },
                        },
                      };
                      onUpdateCampaign(updated);
                      saveToServer(updated);
                    }}
                    className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3 py-2 text-[#14213D] font-mono tabular-nums focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PHASE 4: OPTIONS */}
        {activePhase === 'options' && (
          <div className="space-y-6">
            <div className="border-b border-[#DCE3DF] pb-3">
              <h3 className="text-sm font-bold text-[#14213D] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#14213D]" />
                {t('campaignWizard.wizardPhase4')}
              </h3>
              <p className="text-xs text-[#5C6F68] mt-0.5">
                {t('campaignWizard.optionsPhaseDesc')}
              </p>
            </div>

            <div className="space-y-4">
              {/* Sender Accounts / Inbox Selection */}
              <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-[#14213D] text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4 text-[#14213D]" />
                      <span>
                        {isEs
                          ? 'Casillas de Correo Remitentes (Sender Accounts)'
                          : t('campaignWizard.inboxRotationTitle')}
                      </span>
                    </h4>
                    <p className="text-[#5C6F68] mt-0.5">
                      {isEs
                        ? 'Selecciona las cuentas de correo desde las cuales se enviarán los mensajes de esta campaña.'
                        : t('campaignWizard.inboxRotationDesc')}
                    </p>
                  </div>
                </div>

                {accounts.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                    {isEs
                      ? 'No tienes casillas de correo conectadas.'
                      : 'No sender accounts connected.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {accounts.map((acc) => {
                      const isSelected = (campaign.senderAccountIds || []).includes(acc.id);
                      return (
                        <div
                          key={acc.id}
                          onClick={() => !isReadOnly && handleToggleAccount(acc.id)}
                          aria-disabled={isReadOnly}
                          className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                            isReadOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                          } ${
                            isSelected
                              ? 'bg-[#D5ECD4]/45 border-[#14213D] text-[#14213D]'
                              : 'bg-[#F4F7F5] border-[#DCE3DF] hover:border-[#A1B0AB] text-[#5C6F68]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono uppercase shrink-0 ${
                                isSelected
                                  ? 'bg-[#14213D] text-white'
                                  : 'bg-white border border-[#DCE3DF] text-[#5C6F68]'
                              }`}
                            >
                              {acc.provider === 'google'
                                ? 'G'
                                : acc.provider === 'microsoft'
                                  ? 'M'
                                  : 'SMTP'}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[#14213D] truncate text-xs flex items-center gap-2">
                                <span>{acc.name || acc.email}</span>
                                {isSelected && (
                                  <span className="text-[9px] bg-[#14213D] text-white px-1.5 py-0.5 rounded-lg font-semibold uppercase">
                                    {isEs ? 'Activa' : 'Active'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#5C6F68] font-mono truncate">
                                {acc.email}
                              </div>
                              <div className="text-[10px] text-[#5C6F68] font-medium flex items-center gap-1 mt-0.5">
                                <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-700" />
                                <span>
                                  {isEs ? 'Conectada' : 'Connected'} •{' '}
                                  <span className="font-mono tabular-nums text-[#14213D] font-semibold">
                                    {acc.dailyLimit || 50}
                                  </span>
                                  /día
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isSelected ? (
                              <CheckCircle2 className="w-5 h-5 text-[#14213D]" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-[#A1B0AB]" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Toggles */}
              <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-5 space-y-4 text-xs">
                <label
                  className={`flex items-start gap-3 ${
                    isReadOnly ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={campaign.options?.stopOnReply ?? true}
                    onChange={(e) => {
                      if (isReadOnly) return;
                      const updated = {
                        ...campaign,
                        options: {
                          ...(campaign.options || {
                            stopOnDomainReply: true,
                            plainTextMode: false,
                            openTracking: true,
                            clickTracking: true,
                          }),
                          stopOnReply: e.target.checked,
                        },
                      };
                      onUpdateCampaign(updated);
                      saveToServer(updated);
                    }}
                    className="mt-0.5 rounded bg-[#F4F7F5] border-[#DCE3DF] accent-[#14213D] focus:ring-0 disabled:cursor-not-allowed"
                  />
                  <div>
                    <div className="font-semibold text-[#14213D]">
                      {t('campaignWizard.stopOnReply')}
                    </div>
                    <div className="text-[11px] text-[#5C6F68]">
                      {t('campaignWizard.stopOnReplyDesc')}
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 ${
                    isReadOnly ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={campaign.options?.stopOnDomainReply ?? true}
                    onChange={(e) => {
                      if (isReadOnly) return;
                      const updated = {
                        ...campaign,
                        options: {
                          ...(campaign.options || {
                            stopOnReply: true,
                            plainTextMode: false,
                            openTracking: true,
                            clickTracking: true,
                          }),
                          stopOnDomainReply: e.target.checked,
                        },
                      };
                      onUpdateCampaign(updated);
                      saveToServer(updated);
                    }}
                    className="mt-0.5 rounded bg-[#F4F7F5] border-[#DCE3DF] accent-[#14213D] focus:ring-0 disabled:cursor-not-allowed"
                  />
                  <div>
                    <div className="font-semibold text-[#14213D]">
                      {t('campaignWizard.stopOnDomainReply')}
                    </div>
                    <div className="text-[11px] text-[#5C6F68]">
                      {t('campaignWizard.stopOnDomainReplyDesc')}
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 ${
                    isReadOnly ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={campaign.options?.plainTextMode ?? false}
                    onChange={(e) => {
                      if (isReadOnly) return;
                      const updated = {
                        ...campaign,
                        options: {
                          ...(campaign.options || {
                            stopOnReply: true,
                            stopOnDomainReply: true,
                            openTracking: true,
                            clickTracking: true,
                          }),
                          plainTextMode: e.target.checked,
                        },
                      };
                      onUpdateCampaign(updated);
                      saveToServer(updated);
                    }}
                    className="mt-0.5 rounded bg-[#F4F7F5] border-[#DCE3DF] accent-[#14213D] focus:ring-0 disabled:cursor-not-allowed"
                  />
                  <div>
                    <div className="font-semibold text-[#14213D]">
                      {t('campaignWizard.plainTextMode')}
                    </div>
                    <div className="text-[11px] text-[#5C6F68]">
                      {t('campaignWizard.plainTextModeDesc')}
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Live Batch Sending Progress Bar */}
        {isSending && sendProgress && (
          <div className="mt-6 bg-white border border-[#14213D]/30 shadow-sm rounded-xl p-4 space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold text-[#14213D]">
                <RefreshCw className="w-4 h-4 animate-spin text-[#14213D]" />
                <span>
                  {isEs
                    ? 'Despachando correos por lotes seguros (Conexión SMTP persistente)...'
                    : 'Dispatching emails in safe batches (Persistent SMTP pool)...'}
                </span>
              </div>
              <span className="font-mono tabular-nums font-bold text-[#14213D]">
                {sendProgress.sent} / {sendProgress.total || '?'}
              </span>
            </div>
            <div className="w-full h-2 bg-[#EEF3F0] rounded-full overflow-hidden border border-[#DCE3DF]">
              <div
                className="h-full bg-[#14213D] transition-all duration-300"
                style={{
                  width: `${
                    sendProgress.total > 0
                      ? Math.min(100, Math.round((sendProgress.sent / sendProgress.total) * 100))
                      : 15
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Live Dispatch Logs Modal / Panel */}
        {dispatchResult &&
          (dispatchResult.scheduledNotice ? (
            <div className="mt-6 bg-[#D5ECD4]/60 border border-[#C3DAC3] rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-[#14213D] text-xs">
                  <Clock className="w-4 h-4 text-[#14213D]" />
                  <span>{isEs ? 'Programación Activada' : 'Schedule Armed'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDispatchResult(null)}
                  className="text-xs text-[#5C6F68] hover:text-[#14213D] cursor-pointer"
                >
                  {t('common.close')}
                </button>
              </div>
              <p className="text-xs text-[#14213D]">{dispatchResult.scheduledNotice}</p>
            </div>
          ) : dispatchResult.error ? (
            <div className="mt-6 bg-rose-50 border border-rose-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-rose-700 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>{isEs ? 'Aviso de Envío' : 'Dispatch Notice'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDispatchResult(null)}
                  className="text-xs text-rose-600 hover:text-rose-800 cursor-pointer"
                >
                  {t('common.close')}
                </button>
              </div>
              <p className="text-xs text-rose-700">{dispatchResult.error}</p>
            </div>
          ) : (
            <div className="mt-6 bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#14213D]" />
                  <span className="text-sm font-bold text-[#14213D]">
                    {t('campaignWizard.reportTitle')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDispatchResult(null)}
                  className="text-xs text-[#5C6F68] hover:text-[#14213D] cursor-pointer"
                >
                  {t('common.close')}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#F4F7F5] p-3 rounded-xl border border-[#DCE3DF]">
                  <div className="text-[10px] text-[#5C6F68] uppercase font-semibold">
                    Leads Targeted
                  </div>
                  <div className="text-lg font-bold text-[#14213D] mt-1 font-mono tabular-nums">
                    {dispatchResult.processed || 0}
                  </div>
                </div>
                <div className="bg-[#D5ECD4]/60 p-3 rounded-xl border border-[#C3DAC3]">
                  <div className="text-[10px] text-[#5C6F68] uppercase font-semibold">
                    Emails Dispatched
                  </div>
                  <div className="text-lg font-bold text-[#14213D] mt-1 font-mono tabular-nums">
                    {dispatchResult.sentCount || 0}
                  </div>
                </div>
                <div className="bg-[#F4F7F5] p-3 rounded-xl border border-[#DCE3DF]">
                  <div className="text-[10px] text-[#5C6F68] uppercase font-semibold">
                    Dispatch Mode
                  </div>
                  <div className="text-sm font-semibold text-[#14213D] mt-1">
                    {dispatchResult.logs?.[0]?.status === 'simulated'
                      ? 'Test Simulation'
                      : 'Live SMTP'}
                  </div>
                </div>
              </div>
            </div>
          ))}

        {/* Spintax Preview Modal */}
        {previewSpintaxModal && (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewSpintaxModal(false)}
          >
            <div
              className="bg-white border border-[#DCE3DF] text-[#14213D] rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#DCE3DF]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#14213D]">
                      {isEs ? 'Variaciones Spintax' : 'Spintax Variations'}
                    </h3>
                    <p className="text-[11px] text-[#5C6F68]">
                      {isEs
                        ? 'Simula las diferentes versiones únicas que recibirá cada prospecto'
                        : 'Preview distinct randomized variations sent to each prospect'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewSpintaxModal(false)}
                  className="text-[#5C6F68] hover:text-[#14213D] p-1 rounded-lg hover:bg-[#EEF3F0] transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!hasSpintax(activeVariant?.body || '') ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-amber-900">
                        {isEs
                          ? 'No se detectó sintaxis Spintax en este correo'
                          : 'No Spintax syntax detected'}
                      </div>
                      <p className="text-[11px] text-amber-800/90 leading-relaxed">
                        {isEs
                          ? 'El Spintax te permite alternar saludos y frases para que cada correo enviado sea único y no caiga en spam. Por ejemplo: {Hola|Qué tal|Espero que todo vaya bien}.'
                          : 'Spintax lets you randomize greetings and sentences so each email is unique. For example: {Hi|Hello|Hey}.'}
                      </p>
                    </div>
                  </div>
                  {!isReadOnly && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (isReadOnly) return;
                          handleAddSpintaxToBody();
                          if (activeVariant) {
                            const newBody = generateSpintax(activeVariant.body, language);
                            setSpintaxPreviews(resolveVariations(newBody, 3));
                          }
                        }}
                        className="px-3.5 py-2 bg-[#14213D] hover:bg-[#1E3158] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {isEs
                            ? 'Aplicar Spintax Automático a este correo'
                            : 'Apply Auto Spintax Now'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {spintaxPreviews.map((sample, i) => (
                    <div
                      key={i}
                      className="bg-[#F4F7F5] border border-[#DCE3DF] p-4 rounded-xl space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#14213D] font-mono tabular-nums font-semibold uppercase">
                          {isEs ? `Variación #${i + 1}:` : `Variation #${i + 1}:`}
                        </span>
                        <span className="text-[10px] text-[#5C6F68] font-mono">
                          {isEs ? 'Muestra generada' : 'Generated sample'}
                        </span>
                      </div>
                      <p className="text-xs text-[#14213D] whitespace-pre-wrap leading-relaxed font-sans">
                        {sample}
                      </p>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-[11px] text-[#5C6F68] font-mono">
                      {isEs
                        ? 'Sintaxis: {opción 1|opción 2|opción 3}'
                        : 'Syntax: {option 1|option 2}'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeVariant) {
                          setSpintaxPreviews(resolveVariations(activeVariant.body, 3));
                        }
                      }}
                      className="text-xs font-semibold text-[#14213D] hover:text-[#1E3158] flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>
                        {isEs ? 'Generar otras muestras aleatorias' : 'Re-roll variations'}
                      </span>
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
