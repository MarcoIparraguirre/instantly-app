'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Building2,
  Sparkles,
  ShieldCheck,
  Briefcase,
  ArrowRight,
  Zap,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { WorkspacePlan, SAAS_PLANS, ROLE_PERMISSIONS, normalizeRole } from '@/types';

export default function AuthModal() {
  const {
    user,
    isAuthModalOpen,
    authModalTab,
    setAuthModalTab,
    closeAuthModal,
    signIn,
    signUp,
    signInWithGoogle,
    createWorkspace,
  } = useAuth();
  const { language } = useLanguage();
  const isEs = language === 'es';

  // Sign In form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Sign Up SaaS form state
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPlan, setSignupPlan] = useState<WorkspacePlan>('growth');

  // New Workspace (Agency) form state — shown ONLY inside the app for authenticated admins
  const [wsName, setWsName] = useState('');
  const [wsClientName, setWsClientName] = useState('');
  const [wsPlan, setWsPlan] = useState<WorkspacePlan>('growth');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isWorkspaceMode = authModalTab === 'workspace';
  const effectiveRole = normalizeRole(user?.role);
  const canCreateWorkspace = Boolean(user && ROLE_PERMISSIONS[effectiveRole].canManageWorkspaces);

  // Escape key listener for accessible dismissal
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setErrorMsg(null);
        setSuccessMsg(null);
        closeAuthModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthModalOpen, closeAuthModal]);

  const handleClose = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    closeAuthModal();
  };

  const handleSwitchTab = (tab: 'signin' | 'signup') => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setAuthModalTab(tab);
  };

  if (!isAuthModalOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await signIn(loginEmail, loginPassword);
    setSubmitting(false);

    if (res.error) {
      setErrorMsg(res.error);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await signUp(signupEmail, signupPassword, {
      fullName,
      company,
      workspaceName: company || fullName || 'Mi Espacio SaaS',
      plan: signupPlan,
    });
    setSubmitting(false);

    if (res.error) {
      setErrorMsg(res.error);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    const res = await signInWithGoogle();
    setSubmitting(false);
    if (res.error) {
      setErrorMsg(
        isEs
          ? `Google OAuth: ${res.error}. Ingresa con email y contraseña.`
          : `Google OAuth: ${res.error}. Sign in with email & password.`
      );
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateWorkspace) {
      setErrorMsg(
        isEs
          ? 'Solo el Administrador de la Agencia o el Super Admin puede crear nuevos Workspaces.'
          : 'Only Agency Admins or Super Admins can create new workspaces.'
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await createWorkspace({
      name: wsName,
      clientName: wsClientName || 'Agency Client',
      plan: wsPlan,
    });

    setSubmitting(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else if (res.workspace) {
      setSuccessMsg(
        isEs
          ? `Workspace "${res.workspace.name}" creado y activado con 7 días de prueba.`
          : `Workspace "${res.workspace.name}" created and activated with 7-day trial.`
      );
      setWsName('');
      setWsClientName('');
      setTimeout(() => {
        closeAuthModal();
      }, 650);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg ${
                isWorkspaceMode
                  ? 'bg-gradient-to-tr from-emerald-600 to-teal-600 shadow-emerald-600/20'
                  : 'bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-blue-600/20'
              }`}
            >
              {isWorkspaceMode ? (
                <Building2 className="w-5 h-5" />
              ) : (
                <Zap className="w-5 h-5 fill-white" />
              )}
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-base font-bold text-white leading-tight">
                {isWorkspaceMode
                  ? isEs
                    ? 'Nuevo Workspace para Cliente de tu Agencia'
                    : 'New Workspace for Agency Client'
                  : isEs
                    ? 'Acceso a MiSender SaaS'
                    : 'Sign in to MiSender SaaS'}
              </h2>
              <p className="text-xs text-slate-400">
                {isWorkspaceMode
                  ? isEs
                    ? 'Crea un entorno aislado para cada cliente sin mezclar casillas ni leads'
                    : 'Isolate mailboxes, leads & campaigns for a specific client'
                  : user
                    ? isEs
                      ? `Sesión activa: ${user.email}`
                      : `Signed in as ${user.email}`
                    : isEs
                      ? 'Accede a tu cuenta o crea tu cuenta de agencia (7 días gratis)'
                      : 'Sign in or create your agency account (7-day free trial)'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label={isEs ? 'Cerrar modal' : 'Close modal'}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs: ONLY Sign In and Sign Up in auth mode; NO workspace tab in auth gate */}
        {!isWorkspaceMode && (
          <div className="px-6 pt-4">
            <div className="grid grid-cols-2 gap-1.5 bg-slate-900/90 border border-slate-800 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => handleSwitchTab('signin')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  authModalTab === 'signin'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEs ? 'Iniciar Sesión' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchTab('signup')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  authModalTab === 'signup'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEs ? 'Crear Cuenta (7d)' : 'Create Account (7d)'}
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          {authModalTab === 'signin' && (
            <div className="space-y-4">
              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.31 0 3.26 2.69 1.29 6.61l3.67 2.84C5.83 6.87 8.67 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.72 2.88c2.18-2.01 3.7-4.96 3.7-8.7z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M4.96 14.55c-.22-.66-.35-1.36-.35-2.05s.13-1.39.35-2.05L1.29 7.61C.47 9.23 0 11.06 0 12.5s.47 3.27 1.29 4.89l3.67-2.84z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.72-2.88c-1.08.72-2.45 1.16-4.21 1.16-3.33 0-6.17-1.87-7.04-4.45l-3.67 2.84C3.26 21.31 7.31 24 12 24z"
                  />
                </svg>
                <span>{isEs ? 'Continuar con Google' : 'Continue with Google'}</span>
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-800" />
                <span className="text-[10px] uppercase font-bold text-slate-500">
                  {isEs ? 'o con email' : 'or with email'}
                </span>
                <div className="h-px flex-1 bg-slate-800" />
              </div>

              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-400" />
                    <span>{isEs ? 'Correo Electrónico' : 'Email Address'}</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="founder@tuagencia.com"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{isEs ? 'Contraseña' : 'Password'}</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-2.5 rounded-xl text-xs shadow-lg shadow-blue-600/20 transition cursor-pointer disabled:opacity-50"
                >
                  <span>
                    {submitting
                      ? isEs
                        ? 'Ingresando...'
                        : 'Signing in...'
                      : isEs
                        ? 'Iniciar Sesión'
                        : 'Sign In'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: CREATE SAAS ACCOUNT (7 DAYS FREE) */}
          {authModalTab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3.5">
              <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-2xl p-3 flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-[11px] text-slate-300 leading-snug">
                  <span className="font-bold text-white">
                    {isEs
                      ? 'Crear Cuenta de Agencia (7 días gratis):'
                      : 'Create Agency Account (7 days free):'}
                  </span>{' '}
                  {isEs
                    ? 'Tu primer Workspace principal se crea automáticamente al finalizar el registro.'
                    : 'Your primary workspace is created automatically once you sign up.'}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    <span>{isEs ? 'Nombre Completo' : 'Full Name'}</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Sofía Méndez"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>{isEs ? 'Empresa / Agencia' : 'Company / Agency'}</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Growth Agency"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEs ? 'Email Corporativo' : 'Work Email'}
                </label>
                <input
                  type="email"
                  required
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="sofia@growthagency.io"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isEs ? 'Contraseña (mín. 6)' : 'Password (min 6)'}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isEs ? 'Plan Trial (7 días)' : 'Trial Plan (7 days)'}
                  </label>
                  <select
                    value={signupPlan}
                    onChange={(e) => setSignupPlan(e.target.value as WorkspacePlan)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="starter">Starter ($39/m)</option>
                    <option value="growth">Growth ($79/m — Popular)</option>
                    <option value="agency">Agency ($149/m)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-2.5 rounded-xl text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer disabled:opacity-50"
              >
                <span>
                  {submitting
                    ? isEs
                      ? 'Creando Cuenta...'
                      : 'Creating Account...'
                    : isEs
                      ? 'Comenzar Prueba Gratis (7 días)'
                      : 'Start 7-Day Free Trial'}
                </span>
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {/* INTERNAL MODAL MODE: CREATE CLIENT WORKSPACE FOR AGENCY */}
          {isWorkspaceMode && (
            <form onSubmit={handleCreateWorkspace} className="space-y-3.5">
              <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-3 flex items-center gap-3">
                <Briefcase className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-[11px] text-slate-300 leading-snug">
                  <span className="font-bold text-white">
                    {isEs ? 'Sub-espacio para Cliente:' : 'Client Sub-Workspace:'}
                  </span>{' '}
                  {isEs
                    ? 'Aísla casillas SMTP, campañas, CRM y métricas para este cliente específico.'
                    : 'Isolate SMTP mailboxes, campaigns, CRM & analytics for this client.'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEs ? 'Nombre del Workspace' : 'Workspace Name'}
                </label>
                <input
                  type="text"
                  required
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  placeholder={isEs ? 'Ej: Outbound Cliente FinTech' : 'e.g. FinTech Client Outbound'}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEs ? 'Cliente u Organización' : 'Client or Organization'}
                </label>
                <input
                  type="text"
                  value={wsClientName}
                  onChange={(e) => setWsClientName(e.target.value)}
                  placeholder="Ej: FinTech Labs S.A."
                  className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEs ? 'Plan Inicial del Workspace' : 'Initial Workspace Plan'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['starter', 'growth', 'agency'] as WorkspacePlan[]).map((p) => {
                    const cfg = SAAS_PLANS[p];
                    const selected = wsPlan === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setWsPlan(p)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          selected
                            ? 'bg-emerald-950/40 border-emerald-500/60 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold">{cfg.name}</div>
                        <div className="text-[10px] text-slate-400">${cfg.monthlyPriceUsd}/m</div>
                        <div className="text-[9px] text-emerald-400 mt-0.5">
                          {cfg.maxAccounts === 999 ? '∞' : cfg.maxAccounts}{' '}
                          {isEs ? 'casillas' : 'mailboxes'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !canCreateWorkspace}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl text-xs shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
              >
                <span>
                  {submitting
                    ? isEs
                      ? 'Creando Workspace...'
                      : 'Creating Workspace...'
                    : isEs
                      ? 'Crear Workspace y Activar'
                      : 'Create & Switch Workspace'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
