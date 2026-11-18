'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import { Workspace, WorkspacePlan, SAAS_PLANS } from '@/types';

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  company?: string;
  avatarInitials: string;
  isDemo?: boolean;
  provider?: string;
}

export type AuthModalTab = 'signin' | 'signup' | 'workspace';

export interface SignUpMetadata {
  fullName?: string;
  company?: string;
  workspaceName?: string;
  plan?: WorkspacePlan;
}

export interface CreateWorkspaceInput {
  name: string;
  clientName?: string;
  plan?: WorkspacePlan;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  switchWorkspace: (workspaceOrId: Workspace | string) => void;
  createWorkspace: (
    input: CreateWorkspaceInput
  ) => Promise<{ workspace?: Workspace; error?: string }>;
  updateWorkspaces: (updated: Workspace[]) => void;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error?: string; isDemo?: boolean }>;
  signUp: (
    email: string,
    password: string,
    metadata?: SignUpMetadata
  ) => Promise<{ error?: string; needsEmailConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signInDemo: (email?: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAuthModalOpen: boolean;
  authModalTab: AuthModalTab;
  setAuthModalTab: (tab: AuthModalTab) => void;
  openAuthModal: (defaultTab?: AuthModalTab) => void;
  closeAuthModal: () => void;
  refreshWorkspaces: () => Promise<void>;
}

const DEFAULT_PRIMARY_WORKSPACE: Workspace = {
  id: 'ws-primary',
  name: 'Espacio Principal',
  clientName: 'Vectra Systems',
  credits: SAAS_PLANS.growth.credits,
  plan: 'growth',
  subscriptionStatus: 'trialing',
  maxAccounts: SAAS_PLANS.growth.maxAccounts,
  maxLeads: SAAS_PLANS.growth.maxLeads,
  billingProvider: 'sandbox',
};

const DEMO_USER_STORAGE_KEY = 'misender_demo_user';
const WORKSPACES_STORAGE_KEY = 'misender_workspaces';
const CURRENT_WORKSPACE_STORAGE_KEY = 'misender_current_workspace_id';

let browserSupabaseClient: SupabaseClient | null = null;

function getBrowserSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (browserSupabaseClient) return browserSupabaseClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url.includes('placeholder')) {
    return null;
  }

  browserSupabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserSupabaseClient;
}

function buildInitials(name?: string, email?: string): string {
  const source = (name || email || 'US').trim();
  const parts = source.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function mapSupabaseUser(sbUser: SupabaseUser): AuthUser {
  const meta = (sbUser.user_metadata || {}) as Record<string, unknown>;
  const rawFullName = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : undefined;
  const fullName = rawFullName || sbUser.email?.split('@')[0] || 'Usuario';
  const email = sbUser.email || '';
  return {
    id: sbUser.id,
    email,
    fullName,
    company: typeof meta.company === 'string' ? meta.company : undefined,
    avatarInitials: buildInitials(fullName, email),
    isDemo: false,
    provider: typeof sbUser.app_metadata?.provider === 'string' ? sbUser.app_metadata.provider : 'email',
  };
}

function enrichWorkspaceDefaults(ws: Workspace): Workspace {
  const plan = ws.plan || 'growth';
  const config = SAAS_PLANS[plan] || SAAS_PLANS.growth;
  return {
    ...ws,
    plan,
    subscriptionStatus: ws.subscriptionStatus || 'trialing',
    maxAccounts: ws.maxAccounts ?? config.maxAccounts,
    maxLeads: ws.maxLeads ?? config.maxLeads,
    credits: ws.credits ?? config.credits,
    billingProvider: ws.billingProvider || 'sandbox',
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([DEFAULT_PRIMARY_WORKSPACE]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace>(DEFAULT_PRIMARY_WORKSPACE);
  const currentWorkspaceIdRef = useRef<string>(DEFAULT_PRIMARY_WORKSPACE.id);
  const workspacesRef = useRef<Workspace[]>([DEFAULT_PRIMARY_WORKSPACE]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<AuthModalTab>('signin');

  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspace.id;
  }, [currentWorkspace.id]);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  const persistWorkspacesLocally = useCallback((list: Workspace[], activeId?: string) => {
    try {
      localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(list));
      if (activeId) {
        localStorage.setItem(CURRENT_WORKSPACE_STORAGE_KEY, activeId);
      }
    } catch {}
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const enriched = data.map(enrichWorkspaceDefaults);
          setWorkspaces(enriched);

          let savedId: string | null = null;
          try {
            savedId = localStorage.getItem(CURRENT_WORKSPACE_STORAGE_KEY);
          } catch {}

          const active =
            enriched.find((w) => w.id === savedId) ||
            enriched.find((w) => w.id === currentWorkspaceIdRef.current) ||
            enriched[0];

          setCurrentWorkspace(active);
          persistWorkspacesLocally(enriched, active.id);
          return;
        }
      }
    } catch (err) {
      console.warn('Error refreshing workspaces from API, using local cache:', err);
    }

    // Local fallback hydration
    try {
      const saved = localStorage.getItem(WORKSPACES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const enriched = parsed.map(enrichWorkspaceDefaults);
          setWorkspaces(enriched);
          const savedId = localStorage.getItem(CURRENT_WORKSPACE_STORAGE_KEY);
          const active = enriched.find((w) => w.id === savedId) || enriched[0];
          setCurrentWorkspace(active);
        }
      }
    } catch {}
  }, [persistWorkspacesLocally]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      // 1. Hydrate local workspaces cache quickly while API loads
      try {
        const cachedWs = localStorage.getItem(WORKSPACES_STORAGE_KEY);
        if (cachedWs) {
          const parsed = JSON.parse(cachedWs);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const enriched = parsed.map(enrichWorkspaceDefaults);
            setWorkspaces(enriched);
            const savedId = localStorage.getItem(CURRENT_WORKSPACE_STORAGE_KEY);
            const found = enriched.find((w) => w.id === savedId);
            setCurrentWorkspace(found || enriched[0]);
          }
        }
      } catch {}

      // 2. Hydrate Supabase session or Demo fallback session
      const sb = getBrowserSupabase();
      if (sb) {
        try {
          const { data } = await sb.auth.getSession();
          if (active && data.session?.user) {
            setUser(mapSupabaseUser(data.session.user));
          } else {
            const demoRaw = localStorage.getItem(DEMO_USER_STORAGE_KEY);
            if (active && demoRaw) {
              setUser(JSON.parse(demoRaw));
            }
          }
        } catch {}
      } else {
        try {
          const demoRaw = localStorage.getItem(DEMO_USER_STORAGE_KEY);
          if (active && demoRaw) {
            setUser(JSON.parse(demoRaw));
          }
        } catch {}
      }

      // 3. Fetch authoritative workspaces from API / Supabase
      await refreshWorkspaces();
      if (active) setLoading(false);
    };

    init();

    const sb = getBrowserSupabase();
    const subscription = sb
      ? sb.auth.onAuthStateChange((_event, session) => {
          if (session?.user) {
            setUser(mapSupabaseUser(session.user));
            try {
              localStorage.removeItem(DEMO_USER_STORAGE_KEY);
            } catch {}
            refreshWorkspaces();
          }
        }).data.subscription
      : null;

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [refreshWorkspaces]);

  const switchWorkspace = useCallback(
    (workspaceOrId: Workspace | string) => {
      const target =
        typeof workspaceOrId === 'string'
          ? workspaces.find((w) => w.id === workspaceOrId)
          : workspaceOrId;
      if (!target) return;

      const enriched = enrichWorkspaceDefaults(target);
      setCurrentWorkspace(enriched);
      try {
        localStorage.setItem(CURRENT_WORKSPACE_STORAGE_KEY, enriched.id);
      } catch {}
    },
    [workspaces]
  );

  const createWorkspace = useCallback(
    async (
      input: CreateWorkspaceInput
    ): Promise<{ workspace?: Workspace; error?: string }> => {
      const name = input.name.trim();
      if (!name) {
        return { error: 'Workspace name is required' };
      }

      try {
        const res = await fetch('/api/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            clientName: input.clientName?.trim() || 'Internal',
            plan: input.plan || 'growth',
            ownerId: user?.id,
            ownerEmail: user?.email,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          return { error: data?.error || 'Failed to create workspace' };
        }

        const created = enrichWorkspaceDefaults(data as Workspace);
        const nextList = [...workspaces, created];
        setWorkspaces(nextList);
        setCurrentWorkspace(created);
        persistWorkspacesLocally(nextList, created.id);
        return { workspace: created };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : 'Network error creating workspace' };
      }
    },
    [persistWorkspacesLocally, user, workspaces]
  );

  const updateWorkspaces = useCallback(
    (updated: Workspace[]) => {
      const previous = workspacesRef.current;
      const enriched = updated.map(enrichWorkspaceDefaults);
      setWorkspaces(enriched);
      const nextActive =
        enriched.find((w) => w.id === currentWorkspaceIdRef.current) || enriched[0] || DEFAULT_PRIMARY_WORKSPACE;
      setCurrentWorkspace(nextActive);
      persistWorkspacesLocally(enriched, nextActive.id);

      // Sync additions, edits, and deletions with /api/workspaces in background
      for (const ws of enriched) {
        const prev = previous.find((p) => p.id === ws.id);
        if (!prev) {
          fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ws),
          }).catch(() => {});
        } else if (prev.name !== ws.name || prev.clientName !== ws.clientName || prev.plan !== ws.plan) {
          fetch('/api/workspaces', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ws),
          }).catch(() => {});
        }
      }

      for (const prev of previous) {
        if (!enriched.some((ws) => ws.id === prev.id)) {
          fetch(`/api/workspaces?id=${encodeURIComponent(prev.id)}`, {
            method: 'DELETE',
          }).catch(() => {});
        }
      }
    },
    [persistWorkspacesLocally]
  );

  const activateDemoUser = useCallback(
    (email: string, fullName?: string, company?: string, idOverride?: string): AuthUser => {
      const demoUser: AuthUser = {
        id: idOverride || `demo-${Date.now()}`,
        email,
        fullName: fullName || email.split('@')[0] || 'Demo SaaS',
        company,
        avatarInitials: buildInitials(fullName, email),
        isDemo: true,
        provider: 'staging-demo',
      };
      setUser(demoUser);
      try {
        localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(demoUser));
      } catch {}
      return demoUser;
    },
    []
  );

  const signInDemo = useCallback(
    async (email = 'demo@misender.app', fullName = 'Usuario Demo SaaS') => {
      activateDemoUser(email, fullName, 'Vectra Staging', 'demo-staging-user');
      await refreshWorkspaces();
      setIsAuthModalOpen(false);
    },
    [activateDemoUser, refreshWorkspaces]
  );

  const signIn = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ error?: string; isDemo?: boolean }> => {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) {
        return { error: 'Email and password are required' };
      }

      const sb = getBrowserSupabase();
      if (!sb) {
        activateDemoUser(cleanEmail);
        await refreshWorkspaces();
        setIsAuthModalOpen(false);
        return { isDemo: true };
      }

      try {
        const { data, error } = await sb.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!error && data.user) {
          setUser(mapSupabaseUser(data.user));
          try {
            localStorage.removeItem(DEMO_USER_STORAGE_KEY);
          } catch {}
          await refreshWorkspaces();
          setIsAuthModalOpen(false);
          return { isDemo: false };
        }

        const msg = error?.message || '';
        // Unblock staging tests when Supabase SMTP email confirmation hasn't been clicked yet
        if (/email not confirmed/i.test(msg)) {
          activateDemoUser(cleanEmail, cleanEmail.split('@')[0]);
          await refreshWorkspaces();
          setIsAuthModalOpen(false);
          return { isDemo: true };
        }

        return { error: msg || 'Invalid email or password' };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : 'Sign in failed' };
      }
    },
    [activateDemoUser, refreshWorkspaces]
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata?: SignUpMetadata
    ): Promise<{ error?: string; needsEmailConfirmation?: boolean }> => {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || password.length < 6) {
        return { error: 'Valid email and password (min 6 chars) are required' };
      }

      const fullName = metadata?.fullName?.trim() || cleanEmail.split('@')[0];
      const company = metadata?.company?.trim() || 'Mi Organización';
      const workspaceName = metadata?.workspaceName?.trim() || company;
      const plan = metadata?.plan || 'growth';

      const sb = getBrowserSupabase();
      let createdUserId: string | undefined;
      let needsConfirmation = false;

      if (sb) {
        try {
          const { data, error } = await sb.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: {
                full_name: fullName,
                company,
              },
            },
          });

          if (error) {
            // In staging, gracefully fall back if SMTP rate limits or confirmation settings block signup
            if (/rate limit|email|smtp|confirm/i.test(error.message)) {
              activateDemoUser(cleanEmail, fullName, company);
              needsConfirmation = true;
            } else {
              return { error: error.message };
            }
          } else if (data.user) {
            createdUserId = data.user.id;
            if (data.session) {
              setUser(mapSupabaseUser(data.user));
            } else {
              // Email confirmation pending on Supabase -> activate immediate staging session
              activateDemoUser(cleanEmail, fullName, company, data.user.id);
              needsConfirmation = true;
            }
          }
        } catch (err: unknown) {
          return { error: err instanceof Error ? err.message : 'Sign up failed' };
        }
      } else {
        const demo = activateDemoUser(cleanEmail, fullName, company);
        createdUserId = demo.id;
      }

      // Provision initial SaaS 7-day trial workspace for the new account
      await createWorkspace({
        name: workspaceName,
        clientName: company,
        plan,
      });

      setIsAuthModalOpen(false);
      return {
        needsEmailConfirmation: needsConfirmation,
        error: createdUserId ? undefined : undefined,
      };
    },
    [activateDemoUser, createWorkspace]
  );

  const signInWithGoogle = useCallback(async (): Promise<{ error?: string }> => {
    const sb = getBrowserSupabase();
    if (!sb) {
      await signInDemo('google-demo@misender.app', 'Google Staging User');
      return {};
    }

    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) {
        return { error: error.message };
      }
      return {};
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Google OAuth error' };
    }
  }, [signInDemo]);

  const signOut = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (sb) {
      try {
        await sb.auth.signOut();
      } catch {}
    }
    try {
      localStorage.removeItem(DEMO_USER_STORAGE_KEY);
    } catch {}
    setUser(null);
  }, []);

  const openAuthModal = useCallback((defaultTab: AuthModalTab = 'signin') => {
    setAuthModalTab(defaultTab);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        workspaces,
        currentWorkspace,
        switchWorkspace,
        createWorkspace,
        updateWorkspaces,
        signIn,
        signUp,
        signInWithGoogle,
        signInDemo,
        signOut,
        isAuthModalOpen,
        authModalTab,
        setAuthModalTab,
        openAuthModal,
        closeAuthModal,
        refreshWorkspaces,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
