'use client';

import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Building,
  ShieldCheck,
  X,
  Check,
  Sparkles,
  Database,
  Lock,
} from 'lucide-react';
import { useAdminProfile, calculateInitials, AdminProfile } from '@/context/AdminProfileContext';
import { useAuth, AuthUser } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useFeedback } from '@/context/FeedbackContext';
import { ROLE_PERMISSIONS, UserRole, normalizeRole } from '@/types';

interface RoleOption {
  id: string;
  name: string;
  description: string;
}

interface AdminProfileFormProps {
  user: AuthUser | null;
  profile: AdminProfile;
  roles: RoleOption[];
  isEs: boolean;
  onClose: () => void;
  onSaveProfile: (updates: Partial<AdminProfile>) => void;
  onSwitchRole: (role: UserRole) => void;
}

function AdminProfileForm({
  user,
  profile,
  roles,
  isEs,
  onClose,
  onSaveProfile,
  onSwitchRole,
}: AdminProfileFormProps) {
  const { showToast } = useFeedback();
  const effectiveRole = normalizeRole(user?.role || profile.roleId);
  const canEditRole = effectiveRole === 'super_admin';

  const [name, setName] = useState(user?.fullName || profile.name);
  const [email, setEmail] = useState(user?.email || profile.email);
  const [company, setCompany] = useState(user?.company || profile.company);
  const [roleId, setRoleId] = useState<string>(effectiveRole);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const normalizedSelectedRole = normalizeRole(canEditRole ? roleId : effectiveRole);
  const roleConfig = ROLE_PERMISSIONS[normalizedSelectedRole];
  const currentRoleObj = roles.find((r) => r.id === normalizedSelectedRole) || {
    id: normalizedSelectedRole,
    name: isEs ? roleConfig.labelEs : roleConfig.labelEn,
    description: isEs ? roleConfig.descriptionEs : roleConfig.descriptionEn,
  };

  const previewInitials = calculateInitials(name);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const targetRole = canEditRole ? normalizeRole(roleId) : effectiveRole;
    const savedName = name.trim() || 'Marco Iparraguirre';
    const savedEmail = email.trim() || 'marcos@vectrasystems.com.ar';
    const savedCompany = company.trim() || 'Vectra Systems';

    onSaveProfile({
      name: savedName,
      email: savedEmail,
      company: savedCompany,
      role: currentRoleObj.name,
      roleId: targetRole,
    });
    if (canEditRole) {
      onSwitchRole(targetRole);
    }
    showToast({
      title: isEs ? 'Perfil actualizado' : 'Profile saved',
      description: `${savedName} • ${currentRoleObj.name}`,
      variant: 'success',
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 650);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-[#11141C] border border-[#232938] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
    >
      {/* Modal Header */}
      <div className="px-6 py-5 border-b border-[#1D2330] flex items-center justify-between bg-[#11141C]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#171B26] border border-[#232938] flex items-center justify-center text-[#E85D2A]">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#F3F5F8] leading-tight">
              {isEs ? 'Mi Perfil y Permisos' : 'My Profile & Permissions'}
            </h3>
            <p className="text-xs text-[#949EB0]">
              {isEs
                ? 'Identidad de tu sesión y nivel de acceso activo'
                : 'Your session identity and active access level'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={isEs ? 'Cerrar' : 'Close'}
          className="p-1.5 text-[#949EB0] hover:text-[#F3F5F8] hover:bg-[#171B26] rounded-lg transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Modal Form */}
      <form onSubmit={handleSave} className="p-6 space-y-5">
        {/* Avatar Preview Card */}
        <div className="flex items-center gap-4 bg-[#0A0C10] border border-[#1D2330] rounded-xl p-4">
          <div className="w-14 h-14 rounded-xl bg-[#171B26] border border-[#E85D2A]/50 flex items-center justify-center text-[#F3F5F8] font-mono font-bold text-xl tracking-tight shrink-0">
            {previewInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-[#F3F5F8] flex items-center gap-2">
              <span className="truncate">{name || (isEs ? 'Tu Nombre' : 'Your Name')}</span>
              <span className="text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-lg font-bold uppercase shrink-0">
                {currentRoleObj.name}
              </span>
            </div>
            <div className="text-xs text-[#949EB0] font-mono mt-0.5 truncate">
              {email || 'admin@tudominio.com'}
            </div>
            <div className="text-[11px] text-[#E85D2A] mt-1 flex items-center gap-1 font-mono font-medium">
              <Sparkles className="w-3 h-3" />
              <span>
                {isEs
                  ? `Iniciales del avatar: "${previewInitials}"`
                  : `Avatar initials: "${previewInitials}"`}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-[#949EB0] mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#E85D2A]" />
              <span>{isEs ? 'Nombre Completo' : 'Full Name'}</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Marco Iparraguirre"
              className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3.5 py-2 text-sm text-[#F3F5F8] placeholder-[#949EB0]/50 focus:outline-none transition"
            />
          </div>

          {/* Email Address */}
          <div>
            <label className="block text-xs font-semibold text-[#949EB0] mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#949EB0]" />
              <span>{isEs ? 'Correo Electrónico' : 'Email Address'}</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="marcos@vectrasystems.com.ar"
              className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3.5 py-2 text-sm font-mono text-[#F3F5F8] placeholder-[#949EB0]/50 focus:outline-none transition"
            />
          </div>

          {/* Company / Brand Name */}
          <div>
            <label className="block text-xs font-semibold text-[#949EB0] mb-1.5 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-[#949EB0]" />
              <span>{isEs ? 'Empresa / Agencia' : 'Company / Agency'}</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Vectra Systems"
              className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3.5 py-2 text-sm text-[#F3F5F8] placeholder-[#949EB0]/50 focus:outline-none transition"
            />
          </div>

          {/* Role / Permissions: Editable ONLY for super_admin, locked badge for everyone else */}
          <div>
            <label className="block text-xs font-semibold text-[#949EB0] mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isEs ? 'Rol Asignado' : 'Assigned Role'}</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">RBAC</span>
            </label>

            {canEditRole ? (
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="w-full bg-[#171B26] border border-[#232938] focus:border-[#E85D2A] rounded-lg px-3 py-2 text-sm text-[#F3F5F8] focus:outline-none transition cursor-pointer"
              >
                {roles.length > 0 ? (
                  roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Admin Agencia</option>
                    <option value="campaign_manager">Gestor de Campañas</option>
                    <option value="viewer">Solo Lectura</option>
                  </>
                )}
              </select>
            ) : (
              <div className="w-full bg-[#171B26] border border-[#232938] rounded-lg px-3 py-2 text-xs text-[#F3F5F8] flex items-center justify-between gap-2 select-none">
                <span className="font-semibold text-emerald-300 truncate">
                  {currentRoleObj.name}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg shrink-0">
                  <Lock className="w-3 h-3" />
                  {isEs ? 'Bloqueado' : 'Locked'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Description of the active RBAC role */}
        <div className="bg-[#0A0C10] border border-[#1D2330] rounded-xl p-3.5 text-xs flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-[#F3F5F8]">{currentRoleObj.name}:</div>
            <div className="text-[11px] text-[#949EB0] mt-0.5 leading-relaxed">
              {currentRoleObj.description}
            </div>
            {!canEditRole && (
              <div className="text-[11px] text-amber-300/90 mt-1.5 leading-relaxed">
                {isEs
                  ? 'Por seguridad, tu rol no puede auto-elevarse. Solo el Administrador de la Agencia o el Super Admin puede modificar roles desde la sección "Mi Equipo".'
                  : 'For security, your role cannot self-escalate. Only the Agency Admin or Super Admin can modify roles in "My Team".'}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#949EB0] hover:text-[#F3F5F8] bg-[#171B26] hover:bg-[#1D2330] border border-[#232938] rounded-lg transition cursor-pointer"
          >
            {isEs ? 'Cancelar' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={savedSuccess}
            className="flex items-center gap-2 bg-[#E85D2A] hover:bg-[#F26B3A] text-white font-semibold px-5 py-2 rounded-lg text-xs transition disabled:opacity-50 cursor-pointer"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>{isEs ? 'Guardado Exitoso' : 'Saved Successfully'}</span>
              </>
            ) : (
              <span>{isEs ? 'Guardar Cambios' : 'Save Changes'}</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminProfileModal() {
  const { profile, updateProfile, isProfileModalOpen, setIsProfileModalOpen } = useAdminProfile();
  const { user, switchRole } = useAuth();
  const { language } = useLanguage();
  const isEs = language === 'es';

  const [roles, setRoles] = useState<RoleOption[]>([]);

  // Escape key dismissal
  useEffect(() => {
    if (!isProfileModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsProfileModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isProfileModalOpen, setIsProfileModalOpen]);

  // Load roles directly from Supabase / DB
  useEffect(() => {
    fetch('/api/roles')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setRoles(data);
        }
      })
      .catch((err) => console.error('Error fetching roles:', err));
  }, []);

  if (!isProfileModalOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEs ? 'Mi Perfil y Permisos' : 'My Profile & Permissions'}
      onClick={() => setIsProfileModalOpen(false)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
    >
      <AdminProfileForm
        key={`${user?.id || 'anon'}:${user?.email || profile.email}:${user?.role || profile.roleId}`}
        user={user}
        profile={profile}
        roles={roles}
        isEs={isEs}
        onClose={() => setIsProfileModalOpen(false)}
        onSaveProfile={updateProfile}
        onSwitchRole={switchRole}
      />
    </div>
  );
}
