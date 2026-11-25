'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  Server,
  FileSpreadsheet,
  Send,
  Inbox,
  Kanban,
  CreditCard,
  Lightbulb,
  Sliders,
  Sparkles,
  ExternalLink,
  ListChecks,
} from 'lucide-react';
import { AppTab } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useViewMode } from '@/context/ViewModeContext';

interface GuidedTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: AppTab) => void;
}

interface TourStation {
  id: string;
  stepNumber: number;
  targetTab: AppTab;
  isProOnly?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  shortLabelEs: string;
  shortLabelEn: string;
  titleEs: string;
  titleEn: string;
  badgeEs: string;
  badgeEn: string;
  whatItDoesEs: string;
  whatItDoesEn: string;
  stepsEs: string[];
  stepsEn: string[];
  tipEs: string;
  tipEn: string;
}

const TOUR_STATIONS: TourStation[] = [
  {
    id: 'welcome',
    stepNumber: 1,
    targetTab: 'campaigns',
    icon: Sparkles,
    accentColor: 'text-[#14213D] bg-[#D5ECD4] border-[#C3DAC3]',
    shortLabelEs: 'Bienvenida y Modos',
    shortLabelEn: 'Welcome & Modes',
    titleEs: 'Bienvenida: Modo Simple vs. Modo Pro y Workspaces Multi-Cliente',
    titleEn: 'Welcome: Simple Mode vs. Pro Mode & Multi-Client Workspaces',
    badgeEs: 'Base del Sistema',
    badgeEn: 'System Foundation',
    whatItDoesEs:
      'MiSender adapta toda su interfaz a tu experiencia: usa Modo Simple para lanzar campañas guiadas sin tecnicismos o Modo Pro para acceder a pruebas A/Z, auditor DNS y CRM Kanban. Con Workspaces Multi-Cliente aíslas clientes, créditos y límites SaaS en una misma cuenta.',
    whatItDoesEn:
      'MiSender adapts its entire interface to your workflow: use Simple Mode for guided campaigns without jargon, or Pro Mode to unlock A/Z testing, live DNS auditing, and Kanban CRM. Multi-Client Workspaces isolate clients, credits, and SaaS limits under one account.',
    stepsEs: [
      'Abre el selector de Workspace arriba a la izquierda para cambiar o crear espacios independientes por cliente o marca.',
      'Alterna en cualquier momento entre Simple y Pro desde el interruptor de la barra superior.',
      'Presiona ⌘K (o Ctrl+K) para abrir la Paleta de Comandos y saltar rápido entre vistas, campañas o el Tour.',
    ],
    stepsEn: [
      'Open the top-left Workspace switcher to jump between or create isolated spaces per client or brand.',
      'Toggle anytime between Simple and Pro from the top bar experience switch.',
      'Press ⌘K (or Ctrl+K) to open the Command Palette and jump straight to views, campaigns, or this Tour.',
    ],
    tipEs:
      'Si trabajas como agencia o gestionas varias líneas de negocio, crea un Workspace separado por cliente para mantener aislados sus dominios, métricas y listas de bloqueo.',
    tipEn:
      'If you run an agency or manage multiple brands, create a separate Workspace per client to isolate sending domains, metrics, and suppression lists.',
  },
  {
    id: 'accounts',
    stepNumber: 2,
    targetTab: 'accounts',
    icon: Server,
    accentColor: 'text-amber-800 bg-amber-50 border-amber-200',
    shortLabelEs: 'Casillas y DNS',
    shortLabelEn: 'Mailboxes & DNS',
    titleEs: 'Casillas de Envío: Conexión OAuth 1-Click y Auditoría DNS (SPF/DKIM/DMARC)',
    titleEn: 'Sending Mailboxes: 1-Click OAuth & DNS Audit (SPF/DKIM/DMARC)',
    badgeEs: 'Infraestructura & Warmup',
    badgeEn: 'Infrastructure & Warmup',
    whatItDoesEs:
      'Conecta buzones de Google Workspace, Microsoft 365 o SMTP personalizado para rotar tus envíos, activar el calentamiento P2P automático (Warmup) y auditar en tiempo real tus 5 registros críticos de entregabilidad: SPF, DKIM, DMARC, MX y Tracking Domain.',
    whatItDoesEn:
      'Connect Google Workspace, Microsoft 365, or custom SMTP mailboxes to rotate outreach automatically, run P2P Warmup, and audit all 5 critical deliverability records live: SPF, DKIM, DMARC, MX, and Custom Tracking Domain.',
    stepsEs: [
      'Haz clic en "Conectar Casilla de Envío" y elige Google Workspace o Microsoft 365 para conexión OAuth 1-Click (o SMTP manual).',
      'Abre "Audit DNS →" en cualquier casilla y pulsa "Auditar DNS en vivo" para verificar SPF, DKIM y DMARC reales del dominio.',
      'Activa el interruptor Warmup y define un límite diario seguro de 30 a 50 correos por buzón.',
    ],
    stepsEn: [
      'Click "Add Sending Account" and pick Google Workspace or Microsoft 365 for 1-Click OAuth (or manual SMTP).',
      'Open "Audit DNS →" on any mailbox and click live DNS audit to verify your domain SPF, DKIM, and DMARC records.',
      'Enable Warmup and set a safe daily sending limit of 30–50 emails per mailbox.',
    ],
    tipEs:
      'Nunca superes los 40–50 envíos diarios por casilla. Rotar 4 buzones a 35 correos/día protege mucho más la reputación de dominio que forzar 1 buzón a 140/día.',
    tipEn:
      'Never exceed 40–50 cold emails per day from a single mailbox. Rotating 4 mailboxes at 35/day protects domain reputation far better than pushing 140/day through one.',
  },
  {
    id: 'finder',
    stepNumber: 3,
    targetTab: 'finder',
    icon: FileSpreadsheet,
    accentColor: 'text-[#14213D] bg-[#D5ECD4] border-[#C3DAC3]',
    shortLabelEs: 'Leads y Sheets',
    shortLabelEn: 'Leads & Sheets',
    titleEs: 'Grupos de Leads: Sincronización Viva con Google Sheets y Verificador MX',
    titleEn: 'Lead Groups: Live Google Sheets Sync & MX Verifier',
    badgeEs: 'Audiencia & Calidad',
    badgeEn: 'Audience & Hygiene',
    whatItDoesEs:
      'Organiza y edita tus listas de prospectos agrupadas por campaña, filtra por estado de envío (Pendiente, Enviado, Abierto, Respondido, Rebotado), importa CSV o sincroniza planillas de Google Sheets conservando columnas personalizadas {{tag}} y validación MX anti-rebote.',
    whatItDoesEn:
      'Organize and edit prospect lists grouped by campaign, filter by dispatch status (Pending, Sent, Opened, Replied, Bounced), import CSVs, or sync live Google Sheets preserving custom {{tag}} columns with anti-bounce MX validation.',
    stepsEs: [
      'Pulsa "Importar / Sincronizar (Sheets o CSV)" y pega la URL de tu Google Sheet o carga un archivo CSV.',
      'Mapea la columna de Email y marca las columnas adicionales (cargo, empresa, ciudad) para usarlas como variables {{dinámicas}}.',
      'Usa los filtros de campaña y estado, edita filas con columnas congeladas o actualiza estados en lote.',
    ],
    stepsEn: [
      'Click "Import / Sync (Sheets or CSV)" and paste your Google Sheet link or upload a CSV file.',
      'Map the Email column and select extra columns (title, company, city) to inject as {{dynamic}} variables.',
      'Filter by campaign or status, edit contacts inline with frozen columns, or bulk-update lead statuses.',
    ],
    tipEs:
      'Mantén la tasa de rebote debajo del 2%. La verificación MX y deduplicación automática frente a listas de supresión evitan que envíes a correos inválidos o repetidos.',
    tipEn:
      'Keep bounce rates below 2%. Automated MX checks and workspace deduplication prevent emailing invalid addresses or suppressed contacts.',
  },
  {
    id: 'sequences',
    stepNumber: 4,
    targetTab: 'campaigns',
    icon: Send,
    accentColor: 'text-[#14213D] bg-[#EEF3F0] border-[#C3DAC3]',
    shortLabelEs: 'Secuencias e IA',
    shortLabelEn: 'Sequences & AI',
    titleEs: 'Editor de Secuencias: Multietapa, Spintax IA, Anti-Spam y Live Preview',
    titleEn: 'Sequence Editor: Multi-Step, AI Spintax, Anti-Spam & Live Preview',
    badgeEs: 'Motor de Conversión',
    badgeEn: 'Conversion Engine',
    whatItDoesEs:
      'Crea secuencias multietapa con días de espera, pruebas A/Z con pesos de tráfico, variaciones automáticas con Auto-Spintax, detector en vivo de palabras que activan filtros de spam con limpieza IA y Vista Previa en tiempo real (Desktop/Móvil) sobre leads reales.',
    whatItDoesEn:
      'Build multi-step follow-up cadences, weighted A/Z variants, automatic Auto-Spintax variations, real-time spam trigger scanning with AI cleanup, and Desktop/Mobile Live Preview rendered with real prospect data.',
    stepsEs: [
      'Entra en cualquier campaña (o crea una nueva) y redacta el Paso 1 y tus seguimientos insertando variables como {{firstName}}.',
      'Pulsa "Auto Spintax" para diversificar saludos/frases y revisa el indicador Anti-Spam antes de guardar.',
      'Activa "Vista Previa" para probar datos reales de cada prospecto y configura Horarios y Opciones (rotación, texto plano, stopOnDomainReply).',
    ],
    stepsEn: [
      'Open any campaign (or create a new one) and draft Step 1 plus follow-ups using variables like {{firstName}}.',
      'Click "Auto Spintax" to diversify phrasing and review the live Anti-Spam detector before saving.',
      'Switch to "Preview" to inspect real lead rendering, then configure Schedule and Options (rotation, plain text, stopOnDomainReply).',
    ],
    tipEs:
      'Combina Spintax + Modo Texto Plano + "Detener si alguien del mismo dominio responde" para lograr máxima llegada a Bandeja Principal y evitar incomodar a una misma empresa.',
    tipEn:
      'Combine Spintax + Plain Text Mode + "Stop on domain reply" for peak Primary Inbox placement and clean account-based outreach.',
  },
  {
    id: 'unibox',
    stepNumber: 5,
    targetTab: 'unibox',
    icon: Inbox,
    accentColor: 'text-[#14213D] bg-[#D5ECD4] border-[#C3DAC3]',
    shortLabelEs: 'Unibox IMAP/IA',
    shortLabelEn: 'Unibox IMAP/AI',
    titleEs: 'Buzón Unificado (Unibox): Lectura IMAP y Clasificación IA de Respuestas',
    titleEn: 'Unified Inbox (Unibox): IMAP Sync & AI Reply Classification',
    badgeEs: 'Respuestas Centralizadas',
    badgeEn: 'Centralized Replies',
    whatItDoesEs:
      'Centraliza todas las conversaciones de tus múltiples buzones en un solo lugar mediante lectura IMAP real, filtra automáticamente correos de warmup y clasifica cada respuesta con IA (Interesado, Reunión Agendada, No Interesado, Fuera de Oficina).',
    whatItDoesEn:
      'Unify all replies across dozens of connected mailboxes via real IMAP sync, automatically filter out warmup traffic, and classify every thread with AI sentiment (Interested, Meeting Booked, Not Interested, Out of Office).',
    stepsEs: [
      'Pulsa "Sincronizar IMAP" para descargar respuestas recientes y actualizar automáticamente rebotes o respuestas en tus campañas.',
      'Filtra a la izquierda por "Interesado" o "Reunión Agendada" para atender primero los tratos con intención de compra.',
      'Usa "Sugerir Respuesta con IA", responde en el mismo hilo o promueve el contacto directamente al CRM.',
    ],
    stepsEn: [
      'Click "Sync IMAP" to pull incoming replies and auto-sync reply/bounce statuses across your active campaigns.',
      'Filter by "Interested" or "Meeting Booked" on the left panel to prioritize high-intent prospects first.',
      'Use AI reply suggestions, respond right inside the thread, or promote the contact straight to your CRM.',
    ],
    tipEs:
      'Responder dentro de los primeros 15 minutos a un prospecto etiquetado como "Interesado" multiplica hasta 3x la probabilidad de cerrar una reunión.',
    tipEn:
      'Replying within 15 minutes to an "Interested" lead increases your meeting-booking conversion rate by up to 3x.',
  },
  {
    id: 'crm',
    stepNumber: 6,
    targetTab: 'crm',
    isProOnly: true,
    icon: Kanban,
    accentColor: 'text-[#14213D] bg-[#EEF3F0] border-[#DCE3DF]',
    shortLabelEs: 'CRM Kanban',
    shortLabelEn: 'CRM Kanban',
    titleEs: 'Pipeline CRM Kanban: Oportunidades con Drag & Drop',
    titleEn: 'Kanban CRM Pipeline: Drag & Drop Opportunities',
    badgeEs: 'Modo Pro • Dealflow',
    badgeEn: 'Pro Mode • Dealflow',
    whatItDoesEs:
      'Convierte las respuestas positivas de prospección en un tablero visual de ventas. Calcula el valor total del pipeline en tiempo real, detecta tratos inactivos que requieren seguimiento y permite mover oportunidades con Drag & Drop.',
    whatItDoesEn:
      'Turn positive cold email replies into a visual revenue pipeline. Tracks total projected deal value in real time, flags stale deals needing follow-up, and lets you move opportunities across stages with Drag & Drop.',
    stepsEs: [
      'Promueve hilos calificados desde Unibox o crea oportunidades con "Añadir Trato Manualmente" asignando su valor estimado.',
      'Arrastra y suelta las tarjetas entre columnas: Respuesta Positiva → Demo Agendada → Propuesta Enviada → Cerrada Ganada.',
      'Revisa las alertas rojas de días inactivos para reactivar negociaciones antes de que se enfríen.',
    ],
    stepsEn: [
      'Promote qualified threads from Unibox or click "Add Deal Manually" with an estimated deal value.',
      'Drag and drop deal cards across stages: Positive Reply → Demo Scheduled → Proposal Sent → Closed Won.',
      'Watch inactivity alerts to follow up on stalled deals before momentum fades.',
    ],
    tipEs:
      'Mantén tu proyección de ingresos honesta moviendo a "Cerrada Perdida" los tratos sin avance luego de 3 seguimientos, enfocando energía en oportunidades activas.',
    tipEn:
      'Keep pipeline revenue forecasts accurate by moving unresponsive opportunities to Closed Lost after 3 follow-ups and focusing on active deals.',
  },
  {
    id: 'billing',
    stepNumber: 7,
    targetTab: 'billing',
    icon: CreditCard,
    accentColor: 'text-[#14213D] bg-[#D5ECD4] border-[#C3DAC3]',
    shortLabelEs: 'Planes y Pagos',
    shortLabelEn: 'Plans & Billing',
    titleEs: 'Planes SaaS y Pasarela de Pagos (MercadoPago ARS + Internacional USD)',
    titleEn: 'SaaS Plans & Payment Gateways (MercadoPago ARS + International USD)',
    badgeEs: 'Suscripción & Escalado',
    badgeEn: 'Billing & Scale',
    whatItDoesEs:
      'Supervisa el consumo real de casillas, leads y créditos de tu Workspace frente a los planes Starter, Growth y Agency. Soporta cobros en pesos argentinos (ARS al tipo de cambio MEP en vivo) vía MercadoPago y pagos globales en USD mediante Lemon Squeezy y Stripe.',
    whatItDoesEn:
      'Track real-time mailbox, lead, and credit consumption for your Workspace across Starter, Growth, and Agency plans. Supports Argentine Pesos (ARS at live MEP exchange rate) via MercadoPago plus global USD checkout via Lemon Squeezy and Stripe.',
    stepsEs: [
      'Consulta tus medidores de uso en tiempo real y los días restantes de tu prueba gratis de 7 días.',
      'Elige ciclo Mensual o Anual (-15%) y selecciona MercadoPago (ARS), Lemon Squeezy (USD) o Stripe (USD).',
      'Confirma tu suscripción para desbloquear al instante los cupos completos de casillas, leads y créditos del plan.',
    ],
    stepsEn: [
      'Review live usage meters for connected mailboxes, active leads, and your remaining 7-day trial period.',
      'Switch between Monthly and Annual (-15%) billing and pick MercadoPago (ARS), Lemon Squeezy (USD), or Stripe (USD).',
      'Confirm your subscription to immediately unlock full mailbox, lead, and verification credit limits for your plan.',
    ],
    tipEs:
      'Escalar al plan Growth (10 casillas) o Agency (casillas y workspaces multi-cliente ilimitados) con facturación anual reduce 15% el costo operativo por dominio.',
    tipEn:
      'Upgrading to Growth (10 mailboxes) or Agency (unlimited mailboxes & multi-client workspaces) on annual billing cuts your per-domain outbound cost by 15%.',
  },
];

export default function GuidedTourModal({
  isOpen,
  onClose,
  onNavigateTab,
}: GuidedTourModalProps) {
  const { language } = useLanguage();
  const { mode, setMode } = useViewMode();
  const isEs = language === 'es';

  const [currentStep, setCurrentStep] = useState(0);
  const onNavigateTabRef = useRef(onNavigateTab);

  useEffect(() => {
    onNavigateTabRef.current = onNavigateTab;
  }, [onNavigateTab]);

  const handleClose = useCallback(() => {
    setCurrentStep(0);
    onClose();
  }, [onClose]);

  const goToStep = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(TOUR_STATIONS.length - 1, index));
    setCurrentStep(clamped);
    onNavigateTabRef.current(TOUR_STATIONS[clamped].targetTab);
  }, []);

  // Sync first station's live tab only when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      onNavigateTabRef.current(TOUR_STATIONS[0].targetTab);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Keyboard navigation: ArrowRight, ArrowLeft, Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleClose();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (currentStep < TOUR_STATIONS.length - 1) {
          goToStep(currentStep + 1);
        }
      } else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (currentStep > 0) {
          goToStep(currentStep - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep, goToStep, handleClose]);

  if (!isOpen) return null;

  const station = TOUR_STATIONS[currentStep];
  const StationIcon = station.icon;
  const progressPct = Math.round(((currentStep + 1) / TOUR_STATIONS.length) * 100);
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STATIONS.length - 1;
  const needsProSwitch = Boolean(station.isProOnly && mode === 'simple');

  const handleUseModuleNow = () => {
    if (needsProSwitch) {
      setMode('pro');
    }
    onNavigateTab(station.targetTab);
    handleClose();
  };

  return (
    <div
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={isEs ? 'Tour Guiado Interactivo de MiSender' : 'MiSender Interactive Guided Tour'}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#DCE3DF] text-[#14213D] rounded-2xl w-full max-w-4xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Top Header + Progress Bar */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-[#DCE3DF] bg-[#F4F7F5] space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#D5ECD4] border border-[#C3DAC3] flex items-center justify-center text-[#14213D] shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-[#14213D] truncate">
                    {isEs ? 'Tour Guiado Interactivo — MiSender' : 'Interactive Guided Tour — MiSender'}
                  </h2>
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3] font-mono tabular-nums shrink-0">
                    {isEs
                      ? `Estación ${currentStep + 1} / ${TOUR_STATIONS.length}`
                      : `Station ${currentStep + 1} / ${TOUR_STATIONS.length}`}
                  </span>
                </div>
                <p className="text-[11px] text-[#5C6F68] truncate">
                  {isEs
                    ? 'Navega por cada estación para ver el módulo en vivo detrás del recorrido.'
                    : 'Step through each station to preview the live module behind the tour.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono tabular-nums font-bold text-[#14213D] bg-[#EEF3F0] border border-[#DCE3DF] px-2.5 py-1 rounded-lg">
                {progressPct}%
              </span>
              <button
                type="button"
                onClick={handleClose}
                aria-label={isEs ? 'Cerrar tour' : 'Close tour'}
                className="p-1.5 rounded-lg text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Visual Progress Bar */}
          <div className="w-full h-1.5 bg-[#EEF3F0] border border-[#DCE3DF] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isLast ? 'bg-[#5C6F68]' : 'bg-[#14213D]'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Body: Clickable Station Sidebar + Active Station Detail */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Station List Sidebar */}
          <aside className="md:w-64 shrink-0 bg-[#F4F7F5] border-b md:border-b-0 md:border-r border-[#DCE3DF] p-3 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-1.5">
            <div className="hidden md:flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5C6F68]">
              <span>{isEs ? 'Estaciones del Recorrido' : 'Tour Stations'}</span>
              <span className="font-mono tabular-nums">
                {currentStep + 1}/{TOUR_STATIONS.length}
              </span>
            </div>

            {TOUR_STATIONS.map((item, idx) => {
              const Icon = item.icon;
              const isActive = idx === currentStep;
              const isVisited = idx < currentStep;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToStep(idx)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition cursor-pointer shrink-0 md:w-full ${
                    isActive
                      ? 'bg-[#D5ECD4]/65 border border-[#C3DAC3] text-[#14213D]'
                      : 'border border-transparent text-[#5C6F68] hover:text-[#14213D] hover:bg-[#EEF3F0]'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-mono tabular-nums font-bold shrink-0 ${
                      isActive
                        ? 'bg-[#14213D] text-white'
                        : isVisited
                          ? 'bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]'
                          : 'bg-white border border-[#DCE3DF] text-[#5C6F68]'
                    }`}
                  >
                    {isVisited ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <span>{item.stepNumber}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Icon
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isActive ? 'text-[#14213D]' : 'text-[#5C6F68]'
                        }`}
                      />
                      <span className="text-xs font-semibold truncate">
                        {isEs ? item.shortLabelEs : item.shortLabelEn}
                      </span>
                    </div>
                  </div>

                  {item.isProOnly && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-lg bg-[#14213D] text-white shrink-0">
                      PRO
                    </span>
                  )}
                </button>
              );
            })}
          </aside>

          {/* Main Station Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-white">
            {/* Station Title Header */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border ${station.accentColor}`}
                >
                  <StationIcon className="w-3.5 h-3.5" />
                  <span>{isEs ? station.badgeEs : station.badgeEn}</span>
                </span>
                <span className="text-[10px] font-mono text-[#5C6F68] bg-[#EEF3F0] border border-[#DCE3DF] px-2 py-1 rounded-lg">
                  {isEs ? 'Vista activa:' : 'Active tab:'} {station.targetTab}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-[#14213D] leading-snug">
                {isEs ? station.titleEs : station.titleEn}
              </h3>
            </div>

            {/* Pro Mode Notice when user is currently in Simple Mode */}
            {needsProSwitch && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#EEF3F0] border border-[#C3DAC3] text-xs">
                <div className="flex items-start gap-2.5 text-[#14213D]">
                  <Sliders className="w-4 h-4 text-[#14213D] shrink-0 mt-0.5" />
                  <span className="text-[#5C6F68]">
                    {isEs
                      ? 'Esta estación pertenece al Modo Pro. Al hacer clic en "Ir a usar este módulo ahora" activaremos Modo Pro automáticamente (puedes volver a Simple cuando quieras).'
                      : 'This station belongs to Pro Mode. Clicking "Go use this module now" will switch to Pro Mode automatically (you can switch back anytime).'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMode('pro')}
                  className="px-3 py-1.5 rounded-lg bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold text-[11px] transition cursor-pointer shrink-0"
                >
                  {isEs ? 'Activar Modo Pro' : 'Enable Pro Mode'}
                </button>
              </div>
            )}

            {/* What this module does */}
            <div className="p-4 rounded-xl bg-[#F4F7F5] border border-[#DCE3DF] space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#14213D]">
                {isEs ? '¿Qué hace este módulo?' : 'What does this module do?'}
              </div>
              <p className="text-xs sm:text-sm text-[#14213D]/90 leading-relaxed">
                {isEs ? station.whatItDoesEs : station.whatItDoesEn}
              </p>
            </div>

            {/* Step-by-step usage */}
            <div className="p-4 rounded-xl bg-[#F4F7F5] border border-[#DCE3DF] space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5C6F68]">
                <ListChecks className="w-4 h-4" />
                <span>{isEs ? 'Cómo usarlo paso a paso' : 'How to use it step-by-step'}</span>
              </div>

              <ol className="space-y-2.5">
                {(isEs ? station.stepsEs : station.stepsEn).map((stepText, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-xs sm:text-[13px] text-[#5C6F68] leading-relaxed"
                  >
                    <span className="w-5 h-5 rounded-lg bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] font-mono tabular-nums font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="text-[#14213D]">{stepText}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Expert Tip */}
            <div className="p-4 rounded-xl bg-[#EEF3F0] border border-[#C3DAC3] flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#D5ECD4] border border-[#C3DAC3] flex items-center justify-center shrink-0">
                <Lightbulb className="w-4 h-4 text-[#14213D]" />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#14213D]">
                  {isEs
                    ? 'Tip Experto de Entregabilidad y Conversión'
                    : 'Expert Deliverability & Conversion Tip'}
                </div>
                <p className="text-xs text-[#5C6F68] leading-relaxed">
                  {isEs ? station.tipEs : station.tipEn}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Controls */}
        <div className="px-5 sm:px-6 py-4 border-t border-[#DCE3DF] bg-[#F4F7F5] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => goToStep(currentStep - 1)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-[#EEF3F0] disabled:opacity-40 disabled:pointer-events-none border border-[#DCE3DF] text-xs font-semibold text-[#14213D] transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{isEs ? 'Anterior' : 'Previous'}</span>
            </button>

            <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] text-[#5C6F68] font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#DCE3DF] text-[#14213D]">
                ←
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#DCE3DF] text-[#14213D]">
                →
              </kbd>
              <span>{isEs ? 'Navegar' : 'Navigate'}</span>
              <span>•</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#DCE3DF] text-[#14213D]">
                ESC
              </kbd>
              <span>{isEs ? 'Cerrar' : 'Close'}</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={handleUseModuleNow}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#D5ECD4] hover:bg-[#C3DAC3] border border-[#C3DAC3] text-[#14213D] text-xs font-bold transition cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{isEs ? 'Ir a usar este módulo ahora' : 'Go use this module now'}</span>
            </button>

            {!isLast ? (
              <button
                type="button"
                onClick={() => goToStep(currentStep + 1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#14213D] hover:bg-[#1E3158] text-white text-xs font-bold shadow-sm transition cursor-pointer"
              >
                <span>{isEs ? 'Siguiente' : 'Next'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#14213D] hover:bg-[#1E3158] text-white text-xs font-bold shadow-sm transition cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isEs ? 'Finalizar Tour' : 'Finish Tour'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
