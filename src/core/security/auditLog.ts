import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/core/supabase/client';

export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  actorId?: string;
  actorEmail?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface RecordAuditLogInput {
  workspaceId?: string;
  actorId?: string;
  actorEmail?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface ListAuditLogsOptions {
  workspaceId?: string;
  action?: string;
  limit?: number;
}

interface QueryResult<T = Record<string, unknown>[]> {
  data?: T | null;
  error?: { message?: string } | null;
}

interface AuditLogsQueryLike extends PromiseLike<QueryResult> {
  eq?: (col: string, val: string) => AuditLogsQueryLike;
  order?: (col: string, opts: { ascending: boolean }) => AuditLogsQueryLike;
  limit?: (n: number) => AuditLogsQueryLike;
}

interface AuditLogsTableLike {
  select?: (cols: string) => AuditLogsQueryLike;
  upsert?: (row: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<QueryResult<unknown>>;
  insert?: (row: Record<string, unknown>) => Promise<QueryResult<unknown>>;
}

const MAX_FALLBACK_AUDIT_LOGS = 2000;

function getFallbackStore(): AuditLogEntry[] {
  const g = globalThis as unknown as { __misenderAuditLogsStore?: AuditLogEntry[] };
  if (!Array.isArray(g.__misenderAuditLogsStore)) {
    g.__misenderAuditLogsStore = [];
  }
  return g.__misenderAuditLogsStore;
}

function setFallbackStore(next: AuditLogEntry[]): void {
  const g = globalThis as unknown as { __misenderAuditLogsStore?: AuditLogEntry[] };
  g.__misenderAuditLogsStore = next.slice(0, MAX_FALLBACK_AUDIT_LOGS);
}

function shouldUseSupabase(): boolean {
  const hasEnv = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
  if (hasEnv) return true;

  const clientUrl = (supabase as unknown as { supabaseUrl?: string })?.supabaseUrl;
  const hasFrom = typeof (supabase as unknown as { from?: unknown })?.from === 'function';
  return hasFrom && clientUrl !== 'https://placeholder.supabase.co';
}

function mapDbRowToEntry(row: Record<string, unknown>): AuditLogEntry {
  const rawMetadata = row.metadata;
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id ?? row.workspaceId ?? 'ws-primary'),
    actorId: typeof (row.actor_id ?? row.actorId) === 'string' ? String(row.actor_id ?? row.actorId) : undefined,
    actorEmail:
      typeof (row.actor_email ?? row.actorEmail) === 'string'
        ? String(row.actor_email ?? row.actorEmail)
        : undefined,
    action: String(row.action || ''),
    resourceType:
      typeof (row.resource_type ?? row.resourceType) === 'string'
        ? String(row.resource_type ?? row.resourceType)
        : undefined,
    resourceId:
      typeof (row.resource_id ?? row.resourceId) === 'string'
        ? String(row.resource_id ?? row.resourceId)
        : undefined,
    metadata:
      rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
        ? (rawMetadata as Record<string, unknown>)
        : {},
    ipAddress:
      typeof (row.ip_address ?? row.ipAddress) === 'string'
        ? String(row.ip_address ?? row.ipAddress)
        : undefined,
    userAgent:
      typeof (row.user_agent ?? row.userAgent) === 'string'
        ? String(row.user_agent ?? row.userAgent)
        : undefined,
    createdAt:
      typeof (row.created_at ?? row.createdAt) === 'string'
        ? String(row.created_at ?? row.createdAt)
        : new Date().toISOString(),
  };
}

function mapEntryToDbRow(entry: AuditLogEntry): Record<string, unknown> {
  return {
    id: entry.id,
    workspace_id: entry.workspaceId,
    actor_id: entry.actorId || null,
    actor_email: entry.actorEmail || null,
    action: entry.action,
    resource_type: entry.resourceType || null,
    resource_id: entry.resourceId || null,
    metadata: entry.metadata || {},
    ip_address: entry.ipAddress || null,
    user_agent: entry.userAgent || null,
    created_at: entry.createdAt,
  };
}

function filterFallbackLogs(
  logs: AuditLogEntry[],
  options: ListAuditLogsOptions
): AuditLogEntry[] {
  let result = logs;
  if (options.workspaceId) {
    result = result.filter((entry) => entry.workspaceId === options.workspaceId);
  }
  if (options.action) {
    result = result.filter((entry) => entry.action === options.action);
  }
  const limit =
    typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
      ? Math.min(options.limit, 500)
      : 100;
  return result.slice(0, limit);
}

/**
 * Records an immutable audit event in Supabase `audit_logs` (when configured)
 * and the globalThis fallback store. Never throws on DB persistence failure.
 */
export async function recordAuditLog(input: RecordAuditLogInput): Promise<AuditLogEntry> {
  const entry: AuditLogEntry = {
    id: `audit-${uuidv4()}`,
    workspaceId:
      typeof input.workspaceId === 'string' && input.workspaceId.trim()
        ? input.workspaceId.trim()
        : 'ws-primary',
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.actorEmail ? { actorEmail: input.actorEmail.trim().toLowerCase() } : {}),
    action: input.action.trim(),
    ...(input.resourceType ? { resourceType: input.resourceType } : {}),
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    createdAt: new Date().toISOString(),
  };

  const current = getFallbackStore();
  setFallbackStore([entry, ...current]);

  if (shouldUseSupabase()) {
    try {
      const table = supabase.from('audit_logs') as unknown as AuditLogsTableLike;
      const dbRow = mapEntryToDbRow(entry);
      if (typeof table?.insert === 'function') {
        const { error } = await table.insert(dbRow);
        if (error) {
          console.warn('recordAuditLog Supabase insert warning:', error.message);
        }
      } else if (typeof table?.upsert === 'function') {
        const { error } = await table.upsert(dbRow, { onConflict: 'id' });
        if (error) {
          console.warn('recordAuditLog Supabase upsert warning:', error.message);
        }
      }
    } catch (err) {
      console.warn('recordAuditLog Supabase unexpected warning:', err);
    }
  }

  return entry;
}

/**
 * Lists audit log entries, optionally filtered by workspaceId and action.
 */
export async function listAuditLogs(options: ListAuditLogsOptions = {}): Promise<AuditLogEntry[]> {
  const limit =
    typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
      ? Math.min(options.limit, 500)
      : 100;

  if (shouldUseSupabase()) {
    try {
      const table = supabase.from('audit_logs') as unknown as AuditLogsTableLike;
      if (typeof table?.select === 'function') {
        let query: AuditLogsQueryLike = table.select('*');
        if (options.workspaceId && typeof query?.eq === 'function') {
          query = query.eq('workspace_id', options.workspaceId);
        }
        if (options.action && typeof query?.eq === 'function') {
          query = query.eq('action', options.action);
        }
        if (typeof query?.order === 'function') {
          query = query.order('created_at', { ascending: false });
        }
        if (typeof query?.limit === 'function') {
          query = query.limit(limit);
        }

        const res = (await query) as QueryResult;
        if (!res?.error && Array.isArray(res?.data)) {
          const mapped = res.data.map(mapDbRowToEntry);
          return filterFallbackLogs(mapped, options);
        }
      }
    } catch (err) {
      console.warn('listAuditLogs Supabase fallback:', err);
    }
  }

  return filterFallbackLogs(getFallbackStore(), options);
}
