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
        classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      };
    }
    if (subStatus === 'past_due') {
      return {
        label: isEs ? 'Pago Pendiente' : 'Past Due',
        classes: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      };
    }
    if (subStatus === 'canceled') {
      return {
        label: isEs ? 'Cancelada' : 'Canceled',
        classes: 'bg-[#171B26] text-[#949EB0] border-[#232938]',
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
      classes: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    };
  })();

  const configuredCount = [
    gatewayConfig.mercadopagoConfigured,
    gatewayConfig.lemonsqueezyConfigured,
    gatewayConfig.stripeConfigured,
  ].filter(Boolean).length;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#0A0C10] p-6 lg:p-8 space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header & Active Workspace Plan Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1D2330] pb-5">
          <div>
            <h1 className="text-lg font-bold text-[#F3F5F8] flex items-center gap-2.5 tracking-tight">
              <CreditCard className="w-5 h-5 text-[#E85D2A]" />
              <span>{isEs ? 'Facturación, Planes y Límites SaaS' : 'Billing, Plans & SaaS Limits'}</span>
            </h1>
            <p className="text-xs text-[#949EB0] mt-1">
              {isEs
                ? 'Gestiona tu suscripción, consumo de casillas y capacidad de prospección por Workspace.'
                : 'Manage your subscription, mailbox consumption, and outbound capacity per Workspace.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-[#11141C] border border-[#232938] px-3 py-1.5 rounded-lg text-xs">
              <Building2 className="w-3.5 h-3.5 text-[#E85D2A]" />
              <span className="text-[#F3F5F8] font-semibold">{currentWorkspace.name}</span>
              <span className="text-[#949EB0]">/</span>
              <span className="text-[#E85D2A] font-bold">{activePlanConfig.name}</span>
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
              className="flex items-center gap-1.5 bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] text-[#F3F5F8] px-3 py-1.5 rounded-lg text-xs font-semibold font-mono tabular-nums transition cursor-pointer"
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
                ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/35 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Real Usage Meters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Mailboxes Usage */}
          <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#949EB0]">
                <Server className="w-4 h-4 text-[#E85D2A]" />
                <span>{isEs ? 'Casillas Conectadas' : 'Connected Mailboxes'}</span>
              </div>
              <span className="text-xs font-mono tabular-nums font-bold text-[#F3F5F8]">
                {loadingUsage ? '...' : accountsCount} / {maxAccounts >= 999 ? '∞' : maxAccounts}
              </span>
            </div>
            <div className="w-full h-2 bg-[#171B26] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  accountsPct >= 85 ? 'bg-amber-500' : 'bg-[#E85D2A]'
                }`}
                style={{ width: `${Math.max(accountsCount > 0 ? 6 : 0, accountsPct)}%` }}
              />
            </div>
            <div className="text-[11px] text-[#949EB0] font-mono tabular-nums">
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
          <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#949EB0]">
                <Users className="w-4 h-4 text-[#F3F5F8]" />
                <span>{isEs ? 'Leads Activos' : 'Active Leads'}</span>
              </div>
              <span className="text-xs font-mono tabular-nums font-bold text-[#F3F5F8]">
                {loadingUsage ? '...' : leadsCount.toLocaleString()} / {maxLeads.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-[#171B26] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  leadsPct >= 85 ? 'bg-amber-500' : 'bg-[#949EB0]'
                }`}
                style={{ width: `${Math.max(leadsCount > 0 ? 4 : 0, leadsPct)}%` }}
              />
            </div>
            <div className="text-[11px] text-[#949EB0] font-mono tabular-nums">
              {isEs
                ? `${leadsPct}% de tu cuota mensual utilizada`
                : `${leadsPct}% of monthly lead capacity used`}
            </div>
          </div>

          {/* Credits Balance */}
          <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#949EB0]">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>{isEs ? 'Créditos Verificados' : 'Verification Credits'}</span>
              </div>
              <span className="text-xs font-mono tabular-nums font-bold text-emerald-400">
                {credits.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-[#171B26] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: '100%' }} />
            </div>
            <div className="text-[11px] text-[#949EB0]">
              {isEs
                ? `Proveedor activo: ${getProviderDisplayName(currentWorkspace.billingProvider, isSuperAdmin, isEs)}`
                : `Active provider: ${getProviderDisplayName(currentWorkspace.billingProvider, isSuperAdmin, isEs)}`}
            </div>
          </div>
        </div>

        {/* Billing Controls: Cycle Toggle + 3-Gateway Selector + MercadoPago ARS/Recurring Bar */}
        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 space-y-4">
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
            {/* Monthly vs Annual (20% Off) */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#949EB0]">
                {isEs ? 'Ciclo de facturación:' : 'Billing cycle:'}
              </span>
              <div className="flex items-center bg-[#0A0C10] border border-[#232938] rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    billingCycle === 'monthly'
                      ? 'bg-[#E85D2A] text-white'
                      : 'text-[#949EB0] hover:text-[#F3F5F8]'
                  }`}
                >
                  {isEs ? 'Mensual' : 'Monthly'}
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    billingCycle === 'annual'
                      ? 'bg-[#E85D2A] text-white'
                      : 'text-[#949EB0] hover:text-[#F3F5F8]'
                  }`}
                >
                  <span>{isEs ? 'Anual' : 'Annual'}</span>
                  <span
                    className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-lg border ${
                      billingCycle === 'annual'
                        ? 'bg-black/25 text-white border-white/25'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    -20%
                  </span>
                </button>
              </div>
            </div>

            {/* 3-Gateway Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#949EB0] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#E85D2A]" />
                <span>{isEs ? 'Pasarela:' : 'Payment Gateway:'}</span>
              </span>

              <button
                type="button"
                onClick={() => setProvider('mercadopago')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
                  provider === 'mercadopago'
                    ? 'bg-[#171B26] border-[#E85D2A] text-[#F3F5F8]'
                    : 'bg-[#0A0C10] border-[#232938] text-[#949EB0] hover:text-[#F3F5F8] hover:border-[#343D52]'
                }`}
              >
                <span className="font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0A0C10] border border-[#232938] text-[#F3F5F8]">
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
                    ? 'bg-[#171B26] border-[#E85D2A] text-[#F3F5F8]'
                    : 'bg-[#0A0C10] border-[#232938] text-[#949EB0] hover:text-[#F3F5F8] hover:border-[#343D52]'
                }`}
              >
                <span className="font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0A0C10] border border-[#232938] text-amber-300">
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
                    ? 'bg-[#171B26] border-[#E85D2A] text-[#F3F5F8]'
                    : 'bg-[#0A0C10] border-[#232938] text-[#949EB0] hover:text-[#F3F5F8] hover:border-[#343D52]'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 text-[#949EB0]" />
                <span className="font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0A0C10] border border-[#232938] text-[#F3F5F8]">
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
            <div className="pt-3 border-t border-[#1D2330] flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center flex-wrap gap-2 text-xs text-[#949EB0] bg-[#171B26] border border-[#232938] px-3 py-2 rounded-lg">
                <span className="font-semibold text-[#F3F5F8]">
                  {isEs ? 'Tipo de cambio USD → ARS:' : 'USD → ARS Exchange Rate:'}
                </span>
                <span className="font-mono tabular-nums font-bold text-[#F3F5F8]">
                  1 USD = ARS ${gatewayConfig.usdToArsRate.toLocaleString(locale)}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  {rateSourceLabel}
                </span>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[#F3F5F8] bg-[#171B26] border border-[#232938] px-3.5 py-2 rounded-lg cursor-pointer hover:border-[#E85D2A]/60 transition select-none">
                <input
                  type="checkbox"
                  checked={mpRecurring}
                  onChange={(e) => setMpRecurring(e.target.checked)}
                  className="w-4 h-4 rounded border-[#232938] bg-[#0A0C10] accent-[#E85D2A] cursor-pointer"
                />
                <Repeat className="w-3.5 h-3.5 text-[#E85D2A] shrink-0" />
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
                className={`relative rounded-xl p-6 border flex flex-col justify-between space-y-6 transition ${
                  meta.popular
                    ? 'bg-[#11141C] border-[#E85D2A]/60 shadow-xl'
                    : 'bg-[#11141C] border-[#1D2330] hover:border-[#232938]'
                }`}
              >
                {meta.popular && (
                  <div className="absolute -top-3 right-5 bg-[#E85D2A] text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>{isEs ? 'Más Popular' : 'Most Popular'}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-[#F3F5F8]">{cfg.name}</h2>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {isEs ? 'Plan Actual' : 'Current Plan'}
                      </span>
                    )}
                    {isTrialingThis && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono tabular-nums">
                        {isEs ? 'En Prueba (7d)' : 'Trialing (7d)'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#949EB0] leading-relaxed min-h-[34px]">{tagline}</p>

                  <div className="pt-1 space-y-2.5">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-extrabold text-[#F3F5F8] font-mono tabular-nums">
                          {formatPrice(cfg.monthlyPriceUsd)}
                        </span>
                        <span className="text-xs text-[#949EB0] font-mono font-medium">
                          {isEs ? 'USD / mes' : 'USD / mo'}
                        </span>
                      </div>
                      {billingCycle === 'annual' ? (
                        <p className="text-[11px] text-emerald-400 mt-1 font-mono tabular-nums font-medium">
                          {isEs
                            ? `Facturado $${totalUsd}/año (ahorras 20%)`
                            : `Billed $${totalUsd}/year (save 20%)`}
                        </p>
                      ) : (
                        <p className="text-[11px] text-[#949EB0] mt-1">
                          {isEs ? 'Facturación mensual flexible' : 'Flexible monthly billing'}
                        </p>
                      )}
                    </div>

                    {/* Exact ARS Converted Price Box when MercadoPago is selected */}
                    {provider === 'mercadopago' && (
                      <div className="bg-[#171B26] border border-[#232938] rounded-xl p-3 space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-[#F3F5F8] font-mono tabular-nums">
                            {`ARS $${monthlyEquivalentArs.toLocaleString(locale)}`}
                            <span className="text-[11px] font-normal text-[#949EB0]">
                              {isEs ? ' / mes' : ' / mo'}
                            </span>
                          </span>
                          <span className="text-[10px] text-[#E85D2A] font-semibold">
                            {mpRecurring
                              ? isEs
                                ? 'Débito Automático'
                                : 'Auto-Debit'
                              : 'Checkout Pro'}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#949EB0] font-mono tabular-nums">
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

                  <ul className="space-y-2.5 pt-3 border-t border-[#1D2330]">
                    {features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-[#F3F5F8]/90">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
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
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : meta.popular
                        ? 'bg-[#E85D2A] hover:bg-[#F26B3A] text-white'
                        : 'bg-[#171B26] hover:bg-[#1D2330] text-[#F3F5F8] border border-[#232938]'
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
          <div className="bg-[#11141C] border border-[#1D2330] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setIsSetupOpen((prev) => !prev)}
              className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#171B26]/60 transition cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Settings2 className="w-4 h-4 text-[#E85D2A] shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-xs sm:text-sm font-bold text-[#F3F5F8] truncate">
                    {isEs
                      ? 'Asistente de Conexión de Pasarelas y Webhooks (Guía Paso a Paso)'
                      : 'Payment Gateway & Webhook Setup Assistant (Step-by-Step Guide)'}
                  </h2>
                  <p className="text-[11px] text-[#949EB0] mt-0.5 font-mono tabular-nums">
                    {isEs
                      ? `${configuredCount}/3 pasarelas en vivo configuradas • Copia tu Webhook URL o prueba activaciones al instante`
                      : `${configuredCount}/3 live gateways configured • Copy your Webhook URL or test instant plan activation`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold font-mono tabular-nums px-2.5 py-1 rounded-lg bg-[#171B26] text-[#949EB0] border border-[#232938]">
                  {configuredCount > 0
                    ? isEs
                      ? `${configuredCount} Activa(s)`
                      : `${configuredCount} Active`
                    : isEs
                      ? 'Modo Sandbox'
                      : 'Sandbox Mode'}
                </span>
                {isSetupOpen ? (
                  <ChevronUp className="w-4 h-4 text-[#949EB0]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#949EB0]" />
                )}
              </div>
            </button>

            {isSetupOpen && (
              <div className="px-5 pb-5 pt-3 border-t border-[#1D2330] space-y-5">
                {/* Webhook Endpoint Copy & Live Simulator Bar */}
                <div className="bg-[#0A0C10] border border-[#232938] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#949EB0]">
                      {isEs
                        ? 'URL Única de Webhook (MercadoPago • Lemon Squeezy • Stripe)'
                        : 'Unified Webhook URL (MercadoPago • Lemon Squeezy • Stripe)'}
                    </div>
                    <div className="font-mono text-xs text-[#F3F5F8] break-all">
                      {gatewayConfig.webhookUrl}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyWebhookUrl}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] text-xs font-semibold text-[#F3F5F8] transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#E85D2A]" />
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
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#E85D2A] hover:bg-[#F26B3A] disabled:opacity-60 text-xs font-bold text-white transition cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Zap className="w-3.5 h-3.5" />
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
                  <div className="bg-[#0A0C10] border border-[#232938] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-[#F3F5F8] flex items-center gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#171B26] border border-[#232938] text-[#949EB0]">
                          ARS
                        </span>
                        <span>MercadoPago</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${
                          gatewayConfig.mercadopagoConfigured
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
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

                    <ol className="space-y-2 text-[11px] text-[#949EB0] list-decimal list-inside leading-relaxed">
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
                  <div className="bg-[#0A0C10] border border-[#232938] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-[#F3F5F8] flex items-center gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#171B26] border border-[#232938] text-amber-300">
                          USD
                        </span>
                        <span>Lemon Squeezy</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${
                          gatewayConfig.lemonsqueezyConfigured
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
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

                    <ol className="space-y-2 text-[11px] text-[#949EB0] list-decimal list-inside leading-relaxed">
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
                  <div className="bg-[#0A0C10] border border-[#232938] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-[#F3F5F8] flex items-center gap-2">
                        <CreditCard className="w-3.5 h-3.5 text-[#949EB0]" />
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#171B26] border border-[#232938] text-[#949EB0]">
                          USD
                        </span>
                        <span>Stripe</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${
                          gatewayConfig.stripeConfigured
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
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

                    <ol className="space-y-2 text-[11px] text-[#949EB0] list-decimal list-inside leading-relaxed">
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
        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 flex items-center gap-3 text-xs text-[#949EB0]">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
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
