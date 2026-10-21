'use client';

import React from 'react';
import { LanguageProvider } from '@/context/LanguageContext';
import { ViewModeProvider } from '@/context/ViewModeContext';
import { AdminProfileProvider } from '@/context/AdminProfileContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ViewModeProvider>
        <AdminProfileProvider>
          {children}
        </AdminProfileProvider>
      </ViewModeProvider>
    </LanguageProvider>
  );
}
