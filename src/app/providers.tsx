'use client';

import React from 'react';
import { LanguageProvider } from '@/context/LanguageContext';
import { ViewModeProvider } from '@/context/ViewModeContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ViewModeProvider>
        {children}
      </ViewModeProvider>
    </LanguageProvider>
  );
}
