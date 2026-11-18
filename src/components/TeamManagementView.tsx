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
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { TeamMember, UserRole, ROLE_PERMISSIONS, normalizeRole } from '@/types';

export default function TeamManagementView() {
  const { user, currentWorkspace, signInAsRole } = useAuth();
  const { language } = useLanguage();
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
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastCreatedMember, setLastCreatedMember] = useState<TeamMember | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    setCompany(currentWorkspace.clientName || '');
  }, [currentWorkspace.clientName]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
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
    void fetchMembers();
  }, [fetchMembers]);

  if (!canManageTeam) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-[#0e1422] border border-slate-800 rounded-3xl p-6 text-center space-y-3">
          <Lock className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-base font-bold text-white">
            {isEs ? 'Gestión de Equipo Reservada' : 'Team Management Restricted'}
          </h2>
          <p className="text-xs text-slate-400">
            {isEs
              ? 'Solo el Administrador de la Agencia puede invitar usuarios o cambiar permisos.'
              : 'Only Agency Admins can invite team members or change role permissions.'}
          </p>
        </div>
      </div>
    );
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          company: company.trim() || currentWorkspace.clientName,
          roleId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to add member');
      }

      setLastCreatedMember(data as TeamMember);
      setFullName('');
      setEmail('');
      await fetchMembers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error adding member');
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
      if (res.ok) {
        await fetchMembers();
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteMember = async (member: TeamMember) => {
    if (member.id === 'admin-default') return;
    setUpdatingId(member.id);
    try {
      const res = await fetch(`/api/team?id=${encodeURIComponent(member.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchMembers();
      }
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
      ? `¡Hola ${member.fullName}! Te dimos acceso a MiSender en el Workspace "${currentWorkspace.name}" (${currentWorkspace.clientName}) con rol ${roleLabel}.\n\n🔗 Entra aquí: ${origin}\n📧 Tu email: ${member.email}\n🔑 Usa tu email para ingresar directo a este espacio.`
      : `Hi ${member.fullName}! You've been invited to MiSender workspace "${currentWorkspace.name}" (${currentWorkspace.clientName}) as ${roleLabel}.\n\n🔗 Login: ${origin}\n📧 Email: ${member.email}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedInviteId(member.id);
      setTimeout(() => setCopiedInviteId(null), 1800);
    } catch {}
  };

  const roleCards = [
    {
      role: 'admin' as UserRole,
      icon: Building2,
      color: 'border-blue-500/30 bg-blue-950/20 text-blue-300',
      title: isEs ? 'Administrador de Agencia (admin)' : 'Agency Admin (admin)',
      desc: isEs
        ? 'Control total de su agencia: crea Workspaces para clientes, invita usuarios en Mi Equipo y administra Facturación.'
        : 'Full agency control: creates client workspaces, invites users in My Team, and manages Billing.',
    },
    {
      role: 'campaign_manager' as UserRole,
      icon: UserCog,
      color: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300',
      title: isEs ? 'Gestor de Campañas / SDR (campaign_manager)' : 'Campaign Manager / SDR',
      desc: isEs
        ? 'Operador diario: conecta casillas, sube leads, redacta campañas y responde en Unibox. No ve Facturación ni Mi Equipo.'
        : 'Daily operator: connects mailboxes, imports leads, launches campaigns & handles Unibox. Cannot access Billing or Team.',
    },
    {
      role: 'viewer' as UserRole,
      icon: Eye,
      color: 'border-purple-500/30 bg-purple-950/20 text-purple-300',
      title: isEs ? 'Cliente Final / Solo Lectura (viewer)' : 'End Client / Read-Only (viewer)',
      desc: isEs
        ? 'Acceso transparente para tu cliente: solo visualiza campañas, Unibox, CRM y analíticas sin poder editar ni romper configuraciones.'
        : 'Client reporting access: view-only visibility into campaigns, Unibox, CRM & analytics without editing permissions.',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0b0f17]">
      {/* Header */}
      <div className="bg-[#0e1422] border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                {isEs ? 'Mi Equipo y Permisos por Rol' : 'My Team & Role Permissions'}
              </h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                Workspace: {currentWorkspace.name}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {isEs
                ? 'Cada agencia administra sus propios usuarios dentro de sus Workspaces: operadores SDR que ejecutan campañas y clientes finales que solo miran resultados.'
                : 'Each agency manages its own workspace users: SDR operators who run outreach and end-clients with read-only visibility.'}
            </p>
          </div>
        </div>
      </div>

      {/* Role Guide Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {roleCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.role} className={`rounded-2xl border p-4 space-y-2 ${card.color}`}>
              <div className="flex items-center gap-2 font-bold text-xs text-white">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{card.title}</span>
              </div>
              <p className="text-[11px] text-slate-300/90 leading-relaxed">{card.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Add User Form */}
      <form
        onSubmit={handleAddMember}
        className="bg-[#0e1422] border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              <span>
                {isEs
                  ? '+ Dar de Alta Usuario en este Workspace'
                  : '+ Add User to this Workspace'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEs
                ? `Los usuarios creados aquí tendrán acceso exclusivo a "${currentWorkspace.name}".`
                : `Users added here will be scoped to "${currentWorkspace.name}".`}
            </p>
          </div>

          {lastCreatedMember && (
            <button
              type="button"
              onClick={() => void handleCopyInvite(lastCreatedMember)}
              className="inline-flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              {copiedInviteId === lastCreatedMember.id ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>
                {copiedInviteId === lastCreatedMember.id
                  ? isEs
                    ? '¡Invitación copiada!'
                    : 'Invite copied!'
                  : isEs
                    ? `Copiar invitación para ${lastCreatedMember.fullName}`
                    : `Copy invite for ${lastCreatedMember.fullName}`}
              </span>
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {isEs ? 'Nombre Completo *' : 'Full Name *'}
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej: Lucas Gómez"
              className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {isEs ? 'Email del Usuario *' : 'User Email *'}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lucas@tuagencia.com"
              className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {isEs ? 'Rol y Permisos' : 'Role & Permissions'}
            </label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value as UserRole)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
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
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {isEs ? 'Cargo / Empresa' : 'Role / Company'}
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="SDR Outbound"
              className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs shadow-lg shadow-blue-600/20 transition cursor-pointer disabled:opacity-50"
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
      <div className="bg-[#0e1422] border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white">
              {isEs ? 'Usuarios Activos del Workspace' : 'Workspace Team Members'}
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {members.length} {isEs ? 'miembros' : 'members'}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            {isEs ? 'Cargando miembros...' : 'Loading team members...'}
          </div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            {isEs
              ? 'Todavía no hay usuarios asignados a este Workspace. Crea el primero arriba.'
              : 'No users assigned to this workspace yet. Create the first one above.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/40">
                  <th className="py-3 px-4">{isEs ? 'Usuario' : 'User'}</th>
                  <th className="py-3 px-4">{isEs ? 'Empresa / Cargo' : 'Company'}</th>
                  <th className="py-3 px-4">{isEs ? 'Rol Activo' : 'Active Role'}</th>
                  <th className="py-3 px-4 text-right">{isEs ? 'Acciones' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {members.map((member) => {
                  const isPrimaryFounder = member.id === 'admin-default';
                  const isBusy = updatingId === member.id;
                  const roleCfg = ROLE_PERMISSIONS[normalizeRole(member.roleId)];

                  return (
                    <tr key={member.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{member.fullName}</span>
                          {user?.email?.toLowerCase() === member.email.toLowerCase() && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              {isEs ? 'Tú' : 'You'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{member.email}</div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
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
                            className="bg-slate-900 border border-slate-700 hover:border-blue-500 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none cursor-pointer disabled:opacity-50"
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

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCopyInvite(member)}
                            title={isEs ? 'Copiar invitación' : 'Copy invite'}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                          >
                            {copiedInviteId === member.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
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
                            onClick={() =>
                              void signInAsRole(member.roleId, {
                                id: member.id,
                                fullName: member.fullName,
                                email: member.email,
                                company: member.company,
                                workspaceId: member.workspaceId,
                              })
                            }
                            title={
                              isEs
                                ? 'Simular cómo ve la app este usuario'
                                : 'Preview app as this user'
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            <span>{isEs ? 'Simular vista' : 'Preview View'}</span>
                          </button>

                          {!isPrimaryFounder && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDeleteMember(member)}
                              title={isEs ? 'Quitar usuario' : 'Remove user'}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer disabled:opacity-50"
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
