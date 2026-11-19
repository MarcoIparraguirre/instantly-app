'use client';

import React from 'react';
import { LanguageProvider } from '@/context/LanguageContext';
import { ViewModeProvider } from '@/context/ViewModeContext';
import { AdminProfileProvider } from '@/context/AdminProfileContext';
import { FeedbackProvider } from '@/context/FeedbackContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ViewModeProvider>
        <AdminProfileProvider>
          <FeedbackProvider>
            {children}
          </FeedbackProvider>
        </AdminProfileProvider>
      </ViewModeProvider>
    </LanguageProvider>
  );
}
