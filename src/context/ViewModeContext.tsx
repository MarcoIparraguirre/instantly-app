'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ViewMode = 'simple' | 'pro';

interface ViewModeContextType {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  toggleMode: () => void;
  hasChosenMode: boolean;
  setHasChosenMode: (chosen: boolean) => void;
  openModePicker: () => void;
  isModePickerOpen: boolean;
  closeModePicker: () => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>('simple');
  const [hasChosenMode, setHasChosenModeState] = useState<boolean>(true); // initially true to avoid SSR flicker, loaded in useEffect
  const [isModePickerOpen, setIsModePickerOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      const storedChoice = localStorage.getItem('instantly_has_chosen_mode');
      const storedMode = localStorage.getItem('instantly_view_mode') as ViewMode;

      if (!storedChoice) {
        // First time user: show onboarding choice modal
        setHasChosenModeState(false);
        setIsModePickerOpen(true);
      } else {
        setHasChosenModeState(true);
        if (storedMode === 'simple' || storedMode === 'pro') {
          setModeState(storedMode);
        }
      }
    } catch (e) {}
  }, []);

  const setMode = (newMode: ViewMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem('instantly_view_mode', newMode);
      localStorage.setItem('instantly_has_chosen_mode', 'true');
    } catch (e) {}
    setHasChosenModeState(true);
    setIsModePickerOpen(false);
  };

  const toggleMode = () => {
    setMode(mode === 'simple' ? 'pro' : 'simple');
  };

  const openModePicker = () => setIsModePickerOpen(true);
  const closeModePicker = () => setIsModePickerOpen(false);

  return (
    <ViewModeContext.Provider
      value={{
        mode,
        setMode,
        toggleMode,
        hasChosenMode,
        setHasChosenMode: setHasChosenModeState,
        openModePicker,
        isModePickerOpen,
        closeModePicker
      }}
    >
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
}
