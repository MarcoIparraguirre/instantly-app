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
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  KeyRound,
  Trash2,
  UserPlus,
  RefreshCw,
  LogIn,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useFeedback } from '@/context/FeedbackContext';
import {
  Workspace,
  WorkspacePlan,
  SubscriptionStatus,
  TeamMember,
  UserRole,
  SAAS_PLANS,
  ROLE_PERMISSIONS,
  normalizePlan,
  normalizeRole,
} from '@/types';

interface FounderBackofficeViewProps {
  onOpenWorkspace?: (ws: Workspace) => void;
}

interface ProvisionedCredentials {
  agencyId: string;
  agencyName: string;
  workspaceName: string;
  workspaceId: string;
  ownerId?: string;
  ownerName: string;
  ownerEmail: string;
  plan: WorkspacePlan;
  status: SubscriptionStatus;
  tempCode: string;
  loginUrl: string;
}

function makeTempAccessCode(prefix = 'MiSender'): string {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function FounderBackofficeView({ onOpenWorkspace }: FounderBackofficeViewProps) {
  const { user, workspaces, currentWorkspace, switchWorkspace, refreshWorkspaces, signInAsRole } =
    useAuth();
  const { language } = useLanguage();
  const { showToast, confirm } = useFeedback();
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
  const [initialAccessCode, setInitialAccessCode] = useState('MiSender-2026');
  const [plan, setPlan] = useState<WorkspacePlan>('agency');
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<ProvisionedCredentials | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Add User to Agency inline form state
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserAccessCode, setNewUserAccessCode] = useState('Admin-2026');
  const [newUserRole, setNewUserRole] = useState<UserRole>('admin');
  const [newUserWorkspaceId, setNewUserWorkspaceId] = useState('');
  const [submittingUser, setSubmittingUser] = useState(false);
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);

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

  const effectiveNewUserWorkspaceId = workspaces.some((w) => w.id === newUserWorkspaceId)
    ? newUserWorkspaceId
    : workspaces[0]?.id || '';

  if (userRole !== 'super_admin') {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-[#F4F7F5] text-[#14213D]">
        <div className="max-w-md w-full bg-white border border-rose-200 shadow-sm rounded-xl p-6 text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-rose-600 mx-auto" />
          <h2 className="text-base font-bold text-[#14213D]">
            {isEs ? 'Acceso Exclusivo de Fundador' : 'Founder-Only Area'}
          </h2>
          <p className="text-xs text-[#5C6F68]">
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
    const cleanAccessCode = (initialAccessCode.trim() || makeTempAccessCode('MiSender')).trim();

    if (!cleanAgency || !cleanOwnerName || !cleanOwnerEmail.includes('@') || cleanAccessCode.length < 4) {
      const validationMsg = isEs
        ? 'Completa agencia, nombre del dueño, correo válido y código de acceso (mín. 4 caracteres).'
        : 'Complete agency name, owner name, valid email, and access code (min 4 chars).';
      setErrorMsg(validationMsg);
      showToast(validationMsg, 'warning');
      setSubmitting(false);
      return;
    }

    const agencyId = `ag-${Date.now().toString(36)}`;

    try {
      const wsRes = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanWsName,
          clientName: cleanAgency,
          agencyId,
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
          agencyId,
          accessCode: cleanAccessCode,
          fullName: cleanOwnerName,
          email: cleanOwnerEmail,
          company: cleanAgency,
          roleId: 'admin',
        }),
      });

      const teamData = await teamRes.json().catch(() => ({}));
      if (!teamRes.ok) {
        throw new Error(teamData?.error || 'No se pudo registrar al administrador de la agencia');
      }

      await refreshWorkspaces();
      await fetchMembersAndRate();

      const loginUrl =
        typeof window !== 'undefined' ? window.location.origin : 'https://app.misender.io';

      setProvisioned({
        agencyId,
        agencyName: cleanAgency,
        workspaceName: wsData.name,
        workspaceId: wsData.id,
        ownerId: teamData?.id,
        ownerName: cleanOwnerName,
        ownerEmail: cleanOwnerEmail,
        plan,
        status,
        tempCode: cleanAccessCode,
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
      setInitialAccessCode(makeTempAccessCode('MiSender'));
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
      ? `Hola ${provisioned.ownerName}, ya activamos tu cuenta de ${provisioned.agencyName} en MiSender (Plan ${planLabel}).\n\nAcceso: ${provisioned.loginUrl}\nEmail: ${provisioned.ownerEmail}\nContraseña / Código de acceso: ${provisioned.tempCode}\nWorkspace inicial: ${provisioned.workspaceName}\n\nAl entrar, podrás crear Workspaces para tus clientes y dar de alta usuarios para tu equipo desde "Mi Equipo".`
      : `Hi ${provisioned.ownerName}, your ${provisioned.agencyName} MiSender account is live (${planLabel} Plan).\n\nLogin: ${provisioned.loginUrl}\nEmail: ${provisioned.ownerEmail}\nPassword / Access code: ${provisioned.tempCode}\nInitial workspace: ${provisioned.workspaceName}`;

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

  const handleDeleteWorkspace = async (ws: Workspace) => {
    const confirmed = await confirm({
      title: isEs ? '¿Eliminar Workspace / Agencia?' : 'Delete Workspace / Agency?',
      description: isEs
        ? `Se eliminará "${ws.clientName || ws.name}" (${ws.name}). Esta acción no borra usuarios automáticamente.`
        : `Delete "${ws.clientName || ws.name}" (${ws.name}). Users must be removed separately if needed.`,
      confirmLabel: isEs ? 'Eliminar' : 'Delete',
      cancelLabel: isEs ? 'Cancelar' : 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setUpdatingId(ws.id);
    try {
      const res = await fetch(`/api/workspaces?id=${encodeURIComponent(ws.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(
          errData?.error || (isEs ? 'No se pudo eliminar el workspace' : 'Failed to delete workspace'),
          'error'
        );
        return;
      }
      await refreshWorkspaces();
      showToast(
        isEs ? `Workspace "${ws.name}" eliminado` : `Workspace "${ws.name}" deleted`,
        'success'
      );
    } catch {
      showToast(
        isEs ? 'Error de red al eliminar workspace' : 'Network error deleting workspace',
        'error'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleEnterAsAgencyAdmin = async (ws: Workspace) => {
    const agencyWsIds = workspaces
      .filter((w) => (ws.agencyId && w.agencyId === ws.agencyId) || w.id === ws.id)
      .map((w) => w.id);

    const adminMatch =
      allMembers.find(
        (m) =>
          m.roleId === 'admin' &&
          ((ws.agencyId && m.agencyId === ws.agencyId) ||
            (ws.ownerEmail && m.email.toLowerCase() === ws.ownerEmail.toLowerCase()) ||
            m.workspaceId === ws.id ||
            Boolean(m.allowedWorkspaceIds?.includes(ws.id)))
      ) ||
      allMembers.find(
        (m) => ws.ownerEmail && m.email.toLowerCase() === ws.ownerEmail.toLowerCase()
      );

    const allowedIds = Array.from(
      new Set([...agencyWsIds, ...(adminMatch?.allowedWorkspaceIds || [])])
    );

    switchWorkspace(ws);
    await signInAsRole('admin', {
      id: adminMatch?.id,
      email: adminMatch?.email || ws.ownerEmail || 'admin@agencia.com',
      fullName: adminMatch?.fullName || ws.clientName || ws.name,
      company: adminMatch?.company || ws.clientName || ws.name,
      agencyId: adminMatch?.agencyId || ws.agencyId,
      workspaceId: ws.id,
      allowedWorkspaceIds: allowedIds,
    });
    onOpenWorkspace?.(ws);
  };

  const handleAddUserToAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveNewUserWorkspaceId) return;
    const targetWs = workspaces.find((w) => w.id === effectiveNewUserWorkspaceId);
    if (!targetWs) return;

    setSubmittingUser(true);
    try {
      const agencyWsIds = workspaces
        .filter((w) => targetWs.agencyId && w.agencyId === targetWs.agencyId)
        .map((w) => w.id);
      const effectiveAllowed =
        newUserRole === 'admin' && agencyWsIds.length > 0
          ? agencyWsIds
          : [targetWs.id];

      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: targetWs.id,
          allowedWorkspaceIds: effectiveAllowed,
          agencyId: targetWs.agencyId,
          accessCode: newUserAccessCode.trim() || makeTempAccessCode('User'),
          fullName: newUserFullName.trim(),
          email: newUserEmail.trim().toLowerCase(),
          company: targetWs.clientName || targetWs.name,
          roleId: newUserRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || (isEs ? 'Error al crear usuario' : 'Failed to add user'));
      }

      await fetchMembersAndRate();
      showToast({
        title: isEs ? 'Usuario asignado a la agencia' : 'User assigned to agency',
        description: `${data.fullName} (${data.email}) • ${ROLE_PERMISSIONS[normalizeRole(data.roleId)].labelEs}`,
        variant: 'success',
      });
      setNewUserFullName('');
      setNewUserEmail('');
      setNewUserAccessCode(makeTempAccessCode('Admin'));
      setShowAddUserForm(false);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : isEs ? 'Error creando usuario' : 'Error creating user',
        'error'
      );
    } finally {
      setSubmittingUser(false);
    }
  };

  const handleUpdateMemberRole = async (member: TeamMember, nextRole: UserRole) => {
    setUpdatingId(member.id);
    try {
      const res = await fetch('/api/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, roleId: nextRole }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(
          errData?.error || (isEs ? 'No se pudo actualizar el rol' : 'Failed to update role'),
          'error'
        );
        return;
      }
      await fetchMembersAndRate();
      showToast(
        isEs
          ? `Rol de ${member.fullName} actualizado a ${ROLE_PERMISSIONS[nextRole].labelEs}`
          : `${member.fullName} role updated`,
        'success'
      );
    } catch {
      showToast(isEs ? 'Error de red' : 'Network error', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteMember = async (member: TeamMember) => {
    if (member.id === 'admin-default') return;
    const confirmed = await confirm({
      title: isEs ? '¿Eliminar usuario de la plataforma?' : 'Remove platform user?',
      description: isEs
        ? `Se revocará completamente el acceso de ${member.fullName} (${member.email}).`
        : `Permanently revoke access for ${member.fullName} (${member.email}).`,
      confirmLabel: isEs ? 'Eliminar' : 'Delete',
      cancelLabel: isEs ? 'Cancelar' : 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setUpdatingId(member.id);
    try {
      const res = await fetch(`/api/team?id=${encodeURIComponent(member.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(
          errData?.error || (isEs ? 'No se pudo eliminar el usuario' : 'Failed to delete user'),
          'error'
        );
        return;
      }
      await fetchMembersAndRate();
      showToast(isEs ? `Usuario ${member.email} eliminado` : `User ${member.email} removed`, 'success');
    } catch {
      showToast(isEs ? 'Error de red' : 'Network error', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCopyMemberAccess = async (member: TeamMember) => {
    const loginUrl =
      typeof window !== 'undefined' ? window.location.origin : 'https://app.misender.io';
    const roleLabel = isEs
      ? ROLE_PERMISSIONS[normalizeRole(member.roleId)].labelEs
      : ROLE_PERMISSIONS[normalizeRole(member.roleId)].labelEn;
    const codeText = member.accessCode
      ? isEs
        ? `\nContraseña / Código de acceso: ${member.accessCode}`
        : `\nAccess code: ${member.accessCode}`
      : '';
    const msg = isEs
      ? `Acceso a MiSender (${roleLabel})\nURL: ${loginUrl}\nEmail: ${member.email}${codeText}`
      : `MiSender Access (${roleLabel})\nURL: ${loginUrl}\nEmail: ${member.email}${codeText}`;

    try {
      await navigator.clipboard.writeText(msg);
      setCopiedMemberId(member.id);
      showToast(isEs ? `Acceso copiado (${member.email})` : `Access copied (${member.email})`, 'success');
      setTimeout(() => setCopiedMemberId(null), 1800);
    } catch {
      showToast(isEs ? 'No se pudo copiar' : 'Copy failed', 'error');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#F4F7F5] text-[#14213D]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#14213D] flex items-center justify-center text-[#D5ECD4] shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-extrabold text-[#14213D] tracking-tight">
                {isEs ? 'Consola Super Admin · Agencias y Usuarios' : 'Super Admin Console · Agencies & Users'}
              </h1>
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-lg bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]">
                Nivel 1 • SaaS Owner
              </span>
            </div>
            <p className="text-xs text-[#5C6F68] mt-1 max-w-2xl leading-relaxed">
              {isEs
                ? 'Tu alcance como Super Admin se centra en crear agencias, asignar sus usuarios Administradores y gestionar sus planes. Cada Administrador crea luego sus Workspaces de clientes y su propio equipo.'
                : 'Super Admin manages agencies, plans, and Agency Admin accounts. Each Agency Admin creates their own client Workspaces and team members.'}
            </p>
          </div>
        </div>
      </div>

      {/* Signature 4-Tone KPI Cards (NexaVerse Palette) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] rounded-xl p-4 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#14213D]/80 font-semibold">
            <span>{isEs ? 'Agencias / Workspaces' : 'Agencies / Workspaces'}</span>
            <Building2 className="w-4 h-4 text-[#14213D]" />
          </div>
          <div className="text-2xl font-extrabold text-[#14213D] font-mono tabular-nums">
            {workspaces.length}
          </div>
          <div className="text-[11px] text-[#5C6F68] font-mono tabular-nums">
            {payingWorkspaces.length} {isEs ? 'activos pagos' : 'paid active'} •{' '}
            {workspaces.length - payingWorkspaces.length} {isEs ? 'en trial / pausa' : 'trial / paused'}
          </div>
        </div>

        <div className="bg-[#C3DAC3] border border-[#A1B0AB]/50 text-[#14213D] rounded-xl p-4 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#14213D]/80 font-semibold">
            <span>{isEs ? 'MRR Activo Estimado' : 'Estimated Active MRR'}</span>
            <DollarSign className="w-4 h-4 text-[#14213D]" />
          </div>
          <div className="text-2xl font-extrabold text-[#14213D] font-mono tabular-nums">
            ${estimatedMrrUsd.toLocaleString()}{' '}
            <span className="text-xs font-normal text-[#14213D]/75">USD/mes</span>
          </div>
          <div className="text-[11px] text-[#14213D]/80 font-mono tabular-nums">
            ≈ ARS ${estimatedMrrArs.toLocaleString('es-AR')} ({isEs ? 'potencial' : 'potential'} ${potentialMrrUsd} USD)
          </div>
        </div>

        <div className="bg-[#A1B0AB] border border-[#5C6F68]/30 text-[#14213D] rounded-xl p-4 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#14213D]/85 font-semibold">
            <span>{isEs ? 'Usuarios en Plataforma' : 'Total Platform Users'}</span>
            <Users className="w-4 h-4 text-[#14213D]" />
          </div>
          <div className="text-2xl font-extrabold text-[#14213D] font-mono tabular-nums">
            {loadingMembers ? '—' : allMembers.length}
          </div>
          <div className="text-[11px] text-[#14213D]/80">
            {isEs ? 'Super Admin, admins, SDRs y clientes' : 'Super Admin, agency admins, SDRs & viewers'}
          </div>
        </div>

        <div className="bg-[#5C6F68] border border-[#5C6F68] text-white rounded-xl p-4 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-white/85 font-semibold">
            <span>{isEs ? 'Capacidad Casillas' : 'Mailbox Capacity'}</span>
            <Server className="w-4 h-4 text-white" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono tabular-nums">
            {unlimitedCount > 0 ? `${limitedMailboxesSum} + ${unlimitedCount}∞` : limitedMailboxesSum}
          </div>
          <div className="text-[11px] text-[#D5ECD4] font-mono tabular-nums">
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
          className="lg:col-span-7 bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#14213D] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#14213D]" />
                <span>
                  {isEs
                    ? 'Dar de Alta Nueva Agencia y Usuario Admin'
                    : 'Onboard New Agency & Admin User'}
                </span>
              </h2>
              <p className="text-xs text-[#5C6F68] mt-0.5">
                {isEs
                  ? 'Crea su espacio aislado inicial y genera el usuario Administrador con su código de acceso.'
                  : 'Creates an isolated initial workspace and provisions the Agency Admin user with an access code.'}
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#5C6F68] mb-1.5">
                {isEs ? 'Nombre de la Agencia *' : 'Agency Name *'}
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ej: Impulso Digital B2B"
                className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3.5 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5C6F68] mb-1.5">
                {isEs ? 'Workspace Inicial' : 'Initial Workspace Name'}
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Ej: Principal Impulso Digital"
                className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3.5 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5C6F68] mb-1.5">
                {isEs ? 'Nombre del Admin Agencia *' : 'Agency Admin Full Name *'}
              </label>
              <input
                type="text"
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Ej: Carlos Vega"
                className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3.5 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5C6F68] mb-1.5">
                {isEs ? 'Email del Admin Agencia *' : 'Agency Admin Email *'}
              </label>
              <input
                type="email"
                required
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="carlos@impulsodigital.com"
                className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3.5 py-2 text-xs font-mono text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5C6F68] mb-1.5">
                {isEs ? 'Contraseña / Código de Acceso *' : 'Initial Password / Access Code *'}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  required
                  minLength={4}
                  value={initialAccessCode}
                  onChange={(e) => setInitialAccessCode(e.target.value)}
                  className="flex-1 bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3.5 py-2 text-xs font-mono text-[#14213D] focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setInitialAccessCode(makeTempAccessCode('MiSender'))}
                  title={isEs ? 'Generar código aleatorio' : 'Generate random code'}
                  className="p-2 rounded-lg bg-[#EEF3F0] hover:bg-[#D5ECD4] border border-[#DCE3DF] text-[#14213D] transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[#5C6F68] mb-1.5">
                  {isEs ? 'Plan SaaS' : 'SaaS Plan'}
                </label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as WorkspacePlan)}
                  className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-2.5 py-2 text-xs text-[#14213D] font-mono tabular-nums focus:outline-none cursor-pointer transition"
                >
                  <option value="starter">Starter ($39)</option>
                  <option value="growth">Growth ($79)</option>
                  <option value="agency">Agency ($149)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5C6F68] mb-1.5">
                  {isEs ? 'Estado' : 'Status'}
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
                  className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-2.5 py-2 text-xs text-[#14213D] focus:outline-none cursor-pointer transition"
                >
                  <option value="active">{isEs ? 'Activo' : 'Active'}</option>
                  <option value="trialing">{isEs ? 'Trial 7d' : 'Trial 7d'}</option>
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold px-5 py-2.5 rounded-lg text-xs transition cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#D5ECD4]" />
            <span>
              {submitting
                ? isEs
                  ? 'Creando Agencia...'
                  : 'Provisioning Agency...'
                : isEs
                  ? 'Crear Agencia y Asignar Admin'
                  : 'Create Agency & Assign Admin'}
            </span>
          </button>
        </form>

        {/* Credentials Card */}
        <div className="lg:col-span-5 bg-white border border-[#DCE3DF] shadow-sm rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D5ECD4] border border-[#C3DAC3] text-[#14213D] flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#14213D]">
                {isEs ? 'Tarjeta de Credenciales Listas' : 'Ready-to-Send Credentials Card'}
              </h3>
              <p className="text-[11px] text-[#5C6F68]">
                {isEs
                  ? 'Envía estos datos al Administrador para que continúe su configuración'
                  : 'Share these credentials with the Agency Admin to start'}
              </p>
            </div>
          </div>

          {provisioned ? (
            <div className="bg-[#F4F7F5] border border-[#C3DAC3] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#14213D]">{provisioned.agencyName}</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-lg bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3] font-bold">
                  {SAAS_PLANS[provisioned.plan].name} • {provisioned.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-[#5C6F68]">{isEs ? 'Admin Agencia:' : 'Agency Admin:'}</span>
                  <span className="text-[#14213D] font-semibold">{provisioned.ownerName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#5C6F68]">Email:</span>
                  <span className="text-[#14213D] font-mono">{provisioned.ownerEmail}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#5C6F68]">{isEs ? 'Contraseña inicial:' : 'Initial code:'}</span>
                  <span className="text-[#14213D] bg-[#D5ECD4] px-2 py-0.5 rounded font-mono tabular-nums font-bold">
                    {provisioned.tempCode}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#5C6F68] shrink-0">Workspace:</span>
                  <span className="text-[#14213D] font-medium text-right truncate">
                    {provisioned.workspaceName}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold py-2 px-3 rounded-lg text-xs transition cursor-pointer"
                >
                  {copiedCreds ? <Check className="w-3.5 h-3.5 text-[#D5ECD4]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>
                    {copiedCreds
                      ? isEs
                        ? 'Copiado'
                        : 'Copied'
                      : isEs
                        ? 'Copiar Accesos'
                        : 'Copy Login Details'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void signInAsRole('admin', {
                      id: provisioned.ownerId,
                      email: provisioned.ownerEmail,
                      fullName: provisioned.ownerName,
                      company: provisioned.agencyName,
                      agencyId: provisioned.agencyId,
                      workspaceId: provisioned.workspaceId,
                      allowedWorkspaceIds: [provisioned.workspaceId],
                    });
                    onOpenWorkspace?.({
                      id: provisioned.workspaceId,
                      name: provisioned.workspaceName,
                      clientName: provisioned.agencyName,
                      agencyId: provisioned.agencyId,
                      plan: provisioned.plan,
                      subscriptionStatus: provisioned.status,
                      credits: SAAS_PLANS[provisioned.plan].credits,
                    });
                  }}
                  className="flex items-center justify-center gap-1.5 bg-white hover:bg-[#EEF3F0] border border-[#DCE3DF] text-[#14213D] font-semibold py-2 px-3 rounded-lg text-xs transition cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{isEs ? 'Entrar como Admin' : 'Enter as Admin'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#F4F7F5] border border-dashed border-[#A1B0AB] rounded-xl p-6 text-center space-y-2">
              <p className="text-xs text-[#5C6F68] leading-relaxed">
                {isEs
                  ? 'Al generar una agencia en el formulario, aparecerán aquí las credenciales exactas de acceso (Email + Contraseña inicial) listas para entregar a tu cliente.'
                  : 'Once you create an agency on the left, its email and initial password will appear here ready to share.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Agencies / Workspaces Table */}
      <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#DCE3DF] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#14213D]">
              {isEs ? 'Agencias y Workspaces Registrados' : 'Registered Agencies & Workspaces'}
            </h2>
            <p className="text-xs text-[#5C6F68]">
              {isEs
                ? 'Cambia planes, activa o pausa suscripciones, entra como Administrador de agencia para soporte o elimina espacios.'
                : 'Change plans, toggle subscriptions, enter as Agency Admin, or delete workspaces.'}
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#5C6F68]">
            {workspaces.length} {isEs ? 'espacios' : 'workspaces'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE3DF] text-[11px] uppercase tracking-wider text-[#5C6F68] bg-[#EEF3F0]">
                <th className="py-3 px-4">{isEs ? 'Agencia / Workspace' : 'Agency / Workspace'}</th>
                <th className="py-3 px-4">{isEs ? 'Admin / Equipo' : 'Admin / Team'}</th>
                <th className="py-3 px-4">{isEs ? 'Plan SaaS' : 'SaaS Plan'}</th>
                <th className="py-3 px-4">{isEs ? 'Estado' : 'Status'}</th>
                <th className="py-3 px-4">{isEs ? 'Límites' : 'Limits'}</th>
                <th className="py-3 px-4 text-right">{isEs ? 'Acciones' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE3DF] text-xs">
              {workspaces.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-6 text-center text-xs text-[#5C6F68]">
                    {isEs
                      ? 'No hay agencias creadas todavía. Completa el formulario superior para dar de alta la primera agencia y asignarle su Administrador.'
                      : 'No agencies created yet. Use the form above to onboard the first agency and assign its Admin.'}
                  </td>
                </tr>
              ) : (
                workspaces.map((ws) => {
                  const wsPlan = normalizePlan(ws.plan);
                  const wsStatus = ws.subscriptionStatus || 'trialing';
                  const wsMembers = allMembers.filter(
                    (m) =>
                      m.workspaceId === ws.id ||
                      Boolean(m.allowedWorkspaceIds?.includes(ws.id)) ||
                      (ws.agencyId && m.agencyId === ws.agencyId)
                  );
                  const isActiveWs = currentWorkspace.id === ws.id;
                  const isBusy = updatingId === ws.id;

                  return (
                    <tr key={ws.id} className="hover:bg-[#F4F7F5] transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#14213D] flex items-center gap-2">
                          <span>{ws.clientName || ws.name}</span>
                          {isActiveWs && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]">
                              {isEs ? 'Seleccionado' : 'Selected'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#5C6F68]">
                          {ws.name} • <span className="font-mono text-[10px]">{ws.id}</span>
                          {ws.agencyId && (
                            <span className="ml-1.5 font-mono text-[10px] text-[#5C6F68]/80">
                              ({ws.agencyId})
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-[#14213D] font-mono text-[11px]">
                          {ws.ownerEmail || '—'}
                        </div>
                        <div className="text-[10px] text-[#5C6F68] font-mono tabular-nums">
                          {wsMembers.length} {isEs ? 'usuarios en agencia' : 'agency users'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          value={wsPlan}
                          disabled={isBusy}
                          onChange={(e) =>
                            void handleUpdateWorkspace(ws, { plan: e.target.value as WorkspacePlan })
                          }
                          className="bg-[#F4F7F5] border border-[#DCE3DF] hover:border-[#14213D] rounded-lg px-2.5 py-1 text-xs text-[#14213D] font-mono tabular-nums focus:outline-none cursor-pointer disabled:opacity-50 transition"
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
                              ? 'bg-[#D5ECD4] text-[#14213D] border-[#C3DAC3]'
                              : wsStatus === 'trialing'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {wsStatus}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-[11px] text-[#14213D] font-mono tabular-nums">
                        <div>
                          {(ws.maxAccounts ?? 10) >= 999 ? '∞' : ws.maxAccounts}{' '}
                          {isEs ? 'casillas' : 'boxes'} • {(ws.maxLeads ?? 10000).toLocaleString()} leads
                        </div>
                        <div className="text-[10px] text-[#5C6F68] font-semibold">
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
                                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                : 'bg-[#D5ECD4] hover:bg-[#C3DAC3] text-[#14213D] border-[#C3DAC3]'
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
                            disabled={isBusy}
                            onClick={() => void handleEnterAsAgencyAdmin(ws)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#EEF3F0] hover:bg-[#14213D] text-[#14213D] hover:text-white border border-[#DCE3DF] hover:border-[#14213D] transition cursor-pointer group disabled:opacity-50"
                          >
                            <LogIn className="w-3.5 h-3.5 text-[#14213D] group-hover:text-[#D5ECD4]" />
                            <span>{isEs ? 'Entrar como Admin' : 'Enter as Admin'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDeleteWorkspace(ws)}
                            title={isEs ? 'Eliminar Workspace' : 'Delete Workspace'}
                            className="p-1.5 rounded-lg text-[#5C6F68] hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Platform Users & Agency Admins Directory */}
      <div className="bg-white border border-[#DCE3DF] shadow-sm rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#DCE3DF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#14213D] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#14213D]" />
              <span>
                {isEs ? 'Usuarios y Administradores de Agencia' : 'Platform Users & Agency Admins'}
              </span>
            </h2>
            <p className="text-xs text-[#5C6F68]">
              {isEs
                ? 'Asigna administradores adicionales a cualquier agencia, consulta códigos de acceso o cambia roles.'
                : 'Assign extra admins to an agency, review access codes, or manage user roles.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tabular-nums text-[#5C6F68]">
              {allMembers.length} {isEs ? 'usuarios' : 'users'}
            </span>
            {workspaces.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAddUserForm((prev) => !prev)}
                className="inline-flex items-center gap-1.5 bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer shadow-sm"
              >
                <UserPlus className="w-3.5 h-3.5 text-[#D5ECD4]" />
                <span>
                  {showAddUserForm
                    ? isEs
                      ? 'Cerrar'
                      : 'Close'
                    : isEs
                      ? 'Asignar Usuario a Agencia'
                      : 'Assign User to Agency'}
                </span>
              </button>
            )}
          </div>
        </div>

        {showAddUserForm && workspaces.length > 0 && (
          <form
            onSubmit={handleAddUserToAgency}
            className="p-5 bg-[#F4F7F5] border-b border-[#DCE3DF] space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#5C6F68] mb-1">
                  {isEs ? 'Nombre Completo *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={newUserFullName}
                  onChange={(e) => setNewUserFullName(e.target.value)}
                  placeholder="Ej: Laura Paz"
                  className="w-full bg-white border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3 py-1.5 text-xs text-[#14213D] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5C6F68] mb-1">
                  {isEs ? 'Email *' : 'Email *'}
                </label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="laura@agencia.com"
                  className="w-full bg-white border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3 py-1.5 text-xs font-mono text-[#14213D] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5C6F68] mb-1">
                  {isEs ? 'Código de Acceso *' : 'Access Code *'}
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  value={newUserAccessCode}
                  onChange={(e) => setNewUserAccessCode(e.target.value)}
                  className="w-full bg-white border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-3 py-1.5 text-xs font-mono text-[#14213D] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5C6F68] mb-1">
                  {isEs ? 'Agencia / Workspace *' : 'Agency / Workspace *'}
                </label>
                <select
                  value={effectiveNewUserWorkspaceId}
                  onChange={(e) => setNewUserWorkspaceId(e.target.value)}
                  className="w-full bg-white border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-2.5 py-1.5 text-xs text-[#14213D] focus:outline-none cursor-pointer"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.clientName || ws.name} — {ws.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5C6F68] mb-1">
                  {isEs ? 'Rol' : 'Role'}
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="flex-1 bg-white border border-[#DCE3DF] focus:border-[#14213D] rounded-lg px-2.5 py-1.5 text-xs text-[#14213D] focus:outline-none cursor-pointer"
                  >
                    <option value="admin">{isEs ? 'Admin Agencia' : 'Agency Admin'}</option>
                    <option value="campaign_manager">{isEs ? 'Gestor (SDR)' : 'Manager'}</option>
                    <option value="viewer">{isEs ? 'Solo Lectura' : 'Read Only'}</option>
                  </select>
                  <button
                    type="submit"
                    disabled={submittingUser}
                    className="px-3.5 py-1.5 bg-[#14213D] hover:bg-[#1E3158] text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {submittingUser ? '...' : isEs ? 'Guardar' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE3DF] text-[11px] uppercase tracking-wider text-[#5C6F68] bg-[#EEF3F0]">
                <th className="py-3 px-4">{isEs ? 'Usuario' : 'User'}</th>
                <th className="py-3 px-4">{isEs ? 'Agencia / Empresa' : 'Agency / Company'}</th>
                <th className="py-3 px-4">{isEs ? 'Código de Acceso' : 'Access Code'}</th>
                <th className="py-3 px-4">{isEs ? 'Rol' : 'Role'}</th>
                <th className="py-3 px-4 text-right">{isEs ? 'Acciones' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE3DF] text-xs">
              {allMembers.map((member) => {
                const isFounderAccount = member.id === 'admin-default';
                const isBusy = updatingId === member.id;
                const roleCfg = ROLE_PERMISSIONS[normalizeRole(member.roleId)];
                const memberWsNames = (member.allowedWorkspaceIds || [member.workspaceId])
                  .map((wsId) => workspaces.find((w) => w.id === wsId)?.name)
                  .filter(Boolean);

                return (
                  <tr key={member.id} className="hover:bg-[#F4F7F5] transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#14213D] flex items-center gap-2">
                        <span>{member.fullName}</span>
                        {isFounderAccount && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-[#14213D] text-[#D5ECD4] font-semibold">
                            {isEs ? 'Fundador' : 'Founder'}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#5C6F68] font-mono">{member.email}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="text-[#14213D] font-medium">
                        {member.company || '—'}
                      </div>
                      {memberWsNames.length > 0 && (
                        <div className="text-[10px] text-[#5C6F68] truncate max-w-[220px]">
                          {memberWsNames.join(', ')}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {member.accessCode ? (
                        <span className="font-mono text-[11px] bg-[#EEF3F0] border border-[#DCE3DF] px-2 py-0.5 rounded text-[#14213D]">
                          {isFounderAccount ? '••••••••' : member.accessCode}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#5C6F68]">Supabase Auth</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {isFounderAccount ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]">
                          <Crown className="w-3 h-3" />
                          <span>{isEs ? roleCfg.labelEs : roleCfg.labelEn}</span>
                        </span>
                      ) : (
                        <select
                          value={member.roleId}
                          disabled={isBusy}
                          onChange={(e) =>
                            void handleUpdateMemberRole(member, e.target.value as UserRole)
                          }
                          className="bg-[#F4F7F5] border border-[#DCE3DF] hover:border-[#14213D] rounded-lg px-2.5 py-1 text-xs text-[#14213D] focus:outline-none cursor-pointer disabled:opacity-50"
                        >
                          <option value="admin">{isEs ? 'Admin Agencia' : 'Agency Admin'}</option>
                          <option value="campaign_manager">
                            {isEs ? 'Gestor de Campañas' : 'Campaign Manager'}
                          </option>
                          <option value="viewer">{isEs ? 'Solo Lectura' : 'Read Only'}</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCopyMemberAccess(member)}
                          title={isEs ? 'Copiar acceso' : 'Copy access'}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#EEF3F0] hover:bg-[#DCE3DF] border border-[#DCE3DF] text-[#14213D] transition cursor-pointer"
                        >
                          {copiedMemberId === member.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-[#5C6F68]" />
                          )}
                          <span>{isEs ? 'Acceso' : 'Access'}</span>
                        </button>

                        {!isFounderAccount && (
                          <button
                            type="button"
                            onClick={() => {
                              void signInAsRole(member.roleId, {
                                id: member.id,
                                email: member.email,
                                fullName: member.fullName,
                                company: member.company,
                                agencyId: member.agencyId,
                                workspaceId: member.workspaceId,
                                allowedWorkspaceIds: member.allowedWorkspaceIds,
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#EEF3F0] hover:bg-[#14213D] text-[#14213D] hover:text-white border border-[#DCE3DF] hover:border-[#14213D] transition cursor-pointer"
                          >
                            <LogIn className="w-3 h-3" />
                            <span>{isEs ? 'Simular' : 'Impersonate'}</span>
                          </button>
                        )}

                        {!isFounderAccount && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDeleteMember(member)}
                            title={isEs ? 'Eliminar usuario' : 'Remove user'}
                            className="p-1.5 rounded-lg text-[#5C6F68] hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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
