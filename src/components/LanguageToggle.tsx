'use client';

import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface LanguageToggleProps {
  className?: string;
  variant?: 'compact' | 'full';
}

export default function LanguageToggle({
  className = '',
  variant = 'compact',
}: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage();
  const isFull = variant === 'full';

  return (
    <div
      role="group"
      aria-label={language === 'es' ? 'Selector de idioma' : 'Language selector'}
      className={`inline-flex items-center gap-0.5 bg-[#EEF3F0] border border-[#DCE3DF] rounded-xl p-1 text-xs shrink-0 ${className}`}
    >
      <span
        aria-hidden="true"
        className="flex items-center justify-center pl-1.5 pr-1 text-[#5C6F68]"
      >
        <Globe className="w-3.5 h-3.5" />
      </span>

      <button
        type="button"
        onClick={() => setLanguage('en')}
        aria-pressed={language === 'en'}
        className={`flex items-center justify-center ${
          isFull ? 'px-3 py-1' : 'px-2 py-1'
        } rounded-lg transition font-mono font-bold tracking-wider cursor-pointer ${
          language === 'en'
            ? 'bg-[#14213D] text-white shadow-sm'
            : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-white'
        }`}
        title="Switch to English"
      >
        EN
      </button>

      <button
        type="button"
        onClick={() => setLanguage('es')}
        aria-pressed={language === 'es'}
        className={`flex items-center justify-center ${
          isFull ? 'px-3 py-1' : 'px-2 py-1'
        } rounded-lg transition font-mono font-bold tracking-wider cursor-pointer ${
          language === 'es'
            ? 'bg-[#14213D] text-white shadow-sm'
            : 'text-[#5C6F68] hover:text-[#14213D] hover:bg-white'
        }`}
        title="Cambiar a Español"
      >
        ES
      </button>
    </div>
  );
}
