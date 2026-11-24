import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BrandMark } from '@/components/ui/BrandMark';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F4F7F5] text-[#14213D]">
      <header className="border-b border-[#DCE3DF] bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark size="md" />
            <span className="font-bold text-base tracking-tight text-[#14213D]">
              MiSender
            </span>
            <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded-lg bg-[#D5ECD4] text-[#14213D] border border-[#C3DAC3]">
              Outbound OS
            </span>
          </div>

          <Link
            href="/app"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#14213D] text-white text-sm font-semibold hover:bg-[#1E2F55] transition-colors"
          >
            Ir a la App
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <p className="font-mono text-xs uppercase tracking-widest text-[#5C6F68] mb-4">
            Ruta pública lista · Espacio reservado para la landing
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#14213D] leading-[1.1] max-w-2xl">
            MiSender ahora vive en <span className="font-mono text-[#1F6F54]">/app</span> y la raíz <span className="font-mono text-[#1F6F54]">/</span> quedó lista para tu landing.
          </h1>
          <p className="mt-5 text-base sm:text-lg text-[#4B5E57] max-w-xl leading-relaxed">
            La aplicación completa (Login, Workspaces, Campañas, Warmup, Unibox, CRM y Billing) funciona en <code className="font-mono text-sm bg-white px-1.5 py-0.5 rounded border border-[#DCE3DF]">/app</code>. Cuando definamos el brief comercial, construiremos aquí la landing definitiva usando <code className="font-mono text-sm bg-white px-1.5 py-0.5 rounded border border-[#DCE3DF]">design-taste-frontend</code>.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#14213D] text-white text-sm font-semibold hover:bg-[#1E2F55] transition-colors"
            >
              Abrir MiSender App
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#DCE3DF] bg-white">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between text-xs text-[#5C6F68]">
          <span>MiSender · Outbound OS</span>
          <span>Vectra Systems</span>
        </div>
      </footer>
    </div>
  );
}
