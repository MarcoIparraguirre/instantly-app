'use client';

import React, { useState } from 'react';
import {
  Zap,
  ShieldCheck,
  Building2,
  UserCog,
  Eye,
  Mail,
  Lock,
  User,
  ArrowRight,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Crown,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { WorkspacePlan, UserRole } from '@/types';
import LanguageToggle from './LanguageToggle';

export default function LoginGateView() {
  const { signIn, signUp, signInWithGoogle, signInAsRole } = useAuth();
  const { language } = useLanguage();
  const isEs = language === 'es';

  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');

  // Sign In form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Sign Up form
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPlan, setSignupPlan] = useState<WorkspacePlan>('growth');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
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
    const res = await signUp(signupEmail, signupPassword, {
      fullName,
      company,
      workspaceName: company || fullName || 'Mi Agencia Principal',
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
          ? `Google OAuth: ${res.error}. Puedes usar los accesos rápidos o email y contraseña.`
          : `Google OAuth: ${res.error}. Use quick role access or email & password.`
      );
    }
  };

  const quickRoleCards: Array<{
    role: UserRole;
    title: string;
    subtitle: string;
    desc: string;
    icon: React.ElementType;
    badge: string;
    accent: string;
  }> = [
    {
      role: 'super_admin',
      title: isEs ? 'Super Admin (Fundador — Marco)' : 'Super Admin (Founder — Marco)',
      subtitle: 'marcos@vectrasystems.com.ar',
      desc: isEs
        ? 'Acceso total + Backoffice SaaS para dar de alta agencias, planes y cobros.'
        : 'Full access + SaaS Backoffice to onboard agencies, plans & billing.',
      icon: Crown,
      badge: 'Nivel 1 • Tú',
      accent: 'border-amber-500/40 bg-amber-950/20 hover:bg-amber-950/40 text-amber-300',
    },
    {
      role: 'admin',
      title: isEs ? 'Dueño de Agencia' : 'Agency Owner',
      subtitle: 'sofia@agenciab2b.com',
      desc: isEs
        ? 'Gestiona Workspaces por cada cliente, invita a su equipo y administra su plan.'
        : 'Manages client workspaces, invites team members & pays subscription.',
      icon: Building2,
      badge: 'Nivel 2 • Tu Cliente',
      accent: 'border-blue-500/40 bg-blue-950/20 hover:bg-blue-950/40 text-blue-300',
    },
    {
      role: 'campaign_manager',
      title: isEs ? 'Gestor de Campañas (SDR)' : 'Campaign Manager (SDR)',
      subtitle: 'lucas@agenciab2b.com',
      desc: isEs
        ? 'Crea campañas, importa leads y responde en Unibox (sin Facturación ni Equipo).'
        : 'Operates campaigns, leads & Unibox (no billing or team admin access).',
      icon: UserCog,
      badge: 'Nivel 3 • Operador',
      accent: 'border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-300',
    },
    {
      role: 'viewer',
      title: isEs ? 'Cliente Final (Solo Lectura)' : 'End Client (Read-Only)',
      subtitle: 'martin@clientefinal.com',
      desc: isEs
        ? 'Ve métricas, Unibox y pipeline CRM de su campaña sin modificar configuraciones.'
        : 'Views analytics, Unibox & CRM pipeline without modifying settings.',
      icon: Eye,
      badge: 'Nivel 3 • Vista Cliente',
      accent: 'border-purple-500/40 bg-purple-950/20 hover:bg-purple-950/40 text-purple-300',
    },
  ];

  return (
    <div className="min-h-screen w-screen bg-[#070b14] text-slate-100 flex flex-col justify-between overflow-y-auto relative">
      {/* Subtle Ambient Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
      </div>

      {/* Top Strip */}
      <header className="relative z-10 px-6 py-4 flex items-center justify-between border-b border-slate-800/70 bg-[#090e1a]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-600/25">
            <Zap className="w-4.5 h-4.5 text-white fill-white" />
          </div>
          <div>
            <div className="font-bold text-white text-sm tracking-wide flex items-center gap-2">
              <span>MiSender</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Outbound OS
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isEs
                ? 'Infraestructura multi-agencia para cold email y entregabilidad B2B'
                : 'Multi-agency B2B cold email & deliverability platform'}
            </p>
          </div>
        </div>

        <LanguageToggle />
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Value Prop + 1-Click Role Switcher for Demo & Testing */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {isEs
                    ? 'Aislamiento Multi-Agencia & Control de Roles (RBAC)'
                    : 'Multi-Agency Isolation & Role-Based Access Control'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                {isEs
                  ? 'Entra a tu operación outbound o prueba cada nivel de acceso en 1 clic'
                  : 'Sign in to your outbound operation or test each role in 1 click'}
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
                {isEs
                  ? 'Al crear una cuenta de agencia, tu Workspace principal nace automáticamente. Luego, desde adentro de la app, cada agencia crea Workspaces separados para sus clientes y usuarios para su equipo.'
                  : 'When an agency signs up, its primary workspace is provisioned automatically. Inside the app, agencies create separate client workspaces and invite team members.'}
              </p>
            </div>

            {/* 1-Click Role Demo Cards */}
            <div className="bg-[#0c1220] border border-slate-800/90 rounded-3xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {isEs
                        ? 'Acceso Rápido por Rol (Pruebas de Fundador)'
                        : '1-Click Role Preview (Founder Testing)'}
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isEs
                      ? 'Haz clic en cualquier perfil para comprobar qué ve y qué tiene bloqueado cada rol.'
                      : 'Click any profile to verify what each role sees and what actions are restricted.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {quickRoleCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.role}
                      type="button"
                      onClick={() => void signInAsRole(card.role)}
                      className={`text-left p-4 rounded-2xl border transition cursor-pointer group ${card.accent}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="text-[10px] font-mono uppercase font-bold opacity-90">
                            {card.badge}
                          </span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <div className="font-bold text-white text-xs">{card.title}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        {card.subtitle}
                      </div>
                      <p className="text-[11px] text-slate-300/90 mt-2 leading-snug">
                        {card.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Real Login / Agency Signup Card (Strictly 2 Tabs) */}
          <div className="lg:col-span-5 bg-[#0f172a] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-slate-800 bg-slate-900/50">
              <div className="grid grid-cols-2 gap-1.5 bg-slate-950/80 border border-slate-800 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setActiveTab('signin');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === 'signin'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isEs ? 'Iniciar Sesión' : 'Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setActiveTab('signup');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === 'signup'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isEs ? 'Crear Cuenta de Agencia' : 'Create Agency Account'}
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {errorMsg && (
                <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {activeTab === 'signin' ? (
                <div className="space-y-4">
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
                      {isEs ? 'o accede con tu correo' : 'or sign in with email'}
                    </span>
                    <div className="h-px flex-1 bg-slate-800" />
                  </div>

                  <form onSubmit={handleSignIn} className="space-y-3.5">
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
                        placeholder="agencia@tudominio.com"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{isEs ? 'Contraseña / Código de Acceso' : 'Password / Access Code'}</span>
                      </label>
                      <input
                        type="password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition"
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
                            ? 'Verificando acceso...'
                            : 'Signing in...'
                          : isEs
                            ? 'Ingresar a MiSender'
                            : 'Enter MiSender'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </form>

                  <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 text-[11px] text-slate-400 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      {isEs
                        ? 'Si tu agencia o usuario fue creado desde el Backoffice o Mi Equipo, ingresa tu correo y el sistema te llevará directo a tu Workspace con tu rol.'
                        : 'If your account was provisioned from Backoffice or My Team, sign in with your email to enter your assigned workspace and role.'}
                    </span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-3.5">
                  <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-2xl p-3 text-[11px] text-slate-300 leading-snug">
                    <span className="font-bold text-white">
                      {isEs ? 'Alta automática (7 días de prueba):' : 'Instant trial (7 days free):'}
                    </span>{' '}
                    {isEs
                      ? 'Creas tu usuario Admin y automáticamente activamos el Workspace principal de tu agencia.'
                      : 'Creates your Admin user and automatically sets up your agency primary workspace.'}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        <span>{isEs ? 'Tu Nombre' : 'Full Name'}</span>
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
                        <span>{isEs ? 'Nombre de Agencia' : 'Agency Name'}</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Agencia Growth B2B"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isEs ? 'Correo Corporativo' : 'Work Email'}
                    </label>
                    <input
                      type="email"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="sofia@agenciab2b.com"
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
                        {isEs ? 'Plan Inicial (7d)' : 'Initial Plan (7d)'}
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
                          ? 'Configurando agencia...'
                          : 'Setting up agency...'
                        : isEs
                          ? 'Crear Cuenta y Entrar'
                          : 'Create Account & Enter'}
                    </span>
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
