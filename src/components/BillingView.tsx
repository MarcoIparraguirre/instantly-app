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
import {
  BillingCycle,
  BillingProvider,
  SAAS_PLANS,
  WorkspacePlan,
  normalizePlan,
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

function getProviderDisplayName(provider?: string): string {
  switch (provider) {
    case 'mercadopago':
      return 'MercadoPago (ARS)';
    case 'lemonsqueezy':
      return 'Lemon Squeezy (USD)';
    case 'stripe':
      return 'Stripe Internacional (USD)';
    default:
      return 'Sandbox / Trial';
  }
}

export default function BillingView() {
  const { currentWorkspace, workspaces, refreshWorkspaces, openAuthModal } = useAuth();
  const { language } = useLanguage();
  const isEs = language === 'es';
  const locale = isEs ? 'es-AR' : 'en-US';

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

        setGatewayConfig({
          usdToArsRate:
            Number(data.usdToArsRate) > 0 ? Number(data.usdToArsRate) : 1200,
          rateSource:
            typeof data.rateSource === 'string' ? data.rateSource : 'fallback',
          mercadopagoConfigured: Boolean(data.mercadopagoConfigured),
          lemonsqueezyConfigured: Boolean(data.lemonsqueezyConfigured),
          stripeConfigured: Boolean(data.stripeConfigured),
          webhookUrl:
            typeof data.webhookUrl === 'string' && data.webhookUrl
              ? data.webhookUrl
              : fallbackWebhookUrl,
        });
      } catch {
        if (!active) return;
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
  }, []);

  useEffect(() => {
    let active = true;
    const loadUsageMetrics = async () => {
      try {
        const [accRes, leadsRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/leads'),
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
    return isEs ? 'Referencia base' : 'Reference Fallback';
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
        setFeedback({
          type: 'error',
          text: data?.error || (isEs ? 'Error al procesar el cambio de plan' : 'Checkout failed'),
        });
        return;
      }

      if (data.url) {
        window.location.assign(data.url);
        return;
      }

      await refreshWorkspaces();
      const planLabel = SAAS_PLANS[planId].name;
      const providerLabel = getProviderDisplayName(provider);
      setFeedback({
        type: 'success',
        text: isEs
          ? `¡Workspace "${currentWorkspace.name}" actualizado al plan ${planLabel} (${providerLabel} • Sandbox activo)!`
          : `Workspace "${currentWorkspace.name}" upgraded to ${planLabel} plan (${providerLabel} • Sandbox active)!`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : (isEs ? 'Error de red en facturación' : 'Billing network error'),
      });
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleCopyWebhookUrl = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(gatewayConfig.webhookUrl);
      }
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2200);
    } catch {
      setFeedback({
        type: 'error',
        text: isEs ? 'No se pudo copiar al portapapeles' : 'Could not copy webhook URL',
      });
    }
  };

  const handleSimulateWebhook = async () => {
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
        setFeedback({
          type: 'error',
          text:
            data?.error ||
            data?.message ||
            (isEs ? 'No se pudo simular el webhook de pago' : 'Webhook simulation failed'),
        });
        return;
      }

      await refreshWorkspaces();
      setFeedback({
        type: 'success',
        text: isEs
          ? `⚡ Webhook MercadoPago aprobado simulado para "${currentWorkspace.name}": Plan Agency activado en vivo.`
          : `⚡ Simulated approved MercadoPago webhook for "${currentWorkspace.name}": Agency plan activated live.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : (isEs ? 'Error al simular webhook' : 'Webhook simulation error'),
      });
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
        classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      };
    }
    if (subStatus === 'past_due') {
      return {
        label: isEs ? 'Pago Pendiente' : 'Past Due',
        classes: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      };
    }
    if (subStatus === 'canceled') {
      return {
        label: isEs ? 'Cancelada' : 'Canceled',
        classes: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
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
      classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    };
  })();

  const configuredCount = [
    gatewayConfig.mercadopagoConfigured,
    gatewayConfig.lemonsqueezyConfigured,
    gatewayConfig.stripeConfigured,
  ].filter(Boolean).length;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#0b0f17] p-6 lg:p-8 space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header & Active Workspace Plan Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2.5">
              <CreditCard className="w-5 h-5 text-blue-400" />
              <span>{isEs ? 'Facturación, Planes y Límites SaaS' : 'Billing, Plans & SaaS Limits'}</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {isEs
                ? 'Gestiona tu suscripción, consumo de casillas y capacidad de prospección por Workspace.'
                : 'Manage your subscription, mailbox consumption, and outbound capacity per Workspace.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-300 font-semibold">{currentWorkspace.name}</span>
              <span className="text-slate-600">•</span>
              <span className="text-blue-400 font-bold">{activePlanConfig.name}</span>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border ${statusBadge.classes}`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{statusBadge.label}</span>
            </span>

            <button
              type="button"
              onClick={() => openAuthModal('workspace')}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <span>{`+ Workspace (${workspaces.length})`}</span>
            </button>
          </div>
        </div>

        {/* Inline Feedback Banner */}
        {feedback && (
          <div
            className={`flex items-center gap-3 p-4 rounded-2xl border text-xs font-medium ${
              feedback.type === 'success'
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
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
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Server className="w-4 h-4 text-blue-400" />
                <span>{isEs ? 'Casillas Conectadas' : 'Connected Mailboxes'}</span>
              </div>
              <span className="text-xs font-mono font-bold text-white">
                {loadingUsage ? '...' : accountsCount} / {maxAccounts >= 999 ? '∞' : maxAccounts}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  accountsPct >= 85 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.max(accountsCount > 0 ? 6 : 0, accountsPct)}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400">
              {maxAccounts >= 999
                ? (isEs ? 'Capacidad ilimitada en plan Agency' : 'Unlimited capacity on Agency plan')
                : (isEs
                    ? `${Math.max(0, maxAccounts - accountsCount)} cupos disponibles en tu plan`
                    : `${Math.max(0, maxAccounts - accountsCount)} mailbox slots remaining`)}
            </div>
          </div>

          {/* Leads Usage */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>{isEs ? 'Leads Activos' : 'Active Leads'}</span>
              </div>
              <span className="text-xs font-mono font-bold text-white">
                {loadingUsage ? '...' : leadsCount.toLocaleString()} / {maxLeads.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  leadsPct >= 85 ? 'bg-amber-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${Math.max(leadsCount > 0 ? 4 : 0, leadsPct)}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400">
              {isEs
                ? `${leadsPct}% de tu cuota mensual utilizada`
                : `${leadsPct}% of monthly lead capacity used`}
            </div>
          </div>

          {/* Credits Balance */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>{isEs ? 'Créditos Verificados' : 'Verification Credits'}</span>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {credits.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: '100%' }} />
            </div>
            <div className="text-[11px] text-slate-400">
              {isEs
                ? `Proveedor activo: ${getProviderDisplayName(currentWorkspace.billingProvider)}`
                : `Active provider: ${getProviderDisplayName(currentWorkspace.billingProvider)}`}
            </div>
          </div>
        </div>

        {/* Billing Controls: Cycle Toggle + 3-Gateway Selector + MercadoPago ARS/Recurring Bar */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
            {/* Monthly vs Annual (20% Off) */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400">
                {isEs ? 'Ciclo de facturación:' : 'Billing cycle:'}
              </span>
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    billingCycle === 'monthly'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEs ? 'Mensual' : 'Monthly'}
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    billingCycle === 'annual'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{isEs ? 'Anual' : 'Annual'}</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded-full">
                    -20%
                  </span>
                </button>
              </div>
            </div>

            {/* 3-Gateway Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>{isEs ? 'Pasarela:' : 'Payment Gateway:'}</span>
              </span>

              <button
                type="button"
                onClick={() => setProvider('mercadopago')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  provider === 'mercadopago'
                    ? 'bg-sky-600/20 border-sky-400/60 text-sky-200 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>🇦🇷</span>
                <span>
                  {isEs
                    ? 'MercadoPago (ARS — Saldo MP, Débito, Crédito)'
                    : 'MercadoPago (ARS — MP Wallet, Debit, Credit)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setProvider('lemonsqueezy')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  provider === 'lemonsqueezy'
                    ? 'bg-amber-500/15 border-amber-400/60 text-amber-200 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>🍋</span>
                <span>
                  {isEs
                    ? 'Lemon Squeezy (USD — Global sin LLC)'
                    : 'Lemon Squeezy (USD — Global Merchant of Record)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setProvider('stripe')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  provider === 'stripe'
                    ? 'bg-blue-600/20 border-blue-500/60 text-blue-200 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>💳</span>
                <span>
                  {isEs ? 'Stripe Internacional (USD)' : 'Stripe International (USD)'}
                </span>
              </button>
            </div>
          </div>

          {/* MercadoPago Live Exchange Rate & Recurring Preapproval Toggle */}
          {provider === 'mercadopago' && (
            <div className="pt-3 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-sky-300 bg-sky-950/30 border border-sky-500/25 px-3 py-2 rounded-xl">
                <span className="font-bold">
                  {isEs ? 'Tipo de cambio USD → ARS:' : 'USD → ARS Exchange Rate:'}
                </span>
                <span className="font-mono font-bold text-white">
                  1 USD = ARS ${gatewayConfig.usdToArsRate.toLocaleString(locale)}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  {rateSourceLabel}
                </span>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-200 bg-slate-950/70 border border-slate-800 px-3.5 py-2 rounded-xl cursor-pointer hover:border-sky-500/40 transition select-none">
                <input
                  type="checkbox"
                  checked={mpRecurring}
                  onChange={(e) => setMpRecurring(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500 cursor-pointer"
                />
                <Repeat className="w-3.5 h-3.5 text-sky-400 shrink-0" />
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
                className={`relative rounded-3xl p-6 border flex flex-col justify-between space-y-6 transition ${
                  meta.popular
                    ? 'bg-gradient-to-b from-indigo-950/40 to-slate-900/90 border-indigo-500/50 shadow-xl shadow-indigo-950/30'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                {meta.popular && (
                  <div className="absolute -top-3 right-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>{isEs ? 'Más Popular' : 'Most Popular'}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-white">{cfg.name}</h2>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {isEs ? 'Plan Actual' : 'Current Plan'}
                      </span>
                    )}
                    {isTrialingThis && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {isEs ? 'En Prueba (7d)' : 'Trialing (7d)'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed min-h-[34px]">{tagline}</p>

                  <div className="pt-1 space-y-2">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-black text-white">
                          {formatPrice(cfg.monthlyPriceUsd)}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {isEs ? 'USD / mes' : 'USD / mo'}
                        </span>
                      </div>
                      {billingCycle === 'annual' ? (
                        <p className="text-[11px] text-emerald-400 mt-1 font-medium">
                          {isEs
                            ? `Facturado $${totalUsd}/año (ahorras 20%)`
                            : `Billed $${totalUsd}/year (save 20%)`}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500 mt-1">
                          {isEs ? 'Facturación mensual flexible' : 'Flexible monthly billing'}
                        </p>
                      )}
                    </div>

                    {/* Exact ARS Converted Price Box when MercadoPago is selected */}
                    {provider === 'mercadopago' && (
                      <div className="bg-sky-950/35 border border-sky-500/30 rounded-xl p-2.5 space-y-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-extrabold text-sky-300 font-mono">
                            {`ARS $${monthlyEquivalentArs.toLocaleString(locale)}`}
                            <span className="text-[11px] font-medium text-sky-400/80">
                              {isEs ? ' / mes' : ' / mo'}
                            </span>
                          </span>
                          <span className="text-[10px] text-sky-400/80 font-semibold">
                            {mpRecurring
                              ? (isEs ? 'Débito Automático' : 'Auto-Debit')
                              : 'Checkout Pro'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
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

                  <ul className="space-y-2.5 pt-3 border-t border-slate-800/80">
                    {features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
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
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    isCurrent
                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                      : meta.popular
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-600/25'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
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

        {/* Collapsible Gateway & Webhook Setup Assistant */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setIsSetupOpen((prev) => !prev)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-900 transition cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Settings2 className="w-4 h-4 text-blue-400 shrink-0" />
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-white truncate">
                  {isEs
                    ? '⚙️ Asistente de Conexión de Pasarelas y Webhooks (Guía Paso a Paso)'
                    : '⚙️ Payment Gateway & Webhook Setup Assistant (Step-by-Step Guide)'}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isEs
                    ? `${configuredCount}/3 pasarelas en vivo configuradas • Copia tu Webhook URL o prueba activaciones al instante`
                    : `${configuredCount}/3 live gateways configured • Copy your Webhook URL or test instant plan activation`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {configuredCount > 0
                  ? (isEs ? `${configuredCount} Activa(s)` : `${configuredCount} Active`)
                  : (isEs ? 'Modo Sandbox' : 'Sandbox Mode')}
              </span>
              {isSetupOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </button>

          {isSetupOpen && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-800/80 space-y-5">
              {/* Webhook Endpoint Copy & Live Simulator Bar */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {isEs ? 'URL Única de Webhook (MercadoPago • Lemon Squeezy • Stripe)' : 'Unified Webhook URL (MercadoPago • Lemon Squeezy • Stripe)'}
                  </div>
                  <div className="font-mono text-xs text-sky-300 break-all">
                    {gatewayConfig.webhookUrl}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyWebhookUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-blue-400" />
                    <span>
                      {copiedWebhook
                        ? (isEs ? '¡URL Copiada!' : 'Copied!')
                        : (isEs ? 'Copiar Webhook URL' : 'Copy Webhook URL')}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={simulatingWebhook}
                    onClick={handleSimulateWebhook}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-bold text-white shadow-md transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>
                      {simulatingWebhook
                        ? (isEs ? 'Simulando pago...' : 'Simulating...')
                        : (isEs ? '⚡ Simular Webhook de Pago Aprobado' : '⚡ Simulate Approved Payment Webhook')}
                    </span>
                  </button>
                </div>
              </div>

              {/* 3-Step Guides per Gateway */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* MercadoPago 3-step guide */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>🇦🇷</span>
                      <span>MercadoPago (ARS)</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        gatewayConfig.mercadopagoConfigured
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {gatewayConfig.mercadopagoConfigured
                        ? (isEs ? 'Configurada' : 'Configured')
                        : (isEs ? 'Modo Sandbox' : 'Sandbox Mode')}
                    </span>
                  </div>

                  <ol className="space-y-2 text-[11px] text-slate-300 list-decimal list-inside leading-relaxed">
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
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>🍋</span>
                      <span>Lemon Squeezy (USD)</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        gatewayConfig.lemonsqueezyConfigured
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {gatewayConfig.lemonsqueezyConfigured
                        ? (isEs ? 'Configurada' : 'Configured')
                        : (isEs ? 'Modo Sandbox' : 'Sandbox Mode')}
                    </span>
                  </div>

                  <ol className="space-y-2 text-[11px] text-slate-300 list-decimal list-inside leading-relaxed">
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
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>💳</span>
                      <span>Stripe Internacional (USD)</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        gatewayConfig.stripeConfigured
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {gatewayConfig.stripeConfigured
                        ? (isEs ? 'Configurada' : 'Configured')
                        : (isEs ? 'Modo Sandbox' : 'Sandbox Mode')}
                    </span>
                  </div>

                  <ol className="space-y-2 text-[11px] text-slate-300 list-decimal list-inside leading-relaxed">
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

        {/* Security / Sandbox Footer Note */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {isEs
              ? 'Los pagos soportan MercadoPago (ARS), Lemon Squeezy (USD Global) y Stripe Internacional. En Modo Sandbox los cambios de plan y webhooks simulados activan los límites de inmediato.'
              : 'Payments support MercadoPago (ARS), Lemon Squeezy (Global USD), and Stripe International. In Sandbox Mode, plan changes and simulated webhooks activate workspace limits immediately.'}
          </span>
        </div>
      </div>
    </div>
  );
}
