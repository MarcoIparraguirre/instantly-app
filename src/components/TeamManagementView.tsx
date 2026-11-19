'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  UserCog,
  Eye,
  Building2,
  Trash2,
  Copy,
  Check,
  Play,
  AlertCircle,
  Lock,
  Layers,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useFeedback } from '@/context/FeedbackContext';
import { TeamMember, UserRole, ROLE_PERMISSIONS, normalizeRole } from '@/types';

export default function TeamManagementView() {
  const { user, workspaces, currentWorkspace, signInAsRole } = useAuth();
  return (
    <TeamManagementContent
      key={currentWorkspace.id}
      user={user}
      workspaces={workspaces}
      currentWorkspace={currentWorkspace}
      signInAsRole={signInAsRole}
    />
  );
}

interface TeamManagementContentProps {
  user: ReturnType<typeof useAuth>['user'];
  workspaces: ReturnType<typeof useAuth>['workspaces'];
  currentWorkspace: ReturnType<typeof useAuth>['currentWorkspace'];
  signInAsRole: ReturnType<typeof useAuth>['signInAsRole'];
}

function TeamManagementContent({
  user,
  workspaces,
  currentWorkspace,
  signInAsRole,
}: TeamManagementContentProps) {
  const { language } = useLanguage();
  const { showToast, confirm } = useFeedback();
  const isEs = language === 'es';

  const userRole = normalizeRole(user?.role);
  const canManageTeam = ROLE_PERMISSIONS[userRole].canManageTeam;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Member form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<UserRole>('campaign_manager');
  const [company, setCompany] = useState(currentWorkspace.clientName || '');
  const [assignedWorkspaceIds, setAssignedWorkspaceIds] = useState<string[]>([currentWorkspace.id]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastCreatedMember, setLastCreatedMember] = useState<TeamMember | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/team?workspaceId=${encodeURIComponent(currentWorkspace.id)}`,
        { cache: 'no-store' }
      );
      const data = await res.json().catch(() => []);
      if (Array.isArray(data)) {
        setMembers(data);
      }
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace.id]);

  useEffect(() => {
    if (!canManageTeam) return;
    let active = true;
    const loadInitialMembers = async () => {
      try {
        const res = await fetch(
          `/api/team?workspaceId=${encodeURIComponent(currentWorkspace.id)}`,
          { cache: 'no-store' }
        );
        const data = await res.json().catch(() => []);
        if (!active) return;
        if (Array.isArray(data)) {
          setMembers(data);
        }
      } catch {
        if (active) setMembers([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadInitialMembers();
    return () => {
      active = false;
    };
  }, [canManageTeam, currentWorkspace.id]);

  if (!canManageTeam) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-[#0A0C10]">
        <div className="max-w-md w-full bg-[#11141C] border border-[#232938] rounded-xl p-6 text-center space-y-3">
          <Lock className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-base font-bold text-[#F3F5F8]">
            {isEs ? 'Gestión de Equipo Reservada' : 'Team Management Restricted'}
          </h2>
          <p className="text-xs text-[#949EB0]">
            {isEs
              ? 'Solo el Administrador de la Agencia puede invitar usuarios o cambiar permisos.'
              : 'Only Agency Admins can invite team members or change role permissions.'}
          </p>
        </div>
      </div>
    );
  }

  const availableWorkspaces = workspaces.length > 0 ? workspaces : [currentWorkspace];

  const handleToggleFormWorkspace = (wsId: string) => {
    setAssignedWorkspaceIds((prev) => {
      const exists = prev.includes(wsId);
      if (exists) {
        if (prev.length <= 1) {
          showToast(
            isEs
              ? 'Cada miembro debe tener al menos 1 Workspace visible.'
              : 'Each member must keep at least 1 visible workspace.',
            'warning'
          );
          return prev;
        }
        return prev.filter((id) => id !== wsId);
      }
      return [...prev, wsId];
    });
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    const effectiveAllowedIds =
      assignedWorkspaceIds.length > 0 ? assignedWorkspaceIds : [currentWorkspace.id];
    const primaryWorkspaceId = effectiveAllowedIds.includes(currentWorkspace.id)
      ? currentWorkspace.id
      : effectiveAllowedIds[0];

    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: primaryWorkspaceId,
          allowedWorkspaceIds: effectiveAllowedIds,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          company: company.trim() || currentWorkspace.clientName,
          roleId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || (isEs ? 'No se pudo agregar al usuario' : 'Failed to add member'));
      }

      const created = data as TeamMember;
      setLastCreatedMember(created);
      setFullName('');
      setEmail('');
      setAssignedWorkspaceIds([currentWorkspace.id]);
      await fetchMembers();

      showToast({
        title: isEs ? 'Miembro agregado al equipo' : 'Team member added',
        description: isEs
          ? `${created.fullName} tiene acceso a ${effectiveAllowedIds.length} workspace(s).`
          : `${created.fullName} granted access to ${effectiveAllowedIds.length} workspace(s).`,
        variant: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : isEs ? 'Error al agregar miembro' : 'Error adding member';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeRole = async (member: TeamMember, nextRole: UserRole) => {
    setUpdatingId(member.id);
    try {
      const res = await fetch('/api/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: member.id,
          roleId: nextRole,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(
          errData?.error || (isEs ? 'No se pudo actualizar el rol' : 'Failed to update role'),
          'error'
        );
        return;
      }

      await fetchMembers();
      const label = isEs ? ROLE_PERMISSIONS[nextRole].labelEs : ROLE_PERMISSIONS[nextRole].labelEn;
      showToast({
        title: isEs ? 'Rol actualizado' : 'Role updated',
        description: `${member.fullName} → ${label}`,
        variant: 'success',
      });
    } catch {
      showToast(isEs ? 'Error de red al actualizar rol' : 'Network error updating role', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleMemberWorkspace = async (member: TeamMember, targetWsId: string) => {
    if (member.id === 'admin-default') return;

    const currentIds =
      member.allowedWorkspaceIds && member.allowedWorkspaceIds.length > 0
        ? Array.from(new Set(member.allowedWorkspaceIds))
        : [member.workspaceId];

    const isAssigned = currentIds.includes(targetWsId);
    if (isAssigned && currentIds.length <= 1) {
      showToast(
        isEs
          ? 'No puedes quitar el último workspace asignado al usuario.'
          : 'Cannot remove the last remaining workspace from a member.',
        'warning'
      );
      return;
    }

    const nextIds = isAssigned
      ? currentIds.filter((id) => id !== targetWsId)
      : [...currentIds, targetWsId];

    const nextPrimaryWorkspaceId = nextIds.includes(member.workspaceId)
      ? member.workspaceId
      : nextIds[0];

    const payload: { id: string; allowedWorkspaceIds: string[]; workspaceId?: string } = {
      id: member.id,
      allowedWorkspaceIds: nextIds,
    };
    if (nextPrimaryWorkspaceId !== member.workspaceId) {
      payload.workspaceId = nextPrimaryWorkspaceId;
    }

    setUpdatingId(member.id);
    try {
      const res = await fetch('/api/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(
          errData?.error ||
            (isEs ? 'No se pudo actualizar visibilidad de workspaces' : 'Failed to update workspace visibility'),
          'error'
        );
        return;
      }

      await fetchMembers();
      const wsLabel =
        availableWorkspaces.find((w) => w.id === targetWsId)?.name || targetWsId;
      showToast({
        title: isEs ? 'Visibilidad actualizada' : 'Workspace visibility updated',
        description: isEs
          ? `${member.fullName}: ${isAssigned ? 'removido de' : 'asignado a'} "${wsLabel}" (${nextIds.length} activos).`
          : `${member.fullName}: ${isAssigned ? 'removed from' : 'assigned to'} "${wsLabel}" (${nextIds.length} active).`,
        variant: 'success',
      });
    } catch {
      showToast(
        isEs ? 'Error de red al guardar visibilidad' : 'Network error saving workspace visibility',
        'error'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteMember = async (member: TeamMember) => {
    if (member.id === 'admin-default') return;

    const confirmed = await confirm({
      title: isEs ? '¿Quitar miembro del equipo?' : 'Remove team member?',
      description: isEs
        ? `Se revocará el acceso de ${member.fullName} (${member.email}) a los Workspaces asignados.`
        : `This will revoke ${member.fullName} (${member.email}) access to assigned workspaces.`,
      confirmLabel: isEs ? 'Eliminar miembro' : 'Remove member',
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
          errData?.error || (isEs ? 'No se pudo eliminar el usuario' : 'Failed to delete member'),
          'error'
        );
        return;
      }

      await fetchMembers();
      showToast({
        title: isEs ? 'Miembro eliminado' : 'Member removed',
        description: `${member.fullName} (${member.email})`,
        variant: 'success',
      });
    } catch {
      showToast(isEs ? 'Error de red al eliminar usuario' : 'Network error removing user', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCopyInvite = async (member: TeamMember) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.misender.io';
    const roleLabel = isEs
      ? ROLE_PERMISSIONS[member.roleId].labelEs
      : ROLE_PERMISSIONS[member.roleId].labelEn;
    const text = isEs
      ? `Hola ${member.fullName}, te dimos acceso a MiSender en el Workspace "${currentWorkspace.name}" (${currentWorkspace.clientName}) con rol ${roleLabel}.\n\nAcceso: ${origin}\nEmail: ${member.email}\nUsa tu email para ingresar directo a este espacio.`
      : `Hi ${member.fullName}, you've been invited to MiSender workspace "${currentWorkspace.name}" (${currentWorkspace.clientName}) as ${roleLabel}.\n\nLogin: ${origin}\nEmail: ${member.email}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedInviteId(member.id);
      showToast(
        isEs ? `Invitación copiada para ${member.fullName}` : `Invite copied for ${member.fullName}`,
        'success'
      );
      setTimeout(() => setCopiedInviteId(null), 1800);
    } catch {
      showToast(isEs ? 'No se pudo copiar la invitación' : 'Could not copy invite', 'error');
    }
  };

  const roleCards = [
    {
      role: 'admin' as UserRole,
      icon: Building2,
      iconClass: 'text-[#E85D2A]',
      badgeClass: 'border-[#E85D2A]/30 bg-[#E85D2A]/10 text-[#E85D2A]',
      title: isEs ? 'Administrador de Agencia (admin)' : 'Agency Admin (admin)',
      desc: isEs
        ? 'Control total de su agencia: crea Workspaces para clientes, invita usuarios en Mi Equipo y administra Facturación.'
        : 'Full agency control: creates client workspaces, invites users in My Team, and manages Billing.',
    },
    {
      role: 'campaign_manager' as UserRole,
      icon: UserCog,
      iconClass: 'text-emerald-400',
      badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
      title: isEs ? 'Gestor de Campañas / SDR (campaign_manager)' : 'Campaign Manager / SDR',
      desc: isEs
        ? 'Operador diario: conecta casillas, sube leads, redacta campañas y responde en Unibox. No ve Facturación ni Mi Equipo.'
        : 'Daily operator: connects mailboxes, imports leads, launches campaigns & handles Unibox. Cannot access Billing or Team.',
    },
    {
      role: 'viewer' as UserRole,
      icon: Eye,
      iconClass: 'text-[#949EB0]',
      badgeClass: 'border-[#232938] bg-[#171B26] text-[#949EB0]',
      title: isEs ? 'Cliente Final / Solo Lectura (viewer)' : 'End Client / Read-Only (viewer)',
      desc: isEs
        ? 'Acceso transparente para tu cliente: solo visualiza campañas, Unibox, CRM y analíticas sin poder editar ni romper configuraciones.'
        : 'Client reporting access: view-only visibility into campaigns, Unibox, CRM & analytics without editing permissions.',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0A0C10]">
      {/* Header */}
      <div className="bg-[#11141C] border border-[#1D2330] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#171B26] border border-[#232938] flex items-center justify-center text-[#E85D2A] shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-extrabold text-[#F3F5F8] tracking-tight">
                {isEs ? 'Mi Equipo y Permisos por Rol' : 'My Team & Role Permissions'}
              </h1>
              <span className="text-[11px] font-mono tabular-nums px-2.5 py-0.5 rounded-lg bg-[#171B26] text-[#F3F5F8] border border-[#232938]">
                Workspace: {currentWorkspace.name}
              </span>
            </div>
            <p className="text-xs text-[#949EB0] mt-1 max-w-2xl leading-relaxed">
              {isEs
                ? 'Administra usuarios por rol y controla exactamente qué Workspaces de clientes puede visualizar cada miembro de tu agencia.'
                : 'Manage workspace users by role and control exactly which client Workspaces each agency member can access.'}
            </p>
          </div>
        </div>
      </div>

      {/* Role Guide Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {roleCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.role}
              className="rounded-xl border border-[#1D2330] bg-[#11141C] p-4 space-y-2.5"
            >
              <div className="flex items-center gap-2 font-bold text-xs text-[#F3F5F8]">
                <span className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${card.badgeClass}`}>
                  <Icon className={`w-3.5 h-3.5 ${card.iconClass}`} />
                </span>
                <span>{card.title}</span>
              </div>
              <p className="text-[11px] text-[#949EB0] leading-relaxed">{card.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Add User Form */}
      <form
        onSubmit={handleAddMember}
        className="bg-[#11141C] border border-[#1D2330] rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#F3F5F8] flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#E85D2A]" />
              <span>
                {isEs
                  ? 'Dar de Alta Usuario y Visibilidad de Workspaces'
                  : 'Add User & Workspace Visibility'}
              </span>
            </h2>
            <p className="text-xs text-[#949EB0] mt-0.5">
              {isEs
                ? 'Selecciona uno o varios Workspaces visibles para el nuevo miembro.'
                : 'Select one or more visible Workspaces for the new member.'}
            </p>
          </div>

          {lastCreatedMember && (
            <button
              type="button"
              onClick={() => void handleCopyInvite(lastCreatedMember)}
              className="inline-flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              {copiedInviteId === lastCreatedMember.id ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>
                {copiedInviteId === lastCreatedMember.id
                  ? isEs
                    ? 'Invitación copiada'
                    : 'Invite copied'
                  : isEs
                    ? `Copiar invitación para ${lastCreatedMember.fullName}`
                    : `Copy invite for ${lastCreatedMember.fullName}`}
              </span>
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-[#949EB0] mb-1.5">
              {isEs ? 'Nombre Completo *' : 'Full Name *'}
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej: Lucas Gómez"
              className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3.5 py-2 text-xs text-[#F3F5F8] placeholder-[#949EB0]/50 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#949EB0] mb-1.5">
              {isEs ? 'Email del Usuario *' : 'User Email *'}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lucas@tuagencia.com"
              className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3.5 py-2 text-xs text-[#F3F5F8] placeholder-[#949EB0]/50 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#949EB0] mb-1.5">
              {isEs ? 'Rol y Permisos' : 'Role & Permissions'}
            </label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value as UserRole)}
              className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] focus:outline-none cursor-pointer transition"
            >
              <option value="campaign_manager">
                {isEs ? 'Gestor de Campañas (SDR)' : 'Campaign Manager (SDR)'}
              </option>
              <option value="viewer">
                {isEs ? 'Solo Lectura (Cliente)' : 'Read Only (Client)'}
              </option>
              <option value="admin">
                {isEs ? 'Admin de Agencia' : 'Agency Admin'}
              </option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#949EB0] mb-1.5">
              {isEs ? 'Cargo / Empresa' : 'Role / Company'}
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="SDR Outbound"
              className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3.5 py-2 text-xs text-[#F3F5F8] placeholder-[#949EB0]/50 focus:outline-none transition"
            />
          </div>
        </div>

        {/* Agency-Assigned Workspace Visibility Chip Selector */}
        <div className="bg-[#0A0C10] border border-[#1D2330] rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F3F5F8]">
              <Layers className="w-3.5 h-3.5 text-[#E85D2A]" />
              <span>{isEs ? 'Visibilidad de Workspaces' : 'Workspace Visibility'}</span>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-[#949EB0]">
              {assignedWorkspaceIds.length}/{availableWorkspaces.length}{' '}
              {isEs ? 'seleccionados' : 'selected'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {availableWorkspaces.map((ws) => {
              const selected = assignedWorkspaceIds.includes(ws.id);
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleToggleFormWorkspace(ws.id)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    selected
                      ? 'bg-[#E85D2A]/15 border-[#E85D2A]/60 text-[#F3F5F8]'
                      : 'bg-[#171B26] border-[#232938] text-[#949EB0] hover:text-[#F3F5F8] hover:border-[#343D52]'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                      selected
                        ? 'bg-[#E85D2A] border-[#E85D2A] text-white'
                        : 'bg-[#0A0C10] border-[#232938]'
                    }`}
                  >
                    {selected && <Check className="w-2.5 h-2.5" />}
                  </span>
                  <span>{ws.name}</span>
                  {ws.clientName && ws.clientName !== ws.name && (
                    <span className="text-[10px] text-[#949EB0]">({ws.clientName})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white font-semibold px-5 py-2.5 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>
            {submitting
              ? isEs
                ? 'Agregando...'
                : 'Adding...'
              : isEs
                ? 'Crear Usuario y Asignar Rol'
                : 'Create User & Assign Role'}
          </span>
        </button>
      </form>

      {/* Members Table */}
      <div className="bg-[#11141C] border border-[#1D2330] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1D2330] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#E85D2A]" />
            <h2 className="text-sm font-bold text-[#F3F5F8]">
              {isEs ? 'Usuarios Activos del Workspace' : 'Workspace Team Members'}
            </h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#949EB0]">
            {members.length} {isEs ? 'miembros' : 'members'}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#949EB0]">
            {isEs ? 'Cargando miembros...' : 'Loading team members...'}
          </div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#949EB0]">
            {isEs
              ? 'Todavía no hay usuarios asignados a este Workspace. Crea el primero arriba.'
              : 'No users assigned to this workspace yet. Create the first one above.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1D2330] text-[11px] uppercase tracking-wider text-[#949EB0] bg-[#171B26]/60">
                  <th className="py-3 px-4">{isEs ? 'Usuario' : 'User'}</th>
                  <th className="py-3 px-4">{isEs ? 'Empresa / Cargo' : 'Company'}</th>
                  <th className="py-3 px-4">{isEs ? 'Rol Activo' : 'Active Role'}</th>
                  <th className="py-3 px-4">{isEs ? 'Workspaces Visibles' : 'Visible Workspaces'}</th>
                  <th className="py-3 px-4 text-right">{isEs ? 'Acciones' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2330] text-xs">
                {members.map((member) => {
                  const isPrimaryFounder = member.id === 'admin-default';
                  const isBusy = updatingId === member.id;
                  const roleCfg = ROLE_PERMISSIONS[normalizeRole(member.roleId)];
                  const memberAllowedIds =
                    member.allowedWorkspaceIds && member.allowedWorkspaceIds.length > 0
                      ? member.allowedWorkspaceIds
                      : [member.workspaceId];

                  return (
                    <tr key={member.id} className="hover:bg-[#171B26]/50 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#F3F5F8] flex items-center gap-2">
                          <span>{member.fullName}</span>
                          {user?.email?.toLowerCase() === member.email.toLowerCase() && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-[#E85D2A]/15 text-[#E85D2A] border border-[#E85D2A]/30">
                              {isEs ? 'Tú' : 'You'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#949EB0] font-mono">{member.email}</div>
                      </td>

                      <td className="py-3.5 px-4 text-[#949EB0]">
                        {member.company || currentWorkspace.clientName || '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        {isPrimaryFounder ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>{isEs ? roleCfg.labelEs : roleCfg.labelEn}</span>
                          </span>
                        ) : (
                          <select
                            value={member.roleId}
                            disabled={isBusy}
                            onChange={(e) =>
                              void handleChangeRole(member, e.target.value as UserRole)
                            }
                            className="bg-[#171B26] border border-[#232938] hover:border-[#E85D2A] rounded-lg px-2.5 py-1 text-xs text-[#F3F5F8] focus:outline-none cursor-pointer disabled:opacity-50 transition"
                          >
                            {userRole === 'super_admin' && (
                              <option value="super_admin">Super Admin</option>
                            )}
                            <option value="admin">
                              {isEs ? 'Admin Agencia' : 'Agency Admin'}
                            </option>
                            <option value="campaign_manager">
                              {isEs ? 'Gestor de Campañas' : 'Campaign Manager'}
                            </option>
                            <option value="viewer">
                              {isEs ? 'Solo Lectura' : 'Read Only'}
                            </option>
                          </select>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {isPrimaryFounder ? (
                          <div className="flex flex-wrap gap-1.5 max-w-[260px]">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              <Lock className="w-2.5 h-2.5" />
                              <span>{isEs ? 'Acceso Global' : 'Global Access'}</span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                            {availableWorkspaces.map((ws) => {
                              const hasAccess = memberAllowedIds.includes(ws.id);
                              return (
                                <button
                                  key={ws.id}
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleToggleMemberWorkspace(member, ws.id)}
                                  title={
                                    hasAccess
                                      ? isEs
                                        ? `Quitar visibilidad de ${ws.name}`
                                        : `Remove access to ${ws.name}`
                                      : isEs
                                        ? `Dar visibilidad a ${ws.name}`
                                        : `Grant access to ${ws.name}`
                                  }
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border transition cursor-pointer disabled:opacity-50 ${
                                    hasAccess
                                      ? 'bg-[#E85D2A]/15 text-[#F3F5F8] border-[#E85D2A]/50 hover:bg-[#E85D2A]/25'
                                      : 'bg-[#171B26] text-[#949EB0] border-[#232938] opacity-65 hover:opacity-100 hover:border-[#343D52]'
                                  }`}
                                >
                                  {hasAccess && <Check className="w-2.5 h-2.5 text-[#E85D2A]" />}
                                  <span className="truncate max-w-[120px]">{ws.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCopyInvite(member)}
                            title={isEs ? 'Copiar invitación' : 'Copy invite'}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] text-[#F3F5F8] transition cursor-pointer"
                          >
                            {copiedInviteId === member.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-[#949EB0]" />
                            )}
                            <span className="hidden xl:inline">
                              {copiedInviteId === member.id
                                ? isEs
                                  ? 'Copiado'
                                  : 'Copied'
                                : isEs
                                  ? 'Invitación'
                                  : 'Invite'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const customUser = Object.assign(
                                {
                                  id: member.id,
                                  fullName: member.fullName,
                                  email: member.email,
                                  company: member.company,
                                  workspaceId: member.workspaceId,
                                },
                                { allowedWorkspaceIds: member.allowedWorkspaceIds }
                              );
                              void signInAsRole(member.roleId, customUser);
                            }}
                            title={
                              isEs
                                ? 'Simular cómo ve la app este usuario'
                                : 'Preview app as this user'
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#171B26] hover:bg-[#1D2330] text-[#F3F5F8] border border-[#232938] hover:border-[#E85D2A]/60 transition cursor-pointer"
                          >
                            <Play className="w-3 h-3 text-[#E85D2A]" />
                            <span>{isEs ? 'Simular vista' : 'Preview View'}</span>
                          </button>

                          {!isPrimaryFounder && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDeleteMember(member)}
                              title={isEs ? 'Quitar usuario' : 'Remove user'}
                              className="p-1.5 rounded-lg text-[#949EB0] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-50"
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
        )}
      </div>
    </div>
  );
}
