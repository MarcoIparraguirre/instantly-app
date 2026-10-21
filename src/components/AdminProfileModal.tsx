'use client';

import React, { useState, useEffect } from 'react';
import { User, Mail, Building, ShieldCheck, X, Check, Sparkles, Database } from 'lucide-react';
import { useAdminProfile, calculateInitials } from '@/context/AdminProfileContext';
import { useLanguage } from '@/context/LanguageContext';

interface RoleOption {
  id: string;
  name: string;
  description: string;
}

export default function AdminProfileModal() {
  const { profile, updateProfile, isProfileModalOpen, setIsProfileModalOpen } = useAdminProfile();
  const { language } = useLanguage();

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [company, setCompany] = useState(profile.company);
  const [roleId, setRoleId] = useState(profile.roleId || 'super_admin');
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync inputs with the latest profile whenever the modal opens or profile changes
  useEffect(() => {
    if (isProfileModalOpen) {
      setName(profile.name);
      setEmail(profile.email);
      setCompany(profile.company);
      setRoleId(profile.roleId || 'super_admin');
    }
  }, [isProfileModalOpen, profile]);

  // Load roles directly from Supabase / DB
  useEffect(() => {
    fetch('/api/roles')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setRoles(data);
        }
      })
      .catch(err => console.error('Error fetching roles:', err));
  }, []);

  if (!isProfileModalOpen) return null;

  const currentRoleObj = roles.find(r => r.id === roleId) || {
    id: roleId,
    name: profile.role || 'Super Admin',
    description: 'Control total de la plataforma y base de datos.'
  };

  const previewInitials = calculateInitials(name);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      name: name.trim() || 'Marco Iparraguirre',
      email: email.trim() || 'marcos@vectrasystems.com.ar',
      company: company.trim() || 'Vectra Systems',
      role: currentRoleObj.name,
      roleId: currentRoleObj.id
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setIsProfileModalOpen(false);
    }, 700);
  };

  const isEs = language === 'es';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {isEs ? 'Perfil de Administrador' : 'Admin User Profile'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEs ? 'Configura tu identidad como dueño y remitente principal' : 'Configure your identity as owner and main sender'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsProfileModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Avatar Preview Card */}
          <div className="flex items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-600/20">
              {previewInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span className="truncate">{name || (isEs ? 'Tu Nombre' : 'Your Name')}</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                  {currentRoleObj.name}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">
                {email || 'admin@tudominio.com'}
              </div>
              <div className="text-[11px] text-indigo-400 mt-1 flex items-center gap-1 font-medium">
                <Sparkles className="w-3 h-3" />
                <span>{isEs ? `Iniciales del avatar: "${previewInitials}"` : `Avatar initials: "${previewInitials}"`}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-400" />
                <span>{isEs ? 'Nombre Completo' : 'Full Name'}</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marco Iparraguirre"
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none transition"
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isEs ? 'Correo Electrónico' : 'Email Address'}</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="marcos@vectrasystems.com.ar"
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none transition"
              />
            </div>

            {/* Company / Brand Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-purple-400" />
                <span>{isEs ? 'Empresa / Organización' : 'Company / Workspace'}</span>
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Vectra Systems"
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none transition"
              />
            </div>

            {/* Role / Permissions - Dynamic Database Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isEs ? 'Rol / Permiso (Base de Datos)' : 'Role / Permissions (Database)'}</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">misender.roles</span>
              </label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition cursor-pointer"
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
                    <option value="admin">Administrador</option>
                    <option value="campaign_manager">Gestor de Campañas</option>
                    <option value="viewer">Solo Lectura</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Description of the selected DB role */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-xs flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-200">
                {currentRoleObj.name}:
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                {currentRoleObj.description}
              </div>
            </div>
          </div>

          {/* Explanation note */}
          <div className="bg-blue-950/20 border border-blue-500/20 rounded-2xl p-3.5 text-xs text-blue-300 leading-relaxed">
            <span className="font-bold text-white">{isEs ? '💡 Sincronizado:' : '💡 Synchronized:'}</span>{' '}
            {isEs
              ? 'Tus datos se guardan tanto en tu base de datos Supabase como en tu navegador. Tus iniciales y rol se mantendrán actualizados permanentemente.'
              : 'Your data is saved to both your Supabase database and your browser. Initials and role persist permanently.'}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
            >
              {isEs ? 'Cancelar' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={savedSuccess}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-5 py-2 rounded-xl text-xs shadow-lg shadow-blue-600/20 transition disabled:opacity-50"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>{isEs ? '¡Guardado Exitoso!' : 'Saved Successfully!'}</span>
                </>
              ) : (
                <span>{isEs ? 'Guardar Mi Perfil' : 'Save My Profile'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
