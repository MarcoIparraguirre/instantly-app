'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown,
  Building2,
  Users,
  DollarSign,
  Server,
  Plus,
  Copy,
  Check,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useFeedback } from '@/context/FeedbackContext';
import {
  Workspace,
  WorkspacePlan,
  SubscriptionStatus,
  TeamMember,
  SAAS_PLANS,
  normalizePlan,
  normalizeRole,
} from '@/types';

interface FounderBackofficeViewProps {
  onOpenWorkspace?: (ws: Workspace) => void;
}

interface ProvisionedCredentials {
  agencyName: string;
  workspaceName: string;
  workspaceId: string;
  ownerName: string;
  ownerEmail: string;
  plan: WorkspacePlan;
  status: SubscriptionStatus;
  tempCode: string;
  loginUrl: string;
}

export default function FounderBackofficeView({ onOpenWorkspace }: FounderBackofficeViewProps) {
  const { user, workspaces, currentWorkspace, switchWorkspace, refreshWorkspaces, signInAsRole } =
    useAuth();
  const { language } = useLanguage();
  const { showToast } = useFeedback();
  const isEs = language === 'es';

  const userRole = normalizeRole(user?.role);

  const [allMembers, setAllMembers] = useState<TeamMember[]>([]);
  const [usdToArsRate, setUsdToArsRate] = useState<number>(1200);
  const [loadingMembers, setLoadingMembers] = useState<boolean>(true);

  // Concierge Agency Form State
  const [clientName, setClientName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [plan, setPlan] = useState<WorkspacePlan>('agency');
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<ProvisionedCredentials | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchMembersAndRate = useCallback(async () => {
    try {
      const [teamRes, rateRes] = await Promise.all([
        fetch('/api/team', { cache: 'no-store' }),
        fetch('/api/billing/checkout', { cache: 'no-store' }),
      ]);
      const teamData = await teamRes.json().catch(() => []);
      if (Array.isArray(teamData)) {
        setAllMembers(teamData);
      }
      const rateData = await rateRes.json().catch(() => ({}));
      if (Number(rateData?.usdToArsRate) > 0) {
        setUsdToArsRate(Number(rateData.usdToArsRate));
      }
    } catch {
      // keep safe defaults
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    if (userRole !== 'super_admin') return;
    let active = true;
    const loadInitial = async () => {
      try {
        const [teamRes, rateRes] = await Promise.all([
          fetch('/api/team', { cache: 'no-store' }),
          fetch('/api/billing/checkout', { cache: 'no-store' }),
        ]);
        const teamData = await teamRes.json().catch(() => []);
        const rateData = await rateRes.json().catch(() => ({}));
        if (!active) return;
        if (Array.isArray(teamData)) {
          setAllMembers(teamData);
        }
        if (Number(rateData?.usdToArsRate) > 0) {
          setUsdToArsRate(Number(rateData.usdToArsRate));
        }
      } catch {
        // keep safe defaults
      } finally {
        if (active) setLoadingMembers(false);
      }
    };
    void loadInitial();
    return () => {
      active = false;
    };
  }, [userRole]);

  if (userRole !== 'super_admin') {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-[#0A0C10]">
        <div className="max-w-md w-full bg-[#11141C] border border-rose-500/30 rounded-xl p-6 text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-rose-400 mx-auto" />
          <h2 className="text-base font-bold text-[#F3F5F8]">
            {isEs ? 'Acceso Exclusivo de Fundador' : 'Founder-Only Area'}
          </h2>
          <p className="text-xs text-[#949EB0]">
            {isEs
              ? 'Esta sección pertenece al Super Admin de la plataforma.'
              : 'This section is restricted to the platform Super Admin.'}
          </p>
        </div>
      </div>
    );
  }

  // SaaS KPIs
  const activeOrTrialWorkspaces = workspaces.filter(
    (w) =>
      (w.subscriptionStatus || 'trialing') === 'active' ||
      (w.subscriptionStatus || 'trialing') === 'trialing'
  );
  const payingWorkspaces = workspaces.filter((w) => w.subscriptionStatus === 'active');
  const estimatedMrrUsd = payingWorkspaces.reduce(
    (acc, w) => acc + SAAS_PLANS[normalizePlan(w.plan)].monthlyPriceUsd,
    0
  );
  const potentialMrrUsd = activeOrTrialWorkspaces.reduce(
    (acc, w) => acc + SAAS_PLANS[normalizePlan(w.plan)].monthlyPriceUsd,
    0
  );
  const estimatedMrrArs = Math.round(estimatedMrrUsd * usdToArsRate);
  const unlimitedCount = workspaces.filter((w) => (w.maxAccounts ?? 10) >= 999).length;
  const limitedMailboxesSum = workspaces.reduce(
    (acc, w) => acc + ((w.maxAccounts ?? 10) >= 999 ? 0 : (w.maxAccounts ?? 10)),
    0
  );

  const handleCreateAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    const cleanAgency = clientName.trim();
    const cleanWsName = (workspaceName.trim() || `${cleanAgency} Outbound`).trim();
    const cleanOwnerName = ownerName.trim();
    const cleanOwnerEmail = ownerEmail.trim().toLowerCase();

    if (!cleanAgency || !cleanOwnerName || !cleanOwnerEmail.includes('@')) {
      const validationMsg = isEs
        ? 'Completa el nombre de la agencia, nombre del dueño y un correo válido.'
        : 'Please complete agency name, owner name, and a valid email.';
      setErrorMsg(validationMsg);
      showToast(validationMsg, 'warning');
      setSubmitting(false);
      return;
    }

    try {
      const wsRes = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanWsName,
          clientName: cleanAgency,
          plan,
          subscriptionStatus: status,
          ownerEmail: cleanOwnerEmail,
          billingProvider: status === 'active' ? 'manual-concierge' : 'sandbox',
        }),
      });

      const wsData = await wsRes.json();
      if (!wsRes.ok || !wsData?.id) {
        throw new Error(wsData?.error || 'No se pudo crear el workspace de la agencia');
      }

      const teamRes = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: wsData.id,
          allowedWorkspaceIds: [wsData.id],
          fullName: cleanOwnerName,
          email: cleanOwnerEmail,
          company: cleanAgency,
          roleId: 'admin',
        }),
      });

      if (!teamRes.ok) {
        const teamErr = await teamRes.json().catch(() => ({}));
        throw new Error(teamErr?.error || 'No se pudo registrar al administrador de la agencia');
      }

      await refreshWorkspaces();
      await fetchMembersAndRate();

      const loginUrl =
        typeof window !== 'undefined' ? window.location.origin : 'https://app.misender.io';

      setProvisioned({
        agencyName: cleanAgency,
        workspaceName: wsData.name,
        workspaceId: wsData.id,
        ownerName: cleanOwnerName,
        ownerEmail: cleanOwnerEmail,
        plan,
        status,
        tempCode: `MiSender-${Math.floor(1000 + Math.random() * 9000)}`,
        loginUrl,
      });

      showToast({
        title: isEs ? 'Agencia provisionada correctamente' : 'Agency provisioned successfully',
        description: `${cleanAgency} • ${SAAS_PLANS[plan].name} (${cleanOwnerEmail})`,
        variant: 'success',
      });

      setClientName('');
      setWorkspaceName('');
      setOwnerName('');
      setOwnerEmail('');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error al dar de alta agencia';
      setErrorMsg(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCredentials = async () => {
    if (!provisioned) return;
    const planLabel = SAAS_PLANS[provisioned.plan].name;
    const msg = isEs
      ? `Hola ${provisioned.ownerName}, ya activamos tu cuenta de ${provisioned.agencyName} en MiSender (Plan ${planLabel}).\n\nAcceso: ${provisioned.loginUrl}\nEmail: ${provisioned.ownerEmail}\nCódigo de acceso inicial: ${provisioned.tempCode}\nWorkspace: ${provisioned.workspaceName}\n\nAl entrar, podrás crear Workspaces para tus clientes y dar de alta usuarios para tu equipo desde "Mi Equipo".`
      : `Hi ${provisioned.ownerName}, your ${provisioned.agencyName} MiSender account is live (${planLabel} Plan).\n\nLogin: ${provisioned.loginUrl}\nEmail: ${provisioned.ownerEmail}\nInitial access code: ${provisioned.tempCode}\nWorkspace: ${provisioned.workspaceName}`;

    try {
      await navigator.clipboard.writeText(msg);
      setCopiedCreds(true);
      showToast(
        isEs ? 'Credenciales copiadas al portapapeles' : 'Credentials copied to clipboard',
        'success'
      );
      setTimeout(() => setCopiedCreds(false), 2000);
    } catch {
      showToast(
        isEs ? 'No se pudieron copiar las credenciales' : 'Could not copy credentials',
        'error'
      );
    }
  };

  const handleUpdateWorkspace = async (
    ws: Workspace,
    patch: { plan?: WorkspacePlan; subscriptionStatus?: SubscriptionStatus }
  ) => {
    setUpdatingId(ws.id);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ws.id,
          plan: patch.plan ?? ws.plan,
          subscriptionStatus: patch.subscriptionStatus ?? ws.subscriptionStatus,
        }),
      });
      if (res.ok) {
        await refreshWorkspaces();
        showToast(
          isEs ? `Workspace "${ws.name}" actualizado` : `Workspace "${ws.name}" updated`,
          'success'
        );
      } else {
        showToast(
          isEs ? 'No se pudo actualizar el workspace' : 'Failed to update workspace',
          'error'
        );
      }
    } catch {
      showToast(
        isEs ? 'Error de red al actualizar workspace' : 'Network error updating workspace',
        'error'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0A0C10]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#11141C] border border-[#232938] rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#171B26] border border-[#E85D2A]/40 flex items-center justify-center text-[#E85D2A] shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-extrabold text-[#F3F5F8] tracking-tight">
                {isEs ? 'Backoffice de Fundador (Super Admin)' : 'Founder Backoffice (Super Admin)'}
              </h1>
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-lg bg-[#E85D2A]/15 text-[#E85D2A] border border-[#E85D2A]/35">
                Nivel 1 • SaaS Owner
              </span>
            </div>
            <p className="text-xs text-[#949EB0] mt-1 max-w-2xl leading-relaxed">
              {isEs
                ? 'Crea cuentas listas para tus clientes agencias (alta Concierge), asigna planes Starter/Growth/Agency, activa o pausa suscripciones y supervisa toda la plataforma desde un único panel.'
                : 'Onboard agency accounts manually, assign plans, toggle subscription status, and oversee the entire multi-tenant platform from one screen.'}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#949EB0]">
            <span>{isEs ? 'Agencias / Workspaces' : 'Agencies / Workspaces'}</span>
            <Building2 className="w-4 h-4 text-[#E85D2A]" />
          </div>
          <div className="text-2xl font-extrabold text-[#F3F5F8] font-mono tabular-nums">
            {workspaces.length}
          </div>
          <div className="text-[11px] text-emerald-400 font-mono tabular-nums">
            {payingWorkspaces.length} {isEs ? 'activos pagos' : 'paid active'} •{' '}
            {workspaces.length - payingWorkspaces.length} {isEs ? 'en trial / pausa' : 'trial / paused'}
          </div>
        </div>

        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#949EB0]">
            <span>{isEs ? 'MRR Activo Estimado' : 'Estimated Active MRR'}</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-[#F3F5F8] font-mono tabular-nums">
            ${estimatedMrrUsd.toLocaleString()}{' '}
            <span className="text-xs font-normal text-[#949EB0]">USD/mes</span>
          </div>
          <div className="text-[11px] text-[#949EB0] font-mono tabular-nums">
            ≈ ARS ${estimatedMrrArs.toLocaleString('es-AR')} ({isEs ? 'potencial' : 'potential'} ${potentialMrrUsd} USD)
          </div>
        </div>

        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#949EB0]">
            <span>{isEs ? 'Usuarios en Plataforma' : 'Total Platform Users'}</span>
            <Users className="w-4 h-4 text-[#949EB0]" />
          </div>
          <div className="text-2xl font-extrabold text-[#F3F5F8] font-mono tabular-nums">
            {loadingMembers ? '—' : allMembers.length}
          </div>
          <div className="text-[11px] text-[#949EB0]">
            {isEs ? 'Admins de agencia, SDRs y clientes' : 'Agency admins, SDRs & viewers'}
          </div>
        </div>

        <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#949EB0]">
            <span>{isEs ? 'Capacidad Casillas' : 'Mailbox Capacity'}</span>
            <Server className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-[#F3F5F8] font-mono tabular-nums">
            {unlimitedCount > 0 ? `${limitedMailboxesSum} + ${unlimitedCount}∞` : limitedMailboxesSum}
          </div>
          <div className="text-[11px] text-[#949EB0] font-mono tabular-nums">
            {isEs
              ? `${unlimitedCount} planes Agency ilimitados`
              : `${unlimitedCount} unlimited Agency plans`}
          </div>
        </div>
      </div>

      {/* Concierge Onboarding Form + Generated Credentials */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleCreateAgency}
          className="lg:col-span-7 bg-[#11141C] border border-[#1D2330] rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#F3F5F8] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#E85D2A]" />
                <span>
                  {isEs
                    ? 'Dar de Alta Nueva Agencia (Alta Manual / Concierge)'
                    : 'Onboard New Agency (Concierge Setup)'}
                </span>
              </h2>
              <p className="text-xs text-[#949EB0] mt-0.5">
                {isEs
                  ? 'Crea su Workspace inicial y registra automáticamente al dueño como Administrador de su agencia.'
                  : 'Creates initial workspace and registers the owner as Agency Admin automatically.'}
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#949EB0] mb-1.5">
                {isEs ? 'Nombre de la Agencia *' : 'Agency Name *'}
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ej: Impulso Digital B2B"
                className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3.5 py-2 text-xs text-[#F3F5F8] placeholder-[#949EB0]/50 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#949EB0] mb-1.5">
                {isEs ? 'Workspace Inicial' : 'Initial Workspace Name'}
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Ej: Principal Impulso Digital"
                className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3.5 py-2 text-xs text-[#F3F5F8] placeholder-[#949EB0]/50 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#949EB0] mb-1.5">
                {isEs ? 'Nombre del Dueño / Contacto *' : 'Owner Full Name *'}
              </label>
              <input
                type="text"
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Ej: Carlos Vega"
                className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3.5 py-2 text-xs text-[#F3F5F8] placeholder-[#949EB0]/50 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#949EB0] mb-1.5">
                {isEs ? 'Email del Dueño (Admin Agencia) *' : 'Owner Email (Agency Admin) *'}
              </label>
              <input
                type="email"
                required
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="carlos@impulsodigital.com"
                className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3.5 py-2 text-xs text-[#F3F5F8] placeholder-[#949EB0]/50 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#949EB0] mb-1.5">
                {isEs ? 'Plan Asignado' : 'Assigned Plan'}
              </label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as WorkspacePlan)}
                className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] font-mono tabular-nums focus:outline-none cursor-pointer transition"
              >
                <option value="starter">Starter ($39/m • 3 casillas)</option>
                <option value="growth">Growth ($79/m • 10 casillas)</option>
                <option value="agency">Agency ($149/m • Casillas ilimitadas)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#949EB0] mb-1.5">
                {isEs ? 'Estado Inicial' : 'Initial Status'}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
                className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none cursor-pointer transition"
              >
                <option value="active">{isEs ? 'Activo (Ya abonó)' : 'Active (Paid)'}</option>
                <option value="trialing">{isEs ? 'Trial 7 días (Prueba)' : '7-Day Trial'}</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white font-semibold px-5 py-2.5 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {submitting
                ? isEs
                  ? 'Creando Agencia...'
                  : 'Provisioning Agency...'
                : isEs
                  ? 'Generar Cuenta de Agencia'
                  : 'Provision Agency Account'}
            </span>
          </button>
        </form>

        {/* Credentials Card */}
        <div className="lg:col-span-5 bg-[#11141C] border border-[#1D2330] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#171B26] border border-[#232938] text-[#E85D2A] flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F3F5F8]">
                {isEs ? 'Tarjeta de Credenciales Listas' : 'Ready-to-Send Credentials Card'}
              </h3>
              <p className="text-[11px] text-[#949EB0]">
                {isEs
                  ? 'Copia y envía los accesos directos por WhatsApp o Email'
                  : 'Copy and send login details via WhatsApp or Email'}
              </p>
            </div>
          </div>

          {provisioned ? (
            <div className="bg-[#0A0C10] border border-emerald-500/35 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-300">{provisioned.agencyName}</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {SAAS_PLANS[provisioned.plan].name} • {provisioned.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-[#949EB0]">{isEs ? 'Dueño (Admin):' : 'Owner:'}</span>
                  <span className="text-[#F3F5F8] font-semibold">{provisioned.ownerName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#949EB0]">Email:</span>
                  <span className="text-[#F3F5F8] font-mono">{provisioned.ownerEmail}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#949EB0]">{isEs ? 'Código inicial:' : 'Initial code:'}</span>
                  <span className="text-amber-300 font-mono tabular-nums">{provisioned.tempCode}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#949EB0]">Workspace:</span>
                  <span className="text-[#F3F5F8] truncate">{provisioned.workspaceName}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#E85D2A] hover:bg-[#F26B3A] text-white font-semibold py-2 px-3 rounded-lg text-xs transition cursor-pointer"
                >
                  {copiedCreds ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>
                    {copiedCreds
                      ? isEs
                        ? 'Copiado'
                        : 'Copied'
                      : isEs
                        ? 'Copiar Accesos para WhatsApp / Email'
                        : 'Copy Login Details'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const customUser = Object.assign(
                      {
                        email: provisioned.ownerEmail,
                        fullName: provisioned.ownerName,
                        company: provisioned.agencyName,
                        workspaceId: provisioned.workspaceId,
                      },
                      { allowedWorkspaceIds: [provisioned.workspaceId] }
                    );
                    void signInAsRole('admin', customUser);
                  }}
                  className="flex items-center justify-center gap-1.5 bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] text-[#F3F5F8] font-semibold py-2 px-3 rounded-lg text-xs transition cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isEs ? 'Probar acceso' : 'Test login'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#0A0C10] border border-dashed border-[#232938] rounded-xl p-6 text-center space-y-2">
              <p className="text-xs text-[#949EB0] leading-relaxed">
                {isEs
                  ? 'Al generar una agencia en el formulario, aparecerán aquí sus credenciales y el mensaje listo para copiar y enviarle a tu cliente.'
                  : 'Once you create an agency on the left, its credentials and copyable welcome message will appear here.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Agencies / Workspaces Table */}
      <div className="bg-[#11141C] border border-[#1D2330] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1D2330] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#F3F5F8]">
              {isEs ? 'Agencias y Workspaces Registrados' : 'Registered Agencies & Workspaces'}
            </h2>
            <p className="text-xs text-[#949EB0]">
              {isEs
                ? 'Cambia planes, activa o pausa suscripciones y entra a cualquier Workspace para soporte.'
                : 'Change plans, activate or pause subscriptions, and jump into any workspace.'}
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#949EB0]">
            {workspaces.length} {isEs ? 'espacios' : 'workspaces'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1D2330] text-[11px] uppercase tracking-wider text-[#949EB0] bg-[#171B26]/60">
                <th className="py-3 px-4">{isEs ? 'Agencia / Workspace' : 'Agency / Workspace'}</th>
                <th className="py-3 px-4">{isEs ? 'Dueño / Equipo' : 'Owner / Team'}</th>
                <th className="py-3 px-4">{isEs ? 'Plan SaaS' : 'SaaS Plan'}</th>
                <th className="py-3 px-4">{isEs ? 'Estado' : 'Status'}</th>
                <th className="py-3 px-4">{isEs ? 'Límites' : 'Limits'}</th>
                <th className="py-3 px-4 text-right">{isEs ? 'Acciones' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D2330] text-xs">
              {workspaces.map((ws) => {
                const wsPlan = normalizePlan(ws.plan);
                const wsStatus = ws.subscriptionStatus || 'trialing';
                const wsMembers = allMembers.filter(
                  (m) => m.workspaceId === ws.id || Boolean(m.allowedWorkspaceIds?.includes(ws.id))
                );
                const isActiveWs = currentWorkspace.id === ws.id;
                const isBusy = updatingId === ws.id;

                return (
                  <tr key={ws.id} className="hover:bg-[#171B26]/50 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-[#F3F5F8] flex items-center gap-2">
                        <span>{ws.clientName || ws.name}</span>
                        {isActiveWs && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-[#E85D2A]/15 text-[#E85D2A] border border-[#E85D2A]/35">
                            {isEs ? 'En vista' : 'Current'}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#949EB0]">
                        {ws.name} • <span className="font-mono text-[10px]">{ws.id}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-[#F3F5F8] font-mono text-[11px]">
                        {ws.ownerEmail || (ws.id === 'ws-primary' ? 'marcos@vectrasystems.com.ar' : '—')}
                      </div>
                      <div className="text-[10px] text-[#949EB0] font-mono tabular-nums">
                        {wsMembers.length} {isEs ? 'usuarios asignados' : 'assigned users'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <select
                        value={wsPlan}
                        disabled={isBusy}
                        onChange={(e) =>
                          void handleUpdateWorkspace(ws, { plan: e.target.value as WorkspacePlan })
                        }
                        className="bg-[#171B26] border border-[#232938] hover:border-[#E85D2A] rounded-lg px-2.5 py-1 text-xs text-[#F3F5F8] font-mono tabular-nums focus:outline-none cursor-pointer disabled:opacity-50 transition"
                      >
                        <option value="starter">Starter ($39/m)</option>
                        <option value="growth">Growth ($79/m)</option>
                        <option value="agency">Agency ($149/m)</option>
                      </select>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase border ${
                          wsStatus === 'active'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : wsStatus === 'trialing'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {wsStatus}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-[11px] text-[#F3F5F8] font-mono tabular-nums">
                      <div>
                        {(ws.maxAccounts ?? 10) >= 999 ? '∞' : ws.maxAccounts}{' '}
                        {isEs ? 'casillas' : 'boxes'} • {(ws.maxLeads ?? 10000).toLocaleString()} leads
                      </div>
                      <div className="text-[10px] text-emerald-400">
                        {ws.credits.toLocaleString()} {isEs ? 'créditos' : 'credits'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleUpdateWorkspace(ws, {
                              subscriptionStatus: wsStatus === 'active' ? 'canceled' : 'active',
                            })
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer disabled:opacity-50 ${
                            wsStatus === 'active'
                              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {wsStatus === 'active' ? (
                            <>
                              <PauseCircle className="w-3.5 h-3.5" />
                              <span>{isEs ? 'Pausar' : 'Pause'}</span>
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-3.5 h-3.5" />
                              <span>{isEs ? 'Activar' : 'Activate'}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            switchWorkspace(ws);
                            onOpenWorkspace?.(ws);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#171B26] hover:bg-[#1D2330] text-[#F3F5F8] border border-[#232938] hover:border-[#E85D2A]/60 transition cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-[#E85D2A]" />
                          <span>{isEs ? 'Abrir Workspace' : 'Open Workspace'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
