'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Check,
  Sparkles,
  Server,
  Users,
  Zap,
  Globe,
  ShieldCheck,
  Clock,
  Building2,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Repeat,
  Settings2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useFeedback } from '@/context/FeedbackContext';
import {
  BillingCycle,
  BillingProvider,
  SAAS_PLANS,
  WorkspacePlan,
  normalizePlan,
  normalizeRole,
} from '@/types';

interface PlanFeatureMeta {
  id: WorkspacePlan;
  taglineEs: string;
  taglineEn: string;
  popular?: boolean;
  featuresEs: string[];
  featuresEn: string[];
}

interface GatewayConfigState {
  usdToArsRate: number;
  rateSource: string;
  mercadopagoConfigured: boolean;
  lemonsqueezyConfigured: boolean;
  stripeConfigured: boolean;
  webhookUrl: string;
}

const PLAN_DETAILS: PlanFeatureMeta[] = [
  {
    id: 'starter',
    taglineEs: 'Ideal para fundadores y primeros envíos outbound',
    taglineEn: 'Ideal for founders launching initial outbound outreach',
    featuresEs: [
      'Hasta 3 casillas conectadas (SMTP / OAuth)',
      '1,000 leads activos en secuencias',
      '1,000 créditos de verificación DNS/MX',
      'Rotación básica e informes de campañas',
    ],
    featuresEn: [
      'Up to 3 connected mailboxes (SMTP / OAuth)',
      '1,000 active leads in sequences',
      '1,000 email & DNS/MX verification credits',
      'Basic inbox rotation & campaign analytics',
    ],
  },
  {
    id: 'growth',
    taglineEs: 'Motor completo con IA, Warmup P2P y CRM integrado',
    taglineEn: 'Full outbound engine with AI, P2P Warmup & built-in CRM',
    popular: true,
    featuresEs: [
      'Hasta 10 casillas conectadas con rotación',
      '10,000 leads activos y variables dinámicas',
      '2,500 créditos de verificación incluidos',
      'Unibox con análisis de sentimiento IA',
      'CRM Kanban Dealflow y Red Warmup P2P',
    ],
    featuresEn: [
      'Up to 10 connected mailboxes with rotation',
      '10,000 active leads & custom variables',
      '2,500 verification credits included',
      'Unibox with AI reply sentiment classification',
      'Kanban CRM Dealflow & P2P Warmup Network',
    ],
  },
  {
    id: 'agency',
    taglineEs: 'Escala ilimitada para agencias y equipos comerciales',
    taglineEn: 'Unlimited scale for agencies and multi-client teams',
    featuresEs: [
      'Casillas ilimitadas (pool 999+ buzones)',
      '50,000 leads activos y alto volumen',
      '15,000 créditos de verificación incluidos',
      'Multi-Workspace ilimitado por cliente',
      'Webhooks en tiempo real, API y soporte prioritario',
    ],
    featuresEn: [
      'Unlimited mailboxes (999+ pool capacity)',
      '50,000 active leads & high-volume dispatch',
      '15,000 verification credits included',
      'Unlimited multi-workspace client isolation',
      'Real-time Webhooks, API & priority support',
    ],
  },
];

function computeDaysRemaining(trialEndsAt?: string): number | null {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getProviderDisplayName(
  provider: string | undefined,
  isSuperAdmin: boolean,
  isEs: boolean
): string {
  switch (provider) {
    case 'mercadopago':
      return 'MercadoPago (ARS)';
    case 'lemonsqueezy':
      return 'Lemon Squeezy (USD)';
    case 'stripe':
      return isEs ? 'Stripe Internacional (USD)' : 'Stripe International (USD)';
    default:
      if (isSuperAdmin) return 'Sandbox / Trial';
      return isEs ? 'Periodo de Prueba' : 'Free Trial';
  }
}

export default function BillingView() {
  const { user, currentWorkspace, workspaces, refreshWorkspaces, openAuthModal } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useFeedback();
  const isEs = language === 'es';
  const locale = isEs ? 'es-AR' : 'en-US';

  const userRole = normalizeRole(user?.role);
  const isSuperAdmin = userRole === 'super_admin';

  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [provider, setProvider] = useState<BillingProvider>('mercadopago');
  const [mpRecurring, setMpRecurring] = useState<boolean>(false);
  const [accountsCount, setAccountsCount] = useState<number>(0);
  const [leadsCount, setLeadsCount] = useState<number>(0);
  const [loadingUsage, setLoadingUsage] = useState<boolean>(true);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [processingPlan, setProcessingPlan] = useState<WorkspacePlan | null>(null);
  const [simulatingWebhook, setSimulatingWebhook] = useState<boolean>(false);
  const [isSetupOpen, setIsSetupOpen] = useState<boolean>(false);
  const [copiedWebhook, setCopiedWebhook] = useState<boolean>(false);
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfigState>({
    usdToArsRate: 1200,
    rateSource: 'fallback',
    mercadopagoConfigured: false,
    lemonsqueezyConfigured: false,
    stripeConfigured: false,
    webhookUrl: '/api/billing/webhook',
  });
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!isSuperAdmin && provider !== 'mercadopago') {
      return;
    }

    let active = true;
    const loadGatewayConfig = async () => {
      try {
        const res = await fetch('/api/billing/checkout', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<GatewayConfigState>;
        if (!active) return;

        const fallbackWebhookUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}/api/billing/webhook`
            : '/api/billing/webhook';

        setGatewayConfig((prev) => ({
          usdToArsRate:
            Number(data.usdToArsRate) > 0 ? Number(data.usdToArsRate) : prev.usdToArsRate,
          rateSource:
            typeof data.rateSource === 'string' ? data.rateSource : prev.rateSource,
          mercadopagoConfigured: isSuperAdmin ? Boolean(data.mercadopagoConfigured) : false,
          lemonsqueezyConfigured: isSuperAdmin ? Boolean(data.lemonsqueezyConfigured) : false,
          stripeConfigured: isSuperAdmin ? Boolean(data.stripeConfigured) : false,
          webhookUrl: isSuperAdmin
            ? typeof data.webhookUrl === 'string' && data.webhookUrl
              ? data.webhookUrl
              : fallbackWebhookUrl
            : prev.webhookUrl,
        }));
      } catch {
        if (!active || !isSuperAdmin) return;
        if (typeof window !== 'undefined') {
          setGatewayConfig((prev) => ({
            ...prev,
            webhookUrl: `${window.location.origin}/api/billing/webhook`,
          }));
        }
      }
    };

    void loadGatewayConfig();
    return () => {
      active = false;
    };
  }, [isSuperAdmin, provider]);

  useEffect(() => {
    let active = true;
    const loadUsageMetrics = async () => {
      try {
        const wsQuery = encodeURIComponent(currentWorkspace.id);
        const [accRes, leadsRes] = await Promise.all([
          fetch(`/api/accounts?workspaceId=${wsQuery}`),
          fetch(`/api/leads?workspaceId=${wsQuery}`),
        ]);
        const accData = await accRes.json().catch(() => []);
        const leadsData = await leadsRes.json().catch(() => []);

        if (!active) return;
        if (Array.isArray(accData)) setAccountsCount(accData.length);
        if (Array.isArray(leadsData)) setLeadsCount(leadsData.length);
        setDaysLeft(computeDaysRemaining(currentWorkspace.trialEndsAt));
      } catch {
        // Keep fallback gracefully
      } finally {
        if (active) setLoadingUsage(false);
      }
    };

    void loadUsageMetrics();
    return () => {
      active = false;
    };
  }, [currentWorkspace.id, currentWorkspace.trialEndsAt]);

  const activePlanId = normalizePlan(currentWorkspace.plan);
  const activePlanConfig = SAAS_PLANS[activePlanId];
  const maxAccounts = currentWorkspace.maxAccounts ?? activePlanConfig.maxAccounts;
  const maxLeads = currentWorkspace.maxLeads ?? activePlanConfig.maxLeads;
  const credits = currentWorkspace.credits ?? activePlanConfig.credits;
  const subStatus = currentWorkspace.subscriptionStatus || 'trialing';

  const accountsPct =
    maxAccounts >= 999
      ? Math.min(100, Math.round((accountsCount / 50) * 100))
      : Math.min(100, Math.round((accountsCount / Math.max(1, maxAccounts)) * 100));
  const leadsPct = Math.min(100, Math.round((leadsCount / Math.max(1, maxLeads)) * 100));

  const rateSourceLabel = (() => {
    if (gatewayConfig.rateSource === 'dolarapi-mep') {
      return isEs ? 'Dólar MEP en vivo' : 'Live MEP Rate';
    }
    if (gatewayConfig.rateSource === 'env') {
      return isEs ? 'Tarifa configurada' : 'Configured Rate';
    }
    return isEs ? 'Referencia base' : 'Reference Rate';
  })();

  const handleCheckout = async (planId: WorkspacePlan) => {
    setProcessingPlan(planId);
    setFeedback(null);

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          planId,
          billingCycle,
          provider,
          recurring: provider === 'mercadopago' ? mpRecurring : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg =
          data?.error || (isEs ? 'Error al procesar el cambio de plan' : 'Checkout failed');
        setFeedback({ type: 'error', text: msg });
        showToast(msg, 'error');
        return;
      }

      if (data.url) {
        window.location.assign(data.url);
        return;
      }

      await refreshWorkspaces();
      const planLabel = SAAS_PLANS[planId].name;
      const providerLabel = getProviderDisplayName(provider, isSuperAdmin, isEs);
      const successText = isSuperAdmin
        ? isEs
          ? `Workspace "${currentWorkspace.name}" actualizado al plan ${planLabel} (${providerLabel} • Sandbox activo).`
          : `Workspace "${currentWorkspace.name}" upgraded to ${planLabel} plan (${providerLabel} • Sandbox active).`
        : isEs
          ? `Workspace "${currentWorkspace.name}" actualizado al plan ${planLabel} (${providerLabel}).`
          : `Workspace "${currentWorkspace.name}" upgraded to ${planLabel} plan (${providerLabel}).`;
      setFeedback({ type: 'success', text: successText });
      showToast(successText, 'success');
    } catch (err: unknown) {
      const errText =
        err instanceof Error
          ? err.message
          : isEs
            ? 'Error de red en facturación'
            : 'Billing network error';
      setFeedback({ type: 'error', text: errText });
      showToast(errText, 'error');
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleCopyWebhookUrl = async () => {
    if (!isSuperAdmin) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(gatewayConfig.webhookUrl);
      }
      setCopiedWebhook(true);
      showToast(
        isEs ? 'Webhook URL copiada al portapapeles' : 'Webhook URL copied to clipboard',
        'success'
      );
      setTimeout(() => setCopiedWebhook(false), 2200);
    } catch {
      const errText = isEs ? 'No se pudo copiar al portapapeles' : 'Could not copy webhook URL';
      setFeedback({ type: 'error', text: errText });
      showToast(errText, 'error');
    }
  };

  const handleSimulateWebhook = async () => {
    if (!isSuperAdmin) return;

    setSimulatingWebhook(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/billing/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment',
          external_reference: `${currentWorkspace.id}:agency:monthly`,
          status: 'approved',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.handled) {
        const msg =
          data?.error ||
          data?.message ||
          (isEs ? 'No se pudo simular el webhook de pago' : 'Webhook simulation failed');
        setFeedback({ type: 'error', text: msg });
        showToast(msg, 'error');
        return;
      }

      await refreshWorkspaces();
      const successMsg = isEs
        ? `Webhook MercadoPago aprobado simulado para "${currentWorkspace.name}": Plan Agency activado en vivo.`
        : `Simulated approved MercadoPago webhook for "${currentWorkspace.name}": Agency plan activated live.`;
      setFeedback({ type: 'success', text: successMsg });
      showToast(successMsg, 'success');
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : isEs
            ? 'Error al simular webhook'
            : 'Webhook simulation error';
      setFeedback({ type: 'error', text: errMsg });
      showToast(errMsg, 'error');
    } finally {
      setSimulatingWebhook(false);
    }
  };

  const formatPrice = (monthlyUsd: number): string => {
    if (billingCycle === 'monthly') return `$${monthlyUsd}`;
    const discounted = Number((monthlyUsd * 0.8).toFixed(2));
    return Number.isInteger(discounted) ? `$${discounted}` : `$${discounted.toFixed(2)}`;
  };

  const statusBadge = (() => {
    if (subStatus === 'active') {
      return {
        label: isEs ? 'Suscripción Activa' : 'Active Subscription',
        classes: 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]',
      };
    }
    if (subStatus === 'past_due') {
      return {
        label: isEs ? 'Pago Pendiente' : 'Past Due',
        classes: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    }
    if (subStatus === 'canceled') {
      return {
        label: isEs ? 'Cancelada' : 'Canceled',
        classes: 'bg-[#EEF3F0] text-[#5C6F68] border-[#DCE3DF]',
      };
    }
    return {
      label:
        daysLeft !== null
          ? isEs
            ? `Prueba Gratis • ${daysLeft}d restantes`
            : `Free Trial • ${daysLeft}d left`
          : isEs
            ? 'Prueba Gratis (7 días)'
            : '7-Day Free Trial',
      classes: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  })();

  const configuredCount = [
    gatewayConfig.mercadopagoConfigured,
    gatewayConfig.lemonsqueezyConfigured,
    gatewayConfig.stripeConfigured,
  ].filter(Boolean).length;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F4F7F5] text-[#14213D] p-6 lg:p-8 space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header & Active Workspace Plan Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#DCE3DF] pb-5">
          <div>
            <h1 className="text-lg font-bold text-[#14213D] flex items-center gap-2.5 tracking-tight">
              <CreditCard className="w-5 h-5 text-[#14213D]" />
              <span>{isEs ? 'Facturación, Planes y Límites SaaS' : 'Billing, Plans & SaaS Limits'}</span>
            </h1>
            <p className="text-xs text-[#5C6F68] mt-1">
              {isEs
                ? 'Gestiona tu suscripción, consumo de casillas y capacidad de prospección por Workspace.'
                : 'Manage your subscription, mailbox consumption, and outbound capacity per Workspace.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-white border border-[#DCE3DF] shadow-sm px-3 py-1.5 rounded-lg text-xs">
              <Building2 className="w-3.5 h-3.5 text-[#14213D]" />
              <span className="text-[#14213D] font-semibold">{currentWorkspace.name}</span>
              <span className="text-[#A1B0AB]">/</span>
              <span className="bg-[#D5ECD4] text-[#14213D] px-1.5 py-0.5 rounded font-bold text-[11px]">
                {activePlanConfig.name}
              </span>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border font-mono tabular-nums ${statusBadge.classes}`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{statusBadge.label}</span>
            </span>

            <button
              type="button"
              onClick={() => openAuthModal('workspace')}
              className="flex items-center gap-1.5 bg-white hover:bg-[#EEF3F0] border border-[#DCE3DF] text-[#14213D] shadow-sm px-3 py-1.5 rounded-lg text-xs font-semibold font-mono tabular-nums transition cursor-pointer"
            >
              <span>{`+ Workspace (${workspaces.length})`}</span>
            </button>
          </div>
        </div>

        {/* Inline Feedback Banner */}
        {feedback && (
          <div
            className={`flex items-center gap-3 p-4 rounded-xl border text-xs font-medium ${
              feedback.type === 'success'
                ? 'bg-[#D5ECD4] border-[#C3DAC3] text-[#14213D]'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#14213D] shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Real Usage Meters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Mailboxes Usage */}
          <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#5C6F68]">
                <Server className="w-4 h-4 text-[#14213D]" />
                <span>{isEs ? 'Casillas Conectadas' : 'Connected Mailboxes'}</span>
              </div>
              <span className="text-xs font-mono tabular-nums font-bold text-[#14213D]">
                {loadingUsage ? '...' : accountsCount} / {maxAccounts >= 999 ? '∞' : maxAccounts}
              </span>
            </div>
            <div className="w-full h-2 bg-[#EEF3F0] border border-[#DCE3DF] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  accountsPct >= 85 ? 'bg-amber-500' : 'bg-[#14213D]'
                }`}
                style={{ width: `${Math.max(accountsCount > 0 ? 6 : 0, accountsPct)}%` }}
              />
            </div>
            <div className="text-[11px] text-[#5C6F68] font-mono tabular-nums">
              {maxAccounts >= 999
                ? isEs
                  ? 'Capacidad ilimitada en plan Agency'
                  : 'Unlimited capacity on Agency plan'
                : isEs
                  ? `${Math.max(0, maxAccounts - accountsCount)} cupos disponibles en tu plan`
                  : `${Math.max(0, maxAccounts - accountsCount)} mailbox slots remaining`}
            </div>
          </div>

          {/* Leads Usage */}
          <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#5C6F68]">
                <Users className="w-4 h-4 text-[#14213D]" />
                <span>{isEs ? 'Leads Activos' : 'Active Leads'}</span>
              </div>
              <span className="text-xs font-mono tabular-nums font-bold text-[#14213D]">
                {loadingUsage ? '...' : leadsCount.toLocaleString()} / {maxLeads.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-[#EEF3F0] border border-[#DCE3DF] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  leadsPct >= 85 ? 'bg-amber-500' : 'bg-[#5C6F68]'
                }`}
                style={{ width: `${Math.max(leadsCount > 0 ? 4 : 0, leadsPct)}%` }}
              />
            </div>
            <div className="text-[11px] text-[#5C6F68] font-mono tabular-nums">
              {isEs
                ? `${leadsPct}% de tu cuota mensual utilizada`
                : `${leadsPct}% of monthly lead capacity used`}
            </div>
          </div>

          {/* Credits Balance */}
          <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#5C6F68]">
                <Zap className="w-4 h-4 text-[#14213D]" />
                <span>{isEs ? 'Créditos Verificados' : 'Verification Credits'}</span>
              </div>
              <span className="text-xs font-mono tabular-nums font-bold text-emerald-700">
                {credits.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-[#EEF3F0] border border-[#DCE3DF] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[#14213D]" style={{ width: '100%' }} />
            </div>
            <div className="text-[11px] text-[#5C6F68]">
              {isEs
                ? `Proveedor activo: ${getProviderDisplayName(currentWorkspace.billingProvider, isSuperAdmin, isEs)}`
                : `Active provider: ${getProviderDisplayName(currentWorkspace.billingProvider, isSuperAdmin, isEs)}`}
            </div>
          </div>
        </div>

        {/* Billing Controls: Cycle Toggle + 3-Gateway Selector + MercadoPago ARS/Recurring Bar */}
        <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-4 space-y-4">
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
            {/* Monthly vs Annual (20% Off) */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#5C6F68]">
                {isEs ? 'Ciclo de facturación:' : 'Billing cycle:'}
              </span>
              <div className="flex items-center bg-[#EEF3F0] border border-[#DCE3DF] rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    billingCycle === 'monthly'
                      ? 'bg-[#14213D] text-white'
                      : 'text-[#5C6F68] hover:text-[#14213D]'
                  }`}
                >
                  {isEs ? 'Mensual' : 'Monthly'}
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    billingCycle === 'annual'
                      ? 'bg-[#14213D] text-white'
                      : 'text-[#5C6F68] hover:text-[#14213D]'
                  }`}
                >
                  <span>{isEs ? 'Anual' : 'Annual'}</span>
                  <span
                    className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-lg border ${
                      billingCycle === 'annual'
                        ? 'bg-white/15 text-[#D5ECD4] border-white/25'
                        : 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
                    }`}
                  >
                    -20%
                  </span>
                </button>
              </div>
            </div>

            {/* 3-Gateway Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#5C6F68] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#14213D]" />
                <span>{isEs ? 'Pasarela:' : 'Payment Gateway:'}</span>
              </span>

              <button
                type="button"
                onClick={() => setProvider('mercadopago')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
                  provider === 'mercadopago'
                    ? 'bg-[#D5ECD4] border-[#14213D] text-[#14213D]'
                    : 'bg-[#F4F7F5] border-[#DCE3DF] text-[#5C6F68] hover:text-[#14213D] hover:border-[#A1B0AB]'
                }`}
              >
                <span className="font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#DCE3DF] text-[#14213D]">
                  ARS
                </span>
                <span>
                  {isEs
                    ? 'MercadoPago (Saldo MP, Débito, Crédito)'
                    : 'MercadoPago (MP Wallet, Debit, Credit)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setProvider('lemonsqueezy')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
                  provider === 'lemonsqueezy'
                    ? 'bg-[#D5ECD4] border-[#14213D] text-[#14213D]'
                    : 'bg-[#F4F7F5] border-[#DCE3DF] text-[#5C6F68] hover:text-[#14213D] hover:border-[#A1B0AB]'
                }`}
              >
                <span className="font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#DCE3DF] text-amber-700">
                  USD
                </span>
                <span>
                  {isEs
                    ? 'Lemon Squeezy (Global sin LLC)'
                    : 'Lemon Squeezy (Global Merchant of Record)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setProvider('stripe')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
                  provider === 'stripe'
                    ? 'bg-[#D5ECD4] border-[#14213D] text-[#14213D]'
                    : 'bg-[#F4F7F5] border-[#DCE3DF] text-[#5C6F68] hover:text-[#14213D] hover:border-[#A1B0AB]'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 text-[#5C6F68]" />
                <span className="font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#DCE3DF] text-[#14213D]">
                  USD
                </span>
                <span>
                  {isEs ? 'Stripe Internacional' : 'Stripe International'}
                </span>
              </button>
            </div>
          </div>

          {/* MercadoPago Live Exchange Rate & Recurring Preapproval Toggle */}
          {provider === 'mercadopago' && (
            <div className="pt-3 border-t border-[#DCE3DF] flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center flex-wrap gap-2 text-xs text-[#5C6F68] bg-[#F4F7F5] border border-[#DCE3DF] px-3 py-2 rounded-lg">
                <span className="font-semibold text-[#14213D]">
                  {isEs ? 'Tipo de cambio USD → ARS:' : 'USD → ARS Exchange Rate:'}
                </span>
                <span className="font-mono tabular-nums font-bold text-[#14213D]">
                  1 USD = ARS ${gatewayConfig.usdToArsRate.toLocaleString(locale)}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3] font-semibold">
                  {rateSourceLabel}
                </span>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[#14213D] bg-[#F4F7F5] border border-[#DCE3DF] px-3.5 py-2 rounded-lg cursor-pointer hover:border-[#14213D] transition select-none">
                <input
                  type="checkbox"
                  checked={mpRecurring}
                  onChange={(e) => setMpRecurring(e.target.checked)}
                  className="w-4 h-4 rounded border-[#A1B0AB] bg-white accent-[#14213D] cursor-pointer"
                />
                <Repeat className="w-3.5 h-3.5 text-[#14213D] shrink-0" />
                <span className="font-medium">
                  {isEs
                    ? 'Adherir a débito automático mensual (/preapproval)'
                    : 'Subscribe to automatic monthly debit (/preapproval)'}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {PLAN_DETAILS.map((meta) => {
            const cfg = SAAS_PLANS[meta.id];
            const isCurrent = activePlanId === meta.id && subStatus === 'active';
            const isTrialingThis = activePlanId === meta.id && subStatus === 'trialing';
            const features = isEs ? meta.featuresEs : meta.featuresEn;
            const tagline = isEs ? meta.taglineEs : meta.taglineEn;
            const discountMultiplier = billingCycle === 'annual' ? 0.8 : 1;
            const monthlyEquivalentUsd = Number((cfg.monthlyPriceUsd * discountMultiplier).toFixed(2));
            const totalUsd =
              billingCycle === 'annual'
                ? Number((monthlyEquivalentUsd * 12).toFixed(2))
                : monthlyEquivalentUsd;
            const monthlyEquivalentArs = Math.round(monthlyEquivalentUsd * gatewayConfig.usdToArsRate);
            const totalArs = Math.round(totalUsd * gatewayConfig.usdToArsRate);

            return (
              <div
                key={meta.id}
                className={`relative rounded-xl p-6 flex flex-col justify-between space-y-6 transition bg-white ${
                  meta.popular
                    ? 'border-2 border-[#14213D] shadow-lg'
                    : 'border border-[#DCE3DF] hover:border-[#A1B0AB] shadow-sm'
                }`}
              >
                {meta.popular && (
                  <div className="absolute -top-3 right-5 bg-[#14213D] text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#D5ECD4]" />
                    <span>{isEs ? 'Más Popular' : 'Most Popular'}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-[#14213D]">{cfg.name}</h2>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]">
                        {isEs ? 'Plan Actual' : 'Current Plan'}
                      </span>
                    )}
                    {isTrialingThis && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-mono tabular-nums">
                        {isEs ? 'En Prueba (7d)' : 'Trialing (7d)'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#5C6F68] leading-relaxed min-h-[34px]">{tagline}</p>

                  <div className="pt-1 space-y-2.5">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-extrabold text-[#14213D] font-mono tabular-nums">
                          {formatPrice(cfg.monthlyPriceUsd)}
                        </span>
                        <span className="text-xs text-[#5C6F68] font-mono font-medium">
                          {isEs ? 'USD / mes' : 'USD / mo'}
                        </span>
                      </div>
                      {billingCycle === 'annual' ? (
                        <p className="text-[11px] text-emerald-700 mt-1 font-mono tabular-nums font-medium">
                          {isEs
                            ? `Facturado $${totalUsd}/año (ahorras 20%)`
                            : `Billed $${totalUsd}/year (save 20%)`}
                        </p>
                      ) : (
                        <p className="text-[11px] text-[#5C6F68] mt-1">
                          {isEs ? 'Facturación mensual flexible' : 'Flexible monthly billing'}
                        </p>
                      )}
                    </div>

                    {/* Exact ARS Converted Price Box when MercadoPago is selected */}
                    {provider === 'mercadopago' && (
                      <div className="bg-[#F4F7F5] border border-[#DCE3DF] rounded-xl p-3 space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-[#14213D] font-mono tabular-nums">
                            {`ARS $${monthlyEquivalentArs.toLocaleString(locale)}`}
                            <span className="text-[11px] font-normal text-[#5C6F68]">
                              {isEs ? ' / mes' : ' / mo'}
                            </span>
                          </span>
                          <span className="text-[10px] text-[#14213D] bg-[#D5ECD4] px-2 py-0.5 rounded font-semibold">
                            {mpRecurring
                              ? isEs
                                ? 'Débito Automático'
                                : 'Auto-Debit'
                              : 'Checkout Pro'}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#5C6F68] font-mono tabular-nums">
                          {billingCycle === 'annual'
                            ? isEs
                              ? `Cobro único anual: ARS $${totalArs.toLocaleString(locale)} (MEP $${gatewayConfig.usdToArsRate.toLocaleString(locale)})`
                              : `Annual charge: ARS $${totalArs.toLocaleString(locale)} (MEP $${gatewayConfig.usdToArsRate.toLocaleString(locale)})`
                            : isEs
                              ? `Conversión exacta ARS $${totalArs.toLocaleString(locale)} • Cotización $${gatewayConfig.usdToArsRate.toLocaleString(locale)}`
                              : `Exact charge ARS $${totalArs.toLocaleString(locale)} • Rate $${gatewayConfig.usdToArsRate.toLocaleString(locale)}`}
                        </div>
                      </div>
                    )}
                  </div>

                  <ul className="space-y-2.5 pt-3 border-t border-[#DCE3DF]">
                    {features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-[#14213D]/90">
                        <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={processingPlan !== null || isCurrent}
                  onClick={() => handleCheckout(meta.id)}
                  className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    isCurrent
                      ? 'bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]'
                      : meta.popular
                        ? 'bg-[#14213D] hover:bg-[#1E3158] text-white shadow-sm'
                        : 'bg-[#EEF3F0] hover:bg-[#14213D] text-[#14213D] hover:text-white border border-[#DCE3DF] hover:border-[#14213D]'
                  }`}
                >
                  {processingPlan === meta.id ? (
                    <span>{isEs ? 'Procesando...' : 'Processing...'}</span>
                  ) : isCurrent ? (
                    <span>{isEs ? 'Plan Activo' : 'Active Plan'}</span>
                  ) : isTrialingThis ? (
                    <>
                      <span>{isEs ? `Activar ${cfg.name}` : `Activate ${cfg.name}`}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span>
                        {isEs ? `Elegir Plan ${cfg.name}` : `Upgrade to ${cfg.name}`}
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Collapsible Gateway & Webhook Setup Assistant — Strictly Super Admin Only */}
        {isSuperAdmin && (
          <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setIsSetupOpen((prev) => !prev)}
              className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#F4F7F5] transition cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Settings2 className="w-4 h-4 text-[#14213D] shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-xs sm:text-sm font-bold text-[#14213D] truncate">
                    {isEs
                      ? 'Asistente de Conexión de Pasarelas y Webhooks (Guía Paso a Paso)'
                      : 'Payment Gateway & Webhook Setup Assistant (Step-by-Step Guide)'}
                  </h2>
                  <p className="text-[11px] text-[#5C6F68] mt-0.5 font-mono tabular-nums">
                    {isEs
                      ? `${configuredCount}/3 pasarelas en vivo configuradas • Copia tu Webhook URL o prueba activaciones al instante`
                      : `${configuredCount}/3 live gateways configured • Copy your Webhook URL or test instant plan activation`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold font-mono tabular-nums px-2.5 py-1 rounded-lg bg-[#EEF3F0] text-[#5C6F68] border border-[#DCE3DF]">
                  {configuredCount > 0
                    ? isEs
                      ? `${configuredCount} Activa(s)`
                      : `${configuredCount} Active`
                    : isEs
                      ? 'Modo Sandbox'
                      : 'Sandbox Mode'}
                </span>
                {isSetupOpen ? (
                  <ChevronUp className="w-4 h-4 text-[#5C6F68]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#5C6F68]" />
                )}
              </div>
            </button>

            {isSetupOpen && (
              <div className="px-5 pb-5 pt-3 border-t border-[#DCE3DF] space-y-5">
                {/* Webhook Endpoint Copy & Live Simulator Bar */}
                <div className="bg-[#F4F7F5] border border-[#DCE3DF] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#5C6F68]">
                      {isEs
                        ? 'URL Única de Webhook (MercadoPago • Lemon Squeezy • Stripe)'
                        : 'Unified Webhook URL (MercadoPago • Lemon Squeezy • Stripe)'}
                    </div>
                    <div className="font-mono text-xs text-[#14213D] break-all">
                      {gatewayConfig.webhookUrl}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyWebhookUrl}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-[#EEF3F0] border border-[#DCE3DF] text-xs font-semibold text-[#14213D] transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#14213D]" />
                      <span>
                        {copiedWebhook
                          ? isEs
                            ? 'URL Copiada'
                            : 'Copied'
                          : isEs
                            ? 'Copiar Webhook URL'
                            : 'Copy Webhook URL'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={simulatingWebhook}
                      onClick={handleSimulateWebhook}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#14213D] hover:bg-[#1E3158] disabled:opacity-60 text-xs font-bold text-white transition cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Zap className="w-3.5 h-3.5 text-[#D5ECD4]" />
                      <span>
                        {simulatingWebhook
                          ? isEs
                            ? 'Simulando pago...'
                            : 'Simulating...'
                          : isEs
                            ? 'Simular Webhook de Pago Aprobado'
                            : 'Simulate Approved Payment Webhook'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* 3-Step Guides per Gateway */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* MercadoPago 3-step guide */}
                  <div className="bg-[#F4F7F5] border border-[#DCE3DF] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-[#14213D] flex items-center gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-[#DCE3DF] text-[#5C6F68]">
                          ARS
                        </span>
                        <span>MercadoPago</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${
                          gatewayConfig.mercadopagoConfigured
                            ? 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {gatewayConfig.mercadopagoConfigured
                          ? isEs
                            ? 'Configurada'
                            : 'Configured'
                          : isEs
                            ? 'Modo Sandbox'
                            : 'Sandbox Mode'}
                      </span>
                    </div>

                    <ol className="space-y-2 text-[11px] text-[#5C6F68] list-decimal list-inside leading-relaxed">
                      <li>
                        {isEs
                          ? 'Ingresa a mercadopago.com.ar/developers/panel/app y crea tu aplicación Checkout Pro / Suscripciones.'
                          : 'Go to mercadopago.com.ar/developers/panel/app and create your Checkout Pro / Subscriptions app.'}
                      </li>
                      <li>
                        {isEs
                          ? 'Agrega en Vercel tu Access Token de Producción en MERCADOPAGO_ACCESS_TOKEN (y opcionalmente MP_USD_TO_ARS_RATE como respaldo del MEP).'
                          : 'Add your Production Access Token in Vercel as MERCADOPAGO_ACCESS_TOKEN (plus optional MP_USD_TO_ARS_RATE fallback).'}
                      </li>
                      <li>
                        {isEs
                          ? 'En Webhooks de MercadoPago pega la URL de arriba (eventos payment y subscription_preapproval).'
                          : 'Paste the Webhook URL above in MercadoPago Webhooks (subscribe to payment and subscription_preapproval).'}
                      </li>
                    </ol>
                  </div>

                  {/* Lemon Squeezy 3-step guide */}
                  <div className="bg-[#F4F7F5] border border-[#DCE3DF] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-[#14213D] flex items-center gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-[#DCE3DF] text-amber-700">
                          USD
                        </span>
                        <span>Lemon Squeezy</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${
                          gatewayConfig.lemonsqueezyConfigured
                            ? 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {gatewayConfig.lemonsqueezyConfigured
                          ? isEs
                            ? 'Configurada'
                            : 'Configured'
                          : isEs
                            ? 'Modo Sandbox'
                            : 'Sandbox Mode'}
                      </span>
                    </div>

                    <ol className="space-y-2 text-[11px] text-[#5C6F68] list-decimal list-inside leading-relaxed">
                      <li>
                        {isEs
                          ? 'Crea tu tienda en app.lemonsqueezy.com (cobra en USD global sin LLC) y define variantes Starter, Growth y Agency.'
                          : 'Create your store on app.lemonsqueezy.com (global USD Merchant of Record) with Starter, Growth & Agency variants.'}
                      </li>
                      <li>
                        {isEs
                          ? 'Configura en Vercel LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID y LEMONSQUEEZY_VARIANT_STARTER / GROWTH / AGENCY.'
                          : 'Set LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, and LEMONSQUEEZY_VARIANT_STARTER / GROWTH / AGENCY in Vercel.'}
                      </li>
                      <li>
                        {isEs
                          ? 'En Settings → Webhooks pega la URL de arriba, guarda LEMONSQUEEZY_WEBHOOK_SECRET y marca order_created y subscription_*.'
                          : 'Under Settings → Webhooks paste the Webhook URL, save LEMONSQUEEZY_WEBHOOK_SECRET, and enable order_created & subscription_*.'}
                      </li>
                    </ol>
                  </div>

                  {/* Stripe 3-step guide */}
                  <div className="bg-[#F4F7F5] border border-[#DCE3DF] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-[#14213D] flex items-center gap-2">
                        <CreditCard className="w-3.5 h-3.5 text-[#5C6F68]" />
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-[#DCE3DF] text-[#5C6F68]">
                          USD
                        </span>
                        <span>Stripe</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${
                          gatewayConfig.stripeConfigured
                            ? 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {gatewayConfig.stripeConfigured
                          ? isEs
                            ? 'Configurada'
                            : 'Configured'
                          : isEs
                            ? 'Modo Sandbox'
                            : 'Sandbox Mode'}
                      </span>
                    </div>

                    <ol className="space-y-2 text-[11px] text-[#5C6F68] list-decimal list-inside leading-relaxed">
                      <li>
                        {isEs
                          ? 'Ingresa a dashboard.stripe.com/apikeys y copia tu Secret Key (sk_live_... o sk_test_...).'
                          : 'Open dashboard.stripe.com/apikeys and copy your Secret Key (sk_live_... or sk_test_...).'}
                      </li>
                      <li>
                        {isEs
                          ? 'Configura STRIPE_SECRET_KEY en las variables de entorno de tu proyecto en Vercel.'
                          : 'Set STRIPE_SECRET_KEY in your Vercel project environment variables.'}
                      </li>
                      <li>
                        {isEs
                          ? 'En Developers → Webhooks apunta a la URL de arriba con checkout.session.completed y customer.subscription.* (STRIPE_WEBHOOK_SECRET).'
                          : 'Under Developers → Webhooks point to the URL above for checkout.session.completed & customer.subscription.* (STRIPE_WEBHOOK_SECRET).'}
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Commercial / SuperAdmin Footer Note */}
        <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-4 flex items-center gap-3 text-xs text-[#5C6F68]">
          <ShieldCheck className="w-4 h-4 text-[#14213D] shrink-0" />
          <span>
            {isSuperAdmin
              ? isEs
                ? 'Los pagos soportan MercadoPago (ARS), Lemon Squeezy (USD Global) y Stripe Internacional. En Modo Sandbox los cambios de plan y webhooks simulados activan los límites de inmediato.'
                : 'Payments support MercadoPago (ARS), Lemon Squeezy (Global USD), and Stripe International. In Sandbox Mode, plan changes and simulated webhooks activate workspace limits immediately.'
              : isEs
                ? 'Los pagos se procesan de forma segura con MercadoPago (ARS), Lemon Squeezy (USD Global) y Stripe Internacional. Los límites del plan se activan automáticamente al confirmarse el pago.'
                : 'Payments are securely processed via MercadoPago (ARS), Lemon Squeezy (Global USD), and Stripe International. Plan limits activate automatically upon payment confirmation.'}
          </span>
        </div>
      </div>
    </div>
  );
}
