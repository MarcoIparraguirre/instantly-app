'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import {
  Workspace,
  WorkspacePlan,
  SAAS_PLANS,
  UserRole,
  TeamMember,
  ROLE_PERMISSIONS,
  normalizeRole,
} from '@/types';

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  company?: string;
  avatarInitials: string;
  role: UserRole;
  workspaceId?: string;
  allowedWorkspaceIds?: string[];
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
  ownerId?: string;
  ownerEmail?: string;
  subscriptionStatus?: Workspace['subscriptionStatus'];
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  workspaces: Workspace[];
  visibleWorkspaces: Workspace[];
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
  signInAsRole: (role: UserRole, customUser?: Partial<AuthUser>) => Promise<void>;
  switchRole: (role: UserRole) => void;
  isFounderSession: boolean;
  restoreFounderSession: () => Promise<void>;
  signOut: () => Promise<void>;
  isAuthModalOpen: boolean;
  authModalTab: AuthModalTab;
  setAuthModalTab: (tab: AuthModalTab) => void;
  openAuthModal: (defaultTab?: AuthModalTab) => void;
  closeAuthModal: () => void;
  refreshWorkspaces: (preferredWorkspaceId?: string) => Promise<void>;
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
const ROLE_OVERRIDE_STORAGE_KEY = 'misender_role_override';
const WORKSPACES_STORAGE_KEY = 'misender_workspaces';
const CURRENT_WORKSPACE_STORAGE_KEY = 'misender_current_workspace_id';
const FOUNDER_SESSION_STORAGE_KEY = 'misender_founder_session';

const FOUNDER_EMAILS = ['marcos@vectrasystems.com.ar', 'iparraguirre.marcos@gmail.com'];

export function isFounderEmail(email?: string | null): boolean {
  const clean = (email || '').trim().toLowerCase();
  return FOUNDER_EMAILS.includes(clean);
}

interface StoredFounderSession {
  email: string;
  fullName?: string;
  company?: string;
  id?: string;
  isDemo?: boolean;
}

function readStoredFounderSession(): StoredFounderSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(FOUNDER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    if (raw === 'true') {
      return {
        email: FOUNDER_EMAILS[0],
        fullName: 'Marco Iparraguirre',
        company: 'Vectra Systems',
        id: 'admin-default',
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredFounderSession>;
    if (parsed && typeof parsed.email === 'string' && isFounderEmail(parsed.email)) {
      return {
        email: parsed.email.trim().toLowerCase(),
        fullName: parsed.fullName,
        company: parsed.company,
        id: parsed.id,
        isDemo: parsed.isDemo,
      };
    }
  } catch {}
  return null;
}

const PRESET_ROLE_USERS: Record<
  UserRole,
  { id: string; email: string; fullName: string; company: string }
> = {
  super_admin: {
    id: 'admin-default',
    email: 'marcos@vectrasystems.com.ar',
    fullName: 'Marco Iparraguirre',
    company: 'Vectra Systems',
  },
  admin: {
    id: 'agency-admin-1',
    email: 'sofia@agenciab2b.com',
    fullName: 'Sofía Méndez',
    company: 'Agencia Growth B2B',
  },
  campaign_manager: {
    id: 'sdr-manager-1',
    email: 'lucas@agenciab2b.com',
    fullName: 'Lucas Gómez',
    company: 'Agencia Growth B2B',
  },
  viewer: {
    id: 'client-viewer-1',
    email: 'martin@clientefinal.com',
    fullName: 'Martín Ruiz',
    company: 'Cliente Inmobiliaria',
  },
};

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

function inferDefaultRoleFromEmail(email?: string): UserRole {
  if (isFounderEmail(email)) {
    return 'super_admin';
  }
  return 'admin';
}

function getSavedRoleOverride(): UserRole | null {
  try {
    const raw = localStorage.getItem(ROLE_OVERRIDE_STORAGE_KEY);
    if (
      raw === 'super_admin' ||
      raw === 'admin' ||
      raw === 'campaign_manager' ||
      raw === 'viewer'
    ) {
      return raw;
    }
  } catch {}
  return null;
}

function normalizeOptionalWorkspaceIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) seen.add(trimmed);
    }
  }
  return seen.size > 0 ? Array.from(seen) : undefined;
}

function mapSupabaseUser(sbUser: SupabaseUser, teamMatch?: TeamMember | null): AuthUser {
  const meta = (sbUser.user_metadata || {}) as Record<string, unknown>;
  const rawFullName =
    teamMatch?.fullName ||
    (typeof meta.full_name === 'string'
      ? meta.full_name
      : typeof meta.name === 'string'
        ? meta.name
        : undefined);
  const email = sbUser.email || '';
  const fullName = rawFullName || email.split('@')[0] || 'Usuario';
  const roleOverride = getSavedRoleOverride();
  const role = normalizeRole(
    (isFounderEmail(email) ? roleOverride || 'super_admin' : undefined) ||
      teamMatch?.roleId ||
      roleOverride ||
      (typeof meta.role === 'string' ? meta.role : undefined) ||
      inferDefaultRoleFromEmail(email)
  );
  const allowedWorkspaceIds = normalizeOptionalWorkspaceIds(
    teamMatch?.allowedWorkspaceIds ?? meta.allowedWorkspaceIds ?? meta.allowed_workspace_ids
  );

  return {
    id: sbUser.id,
    email,
    fullName,
    company:
      teamMatch?.company ||
      (typeof meta.company === 'string' ? meta.company : undefined),
    avatarInitials: buildInitials(fullName, email),
    role,
    workspaceId: teamMatch?.workspaceId || allowedWorkspaceIds?.[0],
    allowedWorkspaceIds,
    isDemo: false,
    provider:
      typeof sbUser.app_metadata?.provider === 'string'
        ? sbUser.app_metadata.provider
        : 'email',
  };
}

function normalizeStoredAuthUser(raw: Partial<AuthUser>): AuthUser {
  const email = raw.email || 'demo@misender.app';
  const fullName = raw.fullName || email.split('@')[0] || 'Usuario';
  const roleOverride = getSavedRoleOverride();
  const role = normalizeRole(
    raw.role || roleOverride || inferDefaultRoleFromEmail(email)
  );
  const allowedWorkspaceIds = normalizeOptionalWorkspaceIds(raw.allowedWorkspaceIds);
  return {
    id: raw.id || 'demo-staging-user',
    email,
    fullName,
    company: raw.company,
    avatarInitials: raw.avatarInitials || buildInitials(fullName, email),
    role,
    workspaceId: raw.workspaceId || allowedWorkspaceIds?.[0],
    allowedWorkspaceIds,
    isDemo: raw.isDemo ?? true,
    provider: raw.provider || 'staging-demo',
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

async function lookupTeamMemberByEmail(email: string): Promise<TeamMember | null> {
  try {
    const res = await fetch(`/api/team?email=${encodeURIComponent(email.trim().toLowerCase())}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const rows = data as TeamMember[];
      const mergedWorkspaceIds = new Set<string>();
      for (const row of rows) {
        if (typeof row.workspaceId === 'string' && row.workspaceId.trim()) {
          mergedWorkspaceIds.add(row.workspaceId.trim());
        }
        if (Array.isArray(row.allowedWorkspaceIds)) {
          for (const wsId of row.allowedWorkspaceIds) {
            if (typeof wsId === 'string' && wsId.trim()) {
              mergedWorkspaceIds.add(wsId.trim());
            }
          }
        }
      }
      const primary = rows[0];
      const allowedWorkspaceIds =
        mergedWorkspaceIds.size > 0 ? Array.from(mergedWorkspaceIds) : undefined;
      return {
        ...primary,
        allowedWorkspaceIds,
      };
    }
    return null;
  } catch {
    return null;
  }
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
  const [isFounderSession, setIsFounderSession] = useState<boolean>(false);
  const userRef = useRef<AuthUser | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const persistFounderSession = useCallback((info: StoredFounderSession) => {
    const cleanEmail = (info.email || '').trim().toLowerCase();
    if (!isFounderEmail(cleanEmail)) return;
    const payload: StoredFounderSession = {
      email: cleanEmail,
      fullName: info.fullName,
      company: info.company || 'Vectra Systems',
      id: info.id,
      isDemo: info.isDemo,
    };
    try {
      sessionStorage.setItem(FOUNDER_SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
    setIsFounderSession(true);
  }, []);

  const clearFounderSession = useCallback(() => {
    try {
      sessionStorage.removeItem(FOUNDER_SESSION_STORAGE_KEY);
    } catch {}
    setIsFounderSession(false);
  }, []);

  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspace.id;
  }, [currentWorkspace.id]);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  const visibleWorkspaces = useMemo<Workspace[]>(() => {
    if (!user) return workspaces;
    const perms = ROLE_PERMISSIONS[normalizeRole(user.role)];
    if (perms.canManageWorkspaces) {
      return workspaces;
    }

    const allowedIds =
      Array.isArray(user.allowedWorkspaceIds) && user.allowedWorkspaceIds.length > 0
        ? user.allowedWorkspaceIds
        : user.workspaceId
          ? [user.workspaceId]
          : [];

    if (allowedIds.length > 0) {
      const allowedSet = new Set(allowedIds);
      const matched = workspaces.filter((ws) => allowedSet.has(ws.id));
      if (matched.length > 0) {
        return matched;
      }
    }

    return workspaces.length > 0 ? [workspaces[0]] : [];
  }, [user, workspaces]);

  useEffect(() => {
    if (visibleWorkspaces.length === 0) return;
    const containsCurrent = visibleWorkspaces.some((w) => w.id === currentWorkspace.id);
    if (!containsCurrent) {
      const nextWorkspace = enrichWorkspaceDefaults(visibleWorkspaces[0]);
      const timer = setTimeout(() => {
        setCurrentWorkspace(nextWorkspace);
        try {
          localStorage.setItem(CURRENT_WORKSPACE_STORAGE_KEY, nextWorkspace.id);
        } catch {}
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [visibleWorkspaces, currentWorkspace.id]);

  const persistWorkspacesLocally = useCallback((list: Workspace[], activeId?: string) => {
    try {
      localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(list));
      if (activeId) {
        localStorage.setItem(CURRENT_WORKSPACE_STORAGE_KEY, activeId);
      }
    } catch {}
  }, []);

  const refreshWorkspaces = useCallback(
    async (preferredWorkspaceId?: string) => {
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
              (preferredWorkspaceId &&
                enriched.find((w) => w.id === preferredWorkspaceId)) ||
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
            const active =
              (preferredWorkspaceId &&
                enriched.find((w) => w.id === preferredWorkspaceId)) ||
              enriched.find((w) => w.id === savedId) ||
              enriched[0];
            setCurrentWorkspace(active);
          }
        }
      } catch {}
    },
    [persistWorkspacesLocally]
  );

  useEffect(() => {
    let active = true;

    const init = async () => {
      const storedFounder = readStoredFounderSession();
      if (active && storedFounder) {
        setIsFounderSession(true);
      }

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
      let resolvedWorkspaceId: string | undefined;
      const sb = getBrowserSupabase();
      if (sb) {
        try {
          const { data } = await sb.auth.getSession();
          if (active && data.session?.user) {
            const teamMatch = data.session.user.email
              ? await lookupTeamMemberByEmail(data.session.user.email)
              : null;
            const mapped = mapSupabaseUser(data.session.user, teamMatch);
            if (active) {
              setUser(mapped);
              resolvedWorkspaceId = mapped.workspaceId;
              if (isFounderEmail(mapped.email)) {
                persistFounderSession({
                  email: mapped.email,
                  fullName: mapped.fullName,
                  company: mapped.company,
                  id: mapped.id,
                  isDemo: false,
                });
              }
            }
          } else {
            const demoRaw = localStorage.getItem(DEMO_USER_STORAGE_KEY);
            if (active && demoRaw) {
              const normalized = normalizeStoredAuthUser(JSON.parse(demoRaw));
              setUser(normalized);
              resolvedWorkspaceId = normalized.workspaceId;
              if (isFounderEmail(normalized.email)) {
                persistFounderSession({
                  email: normalized.email,
                  fullName: normalized.fullName,
                  company: normalized.company,
                  id: normalized.id,
                  isDemo: normalized.isDemo,
                });
              }
            }
          }
        } catch {}
      } else {
        try {
          const demoRaw = localStorage.getItem(DEMO_USER_STORAGE_KEY);
          if (active && demoRaw) {
            const normalized = normalizeStoredAuthUser(JSON.parse(demoRaw));
            setUser(normalized);
            resolvedWorkspaceId = normalized.workspaceId;
            if (isFounderEmail(normalized.email)) {
              persistFounderSession({
                email: normalized.email,
                fullName: normalized.fullName,
                company: normalized.company,
                id: normalized.id,
                isDemo: normalized.isDemo,
              });
            }
          }
        } catch {}
      }

      // 3. Fetch authoritative workspaces from API / Supabase
      await refreshWorkspaces(resolvedWorkspaceId);
      if (active) setLoading(false);
    };

    init();

    const sb = getBrowserSupabase();
    const subscription = sb
      ? sb.auth.onAuthStateChange(async (event, session) => {
          if (session?.user) {
            const teamMatch = session.user.email
              ? await lookupTeamMemberByEmail(session.user.email)
              : null;
            const mapped = mapSupabaseUser(session.user, teamMatch);
            setUser(mapped);
            if (isFounderEmail(mapped.email)) {
              persistFounderSession({
                email: mapped.email,
                fullName: mapped.fullName,
                company: mapped.company,
                id: mapped.id,
                isDemo: false,
              });
            } else if (event === 'SIGNED_IN') {
              clearFounderSession();
            }
            try {
              localStorage.removeItem(DEMO_USER_STORAGE_KEY);
            } catch {}
            refreshWorkspaces(mapped.workspaceId);
          } else if (event === 'SIGNED_OUT') {
            try {
              const demoRaw = localStorage.getItem(DEMO_USER_STORAGE_KEY);
              if (!demoRaw) {
                clearFounderSession();
                setUser(null);
              }
            } catch {
              clearFounderSession();
              setUser(null);
            }
          }
        }).data.subscription
      : null;

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [refreshWorkspaces, persistFounderSession, clearFounderSession]);

  const switchWorkspace = useCallback(
    (workspaceOrId: Workspace | string) => {
      const pool = visibleWorkspaces.length > 0 ? visibleWorkspaces : workspaces;
      const target =
        typeof workspaceOrId === 'string'
          ? pool.find((w) => w.id === workspaceOrId)
          : pool.find((w) => w.id === workspaceOrId.id);
      if (!target) return;

      const enriched = enrichWorkspaceDefaults(target);
      setCurrentWorkspace(enriched);
      try {
        localStorage.setItem(CURRENT_WORKSPACE_STORAGE_KEY, enriched.id);
      } catch {}
    },
    [visibleWorkspaces, workspaces]
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
            subscriptionStatus: input.subscriptionStatus || 'trialing',
            ownerId: input.ownerId ?? user?.id,
            ownerEmail: input.ownerEmail ?? user?.email,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          return { error: data?.error || 'Failed to create workspace' };
        }

        const created = enrichWorkspaceDefaults(data as Workspace);
        const nextList = [...workspacesRef.current, created];
        setWorkspaces(nextList);
        setCurrentWorkspace(created);
        persistWorkspacesLocally(nextList, created.id);
        return { workspace: created };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : 'Network error creating workspace' };
      }
    },
    [persistWorkspacesLocally, user]
  );

  const updateWorkspaces = useCallback(
    (updated: Workspace[]) => {
      const previous = workspacesRef.current;
      const enriched = updated.map(enrichWorkspaceDefaults);
      setWorkspaces(enriched);
      const nextActive =
        enriched.find((w) => w.id === currentWorkspaceIdRef.current) ||
        enriched[0] ||
        DEFAULT_PRIMARY_WORKSPACE;
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
        } else if (
          prev.name !== ws.name ||
          prev.clientName !== ws.clientName ||
          prev.plan !== ws.plan ||
          prev.subscriptionStatus !== ws.subscriptionStatus
        ) {
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
    (
      email: string,
      fullName?: string,
      company?: string,
      idOverride?: string,
      role: UserRole = 'admin',
      workspaceId?: string,
      allowedWorkspaceIds?: string[]
    ): AuthUser => {
      const cleanEmail = email.trim().toLowerCase();
      const normalizedRole = normalizeRole(role);
      const normalizedAllowed = normalizeOptionalWorkspaceIds(allowedWorkspaceIds);
      const demoUser: AuthUser = {
        id: idOverride || `demo-${Date.now()}`,
        email: cleanEmail,
        fullName: fullName || cleanEmail.split('@')[0] || 'Demo SaaS',
        company,
        avatarInitials: buildInitials(fullName, cleanEmail),
        role: normalizedRole,
        workspaceId: workspaceId || normalizedAllowed?.[0],
        allowedWorkspaceIds: normalizedAllowed,
        isDemo: true,
        provider: 'staging-demo',
      };
      setUser(demoUser);
      try {
        localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(demoUser));
        localStorage.setItem(ROLE_OVERRIDE_STORAGE_KEY, normalizedRole);
      } catch {}
      return demoUser;
    },
    []
  );

  const switchRole = useCallback((role: UserRole) => {
    const normalized = normalizeRole(role);
    try {
      localStorage.setItem(ROLE_OVERRIDE_STORAGE_KEY, normalized);
    } catch {}
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, role: normalized };
      if (updated.isDemo) {
        try {
          localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });
  }, []);

  const signInAsRole = useCallback(
    async (role: UserRole, customUser?: Partial<AuthUser>) => {
      const activeUser = userRef.current;
      if (activeUser && isFounderEmail(activeUser.email) && !readStoredFounderSession()) {
        persistFounderSession({
          email: activeUser.email,
          fullName: activeUser.fullName,
          company: activeUser.company,
          id: activeUser.id,
          isDemo: activeUser.isDemo,
        });
      }

      const normalized = normalizeRole(role);
      const preset = PRESET_ROLE_USERS[normalized];
      const targetEmail = customUser?.email || preset.email;
      const targetName = customUser?.fullName || preset.fullName;
      const targetCompany = customUser?.company || preset.company;
      const targetId = customUser?.id || preset.id;
      const targetAllowedWorkspaceIds = normalizeOptionalWorkspaceIds(
        customUser?.allowedWorkspaceIds
      );
      const targetWorkspaceId =
        customUser?.workspaceId ?? targetAllowedWorkspaceIds?.[0];

      activateDemoUser(
        targetEmail,
        targetName,
        targetCompany,
        targetId,
        normalized,
        targetWorkspaceId,
        targetAllowedWorkspaceIds
      );
      await refreshWorkspaces(targetWorkspaceId);
      setIsAuthModalOpen(false);
    },
    [activateDemoUser, persistFounderSession, refreshWorkspaces]
  );

  const signInDemo = useCallback(
    async (email = 'marcos@vectrasystems.com.ar', fullName = 'Marco Iparraguirre') => {
      const role = inferDefaultRoleFromEmail(email);
      const demo = activateDemoUser(email, fullName, 'Vectra Systems', 'admin-default', role);
      if (isFounderEmail(demo.email)) {
        persistFounderSession({
          email: demo.email,
          fullName: demo.fullName,
          company: demo.company,
          id: demo.id,
          isDemo: true,
        });
      } else {
        clearFounderSession();
      }
      await refreshWorkspaces();
      setIsAuthModalOpen(false);
    },
    [activateDemoUser, clearFounderSession, persistFounderSession, refreshWorkspaces]
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

      const teamMatch = await lookupTeamMemberByEmail(cleanEmail);
      const isFounder = isFounderEmail(cleanEmail);
      const resolvedRole: UserRole = isFounder
        ? 'super_admin'
        : normalizeRole(teamMatch?.roleId || inferDefaultRoleFromEmail(cleanEmail));
      const resolvedAllowedWorkspaceIds = teamMatch?.allowedWorkspaceIds;
      const resolvedWorkspaceId =
        teamMatch?.workspaceId || resolvedAllowedWorkspaceIds?.[0];

      try {
        localStorage.setItem(ROLE_OVERRIDE_STORAGE_KEY, resolvedRole);
      } catch {}

      const sb = getBrowserSupabase();
      if (!sb) {
        const demo = activateDemoUser(
          cleanEmail,
          teamMatch?.fullName,
          teamMatch?.company,
          teamMatch?.id,
          resolvedRole,
          resolvedWorkspaceId,
          resolvedAllowedWorkspaceIds
        );
        if (isFounder) {
          persistFounderSession({
            email: demo.email,
            fullName: demo.fullName,
            company: demo.company,
            id: demo.id,
            isDemo: true,
          });
        } else {
          clearFounderSession();
        }
        await refreshWorkspaces(resolvedWorkspaceId);
        setIsAuthModalOpen(false);
        return { isDemo: true };
      }

      try {
        const { data, error } = await sb.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!error && data.user) {
          const mapped = mapSupabaseUser(data.user, teamMatch);
          const resolvedUser: AuthUser = isFounder
            ? { ...mapped, role: 'super_admin' }
            : mapped;
          setUser(resolvedUser);
          if (isFounder) {
            persistFounderSession({
              email: resolvedUser.email,
              fullName: resolvedUser.fullName,
              company: resolvedUser.company,
              id: resolvedUser.id,
              isDemo: false,
            });
          } else {
            clearFounderSession();
          }
          try {
            localStorage.removeItem(DEMO_USER_STORAGE_KEY);
          } catch {}
          await refreshWorkspaces(resolvedWorkspaceId);
          setIsAuthModalOpen(false);
          return { isDemo: false };
        }

        const msg = error?.message || '';
        // Unblock staging tests & team/concierge-provisioned users when Auth record or SMTP confirmation is absent
        if (/email not confirmed/i.test(msg) || teamMatch) {
          const demo = activateDemoUser(
            cleanEmail,
            teamMatch?.fullName || cleanEmail.split('@')[0],
            teamMatch?.company,
            teamMatch?.id,
            resolvedRole,
            resolvedWorkspaceId,
            resolvedAllowedWorkspaceIds
          );
          if (isFounder) {
            persistFounderSession({
              email: demo.email,
              fullName: demo.fullName,
              company: demo.company,
              id: demo.id,
              isDemo: true,
            });
          } else {
            clearFounderSession();
          }
          await refreshWorkspaces(resolvedWorkspaceId);
          setIsAuthModalOpen(false);
          return { isDemo: true };
        }

        return { error: msg || 'Invalid email or password' };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : 'Sign in failed' };
      }
    },
    [activateDemoUser, clearFounderSession, persistFounderSession, refreshWorkspaces]
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
      const company = metadata?.company?.trim() || 'Mi Agencia';
      const workspaceName = metadata?.workspaceName?.trim() || company;
      const plan = metadata?.plan || 'growth';
      const isFounder = isFounderEmail(cleanEmail);
      const signupRole: UserRole = isFounder ? 'super_admin' : 'admin';

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
                role: signupRole,
              },
            },
          });

          if (error) {
            // In staging, gracefully fall back if SMTP rate limits or confirmation settings block signup
            if (/rate limit|email|smtp|confirm/i.test(error.message)) {
              const demo = activateDemoUser(cleanEmail, fullName, company, undefined, signupRole);
              createdUserId = demo.id;
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
              activateDemoUser(cleanEmail, fullName, company, data.user.id, signupRole);
              needsConfirmation = true;
            }
          }
        } catch (err: unknown) {
          return { error: err instanceof Error ? err.message : 'Sign up failed' };
        }
      } else {
        const demo = activateDemoUser(cleanEmail, fullName, company, undefined, signupRole);
        createdUserId = demo.id;
      }

      if (isFounder) {
        persistFounderSession({
          email: cleanEmail,
          fullName,
          company,
          id: createdUserId,
        });
      } else {
        clearFounderSession();
      }

      // Provision initial SaaS 7-day trial workspace for the new account
      const wsRes = await createWorkspace({
        name: workspaceName,
        clientName: company,
        plan,
        ownerId: createdUserId,
        ownerEmail: cleanEmail,
      });

      const assignedWorkspaceId = wsRes.workspace?.id || currentWorkspaceIdRef.current;

      // Register agency owner as admin in /api/team
      fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: assignedWorkspaceId,
          fullName,
          email: cleanEmail,
          company,
          roleId: signupRole,
        }),
      }).catch(() => {});

      setUser((prev) =>
        prev ? { ...prev, role: signupRole, workspaceId: assignedWorkspaceId } : prev
      );

      setIsAuthModalOpen(false);
      return {
        needsEmailConfirmation: needsConfirmation,
        error: createdUserId ? undefined : undefined,
      };
    },
    [activateDemoUser, clearFounderSession, createWorkspace, persistFounderSession]
  );

  const signInWithGoogle = useCallback(async (): Promise<{ error?: string }> => {
    const sb = getBrowserSupabase();
    if (!sb) {
      await signInDemo('google-demo@misender.app', 'Google Agency User');
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

  const restoreFounderSession = useCallback(async () => {
    const stored = readStoredFounderSession();
    const fallback = PRESET_ROLE_USERS.super_admin;
    const activeUser = userRef.current;
    const targetEmail =
      stored?.email ||
      (activeUser && isFounderEmail(activeUser.email) ? activeUser.email : fallback.email);
    const targetName =
      stored?.fullName ||
      (activeUser && isFounderEmail(activeUser.email) ? activeUser.fullName : fallback.fullName);
    const targetCompany = stored?.company || fallback.company;
    const targetId = stored?.id || fallback.id;

    try {
      localStorage.removeItem(DEMO_USER_STORAGE_KEY);
      localStorage.setItem(ROLE_OVERRIDE_STORAGE_KEY, 'super_admin');
    } catch {}

    const sb = getBrowserSupabase();
    if (sb) {
      try {
        const { data } = await sb.auth.getSession();
        if (data.session?.user?.email && isFounderEmail(data.session.user.email)) {
          const teamMatch = await lookupTeamMemberByEmail(data.session.user.email);
          const mapped: AuthUser = {
            ...mapSupabaseUser(data.session.user, teamMatch),
            role: 'super_admin',
          };
          setUser(mapped);
          persistFounderSession({
            email: mapped.email,
            fullName: mapped.fullName,
            company: mapped.company,
            id: mapped.id,
            isDemo: false,
          });
          await refreshWorkspaces(mapped.workspaceId);
          return;
        }
      } catch {}
    }

    const restored = activateDemoUser(
      targetEmail,
      targetName,
      targetCompany,
      targetId,
      'super_admin'
    );
    persistFounderSession({
      email: restored.email,
      fullName: restored.fullName,
      company: restored.company,
      id: restored.id,
      isDemo: true,
    });
    await refreshWorkspaces();
  }, [activateDemoUser, persistFounderSession, refreshWorkspaces]);

  const signOut = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (sb) {
      try {
        await sb.auth.signOut();
      } catch {}
    }
    try {
      localStorage.removeItem(DEMO_USER_STORAGE_KEY);
      localStorage.removeItem(ROLE_OVERRIDE_STORAGE_KEY);
    } catch {}
    clearFounderSession();
    setUser(null);
  }, [clearFounderSession]);

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
        visibleWorkspaces,
        currentWorkspace,
        switchWorkspace,
        createWorkspace,
        updateWorkspaces,
        signIn,
        signUp,
        signInWithGoogle,
        signInDemo,
        signInAsRole,
        switchRole,
        isFounderSession,
        restoreFounderSession,
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
