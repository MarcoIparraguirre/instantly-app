import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/core/supabase/client';
import { container } from '@/core/container';
import { validateWebhookUrl } from '@/core/security/ssrfValidator';
import { createHmacSignature } from './WebhookDispatcherService';
import {
  IAccountRepository,
  IBlocklistRepository,
  IDealRepository
} from '@/core/interfaces/storage';
import { Deal, DealStage } from '@/types';

export type AutomationTrigger =
  | 'lead.replied'
  | 'lead.interested'
  | 'lead.bounced'
  | 'lead.opened'
  | 'lead.clicked'
  | 'account.paused'
  | 'campaign.completed';

export type AutomationActionType =
  | 'webhook'
  | 'slack_notify'
  | 'hubspot_sync'
  | 'pipedrive_sync'
  | 'whatsapp_notify'
  | 'create_deal'
  | 'pause_account'
  | 'add_to_blocklist';

export interface AutomationConditionClause {
  field: string;
  operator?: 'equals' | 'not_equals' | 'contains' | 'in' | 'gt' | 'gte' | 'lt' | 'lte';
  value: unknown;
}

export type AutomationConditions =
  | Record<string, unknown>
  | AutomationConditionClause[];

export interface AutomationAction {
  type: AutomationActionType;
  config?: Record<string, unknown>;
  url?: string;
  webhookUrl?: string;
  secret?: string;
  token?: string;
  apiKey?: string;
  dealValue?: number;
  stage?: DealStage;
  reason?: 'unsubscribed' | 'bounced' | 'manual' | 'spam_complaint';
}

export interface AutomationRule {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  triggerEvent: AutomationTrigger;
  conditions?: AutomationConditions;
  actions: AutomationAction[];
  isActive: boolean;
  runCount?: number;
  lastRunAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationActionResult {
  type: AutomationActionType;
  status: 'success' | 'skipped' | 'error';
  detail?: string;
  target?: string;
  statusCode?: number;
  createdId?: string;
}

export interface AutomationRun {
  id: string;
  workspaceId: string;
  ruleId: string;
  ruleName: string;
  triggerEvent: AutomationTrigger;
  status: 'success' | 'partial' | 'error' | 'skipped';
  payload: Record<string, unknown>;
  actionResults: AutomationActionResult[];
  errorMessage?: string | null;
  durationMs: number;
  executedAt: string;
  createdAt?: string;
}

export interface ConnectorTemplateField {
  key: string;
  label: string;
  type: 'url' | 'text' | 'password' | 'number' | 'select';
  placeholder: string;
  required: boolean;
}

export interface ConnectorTemplate {
  id: string;
  provider: 'hubspot' | 'pipedrive' | 'slack' | 'whatsapp' | 'n8n' | 'make' | 'zapier';
  name: string;
  category: 'crm' | 'messaging' | 'automation';
  description: string;
  recommendedTrigger: AutomationTrigger;
  actionType: AutomationActionType;
  defaultAction: AutomationAction;
  fields: ConnectorTemplateField[];
}

export interface AutomationEngineDeps {
  dealRepo?: IDealRepository;
  blocklistRepo?: IBlocklistRepository;
  accountRepo?: IAccountRepository;
}

export interface ExecuteTriggerOptions {
  ruleId?: string;
}

interface FallbackAutomationStore {
  rules: AutomationRule[];
  runs: AutomationRun[];
}

const VALID_TRIGGERS: ReadonlySet<string> = new Set<AutomationTrigger>([
  'lead.replied',
  'lead.interested',
  'lead.bounced',
  'lead.opened',
  'lead.clicked',
  'account.paused',
  'campaign.completed'
]);

const VALID_ACTIONS: ReadonlySet<string> = new Set<AutomationActionType>([
  'webhook',
  'slack_notify',
  'hubspot_sync',
  'pipedrive_sync',
  'whatsapp_notify',
  'create_deal',
  'pause_account',
  'add_to_blocklist'
]);

function getFallbackStore(): FallbackAutomationStore {
  const g = globalThis as unknown as { __misenderAutomationStore?: FallbackAutomationStore };
  if (!g.__misenderAutomationStore) {
    g.__misenderAutomationStore = { rules: [], runs: [] };
  }
  return g.__misenderAutomationStore;
}

function shouldUseSupabase(): boolean {
  const hasEnv = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
  if (hasEnv) return true;

  const clientUrl = (supabase as unknown as { supabaseUrl?: string })?.supabaseUrl;
  const hasFrom = typeof (supabase as unknown as { from?: unknown })?.from === 'function';
  return Boolean(hasFrom && clientUrl && clientUrl !== 'https://placeholder.supabase.co');
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  if (path in obj) return obj[path];

  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function extractEmailFromPayload(payload: Record<string, unknown>): string {
  const raw =
    payload.leadEmail ||
    payload.email ||
    payload.contactEmail ||
    getNestedValue(payload, 'lead.email') ||
    '';
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function evaluateClause(payload: Record<string, unknown>, clause: AutomationConditionClause): boolean {
  let actual = getNestedValue(payload, clause.field);
  if (actual === undefined && clause.field === 'emailDomain') {
    const email = extractEmailFromPayload(payload);
    actual = email.includes('@') ? email.split('@')[1] : undefined;
  }

  const op = clause.operator || 'equals';
  const expected = clause.value;

  switch (op) {
    case 'equals':
      if (typeof expected === 'string' && typeof actual === 'string') {
        return actual.toLowerCase() === expected.toLowerCase();
      }
      return actual === expected;
    case 'not_equals':
      if (typeof expected === 'string' && typeof actual === 'string') {
        return actual.toLowerCase() !== expected.toLowerCase();
      }
      return actual !== expected;
    case 'contains':
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'in':
      if (!Array.isArray(expected)) return false;
      return expected.map(v => String(v).toLowerCase()).includes(String(actual ?? '').toLowerCase());
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

export function matchesAutomationConditions(
  conditions: AutomationConditions | undefined,
  payload: Record<string, unknown>
): boolean {
  if (!conditions) return true;

  if (Array.isArray(conditions)) {
    if (conditions.length === 0) return true;
    return conditions.every(clause => evaluateClause(payload, clause));
  }

  const entries = Object.entries(conditions);
  if (entries.length === 0) return true;

  for (const [key, expected] of entries) {
    if (expected === undefined || expected === null || expected === '') continue;

    if (key === 'clauses' && Array.isArray(expected)) {
      const ok = (expected as AutomationConditionClause[]).every(c => evaluateClause(payload, c));
      if (!ok) return false;
      continue;
    }

    if (Array.isArray(expected)) {
      if (!evaluateClause(payload, { field: key, operator: 'in', value: expected })) {
        return false;
      }
      continue;
    }

    if (
      typeof expected === 'object' &&
      expected !== null &&
      'operator' in (expected as Record<string, unknown>) &&
      'value' in (expected as Record<string, unknown>)
    ) {
      const clauseObj = expected as { operator?: AutomationConditionClause['operator']; value: unknown };
      if (!evaluateClause(payload, { field: key, operator: clauseObj.operator, value: clauseObj.value })) {
        return false;
      }
      continue;
    }

    if (!evaluateClause(payload, { field: key, operator: 'equals', value: expected })) {
      return false;
    }
  }

  return true;
}

function interpolateTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_match, key: string) => {
    const val = getNestedValue(payload, key);
    return val !== undefined && val !== null ? String(val) : '';
  });
}

function mapDbRowToRule(row: Record<string, unknown>): AutomationRule {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id ?? row.workspaceId ?? 'ws-primary'),
    name: String(row.name ?? 'Automation Rule'),
    description: typeof row.description === 'string' ? row.description : '',
    triggerEvent: String(row.trigger_event ?? row.triggerEvent ?? 'lead.replied') as AutomationTrigger,
    conditions: (row.conditions as AutomationConditions) ?? {},
    actions: Array.isArray(row.actions) ? (row.actions as AutomationAction[]) : [],
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : Boolean(row.isActive ?? true),
    runCount: Number(row.run_count ?? row.runCount ?? 0),
    lastRunAt: typeof (row.last_run_at ?? row.lastRunAt) === 'string'
      ? String(row.last_run_at ?? row.lastRunAt)
      : null,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString())
  };
}

function mapRuleToDbRow(rule: AutomationRule): Record<string, unknown> {
  return {
    id: rule.id,
    workspace_id: rule.workspaceId || 'ws-primary',
    name: rule.name,
    description: rule.description || '',
    trigger_event: rule.triggerEvent,
    conditions: rule.conditions ?? {},
    actions: rule.actions ?? [],
    is_active: rule.isActive,
    run_count: rule.runCount ?? 0,
    last_run_at: rule.lastRunAt ?? null,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt
  };
}

function mapDbRowToRun(row: Record<string, unknown>): AutomationRun {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id ?? row.workspaceId ?? 'ws-primary'),
    ruleId: String(row.rule_id ?? row.ruleId ?? ''),
    ruleName: String(row.rule_name ?? row.ruleName ?? ''),
    triggerEvent: String(row.trigger_event ?? row.triggerEvent ?? 'lead.replied') as AutomationTrigger,
    status: String(row.status ?? 'success') as AutomationRun['status'],
    payload: (row.payload as Record<string, unknown>) ?? {},
    actionResults: Array.isArray(row.action_results ?? row.actionResults)
      ? ((row.action_results ?? row.actionResults) as AutomationActionResult[])
      : [],
    errorMessage: typeof (row.error_message ?? row.errorMessage) === 'string'
      ? String(row.error_message ?? row.errorMessage)
      : null,
    durationMs: Number(row.duration_ms ?? row.durationMs ?? 0),
    executedAt: String(row.executed_at ?? row.executedAt ?? new Date().toISOString()),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString())
  };
}

function mapRunToDbRow(run: AutomationRun): Record<string, unknown> {
  return {
    id: run.id,
    workspace_id: run.workspaceId || 'ws-primary',
    rule_id: run.ruleId,
    rule_name: run.ruleName,
    trigger_event: run.triggerEvent,
    status: run.status,
    payload: run.payload ?? {},
    action_results: run.actionResults ?? [],
    error_message: run.errorMessage ?? null,
    duration_ms: run.durationMs,
    executed_at: run.executedAt,
    created_at: run.createdAt || run.executedAt
  };
}

export function isValidAutomationTrigger(val: unknown): val is AutomationTrigger {
  return typeof val === 'string' && VALID_TRIGGERS.has(val);
}

export function isValidAutomationActionType(val: unknown): val is AutomationActionType {
  return typeof val === 'string' && VALID_ACTIONS.has(val);
}

export function getConnectorTemplates(): ConnectorTemplate[] {
  return [
    {
      id: 'tpl-hubspot',
      provider: 'hubspot',
      name: 'HubSpot CRM Sync',
      category: 'crm',
      description: 'Sincroniza automáticamente leads interesados con contactos de HubSpot CRM API v3.',
      recommendedTrigger: 'lead.interested',
      actionType: 'hubspot_sync',
      defaultAction: {
        type: 'hubspot_sync',
        config: {
          accessToken: '',
          lifecycleStage: 'opportunity'
        }
      },
      fields: [
        {
          key: 'accessToken',
          label: 'HubSpot Private App Token',
          type: 'password',
          placeholder: 'pat-na1-...',
          required: true
        }
      ]
    },
    {
      id: 'tpl-pipedrive',
      provider: 'pipedrive',
      name: 'Pipedrive Deal & Contact Sync',
      category: 'crm',
      description: 'Crea personas y oportunidades en Pipedrive cuando un prospecto responde con interés.',
      recommendedTrigger: 'lead.interested',
      actionType: 'pipedrive_sync',
      defaultAction: {
        type: 'pipedrive_sync',
        config: {
          apiToken: '',
          companyDomain: '',
          createDeal: true,
          dealValue: 2500
        }
      },
      fields: [
        {
          key: 'apiToken',
          label: 'Pipedrive API Token',
          type: 'password',
          placeholder: 'pd-api-token',
          required: true
        },
        {
          key: 'companyDomain',
          label: 'Subdominio Pipedrive',
          type: 'text',
          placeholder: 'miempresa',
          required: false
        }
      ]
    },
    {
      id: 'tpl-slack',
      provider: 'slack',
      name: 'Slack Channel Notification',
      category: 'messaging',
      description: 'Envía alertas en tiempo real a un canal de Slack ante respuestas positivas o pausas de cuenta.',
      recommendedTrigger: 'lead.interested',
      actionType: 'slack_notify',
      defaultAction: {
        type: 'slack_notify',
        config: {
          webhookUrl: '',
          messageTemplate: 'Nuevo lead interesado: {{leadName}} ({{leadEmail}}) - {{companyName}}'
        }
      },
      fields: [
        {
          key: 'webhookUrl',
          label: 'Slack Incoming Webhook URL',
          type: 'url',
          placeholder: 'https://hooks.slack.com/services/...',
          required: true
        }
      ]
    },
    {
      id: 'tpl-whatsapp',
      provider: 'whatsapp',
      name: 'WhatsApp Instant Alert',
      category: 'messaging',
      description: 'Notifica vía WhatsApp Cloud API o Evolution API webhook cuando llega un lead caliente.',
      recommendedTrigger: 'lead.interested',
      actionType: 'whatsapp_notify',
      defaultAction: {
        type: 'whatsapp_notify',
        config: {
          webhookUrl: '',
          to: '',
          phoneNumberId: '',
          accessToken: '',
          messageTemplate: '🔥 Lead interesado en MiSender: {{leadName}} ({{leadEmail}}) de {{companyName}}'
        }
      },
      fields: [
        {
          key: 'to',
          label: 'Teléfono destino (E.164)',
          type: 'text',
          placeholder: '+5491155551234',
          required: true
        },
        {
          key: 'webhookUrl',
          label: 'Evolution / Gateway Webhook URL (opcional si usas Cloud API)',
          type: 'url',
          placeholder: 'https://evo.tu-dominio.com/message/sendText/instancia',
          required: false
        },
        {
          key: 'accessToken',
          label: 'WhatsApp Cloud API / Gateway Token',
          type: 'password',
          placeholder: 'EAA...',
          required: false
        }
      ]
    },
    {
      id: 'tpl-n8n',
      provider: 'n8n',
      name: 'n8n Workflow Trigger',
      category: 'automation',
      description: 'Dispara flujos de n8n mediante Webhook HTTPS firmado con HMAC-SHA256.',
      recommendedTrigger: 'lead.replied',
      actionType: 'webhook',
      defaultAction: {
        type: 'webhook',
        config: {
          url: '',
          secret: '',
          platform: 'n8n'
        }
      },
      fields: [
        {
          key: 'url',
          label: 'n8n Production Webhook URL',
          type: 'url',
          placeholder: 'https://n8n.tudominio.com/webhook/misender-events',
          required: true
        },
        {
          key: 'secret',
          label: 'HMAC Signing Secret',
          type: 'password',
          placeholder: 'whsec_...',
          required: false
        }
      ]
    },
    {
      id: 'tpl-make',
      provider: 'make',
      name: 'Make (Integromat) Scenario',
      category: 'automation',
      description: 'Conecta eventos de MiSender con escenarios de Make usando Webhooks firmados.',
      recommendedTrigger: 'lead.interested',
      actionType: 'webhook',
      defaultAction: {
        type: 'webhook',
        config: {
          url: '',
          secret: '',
          platform: 'make'
        }
      },
      fields: [
        {
          key: 'url',
          label: 'Make Custom Webhook URL',
          type: 'url',
          placeholder: 'https://hook.us1.make.com/...',
          required: true
        },
        {
          key: 'secret',
          label: 'HMAC Signing Secret',
          type: 'password',
          placeholder: 'whsec_...',
          required: false
        }
      ]
    },
    {
      id: 'tpl-zapier',
      provider: 'zapier',
      name: 'Zapier Catch Hook',
      category: 'automation',
      description: 'Envía eventos firmados con HMAC-SHA256 hacia Zaps en Zapier.',
      recommendedTrigger: 'lead.replied',
      actionType: 'webhook',
      defaultAction: {
        type: 'webhook',
        config: {
          url: '',
          secret: '',
          platform: 'zapier'
        }
      },
      fields: [
        {
          key: 'url',
          label: 'Zapier Catch Hook URL',
          type: 'url',
          placeholder: 'https://hooks.zapier.com/hooks/catch/...',
          required: true
        },
        {
          key: 'secret',
          label: 'HMAC Signing Secret',
          type: 'password',
          placeholder: 'whsec_...',
          required: false
        }
      ]
    }
  ];
}

export class AutomationEngineService {
  constructor(private deps: AutomationEngineDeps = {}) {}

  private resolveDeps(): Required<AutomationEngineDeps> {
    return {
      dealRepo: this.deps.dealRepo || container.dealRepo,
      blocklistRepo: this.deps.blocklistRepo || container.blocklistRepo,
      accountRepo: this.deps.accountRepo || container.accountRepo
    };
  }

  getConnectorTemplates(): ConnectorTemplate[] {
    return getConnectorTemplates();
  }

  static getConnectorTemplates(): ConnectorTemplate[] {
    return getConnectorTemplates();
  }

  async getRules(workspaceId?: string): Promise<AutomationRule[]> {
    const store = getFallbackStore();

    if (shouldUseSupabase()) {
      try {
        let query = supabase
          .from('automation_rules')
          .select('*')
          .order('created_at', { ascending: false });
        if (workspaceId) {
          query = query.eq('workspace_id', workspaceId);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          return data.map(row => mapDbRowToRule(row as Record<string, unknown>));
        }
      } catch (err) {
        console.warn('AutomationEngineService getRules Supabase fallback:', err);
      }
    }

    return workspaceId
      ? store.rules.filter(r => r.workspaceId === workspaceId)
      : [...store.rules];
  }

  async saveRule(
    input: Partial<AutomationRule> & { name: string; triggerEvent: AutomationTrigger; actions: AutomationAction[] }
  ): Promise<AutomationRule> {
    const now = new Date().toISOString();
    const rule: AutomationRule = {
      id: input.id || `rule-${uuidv4()}`,
      workspaceId: input.workspaceId || 'ws-primary',
      name: input.name.trim(),
      description: input.description?.trim() || '',
      triggerEvent: input.triggerEvent,
      conditions: input.conditions ?? {},
      actions: input.actions,
      isActive: input.isActive !== false,
      runCount: input.runCount ?? 0,
      lastRunAt: input.lastRunAt ?? null,
      createdAt: input.createdAt || now,
      updatedAt: now
    };

    const store = getFallbackStore();
    const idx = store.rules.findIndex(r => r.id === rule.id);
    if (idx >= 0) {
      store.rules[idx] = rule;
    } else {
      store.rules.unshift(rule);
    }

    if (shouldUseSupabase()) {
      try {
        const { error } = await supabase
          .from('automation_rules')
          .upsert(mapRuleToDbRow(rule), { onConflict: 'id' });
        if (error) {
          console.warn('AutomationEngineService saveRule Supabase error:', error.message);
        }
      } catch (err) {
        console.warn('AutomationEngineService saveRule Supabase exception:', err);
      }
    }

    return rule;
  }

  async updateRule(
    id: string,
    patch: Partial<Omit<AutomationRule, 'id' | 'createdAt'>>
  ): Promise<AutomationRule | null> {
    const store = getFallbackStore();
    const rules = await this.getRules();
    const existing = rules.find(r => r.id === id) || store.rules.find(r => r.id === id);
    if (!existing) return null;

    const updated: AutomationRule = {
      ...existing,
      ...patch,
      id: existing.id,
      workspaceId: patch.workspaceId || existing.workspaceId,
      name: patch.name !== undefined ? patch.name.trim() || existing.name : existing.name,
      triggerEvent: patch.triggerEvent || existing.triggerEvent,
      actions: Array.isArray(patch.actions) ? patch.actions : existing.actions,
      isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : existing.isActive,
      updatedAt: new Date().toISOString()
    };

    const idx = store.rules.findIndex(r => r.id === id);
    if (idx >= 0) {
      store.rules[idx] = updated;
    } else {
      store.rules.unshift(updated);
    }

    if (shouldUseSupabase()) {
      try {
        const { error } = await supabase
          .from('automation_rules')
          .upsert(mapRuleToDbRow(updated), { onConflict: 'id' });
        if (error) {
          console.warn('AutomationEngineService updateRule Supabase error:', error.message);
        }
      } catch (err) {
        console.warn('AutomationEngineService updateRule Supabase exception:', err);
      }
    }

    return updated;
  }

  async deleteRule(id: string): Promise<void> {
    const store = getFallbackStore();
    store.rules = store.rules.filter(r => r.id !== id);

    if (shouldUseSupabase()) {
      try {
        const { error } = await supabase.from('automation_rules').delete().eq('id', id);
        if (error) {
          console.warn('AutomationEngineService deleteRule Supabase error:', error.message);
        }
      } catch (err) {
        console.warn('AutomationEngineService deleteRule Supabase exception:', err);
      }
    }
  }

  async getRuns(workspaceId?: string, limit: number = 50): Promise<AutomationRun[]> {
    const store = getFallbackStore();

    if (shouldUseSupabase()) {
      try {
        let query = supabase
          .from('automation_runs')
          .select('*')
          .order('executed_at', { ascending: false })
          .limit(limit);
        if (workspaceId) {
          query = query.eq('workspace_id', workspaceId);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          return data.map(row => mapDbRowToRun(row as Record<string, unknown>));
        }
      } catch (err) {
        console.warn('AutomationEngineService getRuns Supabase fallback:', err);
      }
    }

    const filtered = workspaceId
      ? store.runs.filter(r => r.workspaceId === workspaceId)
      : store.runs;
    return filtered.slice(0, limit);
  }

  private async recordRun(run: AutomationRun): Promise<void> {
    const store = getFallbackStore();
    store.runs.unshift(run);
    if (store.runs.length > 250) {
      store.runs = store.runs.slice(0, 250);
    }

    if (shouldUseSupabase()) {
      try {
        const { error } = await supabase.from('automation_runs').insert(mapRunToDbRow(run));
        if (error) {
          console.warn('AutomationEngineService recordRun Supabase error:', error.message);
        }
      } catch (err) {
        console.warn('AutomationEngineService recordRun Supabase exception:', err);
      }
    }
  }

  async executeTrigger(
    workspaceId: string,
    triggerEvent: AutomationTrigger,
    payload: Record<string, unknown>,
    options?: ExecuteTriggerOptions
  ): Promise<AutomationRun[]> {
    const ws = workspaceId || 'ws-primary';
    const allRules = await this.getRules(ws);
    const matchingRules = allRules.filter(rule => {
      if (!rule.isActive) return false;
      if (rule.workspaceId !== ws) return false;
      if (options?.ruleId && rule.id !== options.ruleId) return false;
      if (rule.triggerEvent !== triggerEvent) return false;
      return matchesAutomationConditions(rule.conditions, payload);
    });

    const runs: AutomationRun[] = [];

    for (const rule of matchingRules) {
      const startedAt = Date.now();
      const actionResults: AutomationActionResult[] = [];

      for (const action of rule.actions) {
        try {
          const result = await this.executeSingleAction(ws, rule, triggerEvent, payload, action);
          actionResults.push(result);
        } catch (err: unknown) {
          actionResults.push({
            type: action.type,
            status: 'error',
            detail: err instanceof Error ? err.message : 'Action execution failed'
          });
        }
      }

      const errorCount = actionResults.filter(r => r.status === 'error').length;
      const successCount = actionResults.filter(r => r.status === 'success').length;
      let status: AutomationRun['status'] = 'success';
      if (actionResults.length > 0 && errorCount === actionResults.length) {
        status = 'error';
      } else if (errorCount > 0 && successCount > 0) {
        status = 'partial';
      } else if (errorCount > 0) {
        status = 'error';
      } else if (successCount === 0 && actionResults.every(r => r.status === 'skipped')) {
        status = 'skipped';
      }

      const firstError = actionResults.find(r => r.status === 'error')?.detail || null;
      const nowIso = new Date().toISOString();

      const run: AutomationRun = {
        id: `run-${crypto.randomUUID ? crypto.randomUUID() : uuidv4()}`,
        workspaceId: ws,
        ruleId: rule.id,
        ruleName: rule.name,
        triggerEvent,
        status,
        payload,
        actionResults,
        errorMessage: firstError,
        durationMs: Math.max(0, Date.now() - startedAt),
        executedAt: nowIso,
        createdAt: nowIso
      };

      await this.recordRun(run);
      await this.updateRule(rule.id, {
        runCount: (rule.runCount || 0) + 1,
        lastRunAt: nowIso
      });
      runs.push(run);
    }

    return runs;
  }

  private async executeSingleAction(
    workspaceId: string,
    rule: AutomationRule,
    triggerEvent: AutomationTrigger,
    payload: Record<string, unknown>,
    action: AutomationAction
  ): Promise<AutomationActionResult> {
    const cfg = action.config || {};

    switch (action.type) {
      case 'webhook':
        return this.runWebhookAction(workspaceId, rule, triggerEvent, payload, action, cfg);
      case 'slack_notify':
        return this.runSlackAction(workspaceId, rule, triggerEvent, payload, action, cfg);
      case 'hubspot_sync':
        return this.runHubSpotAction(triggerEvent, payload, action, cfg);
      case 'pipedrive_sync':
        return this.runPipedriveAction(triggerEvent, payload, action, cfg);
      case 'whatsapp_notify':
        return this.runWhatsAppAction(workspaceId, triggerEvent, payload, action, cfg);
      case 'create_deal':
        return this.runCreateDealAction(workspaceId, payload, action, cfg);
      case 'add_to_blocklist':
        return this.runBlocklistAction(workspaceId, triggerEvent, payload, action, cfg);
      case 'pause_account':
        return this.runPauseAccountAction(workspaceId, payload, cfg);
      default:
        return {
          type: action.type,
          status: 'error',
          detail: `Unsupported action type: ${String(action.type)}`
        };
    }
  }

  private async postSignedJson(
    actionType: AutomationActionType,
    url: string,
    bodyObj: Record<string, unknown>,
    options: { secret?: string; extraHeaders?: Record<string, string>; event: AutomationTrigger }
  ): Promise<AutomationActionResult> {
    const validation = await validateWebhookUrl(url, true);
    if (!validation.valid) {
      return {
        type: actionType,
        status: 'error',
        target: url,
        detail: `SSRF Block: ${validation.reason}`
      };
    }

    const timestamp = new Date().toISOString();
    const bodyStr = JSON.stringify(bodyObj);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'MiSender-Automation-Engine/1.0',
      'X-MiSender-Event': options.event,
      'X-MiSender-Timestamp': timestamp,
      ...(options.extraHeaders || {})
    };

    if (options.secret) {
      headers['X-MiSender-Signature'] = createHmacSignature(bodyStr, options.secret);
      headers['X-MiSender-Secret'] = options.secret;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      return {
        type: actionType,
        status: 'error',
        target: url,
        statusCode: res.status,
        detail: `HTTP ${res.status} from ${url}`
      };
    }

    return {
      type: actionType,
      status: 'success',
      target: url,
      statusCode: res.status
    };
  }

  private async runWebhookAction(
    workspaceId: string,
    rule: AutomationRule,
    triggerEvent: AutomationTrigger,
    payload: Record<string, unknown>,
    action: AutomationAction,
    cfg: Record<string, unknown>
  ): Promise<AutomationActionResult> {
    const url = String(cfg.url || cfg.webhookUrl || action.url || action.webhookUrl || '').trim();
    if (!url) {
      return { type: 'webhook', status: 'error', detail: 'Webhook URL is required' };
    }

    const secret = String(cfg.secret || action.secret || '').trim() || undefined;
    const rawHeaders =
      cfg.headers && typeof cfg.headers === 'object' ? (cfg.headers as Record<string, unknown>) : {};
    const extraHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (typeof v === 'string') {
        extraHeaders[k] = v.replace(/[\r\n]/g, '');
      }
    }

    return this.postSignedJson(
      'webhook',
      url,
      {
        event: triggerEvent,
        workspaceId,
        ruleId: rule.id,
        ruleName: rule.name,
        platform: cfg.platform || 'custom',
        timestamp: new Date().toISOString(),
        data: payload
      },
      { secret, extraHeaders, event: triggerEvent }
    );
  }

  private async runSlackAction(
    workspaceId: string,
    rule: AutomationRule,
    triggerEvent: AutomationTrigger,
    payload: Record<string, unknown>,
    action: AutomationAction,
    cfg: Record<string, unknown>
  ): Promise<AutomationActionResult> {
    const url = String(cfg.webhookUrl || cfg.url || action.webhookUrl || action.url || '').trim();
    if (!url) {
      return { type: 'slack_notify', status: 'error', detail: 'Slack webhookUrl is required' };
    }

    const leadEmail = extractEmailFromPayload(payload) || 'N/A';
    const leadName = String(payload.leadName || payload.firstName || leadEmail);
    const companyName = String(payload.companyName || '');
    const defaultText = `[MiSender • ${triggerEvent}] ${rule.name}: ${leadName} (${leadEmail})${companyName ? ` — ${companyName}` : ''}`;
    const customTemplate = typeof cfg.messageTemplate === 'string' ? cfg.messageTemplate : '';
    const text = customTemplate ? interpolateTemplate(customTemplate, payload) : defaultText;
    const secret = String(cfg.secret || action.secret || '').trim() || undefined;

    return this.postSignedJson(
      'slack_notify',
      url,
      {
        text,
        workspaceId,
        event: triggerEvent,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${rule.name}* (\`${triggerEvent}\`)\n${text}`
            }
          }
        ]
      },
      { secret, event: triggerEvent }
    );
  }

  private async runHubSpotAction(
    triggerEvent: AutomationTrigger,
    payload: Record<string, unknown>,
    action: AutomationAction,
    cfg: Record<string, unknown>
  ): Promise<AutomationActionResult> {
    const token = String(
      cfg.accessToken || cfg.token || cfg.apiKey || action.token || process.env.HUBSPOT_ACCESS_TOKEN || ''
    ).trim();

    if (!token) {
      return {
        type: 'hubspot_sync',
        status: 'skipped',
        detail: 'HubSpot accessToken not configured'
      };
    }

    const email = extractEmailFromPayload(payload);
    if (!email) {
      return {
        type: 'hubspot_sync',
        status: 'skipped',
        detail: 'No lead email in trigger payload for HubSpot sync'
      };
    }

    const endpoint = 'https://api.hubapi.com/crm/v3/objects/contacts';
    const validation = await validateWebhookUrl(endpoint, false);
    if (!validation.valid) {
      return { type: 'hubspot_sync', status: 'error', detail: `SSRF Block: ${validation.reason}` };
    }

    const leadName = String(payload.leadName || '').trim();
    const firstName = String(payload.firstName || leadName.split(' ')[0] || '').trim();
    const lastName = String(payload.lastName || leadName.split(' ').slice(1).join(' ') || '').trim();

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        properties: {
          email,
          firstname: firstName,
          lastname: lastName,
          company: String(payload.companyName || ''),
          hs_lead_status: triggerEvent === 'lead.interested' ? 'OPEN_DEAL' : 'IN_PROGRESS'
        }
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (res.status === 409) {
      return {
        type: 'hubspot_sync',
        status: 'success',
        target: email,
        statusCode: 409,
        detail: 'Contact already exists in HubSpot'
      };
    }

    if (!res.ok) {
      return {
        type: 'hubspot_sync',
        status: 'error',
        target: email,
        statusCode: res.status,
        detail: `HubSpot API returned HTTP ${res.status}`
      };
    }

    return {
      type: 'hubspot_sync',
      status: 'success',
      target: email,
      statusCode: res.status
    };
  }

  private async runPipedriveAction(
    triggerEvent: AutomationTrigger,
    payload: Record<string, unknown>,
    action: AutomationAction,
    cfg: Record<string, unknown>
  ): Promise<AutomationActionResult> {
    const token = String(
      cfg.apiToken || cfg.token || cfg.apiKey || action.token || process.env.PIPEDRIVE_API_TOKEN || ''
    ).trim();

    if (!token) {
      return {
        type: 'pipedrive_sync',
        status: 'skipped',
        detail: 'Pipedrive apiToken not configured'
      };
    }

    const email = extractEmailFromPayload(payload);
    if (!email) {
      return {
        type: 'pipedrive_sync',
        status: 'skipped',
        detail: 'No lead email in trigger payload for Pipedrive sync'
      };
    }

    const rawDomain = typeof cfg.companyDomain === 'string' ? cfg.companyDomain.trim() : '';
    if (rawDomain && !/^[a-zA-Z0-9-]+$/.test(rawDomain)) {
      return {
        type: 'pipedrive_sync',
        status: 'error',
        detail: 'Invalid Pipedrive companyDomain subdomain'
      };
    }
    const baseUrl = rawDomain
      ? `https://${rawDomain}.pipedrive.com`
      : 'https://api.pipedrive.com';
    const personsUrl = `${baseUrl}/api/v1/persons?api_token=${encodeURIComponent(token)}`;

    const validation = await validateWebhookUrl(personsUrl, false);
    if (!validation.valid) {
      return { type: 'pipedrive_sync', status: 'error', detail: `SSRF Block: ${validation.reason}` };
    }

    const personName =
      String(payload.leadName || `${payload.firstName || ''} ${payload.lastName || ''}`.trim() || email);

    const personRes = await fetch(personsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: personName,
        email: [{ value: email, primary: true, label: 'work' }]
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (!personRes.ok) {
      return {
        type: 'pipedrive_sync',
        status: 'error',
        target: email,
        statusCode: personRes.status,
        detail: `Pipedrive API returned HTTP ${personRes.status}`
      };
    }

    if (cfg.createDeal) {
      const dealsUrl = `${baseUrl}/api/v1/deals?api_token=${encodeURIComponent(token)}`;
      await fetch(dealsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${payload.companyName || personName} (${triggerEvent})`,
          value: Number(cfg.dealValue || 2500)
        }),
        signal: AbortSignal.timeout(5000)
      }).catch(() => {});
    }

    return {
      type: 'pipedrive_sync',
      status: 'success',
      target: email,
      statusCode: personRes.status
    };
  }

  private async runWhatsAppAction(
    workspaceId: string,
    triggerEvent: AutomationTrigger,
    payload: Record<string, unknown>,
    action: AutomationAction,
    cfg: Record<string, unknown>
  ): Promise<AutomationActionResult> {
    const to = String(cfg.to || cfg.phone || payload.phone || '').trim();
    const webhookUrl = String(cfg.webhookUrl || cfg.url || action.webhookUrl || action.url || '').trim();
    const phoneNumberId = String(cfg.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    const accessToken = String(
      cfg.accessToken || cfg.token || action.token || process.env.WHATSAPP_ACCESS_TOKEN || ''
    ).trim();

    const email = extractEmailFromPayload(payload);
    const defaultMsg = `[MiSender • ${triggerEvent}] ${String(payload.leadName || email || 'Prospecto')} (${String(payload.companyName || 'Lead')})`;
    const msg =
      typeof cfg.messageTemplate === 'string' && cfg.messageTemplate.trim()
        ? interpolateTemplate(cfg.messageTemplate, payload)
        : defaultMsg;

    if (webhookUrl) {
      const secret = String(cfg.secret || action.secret || '').trim() || undefined;
      const extraHeaders: Record<string, string> = {};
      if (accessToken) {
        extraHeaders.apikey = accessToken;
        extraHeaders.Authorization = `Bearer ${accessToken}`;
      }
      return this.postSignedJson(
        'whatsapp_notify',
        webhookUrl,
        {
          event: triggerEvent,
          workspaceId,
          number: to,
          to,
          text: msg,
          data: payload
        },
        { secret, extraHeaders, event: triggerEvent }
      );
    }

    if (phoneNumberId && accessToken && to) {
      const graphUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(phoneNumberId)}/messages`;
      const validation = await validateWebhookUrl(graphUrl, false);
      if (!validation.valid) {
        return { type: 'whatsapp_notify', status: 'error', detail: `SSRF Block: ${validation.reason}` };
      }

      const res = await fetch(graphUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: msg }
        }),
        signal: AbortSignal.timeout(5000)
      });

      return {
        type: 'whatsapp_notify',
        status: res.ok ? 'success' : 'error',
        target: to,
        statusCode: res.status,
        detail: res.ok ? undefined : `WhatsApp Cloud API returned HTTP ${res.status}`
      };
    }

    return {
      type: 'whatsapp_notify',
      status: 'skipped',
      detail: 'WhatsApp webhookUrl or Cloud API credentials (phoneNumberId, accessToken, to) not configured'
    };
  }

  private async runCreateDealAction(
    workspaceId: string,
    payload: Record<string, unknown>,
    action: AutomationAction,
    cfg: Record<string, unknown>
  ): Promise<AutomationActionResult> {
    const { dealRepo } = this.resolveDeps();
    const contactEmail = extractEmailFromPayload(payload);
    const leadId = typeof payload.leadId === 'string' ? payload.leadId : '';

    const existingDeals = await dealRepo.getDeals(workspaceId);
    const existing = existingDeals.find(
      d =>
        (leadId && d.leadId === leadId) ||
        (contactEmail && d.contactEmail && d.contactEmail.toLowerCase().trim() === contactEmail)
    );

    if (existing) {
      return {
        type: 'create_deal',
        status: 'skipped',
        createdId: existing.id,
        target: contactEmail || leadId,
        detail: 'Deal already exists for this lead'
      };
    }

    const contactName =
      String(
        payload.leadName ||
          `${payload.firstName || ''} ${payload.lastName || ''}`.trim() ||
          contactEmail ||
          'Nuevo Prospecto'
      );
    const companyName = String(payload.companyName || '');
    const dealValue = Number(cfg.value ?? cfg.dealValue ?? action.dealValue ?? 2500);
    const stage = (cfg.stage || action.stage || 'positive') as DealStage;

    const deal: Deal = {
      id: `deal-${uuidv4()}`,
      workspaceId,
      leadId,
      contactName,
      contactEmail: contactEmail || 'unknown@lead.local',
      companyName,
      title: typeof cfg.title === 'string' && cfg.title.trim()
        ? interpolateTemplate(cfg.title, payload)
        : `Oportunidad: ${companyName || contactName}`,
      stage,
      value: Number.isFinite(dealValue) ? dealValue : 2500,
      daysInactive: 0,
      createdAt: new Date().toISOString()
    };

    await dealRepo.saveDeal(deal);
    return {
      type: 'create_deal',
      status: 'success',
      createdId: deal.id,
      target: deal.contactEmail
    };
  }

  private async runBlocklistAction(
    workspaceId: string,
    triggerEvent: AutomationTrigger,
    payload: Record<string, unknown>,
    action: AutomationAction,
    cfg: Record<string, unknown>
  ): Promise<AutomationActionResult> {
    const { blocklistRepo } = this.resolveDeps();
    const value = String(cfg.value || extractEmailFromPayload(payload) || '').trim().toLowerCase();

    if (!value) {
      return {
        type: 'add_to_blocklist',
        status: 'skipped',
        detail: 'No email or domain found in payload'
      };
    }

    if (await blocklistRepo.isBlocked(value)) {
      return {
        type: 'add_to_blocklist',
        status: 'skipped',
        target: value,
        detail: 'Already present in blocklist'
      };
    }

    const itemType: 'email' | 'domain' =
      cfg.blockType === 'domain' || (!value.includes('@') && cfg.blockType !== 'email')
        ? 'domain'
        : 'email';
    const reason =
      (cfg.reason as AutomationAction['reason']) ||
      action.reason ||
      (triggerEvent === 'lead.bounced' ? 'bounced' : 'manual');

    const added = await blocklistRepo.addToBlocklist({
      workspaceId,
      type: itemType,
      value,
      reason
    });

    return {
      type: 'add_to_blocklist',
      status: 'success',
      createdId: added.id,
      target: value
    };
  }

  private async runPauseAccountAction(
    workspaceId: string,
    payload: Record<string, unknown>,
    cfg: Record<string, unknown>
  ): Promise<AutomationActionResult> {
    const { accountRepo } = this.resolveDeps();
    const accountId = String(cfg.accountId || payload.accountId || payload.senderAccountId || '').trim();
    const accountEmail = String(cfg.email || payload.accountEmail || payload.senderEmail || '')
      .trim()
      .toLowerCase();

    let account = accountId ? await accountRepo.getAccountById(accountId) : undefined;
    if (!account && accountEmail) {
      const accounts = await accountRepo.getAccounts(workspaceId);
      account = accounts.find(a => a.email.toLowerCase().trim() === accountEmail);
    }

    if (!account) {
      return {
        type: 'pause_account',
        status: 'skipped',
        detail: 'Target sender account not found'
      };
    }

    if (account.status === 'error') {
      return {
        type: 'pause_account',
        status: 'skipped',
        target: account.email,
        detail: 'Account already paused/error'
      };
    }

    account.status = 'error';
    await accountRepo.saveAccount(account);

    return {
      type: 'pause_account',
      status: 'success',
      createdId: account.id,
      target: account.email
    };
  }

  // Static convenience wrappers for direct service usage in route handlers & crons
  static executeTrigger(
    workspaceId: string,
    triggerEvent: AutomationTrigger,
    payload: Record<string, unknown>,
    options?: ExecuteTriggerOptions
  ): Promise<AutomationRun[]> {
    return defaultAutomationEngine.executeTrigger(workspaceId, triggerEvent, payload, options);
  }

  static getRules(workspaceId?: string): Promise<AutomationRule[]> {
    return defaultAutomationEngine.getRules(workspaceId);
  }

  static saveRule(
    input: Partial<AutomationRule> & { name: string; triggerEvent: AutomationTrigger; actions: AutomationAction[] }
  ): Promise<AutomationRule> {
    return defaultAutomationEngine.saveRule(input);
  }

  static updateRule(
    id: string,
    patch: Partial<Omit<AutomationRule, 'id' | 'createdAt'>>
  ): Promise<AutomationRule | null> {
    return defaultAutomationEngine.updateRule(id, patch);
  }

  static deleteRule(id: string): Promise<void> {
    return defaultAutomationEngine.deleteRule(id);
  }

  static getRuns(workspaceId?: string, limit?: number): Promise<AutomationRun[]> {
    return defaultAutomationEngine.getRuns(workspaceId, limit);
  }
}

export const defaultAutomationEngine = new AutomationEngineService();
