'use client';

import React, { useState } from 'react';
import {
  Building2,
  Mail,
  Lock,
  User,
  ArrowRight,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { WorkspacePlan } from '@/types';
import LanguageToggle from './LanguageToggle';
import { BrandMark } from '@/components/ui/BrandMark';

export default function LoginGateView() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const { language } = useLanguage();
  const isEs = language === 'es';

  const [showSignUp, setShowSignUp] = useState(false);

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

  return (
    <div className="min-h-screen w-screen bg-[#F4F7F5] text-[#14213D] flex flex-col justify-between overflow-y-auto">
      {/* Minimal Header Bar */}
      <header className="px-6 py-3.5 flex items-center justify-between border-b border-[#DCE3DF] bg-white shrink-0">
        <div className="flex items-center gap-2.5">
          <BrandMark size="md" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#14213D] text-sm tracking-tight">
              MiSender
            </span>
            <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded-lg bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]">
              Outbound OS
            </span>
          </div>
        </div>

        <LanguageToggle />
      </header>

      {/* Centered Login Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-md w-full bg-white border border-[#DCE3DF] rounded-2xl shadow-xl overflow-hidden">
          {/* Prussian Blue Top Header Band */}
          <div className="bg-[#14213D] text-white px-6 py-5 flex items-center gap-3.5">
            <BrandMark size="md" className="border-[#D5ECD4]/35" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-snug">
                {showSignUp
                  ? isEs
                    ? 'Crear Cuenta'
                    : 'Create Account'
                  : isEs
                    ? 'Iniciar Sesión'
                    : 'Sign In'}
              </h1>
              <p className="text-xs text-[#A1B0AB] mt-0.5">
                {showSignUp
                  ? isEs
                    ? 'Activa tu espacio de trabajo con 7 días de prueba gratis'
                    : 'Activate your workspace with a 7-day free trial'
                  : isEs
                    ? 'Accede a tu plataforma de prospección y entregabilidad'
                    : 'Access your B2B outreach & deliverability workspace'}
              </p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {errorMsg && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {!showSignUp ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2.5 bg-[#F4F7F5] hover:bg-[#EEF3F0] border border-[#DCE3DF] text-[#14213D] font-semibold py-2.5 px-4 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
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
                  <div className="h-px flex-1 bg-[#DCE3DF]" />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#5C6F68]">
                    {isEs ? 'o ingresa con tu correo' : 'or sign in with email'}
                  </span>
                  <div className="h-px flex-1 bg-[#DCE3DF]" />
                </div>

                <form onSubmit={handleSignIn} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[#14213D] mb-1.5 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#5C6F68]" />
                      <span>{isEs ? 'Correo Electrónico' : 'Email Address'}</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="nombre@tuempresa.com"
                      className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3.5 py-2.5 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#14213D] mb-1.5 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-[#5C6F68]" />
                      <span>{isEs ? 'Contraseña' : 'Password'}</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3.5 py-2.5 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold py-2.5 rounded-lg text-xs shadow-sm transition cursor-pointer disabled:opacity-50"
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
                <div className="bg-[#D5ECD4]/45 border border-[#C3DAC3] rounded-xl p-3 text-[11px] text-[#14213D] leading-snug">
                  <span className="font-bold">
                    {isEs ? 'Prueba gratis de 7 días:' : '7-day free trial:'}
                  </span>{' '}
                  {isEs
                    ? 'Crea tu cuenta y activamos tu espacio de trabajo principal automáticamente.'
                    : 'Create your account and we provision your primary workspace automatically.'}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#14213D] mb-1 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#5C6F68]" />
                      <span>{isEs ? 'Nombre Completo' : 'Full Name'}</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={isEs ? 'Tu nombre' : 'Your name'}
                      className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#14213D] mb-1 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[#5C6F68]" />
                      <span>{isEs ? 'Empresa / Agencia' : 'Company / Agency'}</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder={isEs ? 'Nombre de tu empresa' : 'Your company'}
                      className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#14213D] mb-1">
                    {isEs ? 'Correo Corporativo' : 'Work Email'}
                  </label>
                  <input
                    type="email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="nombre@tuempresa.com"
                    className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3.5 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#14213D] mb-1">
                      {isEs ? 'Contraseña (mín. 6)' : 'Password (min 6)'}
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3.5 py-2 text-xs text-[#14213D] placeholder-[#5C6F68]/60 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#14213D] mb-1">
                      {isEs ? 'Plan Inicial (7d)' : 'Initial Plan (7d)'}
                    </label>
                    <select
                      value={signupPlan}
                      onChange={(e) => setSignupPlan(e.target.value as WorkspacePlan)}
                      className="w-full bg-[#F4F7F5] border border-[#DCE3DF] focus:border-[#14213D] focus:bg-white rounded-lg px-3 py-2 text-xs text-[#14213D] focus:outline-none cursor-pointer"
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
                  className="w-full flex items-center justify-center gap-2 bg-[#14213D] hover:bg-[#1E3158] text-white font-semibold py-2.5 rounded-lg text-xs shadow-sm transition cursor-pointer disabled:opacity-50"
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

            {/* Quiet link to toggle Sign Up / Sign In */}
            <div className="pt-3 border-t border-[#DCE3DF] text-center">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setShowSignUp((prev) => !prev);
                }}
                className="text-xs text-[#5C6F68] hover:text-[#14213D] transition cursor-pointer"
              >
                {!showSignUp ? (
                  <>
                    {isEs ? '¿No tienes cuenta? ' : "Don't have an account? "}
                    <span className="font-semibold text-[#14213D] underline underline-offset-2">
                      {isEs ? 'Crear cuenta' : 'Create account'}
                    </span>
                  </>
                ) : (
                  <>
                    {isEs ? '¿Ya tienes cuenta? ' : 'Already have an account? '}
                    <span className="font-semibold text-[#14213D] underline underline-offset-2">
                      {isEs ? 'Iniciar sesión' : 'Sign in'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Vectra Systems Footer */}
      <footer className="px-6 py-3.5 border-t border-[#DCE3DF] bg-white text-center text-[11px] text-[#5C6F68] shrink-0">
        <span>
          {isEs
            ? 'Software creado por Vectra Systems · '
            : 'Software created by Vectra Systems · '}
        </span>
        <a
          href="https://www.vectrasystems.com.ar"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono font-semibold text-[#14213D] hover:underline"
        >
          www.vectrasystems.com.ar
        </a>
      </footer>
    </div>
  );
}
