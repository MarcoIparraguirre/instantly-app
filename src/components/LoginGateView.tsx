'use client';

import React, { useState } from 'react';
import {
  Zap,
  ShieldCheck,
  Building2,
  Mail,
  Lock,
  User,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Flame,
  Inbox,
  Send,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { WorkspacePlan } from '@/types';
import LanguageToggle from './LanguageToggle';

export default function LoginGateView() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
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
      workspaceName: company || fullName || 'Espacio Principal',
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
          ? `Google OAuth no está disponible en este entorno: ${res.error}. Ingresa con tu email y contraseña.`
          : `Google OAuth: ${res.error}. Please sign in with email & password.`
      );
    }
  };

  const productHighlights = [
    {
      icon: Flame,
      title: isEs ? 'Rotación de Casillas & Warmup P2P' : 'Mailbox Rotation & P2P Warmup',
      desc: isEs
        ? 'Distribuye envíos entre múltiples cuentas SMTP y protege la reputación de tus dominios en piloto automático.'
        : 'Spread volume across multiple SMTP accounts and protect domain reputation automatically.',
      accent: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    {
      icon: Send,
      title: isEs ? 'Secuencias con Spintax y Parada por Dominio' : 'Spintax Sequences & Domain Stop',
      desc: isEs
        ? 'Personalización con variables dinámicas, pruebas A/Z y detención automática cuando responde cualquier colega.'
        : 'Dynamic variables, A/Z variants, and automatic sequence stop on company-domain replies.',
      accent: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    },
    {
      icon: Inbox,
      title: isEs ? 'Unibox Centralizado + Pipeline CRM' : 'Unified Unibox + CRM Pipeline',
      desc: isEs
        ? 'Clasifica respuestas con IA (Interesado, Reunión) y mueve oportunidades directo a tu tablero comercial.'
        : 'AI sentiment tagging and one-click deal promotion straight into your sales pipeline.',
      accent: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      icon: Building2,
      title: isEs ? 'Workspaces Multi-Cliente & Permisos' : 'Client Workspaces & Team Roles',
      desc: isEs
        ? 'Separa casillas, leads y métricas por cada cliente desde una sola cuenta con accesos por rol.'
        : 'Keep mailboxes, leads, and metrics strictly isolated per client with role-based access.',
      accent: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
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
                ? 'Infraestructura de prospección B2B y entregabilidad multi-agencia'
                : 'B2B cold outreach & multi-agency deliverability infrastructure'}
            </p>
          </div>
        </div>

        <LanguageToggle />
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Clean Product Value Proposition */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {isEs
                    ? 'Plataforma Outbound para Agencias y Equipos B2B'
                    : 'Outbound Platform for Agencies & B2B Teams'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                {isEs
                  ? 'Escala tus campañas en frío manteniendo alta entregabilidad en cada dominio'
                  : 'Scale your cold outreach while protecting deliverability on every domain'}
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
                {isEs
                  ? 'Inicia sesión para gestionar tus campañas, casillas y prospectos, o crea tu cuenta con 7 días de prueba gratis.'
                  : 'Sign in to manage your campaigns, mailboxes, and leads, or create an account with a 7-day free trial.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {productHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="bg-[#0c1220] border border-slate-800/90 rounded-2xl p-4 space-y-2"
                  >
                    <div
                      className={`w-8 h-8 rounded-xl border flex items-center justify-center ${item.accent}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <h2 className="font-bold text-white text-xs">{item.title}</h2>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Login / Create Account Card (Strictly 2 Tabs) */}
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
                  {isEs ? 'Crear Cuenta' : 'Create Account'}
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
                        placeholder="nombre@tuempresa.com"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition"
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
                            : 'Sign In'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-3.5">
                  <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-2xl p-3 text-[11px] text-slate-300 leading-snug">
                    <span className="font-bold text-white">
                      {isEs ? 'Prueba gratis de 7 días:' : '7-day free trial:'}
                    </span>{' '}
                    {isEs
                      ? 'Crea tu cuenta y activamos tu espacio de trabajo principal automáticamente.'
                      : 'Create your account and we provision your primary workspace automatically.'}
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
                        placeholder="Tu nombre"
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
                        placeholder="Nombre de tu empresa"
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
                      placeholder="nombre@tuempresa.com"
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
                          ? 'Creando cuenta...'
                          : 'Creating account...'
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
