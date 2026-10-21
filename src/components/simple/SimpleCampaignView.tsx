'use client';

import React, { useState, useRef } from 'react';
import { 
  Send, Sparkles, CheckCircle2, ShieldCheck, Clock, FileSpreadsheet, 
  ChevronDown, ChevronUp, Play, Pause, RefreshCw, Eye, AlertTriangle,
  Upload, Trash2, Tag, Plus, Edit3
} from 'lucide-react';
import { Campaign, Lead } from '@/types';
import { NOVICE_TEMPLATES } from '@/core/templates';
import { checkSpamWords, applySpamFixes } from '@/lib/spamDetector';
import { useLanguage } from '@/context/LanguageContext';
import LeadImportModal from '../LeadImportModal';

interface SimpleCampaignViewProps {
  campaign: Campaign;
  onUpdateCampaign: (updated: Campaign) => void;
  openCopilot: () => void;
  leads?: Lead[];
  onRefreshLeads?: () => void;
}

export default function SimpleCampaignView({
  campaign,
  onUpdateCampaign,
  openCopilot,
  leads = [],
  onRefreshLeads
}: SimpleCampaignViewProps) {
  const { t, language } = useLanguage();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('template-pitch');
  const [isSending, setIsSending] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<any | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [lastFocusedField, setLastFocusedField] = useState<'subject' | 'body'>('body');

  const subjectInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const activeStep = campaign.steps[0];
  const activeVariant = activeStep?.variants[0];

  const subjectSpam = activeVariant ? checkSpamWords(activeVariant.subject, language) : [];
  const bodySpam = activeVariant ? checkSpamWords(activeVariant.body, language) : [];
  const totalSpam = [...subjectSpam, ...bodySpam];

  const campaignLeads = leads.filter(l => l.campaignId === campaign.id);

  // Extract detected unique variables from campaign leads' customVariables
  const detectedVariables = Array.from(
    new Set(
      campaignLeads.flatMap(l => Object.keys(l.customVariables || {}))
    )
  );

  // Standard variables list combined with sheet variables
  const availableTags = Array.from(
    new Set([
      language === 'es' ? 'Nombre' : 'firstName',
      language === 'es' ? 'Empresa' : 'companyName',
      ...detectedVariables
    ])
  );

  // Apply selected template
  const applyTemplate = (templateId: string) => {
    const tmpl = NOVICE_TEMPLATES.find(t => t.id === templateId);
    if (!tmpl || !activeStep || !activeVariant) return;

    setSelectedTemplateId(templateId);
    const langKey = language === 'es' ? 'es' : 'en';

    const newSteps = campaign.steps.map((step, sIdx) => {
      if (sIdx !== 0) return step;
      return {
        ...step,
        variants: step.variants.map((v, vIdx) => {
          if (vIdx !== 0) return v;
          return {
            ...v,
            subject: tmpl.subject[langKey],
            body: tmpl.body[langKey]
          };
        })
      };
    });

    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const handleUpdateContent = (updates: { subject?: string; body?: string }) => {
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
            ...(updates.body !== undefined ? { body: updates.body } : {})
          };
        })
      };
    });

    const updated = { ...campaign, steps: newSteps };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const handleInsertVariable = (varName: string, targetField?: 'subject' | 'body') => {
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
    const nextStatus = campaign.status === 'active' ? 'paused' : 'active';
    const updated = { ...campaign, status: nextStatus as any };
    onUpdateCampaign(updated);
    await saveToServer(updated);
  };

  const handleRenameCampaign = (newName: string) => {
    const updated = { ...campaign, name: newName.trim() || campaign.name };
    onUpdateCampaign(updated);
    saveToServer(updated);
  };

  const saveToServer = async (updated: Campaign) => {
    try {
      await fetch(`/api/campaigns/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (err) {}
  };

  const handleCleanSpamWithAi = () => {
    if (!activeVariant) return;
    const cleanSub = applySpamFixes(activeVariant.subject, language);
    const cleanBody = applySpamFixes(activeVariant.body, language);
    handleUpdateContent({ subject: cleanSub, body: cleanBody });
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
      if (onRefreshLeads) onRefreshLeads();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const handleClearLeads = async () => {
    if (!confirm(language === 'es' ? '¿Deseas vaciar la lista de destinatarios de esta campaña?' : 'Clear all leads in this campaign?')) return;
    try {
      await fetch(`/api/leads?campaignId=${campaign.id}`, { method: 'DELETE' });
      if (onRefreshLeads) onRefreshLeads();
    } catch (e) {}
  };

  const handleImportSuccess = () => {
    if (onRefreshLeads) onRefreshLeads();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#0b0f17] p-8 max-w-4xl mx-auto w-full space-y-6">
      {/* Modal to Import Leads (Google Sheets / CSV) */}
      <LeadImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        campaignId={campaign.id}
        onImportSuccess={handleImportSuccess}
      />

      {/* Top Banner: Novice Campaign Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
              {language === 'es' ? 'Modo Simple (Paso a Paso)' : 'Simple Mode (Guided)'}
            </span>
            <span className="text-slate-500 text-xs">•</span>
            {/* Inline Editable Campaign Name */}
            <div className="flex items-center gap-1.5 group bg-slate-900/80 hover:bg-slate-900 border border-slate-700/80 hover:border-blue-500/60 focus-within:border-blue-500 rounded-xl px-2.5 py-1 transition">
              <input
                type="text"
                value={campaign.name}
                onChange={(e) => handleRenameCampaign(e.target.value)}
                className="text-xs font-bold text-white bg-transparent focus:outline-none min-w-[200px]"
                placeholder={language === 'es' ? 'Nombre de la campaña...' : 'Campaign name...'}
                title={language === 'es' ? 'Haz clic para editar el nombre de la campaña' : 'Click to edit campaign name'}
              />
              <Edit3 className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-white mt-1.5">
            {language === 'es' ? 'Crear y Lanzar Campaña de Correo' : 'Draft & Launch Outreach Campaign'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {language === 'es'
              ? 'Conecta tus contactos, escribe tu mensaje y el sistema enviará en horario laboral seguro sin caer en spam.'
              : 'Connect your contacts, choose your message, and let automated safeguards deliver safely without spam flags.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Status Toggle (Active / Paused) */}
          <button
            onClick={handleToggleStatus}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition shadow-sm cursor-pointer ${
              campaign.status === 'active'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                : campaign.status === 'paused'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title={language === 'es' ? 'Haz clic para pausar o activar la campaña' : 'Click to toggle status'}
          >
            {campaign.status === 'active' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{language === 'es' ? 'Campaña Activa' : 'Campaign Active'}</span>
                <Pause className="w-3.5 h-3.5 ml-1 opacity-70" />
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-blue-400" />
                <span>{language === 'es' ? 'Activar Campaña' : 'Activate Campaign'}</span>
              </>
            )}
          </button>

          <button
            onClick={openCopilot}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg transition shrink-0 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{language === 'es' ? 'Copilot IA' : 'Copilot AI'}</span>
          </button>
        </div>
      </div>

      {/* Step 1: Recipients Card & Google Sheets Import */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-bold text-xs flex items-center justify-center">
              1
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {language === 'es' ? '¿A quién le escribes? (Destinatarios)' : 'Who are you emailing? (Recipients)'}
              </h3>
              <p className="text-xs text-slate-400">
                {language === 'es' ? 'Base de contactos asignada a esta campaña' : 'Contacts targeted for this campaign'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md transition"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                {campaignLeads.length > 0
                  ? (language === 'es' ? 'Importar más desde Sheets / CSV' : 'Import more from Sheets / CSV')
                  : (language === 'es' ? '📥 Conectar Google Sheet / Cargar Leads' : '📥 Connect Google Sheet / Upload Leads')}
              </span>
            </button>

            {campaignLeads.length > 0 && (
              <button
                onClick={handleClearLeads}
                title={language === 'es' ? 'Vaciar lista' : 'Clear leads'}
                className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/80 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Status of Loaded Contacts */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div>
              <span className="font-semibold text-white">
                {campaignLeads.length > 0
                  ? `${campaignLeads.length} ${language === 'es' ? 'contactos listos para recibir correos' : 'contacts ready to receive emails'}`
                  : (language === 'es' ? 'No hay contactos cargados aún' : 'No contacts loaded yet')}
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {campaignLeads.length > 0
                  ? (language === 'es' ? 'Se respetan todas las columnas de tu hoja para personalización' : 'All spreadsheet columns are mapped for personalized variables')
                  : (language === 'es' ? 'Haz clic en "Conectar Google Sheet" para subir tu base en segundos' : 'Click "Connect Google Sheet" to upload your list in seconds')}
              </p>
            </div>
          </div>

          {detectedVariables.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 font-medium">
                {language === 'es' ? 'Columnas de tu hoja:' : 'Your Sheet Columns:'}
              </span>
              {detectedVariables.map((v, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleInsertVariable(v)}
                  title={language === 'es' ? `Insertar {{${v}}} en el mensaje` : `Insert {{${v}}} in message`}
                  className="bg-emerald-950/80 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 font-mono text-[10px] px-2 py-0.5 rounded transition cursor-pointer"
                >
                  +{`{{${v}}}`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Message & Pre-built Templates */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-bold text-xs flex items-center justify-center">
              2
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {language === 'es' ? '¿Qué quieres decirles?' : 'What do you want to say?'}
              </h3>
              <p className="text-xs text-slate-400">
                {language === 'es' ? 'Selecciona una plantilla de alto impacto o escribe tu propio mensaje' : 'Select a high-converting template or write your own'}
              </p>
            </div>
          </div>

          {/* AI Spam Traffic Light Badge */}
          {totalSpam.length === 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>{language === 'es' ? 'Mensaje Seguro (Llega a Inbox)' : 'Spam-Safe (100% Inbox)'}</span>
            </div>
          ) : (
            <button
              onClick={handleCleanSpamWithAi}
              className="flex items-center gap-1.5 text-xs text-rose-300 bg-rose-500/20 border border-rose-500/40 px-3 py-1 rounded-xl font-medium hover:bg-rose-500/30 transition shadow-sm"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>{language === 'es' ? 'Limpiar con IA (Evitar Spam)' : 'Auto-Clean with AI'}</span>
            </button>
          )}
        </div>

        {/* 3 High-Impact Ready Templates Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">
            {language === 'es' ? 'Plantillas Recomendadas en 1 Clic:' : '1-Click Recommended Templates:'}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {NOVICE_TEMPLATES.map((tmpl) => {
              const active = selectedTemplateId === tmpl.id;
              const langKey = language === 'es' ? 'es' : 'en';
              return (
                <button
                  key={tmpl.id}
                  onClick={() => applyTemplate(tmpl.id)}
                  className={`p-3 rounded-xl border text-left transition space-y-1 ${
                    active
                      ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs text-white">{tmpl.name[langKey]}</div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {tmpl.description[langKey]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Variable Insertion Pills Toolbar */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-blue-400" />
              <span>
                {language === 'es' ? 'Haz clic en una variable para insertarla en tu correo:' : 'Click any variable tag to insert into your email:'}
              </span>
            </span>
            <span className="text-[10px] text-blue-400/90 font-medium bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
              {language === 'es' 
                ? (lastFocusedField === 'subject' ? '🎯 Se insertará en: Asunto' : '🎯 Se insertará en: Cuerpo')
                : (lastFocusedField === 'subject' ? '🎯 Target: Subject' : '🎯 Target: Body')}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {availableTags.map((tag, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleInsertVariable(tag)}
                className="bg-blue-950/50 hover:bg-blue-900/60 border border-blue-500/30 hover:border-blue-400 text-blue-300 font-mono text-[11px] px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer active:scale-95"
                title={language === 'es' ? `Insertar {{${tag}}}` : `Insert {{${tag}}}`}
              >
                <Plus className="w-3 h-3 text-blue-400" />
                <span>{`{{${tag}}}`}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Subject Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300">
              {language === 'es' ? 'Asunto del Correo' : 'Email Subject Line'}
            </label>
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              <span>{language === 'es' ? 'Variables rápidas para asunto:' : 'Subject tags:'}</span>
              <button
                type="button"
                onClick={() => handleInsertVariable(language === 'es' ? 'Nombre' : 'firstName', 'subject')}
                className="text-blue-400 hover:underline font-mono cursor-pointer"
              >
                +&#123;&#123;{language === 'es' ? 'Nombre' : 'firstName'}&#125;&#125;
              </button>
              <button
                type="button"
                onClick={() => handleInsertVariable(language === 'es' ? 'Empresa' : 'companyName', 'subject')}
                className="text-blue-400 hover:underline font-mono ml-1 cursor-pointer"
              >
                +&#123;&#123;{language === 'es' ? 'Empresa' : 'companyName'}&#125;&#125;
              </button>
            </div>
          </div>
          <input
            ref={subjectInputRef}
            type="text"
            onFocus={() => setLastFocusedField('subject')}
            value={activeVariant?.subject || ''}
            onChange={(e) => handleUpdateContent({ subject: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none transition"
            placeholder={language === 'es' ? 'Consulta breve sobre {{Empresa}}...' : 'Quick question regarding {{companyName}}...'}
          />
        </div>

        {/* Body Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300">
              {language === 'es' ? 'Cuerpo del Mensaje' : 'Email Content'}
            </label>
            <div className="text-[11px] text-slate-500">
              {language === 'es' ? 'Cualquier columna de tu hoja (ej: {{DOLOR}}, {{MAIL}}) se reemplazará automáticamente' : 'Any column like {{Cargo}}, {{Ciudad}} is dynamically populated'}
            </div>
          </div>
          <textarea
            ref={bodyTextareaRef}
            rows={8}
            onFocus={() => setLastFocusedField('body')}
            value={activeVariant?.body || ''}
            onChange={(e) => handleUpdateContent({ body: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl p-4 text-xs text-white focus:outline-none transition leading-relaxed font-sans"
            placeholder={language === 'es' ? 'Hola {{Nombre}}, te escribo porque...' : 'Hi {{firstName}}, reaching out because...'}
          />
        </div>
      </div>

      {/* Step 3: Automated Safeguards Summary (Novice Friendly) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h4 className="font-bold text-white text-xs">
              {language === 'es' ? 'Ajustes de Entrega Segura (Automáticos)' : 'Safe Delivery Safeguards (Auto-Pilot)'}
            </h4>
          </div>

          <button
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="text-slate-400 hover:text-white text-[11px] flex items-center gap-1 transition"
          >
            <span>{language === 'es' ? 'Opciones avanzadas' : 'Advanced options'}</span>
            {showAdvancedSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">
              {language === 'es' ? 'Horario de Oficina' : 'Business Hours'}
            </div>
            <div className="text-slate-200 font-medium">09:00 - 17:30 (Lunes a Viernes)</div>
            <div className="text-[10px] text-emerald-400">✓ Optimizado para apertura</div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">
              {language === 'es' ? 'Pausa si Responde' : 'Auto-Stop on Reply'}
            </div>
            <div className="text-slate-200 font-medium">Activada al 100%</div>
            <div className="text-[10px] text-emerald-400">✓ No molesta a quien ya contestó</div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">
              {language === 'es' ? 'Límite Seguro Diario' : 'Safe Daily Volume'}
            </div>
            <div className="text-slate-200 font-medium">Hasta 50 correos / día</div>
            <div className="text-[10px] text-emerald-400">✓ Protege tu dominio de spam</div>
          </div>
        </div>

        {/* Optional Advanced Accordion */}
        {showAdvancedSettings && (
          <div className="pt-3 border-t border-slate-800 space-y-2 text-slate-400 text-[11px]">
            <p>
              {language === 'es'
                ? 'Para configurar pruebas A/Z, sintaxis Spintax compleja o códigos DNS específicos, puedes conmutar a "Modo Pro" en la barra superior en cualquier momento.'
                : 'For A/Z tests, raw Spintax syntax, or deep DNS audits, you can switch to "Pro Mode" in the top bar anytime.'}
            </p>
          </div>
        )}
      </div>

      {/* Launch Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={() => handleRunCampaign(true)}
          disabled={isSending}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
          <span>{language === 'es' ? 'Simular Envío Seguro (Prueba)' : 'Safe Test Simulation'}</span>
        </button>

        {campaignLeads.length === 0 ? (
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{language === 'es' ? 'Cargar Leads de Sheets para Enviar' : 'Load Leads to Send'}</span>
          </button>
        ) : (
          <button
            onClick={() => handleRunCampaign(false)}
            disabled={isSending}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{language === 'es' ? 'Activar y Enviar Campaña 🚀' : 'Launch Campaign 🚀'}</span>
          </button>
        )}
      </div>

      {/* Execution Results Banner */}
      {dispatchResult && (
        <div className="bg-slate-900 border border-blue-500/40 rounded-2xl p-5 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-white text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{language === 'es' ? '¡Campaña Procesada con Éxito!' : 'Campaign Processed Successfully!'}</span>
            </div>
            <button onClick={() => setDispatchResult(null)} className="text-slate-400 hover:text-white text-xs">
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl">
              <span className="text-slate-400 text-[10px] uppercase">Emails Enviados</span>
              <div className="text-lg font-bold text-emerald-400 mt-0.5">{dispatchResult.sentCount}</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl">
              <span className="text-slate-400 text-[10px] uppercase">Modo</span>
              <div className="text-sm font-medium text-blue-400 mt-0.5">
                {dispatchResult.logs[0]?.status === 'simulated' ? 'Simulación Segura' : 'Envío Real SMTP'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
