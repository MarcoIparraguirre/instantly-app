'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  RefreshCw,
  Eye,
  AlertTriangle,
  Trash2,
  Tag,
  Plus,
  Edit3,
  Mail,
  Target,
  Rocket,
  X,
} from 'lucide-react';
import { Campaign, Lead, SenderAccount, ROLE_PERMISSIONS, normalizeRole } from '@/types';
import { NOVICE_TEMPLATES } from '@/core/templates';
import { checkSpamWords, applySpamFixes } from '@/lib/spamDetector';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/context/FeedbackContext';
import LeadImportModal from '../LeadImportModal';
import SendTestEmailModal from '../SendTestEmailModal';

interface SimpleCampaignViewProps {
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
  error?: string;
  campaignId?: string;
  totalPending?: number;
  processed?: number;
  sentCount?: number;
  logs?: DispatchLogItem[];
}

export default function SimpleCampaignView({
  campaign,
  onUpdateCampaign,
  openCopilot,
  leads = [],
  onRefreshLeads,
}: SimpleCampaignViewProps) {
  const { language } = useLanguage();
  const { user, currentWorkspace } = useAuth();
  const { showToast, confirm } = useFeedback();
  const isEs = language === 'es';
  const isReadOnly = ROLE_PERMISSIONS[normalizeRole(user?.role)].isReadOnly;

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('template-pitch');
  const [isSending, setIsSending] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResultState | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTestEmailModalOpen, setIsTestEmailModalOpen] = useState(false);
  const [lastFocusedField, setLastFocusedField] = useState<'subject' | 'body'>('body');
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [isResettingLeads, setIsResettingLeads] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null);

  const subjectInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

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
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data)) {
          setAccounts(data);
          if (!isReadOnlyRef.current && data.length > 0) {
            const currentCampaign = campaignRef.current;
            const currentIds = currentCampaign.senderAccountIds || [];
            const validIds = currentIds.filter((id) => data.some((a) => a.id === id));
            if (validIds.length === 0) {
              const autoSelected = [data[0].id];
              const updated = { ...currentCampaign, senderAccountIds: autoSelected };
              onUpdateCampaignRef.current(updated);
              fetch(`/api/campaigns/${updated.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...updated,
                  workspaceId: updated.workspaceId || currentWorkspace.id,
                }),
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

  const saveToServer = async (updated: Campaign) => {
    if (isReadOnly) return;
    try {
      const res = await fetch(`/api/campaigns/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updated,
          workspaceId: updated.workspaceId || currentWorkspace.id,
        }),
      });
      if (!res.ok) {
        showToast({
          title: isEs ? 'Error al guardar campaña' : 'Failed to save campaign',
          variant: 'error',
        });
      }
    } catch {
      showToast({
        title: isEs ? 'Error de red al guardar' : 'Network error while saving',
        variant: 'error',
      });
    }
  };

  const handleToggleAccount = (accountId: string) => {
    if (isReadOnly) return;
    const current = campaign.senderAccountIds || [];
    let updatedIds: string[];
    if (current.includes(accountId)) {
      if (current.length === 1) return;
      updatedIds = current.filter((id) => id !== accountId);
    } else {
      updatedIds = [...current, accountId];
    }
    const updated = { ...campaign, senderAccountIds: updatedIds };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const activeStep = campaign.steps[0];
  const activeVariant = activeStep?.variants[0];

  const subjectSpam = activeVariant ? checkSpamWords(activeVariant.subject, language) : [];
  const bodySpam = activeVariant ? checkSpamWords(activeVariant.body, language) : [];
  const totalSpam = [...subjectSpam, ...bodySpam];

  const campaignLeads = leads.filter((l) => l.campaignId === campaign.id);
  const allRelevantLeads = campaignLeads.length > 0 ? campaignLeads : leads;

  const detectedVariables = Array.from(
    new Set(allRelevantLeads.flatMap((l) => Object.keys(l.customVariables || {})))
  );

  const availableTags =
    detectedVariables.length > 0
      ? detectedVariables
      : [isEs ? 'Nombre' : 'firstName', isEs ? 'Empresa' : 'companyName', isEs ? 'Email' : 'email'];

  const handleResetLeads = async () => {
    if (isReadOnly) return;
    const confirmed = await confirm({
      title: isEs ? 'Reiniciar estado de leads' : 'Reset leads status',
      description: isEs
        ? '¿Deseas reiniciar los contactos a estado "Pendiente" para poder reenviar la campaña o probar el envío?'
        : 'Reset contacts to "Pending" status to re-test sending?',
      confirmLabel: isEs ? 'Reiniciar' : 'Reset',
      cancelLabel: isEs ? 'Cancelar' : 'Cancel',
      variant: 'primary',
    });
    if (!confirmed) return;

    setIsResettingLeads(true);
    try {
      const res = await fetch(
        `/api/leads?campaignId=${encodeURIComponent(campaign.id)}&workspaceId=${encodeURIComponent(currentWorkspace.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset_status', workspaceId: currentWorkspace.id }),
        }
      );
      if (!res.ok) throw new Error('Failed to reset leads');
      if (onRefreshLeads) onRefreshLeads();
      showToast({
        title: isEs ? 'Contactos reiniciados a Pendiente' : 'Contacts reset to Pending',
        variant: 'success',
      });
    } catch (e) {
      console.error(e);
      showToast({
        title: isEs ? 'Error al reiniciar contactos' : 'Failed to reset contacts',
        variant: 'error',
      });
    } finally {
      setIsResettingLeads(false);
    }
  };

  const applyTemplate = (templateId: string) => {
    if (isReadOnly) return;
    const tmpl = NOVICE_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl || !activeStep || !activeVariant) return;

    setSelectedTemplateId(templateId);
    const langKey = isEs ? 'es' : 'en';

    const newSteps = campaign.steps.map((step, sIdx) => {
      if (sIdx !== 0) return step;
      return {
        ...step,
        variants: step.variants.map((v, vIdx) => {
          if (vIdx !== 0) return v;
          return {
            ...v,
            subject: tmpl.subject[langKey],
            body: tmpl.body[langKey],
          };
        }),
      };
    });

    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const handleUpdateContent = (updates: { subject?: string; body?: string }) => {
    if (isReadOnly) return;
    if (!activeStep || !activeVariant) return;
    const newSteps = campaign.steps.map((step, sIdx) => {
      if (sIdx !== 0) return step;
      return {
        ...step,
        variants: step.variants.map((v, vIdx) => {
          if (vIdx !== 0) return v;
          return {
            ...v,
            ...(updates.subject !== undefined ? { subject: updates.subject } : {}),
            ...(updates.body !== undefined ? { body: updates.body } : {}),
          };
        }),
      };
    });

    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const handleInsertVariable = (varName: string, targetField?: 'subject' | 'body') => {
    if (isReadOnly) return;
    const target = targetField || lastFocusedField;
    const tag = `{{${varName}}}`;

    if (target === 'subject') {
      const el = subjectInputRef.current;
      const currentVal = activeVariant?.subject || '';
      let newVal = '';
      if (el && typeof el.selectionStart === 'number') {
        const start = el.selectionStart;
        const end = el.selectionEnd || start;
        newVal = currentVal.substring(0, start) + tag + currentVal.substring(end);
      } else {
        newVal = currentVal ? `${currentVal} ${tag}` : tag;
      }
      handleUpdateContent({ subject: newVal });
      setTimeout(() => {
        if (el) el.focus();
      }, 50);
    } else {
      const el = bodyTextareaRef.current;
      const currentVal = activeVariant?.body || '';
      let newVal = '';
      if (el && typeof el.selectionStart === 'number') {
        const start = el.selectionStart;
        const end = el.selectionEnd || start;
        newVal = currentVal.substring(0, start) + tag + currentVal.substring(end);
      } else {
        newVal = currentVal ? `${currentVal} ${tag}` : tag;
      }
      handleUpdateContent({ body: newVal });
      setTimeout(() => {
        if (el) el.focus();
      }, 50);
    }
  };

  const handleToggleStatus = async () => {
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
      variant: 'success',
    });
  };

  const handleRenameCampaign = (newName: string) => {
    if (isReadOnly) return;
    const updated = { ...campaign, name: newName.trim() || campaign.name };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const handleCleanSpamWithAi = () => {
    if (isReadOnly) return;
    if (!activeVariant) return;
    const cleanSub = applySpamFixes(activeVariant.subject, language);
    const cleanBody = applySpamFixes(activeVariant.body, language);
    handleUpdateContent({ subject: cleanSub, body: cleanBody });
    showToast({
      title: isEs ? 'Texto optimizado contra spam' : 'Spam triggers cleaned',
      variant: 'success',
    });
  };

  const handleRunCampaign = async (simulationOnly: boolean = false) => {
    if (isReadOnly) return;
    setIsSending(true);
    setDispatchResult(null);
    const pendingTotal = campaignLeads.filter((l) => l.status === 'pending').length;
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
          body: JSON.stringify({ simulationOnly, batchSize }),
        });
        const data = await res.json();

        if (!res.ok || data.error) {
          const errText = data.error || (isEs ? 'Error enviando lote de campaña' : 'Batch send error');
          setDispatchResult({ error: errText });
          showToast({
            title: isEs ? 'Error en envío' : 'Dispatch error',
            description: errText,
            variant: 'error',
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
          const firstErrorLog = allLogs.find((l) => l.status === 'error');
          if (cumulativeSent === 0 && firstErrorLog?.error) {
            setDispatchResult({ error: `Fallo SMTP: ${firstErrorLog.error}` });
            showToast({
              title: isEs ? 'Fallo SMTP' : 'SMTP failure',
              description: firstErrorLog.error,
              variant: 'error',
            });
          } else {
            setDispatchResult({
              campaignId: campaign.id,
              totalPending: pendingTotal,
              processed: cumulativeProcessed,
              sentCount: cumulativeSent,
              logs: allLogs,
            });
            showToast({
              title: simulationOnly
                ? isEs
                  ? 'Simulación completada'
                  : 'Simulation complete'
                : isEs
                  ? 'Campaña despachada'
                  : 'Campaign dispatched',
              description: isEs
                ? `${cumulativeSent} correos procesados`
                : `${cumulativeSent} emails processed`,
              variant: 'success',
            });
          }
          break;
        }
      }

      const refreshed = await fetch(`/api/campaigns/${campaign.id}`).then((r) => r.json());
      if (refreshed && refreshed.id) {
        onUpdateCampaign(refreshed);
      }
      if (onRefreshLeads) onRefreshLeads();
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error
          ? err.message
          : isEs
            ? 'Error de red durante el envío'
            : 'Network error during dispatch';
      setDispatchResult({ error: msg });
      showToast({
        title: isEs ? 'Error de envío' : 'Dispatch error',
        description: msg,
        variant: 'error',
      });
    } finally {
      setIsSending(false);
      setSendProgress(null);
    }
  };

  const handleClearLeads = async () => {
    if (isReadOnly) return;
    const confirmed = await confirm({
      title: isEs ? 'Vaciar lista de destinatarios' : 'Clear campaign leads',
      description: isEs
        ? '¿Deseas vaciar la lista de destinatarios de esta campaña?'
        : 'Clear all leads in this campaign?',
      confirmLabel: isEs ? 'Vaciar' : 'Clear',
      cancelLabel: isEs ? 'Cancelar' : 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/leads?campaignId=${encodeURIComponent(campaign.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to clear leads');
      if (onRefreshLeads) onRefreshLeads();
      showToast({
        title: isEs ? 'Lista de destinatarios vaciada' : 'Recipient list cleared',
        variant: 'success',
      });
    } catch {
      showToast({
        title: isEs ? 'Error al vaciar destinatarios' : 'Failed to clear recipients',
        variant: 'error',
      });
    }
  };

  const handleImportSuccess = () => {
    if (onRefreshLeads) onRefreshLeads();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#0A0C10] text-[#F3F5F8]">
      <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
        {/* Modal to Import Leads (Google Sheets / CSV) */}
        <LeadImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          campaignId={campaign.id}
          onImportSuccess={handleImportSuccess}
        />

        {/* Top Banner: Novice Campaign Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1D2330] pb-5">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#E85D2A] bg-[#E85D2A]/10 px-2.5 py-0.5 rounded-lg border border-[#E85D2A]/25">
                {isEs ? 'Modo Simple (Paso a Paso)' : 'Simple Mode (Guided)'}
              </span>
              {isReadOnly && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-[#11141C] border border-[#232938] text-[#949EB0]">
                  <Eye className="w-3.5 h-3.5 text-[#E85D2A]" />
                  <span>{isEs ? 'Modo Solo Lectura' : 'Read-Only Mode'}</span>
                </span>
              )}
              <span className="text-[#232938] text-xs">•</span>
              {/* Inline Editable Campaign Name */}
              <div className="flex items-center gap-1.5 group bg-[#11141C] border border-[#232938] focus-within:border-[#E85D2A] rounded-lg px-2.5 py-1 transition">
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={campaign.name}
                  onChange={(e) => handleRenameCampaign(e.target.value)}
                  className="text-xs font-bold text-[#F3F5F8] bg-transparent focus:outline-none min-w-[200px] disabled:opacity-75 disabled:cursor-not-allowed"
                  placeholder={isEs ? 'Nombre de la campaña...' : 'Campaign name...'}
                  title={
                    isReadOnly
                      ? isEs
                        ? 'Modo Solo Lectura'
                        : 'Read-Only Mode'
                      : isEs
                        ? 'Haz clic para editar el nombre de la campaña'
                        : 'Click to edit campaign name'
                  }
                />
                {!isReadOnly && (
                  <Edit3 className="w-3 h-3 text-[#949EB0] group-hover:text-[#E85D2A] transition" />
                )}
              </div>
            </div>
            <h1 className="text-xl font-bold text-[#F3F5F8] mt-1.5">
              {isEs ? 'Crear y Lanzar Campaña de Correo' : 'Draft & Launch Outreach Campaign'}
            </h1>
            <p className="text-xs text-[#949EB0] mt-0.5">
              {isEs
                ? 'Conecta tus contactos, escribe tu mensaje y el sistema enviará en horario laboral seguro sin caer en spam.'
                : 'Connect your contacts, choose your message, and let automated safeguards deliver safely without spam flags.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Status Toggle (Active / Paused) */}
            <button
              type="button"
              disabled={isReadOnly}
              onClick={handleToggleStatus}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-bold transition ${
                isReadOnly
                  ? 'opacity-50 cursor-not-allowed bg-[#11141C] border-[#232938] text-[#949EB0]'
                  : campaign.status === 'active'
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25 cursor-pointer'
                    : campaign.status === 'paused'
                      ? 'bg-amber-500/15 border-amber-500/35 text-amber-300 hover:bg-amber-500/25 cursor-pointer'
                      : 'bg-[#171B26] border-[#232938] text-[#F3F5F8] hover:bg-[#1D2330] cursor-pointer'
              }`}
              title={
                isReadOnly
                  ? isEs
                    ? 'Modo Solo Lectura'
                    : 'Read-Only Mode'
                  : isEs
                    ? 'Haz clic para pausar o activar la campaña'
                    : 'Click to toggle status'
              }
            >
              {campaign.status === 'active' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{isEs ? 'Campaña Activa' : 'Campaign Active'}</span>
                  <Pause className="w-3.5 h-3.5 ml-1 opacity-70" />
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-[#E85D2A]" />
                  <span>{isEs ? 'Activar Campaña' : 'Activate Campaign'}</span>
                </>
              )}
            </button>

            {!isReadOnly && (
              <button
                type="button"
                onClick={openCopilot}
                className="flex items-center gap-2 bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] hover:border-[#E85D2A]/50 text-[#F3F5F8] text-xs font-semibold px-4 py-2 rounded-lg transition shrink-0 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#E85D2A]" />
                <span>{isEs ? 'Copilot IA' : 'Copilot AI'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Step 1: Recipients Card & Google Sheets Import */}
        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#E85D2A]/15 border border-[#E85D2A]/30 text-[#E85D2A] font-bold text-xs font-mono tabular-nums flex items-center justify-center">
                1
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F3F5F8]">
                  {isEs ? '¿A quién le escribes? (Destinatarios)' : 'Who are you emailing? (Recipients)'}
                </h3>
                <p className="text-xs text-[#949EB0]">
                  {isEs ? 'Base de contactos asignada a esta campaña' : 'Contacts targeted for this campaign'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => !isReadOnly && setIsImportModalOpen(true)}
                className="flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-lg transition cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>
                  {campaignLeads.length > 0
                    ? isEs
                      ? 'Importar más desde Sheets / CSV'
                      : 'Import more from Sheets / CSV'
                    : isEs
                      ? 'Conectar Google Sheet / Cargar Leads'
                      : 'Connect Google Sheet / Upload Leads'}
                </span>
              </button>

              {campaignLeads.length > 0 && (
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={handleClearLeads}
                  title={isEs ? 'Vaciar lista' : 'Clear leads'}
                  className="p-2 rounded-lg bg-[#171B26] hover:bg-rose-500/10 text-[#949EB0] hover:text-rose-400 border border-[#232938] hover:border-rose-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Status of Loaded Contacts */}
          <div className="bg-[#171B26] border border-[#232938] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-[#F3F5F8]">
                    {campaignLeads.length > 0 ? (
                      <>
                        <span className="font-mono tabular-nums">{campaignLeads.length}</span>{' '}
                        {isEs ? 'contactos cargados' : 'contacts loaded'}
                      </>
                    ) : isEs ? (
                      'No hay contactos cargados aún'
                    ) : (
                      'No contacts loaded yet'
                    )}
                  </span>
                  {campaignLeads.length > 0 && (
                    <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
                      <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/25">
                        {campaignLeads.filter((l) => l.status === 'sent').length}{' '}
                        {isEs ? 'enviados' : 'sent'}
                      </span>
                      <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/25">
                        {campaignLeads.filter((l) => l.status === 'pending').length}{' '}
                        {isEs ? 'pendientes' : 'pending'}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[#949EB0] mt-0.5">
                  {campaignLeads.length > 0
                    ? isEs
                      ? 'Se respetan todas las columnas de tu hoja para personalización'
                      : 'All spreadsheet columns are mapped for personalized variables'
                    : isEs
                      ? 'Haz clic en "Conectar Google Sheet" para subir tu base en segundos'
                      : 'Click "Connect Google Sheet" to upload your list in seconds'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {campaignLeads.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetLeads}
                  disabled={isReadOnly || isResettingLeads}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#11141C] hover:bg-[#1D2330] border border-[#232938] text-[#F3F5F8] rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    isEs
                      ? 'Reiniciar estado de leads a pendiente para reenviar o probar'
                      : 'Reset to pending'
                  }
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isResettingLeads ? 'animate-spin' : ''}`} />
                  <span>{isEs ? 'Reiniciar a Pendiente' : 'Reset to Pending'}</span>
                </button>
              )}

              {detectedVariables.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {detectedVariables.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => handleInsertVariable(v)}
                      title={
                        isEs
                          ? `Insertar {{${v}}} en el mensaje`
                          : `Insert {{${v}}} in message`
                      }
                      className="bg-[#E85D2A]/10 border border-[#E85D2A]/30 hover:border-[#E85D2A] text-[#E85D2A] font-mono text-[10px] px-2 py-0.5 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      +{`{{${v}}}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Sender Mailbox Selection */}
        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#E85D2A]/15 border border-[#E85D2A]/30 text-[#E85D2A] font-bold text-xs font-mono tabular-nums flex items-center justify-center">
                2
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F3F5F8] flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#E85D2A]" />
                  <span>
                    {isEs
                      ? '¿Desde qué cuenta de correo saldrá la campaña? (Casilla Remitente)'
                      : 'Which email account will send this campaign?'}
                  </span>
                </h3>
                <p className="text-xs text-[#949EB0]">
                  {isEs
                    ? 'Selecciona la casilla (Gmail, Outlook o SMTP) desde donde se enviarán tus correos.'
                    : 'Select the sender mailbox (Gmail, Outlook or SMTP) from which your emails will be dispatched.'}
                </p>
              </div>
            </div>
          </div>

          {accounts.length === 0 ? (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between">
              <span>
                {isEs ? 'No tienes casillas de correo conectadas.' : 'No email accounts connected.'}
              </span>
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
                        ? 'bg-[#E85D2A]/10 border-[#E85D2A]/60'
                        : 'bg-[#171B26] border-[#232938] hover:border-[#343D52] text-[#949EB0]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold font-mono uppercase shrink-0 ${
                          isSelected
                            ? 'bg-[#E85D2A] text-white'
                            : 'bg-[#0A0C10] border border-[#232938] text-[#949EB0]'
                        }`}
                      >
                        {acc.provider === 'google' ? 'G' : acc.provider === 'microsoft' ? 'M' : 'SMTP'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#F3F5F8] truncate flex items-center gap-2">
                          <span>{acc.name || acc.email}</span>
                          {isSelected && (
                            <span className="text-[9px] bg-[#E85D2A]/15 text-[#E85D2A] border border-[#E85D2A]/30 px-1.5 py-0.5 rounded-lg font-semibold uppercase">
                              {isEs ? 'Casilla Activa' : 'Active Sender'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#949EB0] font-mono truncate">{acc.email}</div>
                        <div className="text-[10px] text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>
                            {isEs ? 'Conectada y lista' : 'Connected & ready'} •{' '}
                            <span className="font-mono tabular-nums">{acc.dailyLimit || 50}</span>/día
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-[#E85D2A]" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-[#232938]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 3: Message & Pre-built Templates */}
        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#1D2330] pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#E85D2A]/15 border border-[#E85D2A]/30 text-[#E85D2A] font-bold text-xs font-mono tabular-nums flex items-center justify-center">
                3
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F3F5F8]">
                  {isEs ? '¿Qué quieres decirles?' : 'What do you want to say?'}
                </h3>
                <p className="text-xs text-[#949EB0]">
                  {isEs
                    ? 'Selecciona una plantilla de alto impacto o escribe tu propio mensaje'
                    : 'Select a high-converting template or write your own'}
                </p>
              </div>
            </div>

            {/* AI Spam Traffic Light Badge */}
            {totalSpam.length === 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-lg font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEs ? 'Mensaje Seguro (Llega a Inbox)' : 'Spam-Safe (100% Inbox)'}</span>
              </div>
            ) : (
              <button
                type="button"
                disabled={isReadOnly}
                onClick={handleCleanSpamWithAi}
                className="flex items-center gap-1.5 text-xs text-rose-300 bg-rose-500/15 border border-rose-500/35 px-3 py-1 rounded-lg font-medium hover:bg-rose-500/25 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>{isEs ? 'Limpiar con IA (Evitar Spam)' : 'Auto-Clean with AI'}</span>
              </button>
            )}
          </div>

          {/* 3 High-Impact Ready Templates Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#F3F5F8] block">
              {isEs ? 'Plantillas Recomendadas en 1 Clic:' : '1-Click Recommended Templates:'}
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {NOVICE_TEMPLATES.map((tmpl) => {
                const active = selectedTemplateId === tmpl.id;
                const langKey = isEs ? 'es' : 'en';
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => applyTemplate(tmpl.id)}
                    className={`p-3 rounded-xl border text-left transition space-y-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      active
                        ? 'bg-[#E85D2A]/10 border-[#E85D2A] text-[#F3F5F8]'
                        : 'bg-[#171B26] border-[#232938] text-[#949EB0] hover:text-[#F3F5F8] hover:border-[#343D52]'
                    }`}
                  >
                    <div className="font-bold text-xs text-[#F3F5F8]">{tmpl.name[langKey]}</div>
                    <p className="text-[11px] text-[#949EB0] line-clamp-2 leading-relaxed">
                      {tmpl.description[langKey]}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Variable Insertion Pills Toolbar */}
          <div className="bg-[#171B26] border border-[#232938] rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#949EB0] flex-wrap gap-2">
              <span className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#E85D2A]" />
                <span>
                  {isEs
                    ? 'Haz clic en una variable para insertarla en tu correo:'
                    : 'Click any variable tag to insert into your email:'}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-[#E85D2A] font-medium bg-[#E85D2A]/10 px-2.5 py-0.5 rounded-lg border border-[#E85D2A]/25">
                <Target className="w-3 h-3" />
                <span>
                  {isEs
                    ? lastFocusedField === 'subject'
                      ? 'Se insertará en: Asunto'
                      : 'Se insertará en: Cuerpo'
                    : lastFocusedField === 'subject'
                      ? 'Target: Subject'
                      : 'Target: Body'}
                </span>
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {availableTags.map((tag, idx) => {
                const isCustomSheet = detectedVariables.includes(tag);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => handleInsertVariable(tag)}
                    className={`font-mono text-[11px] px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      isCustomSheet
                        ? 'bg-[#E85D2A]/10 hover:bg-[#E85D2A]/20 border border-[#E85D2A]/30 hover:border-[#E85D2A] text-[#E85D2A] font-semibold'
                        : 'bg-[#11141C] hover:bg-[#1D2330] border border-[#232938] text-[#F3F5F8]'
                    }`}
                    title={
                      isCustomSheet
                        ? isEs
                          ? `Columna de tu Hoja de Leads: {{${tag}}}`
                          : `Sheet Column: {{${tag}}}`
                        : isEs
                          ? `Insertar {{${tag}}}`
                          : `Insert {{${tag}}}`
                    }
                  >
                    <Plus className="w-3 h-3 text-[#E85D2A]" />
                    <span>{`{{${tag}}}`}</span>
                    {isCustomSheet && (
                      <span className="text-[9px] bg-[#E85D2A]/20 text-[#E85D2A] px-1 py-0.2 rounded font-sans uppercase">
                        Sheet
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-semibold text-[#F3F5F8]">
                {isEs ? 'Asunto del Correo' : 'Email Subject Line'}
              </label>
              <div className="text-[11px] text-[#949EB0] flex items-center gap-1">
                <span>{isEs ? 'Variables rápidas para asunto:' : 'Subject tags:'}</span>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleInsertVariable(isEs ? 'Nombre' : 'firstName', 'subject')}
                  className="text-[#E85D2A] hover:underline font-mono cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  +&#123;&#123;{isEs ? 'Nombre' : 'firstName'}&#125;&#125;
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleInsertVariable(isEs ? 'Empresa' : 'companyName', 'subject')}
                  className="text-[#E85D2A] hover:underline font-mono ml-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  +&#123;&#123;{isEs ? 'Empresa' : 'companyName'}&#125;&#125;
                </button>
              </div>
            </div>
            <input
              ref={subjectInputRef}
              type="text"
              disabled={isReadOnly}
              onFocus={() => setLastFocusedField('subject')}
              value={activeVariant?.subject || ''}
              onChange={(e) => handleUpdateContent({ subject: e.target.value })}
              className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-4 py-2.5 text-xs text-[#F3F5F8] placeholder-[#949EB0]/60 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder={
                isEs
                  ? 'Consulta breve sobre {{Empresa}}...'
                  : 'Quick question regarding {{companyName}}...'
              }
            />
          </div>

          {/* Body Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-semibold text-[#F3F5F8]">
                {isEs ? 'Cuerpo del Mensaje' : 'Email Content'}
              </label>
              <div className="text-[11px] text-[#949EB0]">
                {isEs
                  ? 'Cualquier columna de tu hoja (ej: {{DOLOR}}, {{MAIL}}) se reemplazará automáticamente'
                  : 'Any column like {{Cargo}}, {{Ciudad}} is dynamically populated'}
              </div>
            </div>
            <textarea
              ref={bodyTextareaRef}
              rows={8}
              disabled={isReadOnly}
              onFocus={() => setLastFocusedField('body')}
              value={activeVariant?.body || ''}
              onChange={(e) => handleUpdateContent({ body: e.target.value })}
              className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg p-4 text-xs text-[#F3F5F8] placeholder-[#949EB0]/60 focus:outline-none transition leading-relaxed font-sans disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder={
                isEs
                  ? 'Hola {{Nombre}}, te escribo porque...'
                  : 'Hi {{firstName}}, reaching out because...'
              }
            />
          </div>
        </div>

        {/* Step 4: Automated Safeguards Summary */}
        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#E85D2A]/15 border border-[#E85D2A]/30 text-[#E85D2A] font-bold text-xs font-mono tabular-nums flex items-center justify-center">
                4
              </div>
              <h4 className="font-bold text-[#F3F5F8] text-xs">
                {isEs
                  ? 'Ajustes de Entrega Segura (Automáticos)'
                  : 'Safe Delivery Safeguards (Auto-Pilot)'}
              </h4>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="text-[#949EB0] hover:text-[#F3F5F8] text-[11px] flex items-center gap-1 transition cursor-pointer"
            >
              <span>{isEs ? 'Opciones avanzadas' : 'Advanced options'}</span>
              {showAdvancedSettings ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#171B26] p-3 rounded-xl border border-[#232938] space-y-1">
              <div className="text-[10px] text-[#949EB0] font-semibold uppercase">
                {isEs ? 'Horario de Oficina' : 'Business Hours'}
              </div>
              <div className="text-[#F3F5F8] font-medium font-mono tabular-nums">
                09:00 - 17:30 (Lun–Vie)
              </div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>{isEs ? 'Optimizado para apertura' : 'Optimized for opens'}</span>
              </div>
            </div>

            <div className="bg-[#171B26] p-3 rounded-xl border border-[#232938] space-y-1">
              <div className="text-[10px] text-[#949EB0] font-semibold uppercase">
                {isEs ? 'Pausa si Responde' : 'Auto-Stop on Reply'}
              </div>
              <div className="text-[#F3F5F8] font-medium font-mono tabular-nums">100%</div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>{isEs ? 'No molesta a quien ya contestó' : 'Stops on prospect reply'}</span>
              </div>
            </div>

            <div className="bg-[#171B26] p-3 rounded-xl border border-[#232938] space-y-1">
              <div className="text-[10px] text-[#949EB0] font-semibold uppercase">
                {isEs ? 'Límite Seguro Diario' : 'Safe Daily Volume'}
              </div>
              <div className="text-[#F3F5F8] font-medium font-mono tabular-nums">
                50 {isEs ? 'correos / día' : 'emails / day'}
              </div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>{isEs ? 'Protege tu dominio de spam' : 'Protects domain reputation'}</span>
              </div>
            </div>
          </div>

          {showAdvancedSettings && (
            <div className="pt-3 border-t border-[#1D2330] space-y-2 text-[#949EB0] text-[11px]">
              <p>
                {isEs
                  ? 'Para configurar pruebas A/Z, sintaxis Spintax compleja o códigos DNS específicos, puedes conmutar a "Modo Pro" en la barra superior en cualquier momento.'
                  : 'For A/Z tests, raw Spintax syntax, or deep DNS audits, you can switch to "Pro Mode" in the top bar anytime.'}
              </p>
            </div>
          )}
        </div>

        {/* Launch Actions */}
        {!isReadOnly && (
          <div className="flex items-center justify-end gap-3 pt-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsTestEmailModalOpen(true)}
              className="flex items-center gap-1.5 bg-[#11141C] hover:bg-[#171B26] text-[#F3F5F8] border border-[#232938] px-3.5 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer"
              title={
                isEs
                  ? 'Enviar un correo de prueba real a tu dirección'
                  : 'Send a test email to your address'
              }
            >
              <Mail className="w-3.5 h-3.5 text-[#E85D2A]" />
              <span>{isEs ? 'Enviar Prueba a mi Correo' : 'Send Test to My Email'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleRunCampaign(true)}
              disabled={isSending}
              className="flex items-center gap-2 bg-[#171B26] hover:bg-[#1D2330] text-[#F3F5F8] text-xs font-semibold px-4 py-2.5 rounded-lg border border-[#232938] transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
              <span>{isEs ? 'Simular Envío Seguro (Prueba)' : 'Safe Test Simulation'}</span>
            </button>

            {campaignLeads.length === 0 ? (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white text-xs font-bold px-5 py-2.5 rounded-lg transition cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{isEs ? 'Cargar Leads de Sheets para Enviar' : 'Load Leads to Send'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleRunCampaign(false)}
                disabled={isSending}
                className="flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] disabled:opacity-50 text-white text-xs font-bold px-6 py-2.5 rounded-lg transition cursor-pointer"
              >
                <Rocket className="w-4 h-4" />
                <span>{isEs ? 'Activar y Enviar Campaña' : 'Launch Campaign'}</span>
              </button>
            )}
          </div>
        )}

        {/* Live Batch Sending Progress Bar */}
        {isSending && sendProgress && (
          <div className="bg-[#11141C] border border-[#E85D2A]/40 rounded-xl p-4 space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold text-[#F3F5F8]">
                <RefreshCw className="w-4 h-4 animate-spin text-[#E85D2A]" />
                <span>
                  {isEs
                    ? 'Despachando correos por lotes seguros (Conexión SMTP persistente)...'
                    : 'Dispatching emails in safe batches (Persistent SMTP pool)...'}
                </span>
              </div>
              <span className="font-mono tabular-nums font-bold text-[#F3F5F8]">
                {sendProgress.sent} / {sendProgress.total || '?'}
              </span>
            </div>
            <div className="w-full h-2 bg-[#0A0C10] rounded-full overflow-hidden border border-[#232938]">
              <div
                className="h-full bg-[#E85D2A] transition-all duration-300"
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

        {/* Execution Results or Error Banner */}
        {dispatchResult &&
          (dispatchResult.error ? (
            <div className="bg-rose-500/10 border border-rose-500/35 rounded-xl p-5 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-rose-300 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>{isEs ? 'Aviso de Envío' : 'Dispatch Notice'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDispatchResult(null)}
                  className="text-[#949EB0] hover:text-[#F3F5F8] p-1 rounded-lg transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-rose-200 leading-relaxed">{dispatchResult.error}</p>
            </div>
          ) : (
            <div className="bg-[#11141C] border border-emerald-500/35 rounded-xl p-5 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-[#F3F5F8] text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    {isEs ? '¡Campaña Procesada con Éxito!' : 'Campaign Processed Successfully!'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDispatchResult(null)}
                  className="text-[#949EB0] hover:text-[#F3F5F8] p-1 rounded-lg transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-[#171B26] border border-[#232938] p-3 rounded-xl">
                  <span className="text-[#949EB0] text-[10px] uppercase">
                    {isEs ? 'Emails Enviados' : 'Emails Sent'}
                  </span>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5 font-mono tabular-nums">
                    {dispatchResult.sentCount || 0}
                  </div>
                </div>
                <div className="bg-[#171B26] border border-[#232938] p-3 rounded-xl">
                  <span className="text-[#949EB0] text-[10px] uppercase">
                    {isEs ? 'Modo' : 'Mode'}
                  </span>
                  <div className="text-sm font-medium text-[#E85D2A] mt-0.5">
                    {dispatchResult.logs?.[0]?.status === 'simulated'
                      ? isEs
                        ? 'Simulación Segura'
                        : 'Safe Simulation'
                      : isEs
                        ? 'Envío Real SMTP'
                        : 'Live SMTP'}
                  </div>
                </div>
              </div>
            </div>
          ))}

        {/* Send Real Test Email Modal */}
        <SendTestEmailModal
          isOpen={isTestEmailModalOpen}
          onClose={() => setIsTestEmailModalOpen(false)}
          campaignId={campaign.id}
        />
      </div>
    </div>
  );
}
