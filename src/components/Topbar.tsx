'use client';

import React, { useState } from 'react';
import { 
  Building2, Search, Zap, ChevronDown, Check, Sparkles
} from 'lucide-react';
import { Workspace } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useViewMode } from '@/context/ViewModeContext';
import LanguageToggle from './LanguageToggle';

interface TopbarProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  openCopilot: () => void;
}

export default function Topbar({
  currentWorkspace,
  workspaces,
  onSelectWorkspace,
  openCopilot
}: TopbarProps) {
  const { t, language } = useLanguage();
  const { mode, setMode, openModePicker } = useViewMode();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="h-14 border-b border-slate-800 bg-[#090d16] px-5 flex items-center justify-between shrink-0 select-none z-30">
      {/* Left Area: Workspace Selector */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
            className="flex items-center gap-2.5 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-xl transition text-xs font-semibold shadow-sm"
          >
            <div className="w-5 h-5 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
              <Building2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <div className="text-white leading-tight font-medium max-w-[180px] truncate">
                {currentWorkspace.name}
              </div>
              <div className="text-[10px] text-slate-400 font-normal">
                {currentWorkspace.clientName}
              </div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isWorkspaceMenuOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {t('topbar.switchWorkspace')}
              </div>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => {
                    onSelectWorkspace(ws);
                    setIsWorkspaceMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                    currentWorkspace.id === ws.id
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="text-left truncate pr-2">
                    <div className="font-semibold text-white">{ws.name}</div>
                    <div className="text-[10px] text-slate-400">{ws.clientName}</div>
                  </div>
                  {currentWorkspace.id === ws.id && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Global Search */}
        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.searchPlaceholder')}
            className="w-full bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 focus:border-blue-500 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/60 font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Area: Experience Switcher (Simple / Pro), Credits, Language, Profile */}
      <div className="flex items-center gap-3">
        {/* Experience Mode Toggle Pill */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setMode('simple')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition font-bold text-xs ${
              mode === 'simple'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Switch to Simple Mode (Beginner friendly)"
          >
            <span>🐣</span>
            <span>{language === 'es' ? 'Simple' : 'Simple'}</span>
          </button>

          <button
            onClick={() => setMode('pro')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition font-bold text-xs ${
              mode === 'pro'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Switch to Pro Mode (Advanced tools)"
          >
            <span>⚡</span>
            <span>{language === 'es' ? 'Pro' : 'Pro'}</span>
          </button>
        </div>

        {/* Verification Credits Badge */}
        <div className="flex items-center gap-1.5 bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 px-3 py-1 rounded-xl text-xs font-semibold shadow-sm">
          <Zap className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400" />
          <span>{currentWorkspace.credits.toLocaleString()}</span>
          <span className="text-[10px] text-indigo-400/80 font-normal">{t('topbar.creditsAvailable')}</span>
        </div>

        {/* Instantly Copilot Trigger */}
        <button
          onClick={openCopilot}
          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl shadow-md shadow-indigo-600/20 transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Copilot</span>
        </button>

        {/* Language Switcher */}
        <LanguageToggle />

        {/* User Profile Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
            AM
          </div>
        </div>
      </div>
    </header>
  );
}
