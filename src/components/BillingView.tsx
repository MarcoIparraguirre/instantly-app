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

export default function BillingView() {
  const { currentWorkspace, workspaces, refreshWorkspaces, openAuthModal } = useAuth();
  const { language } = useLanguage();
  const isEs = language === 'es';

  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [provider, setProvider] = useState<BillingProvider>('stripe');
  const [accountsCount, setAccountsCount] = useState<number>(0);
  const [leadsCount, setLeadsCount] = useState<number>(0);
  const [loadingUsage, setLoadingUsage] = useState<boolean>(true);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [processingPlan, setProcessingPlan] = useState<WorkspacePlan | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

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
    maxAccounts >= 999 ? Math.min(100, Math.round((accountsCount / 50) * 100)) : Math.min(100, Math.round((accountsCount / Math.max(1, maxAccounts)) * 100));
  const leadsPct = Math.min(100, Math.round((leadsCount / Math.max(1, maxLeads)) * 100));

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
      setFeedback({
        type: 'success',
        text: isEs
          ? `¡Workspace "${currentWorkspace.name}" actualizado al plan ${planLabel} (${provider === 'mercadopago' ? 'MercadoPago LATAM' : 'Stripe'} • Sandbox activo)!`
          : `Workspace "${currentWorkspace.name}" upgraded to ${planLabel} plan (${provider} • Sandbox active)!`,
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
              <span>{isEs ? `+ Workspace (${workspaces.length})` : `+ Workspace (${workspaces.length})`}</span>
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
                ? `Proveedor activo: ${currentWorkspace.billingProvider === 'mercadopago' ? 'MercadoPago LATAM' : currentWorkspace.billingProvider === 'stripe' ? 'Stripe Internacional' : 'Sandbox / Trial'}`
                : `Active provider: ${currentWorkspace.billingProvider || 'Sandbox / Trial'}`}
            </div>
          </div>
        </div>

        {/* Billing Controls: Cycle Toggle + Payment Provider */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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

          {/* Payment Provider Selector */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>{isEs ? 'Pasarela:' : 'Payment Gateway:'}</span>
            </span>

            <button
              type="button"
              onClick={() => setProvider('stripe')}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                provider === 'stripe'
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Stripe Internacional (USD)
            </button>

            <button
              type="button"
              onClick={() => setProvider('mercadopago')}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                provider === 'mercadopago'
                  ? 'bg-sky-600/20 border-sky-400/50 text-sky-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              MercadoPago LATAM
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {PLAN_DETAILS.map((meta) => {
            const cfg = SAAS_PLANS[meta.id];
            const isCurrent = activePlanId === meta.id && subStatus === 'active';
            const isTrialingThis = activePlanId === meta.id && subStatus === 'trialing';
            const features = isEs ? meta.featuresEs : meta.featuresEn;
            const tagline = isEs ? meta.taglineEs : meta.taglineEn;
            const annualTotal = Number((cfg.monthlyPriceUsd * 0.8 * 12).toFixed(2));

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

                  <div className="pt-1">
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
                          ? `Facturado $${annualTotal}/año (ahorras 20%)`
                          : `Billed $${annualTotal}/year (save 20%)`}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-1">
                        {isEs ? 'Facturación mensual flexible' : 'Flexible monthly billing'}
                      </p>
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

        {/* Security / Sandbox Footer Note */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {isEs
              ? 'Los pagos soportan Stripe Internacional y MercadoPago LATAM. En entorno Staging/Sandbox los cambios de plan activan los límites de inmediato en Supabase para pruebas completas.'
              : 'Payments support Stripe International and MercadoPago LATAM. In Staging/Sandbox mode, plan changes activate workspace limits immediately in Supabase.'}
          </span>
        </div>
      </div>
    </div>
  );
}
