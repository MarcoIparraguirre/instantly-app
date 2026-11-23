import crypto from 'crypto';
import { types as utilTypes } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { validateWebhookUrl } from '@/core/security/ssrfValidator';
import { ITemplateRenderer, TemplateRenderer } from '@/core/services/TemplateRenderer';
import { ISpintaxService, SpintaxService } from '@/core/services/SpintaxService';
import { supabase } from '@/core/supabase/client';
import { Lead } from '@/types';

export type MultichannelChannel = 'email' | 'whatsapp' | 'linkedin_task' | 'call_task';

export type SalesTaskChannel = 'linkedin_task' | 'call_task';

export interface SalesTask {
  id: string;
  workspaceId: string;
  campaignId: string;
  leadId: string;
  leadEmail: string;
  leadName: string;
  companyName: string;
  channel: SalesTaskChannel;
  actionUrl: string;
  script: string;
  status: 'pending' | 'completed';
  createdAt: string;
  completedAt?: string;
  notes?: string;
}

export interface MultichannelDispatchInput {
  channel: MultichannelChannel;
  workspaceId?: string;
  campaignId?: string;
  lead: Partial<Lead> & { id?: string; email?: string };
  messageTemplate: string;
  subjectTemplate?: string;
  phone?: string;
  linkedinUrl?: string;
  whatsappAccessToken?: string;
  whatsappPhoneNumberId?: string;
  whatsappWebhookUrl?: string;
  whatsappWebhookSecret?: string;
}

export interface MultichannelBatchInput {
  channel: MultichannelChannel;
  workspaceId?: string;
  campaignId?: string;
  leads: Array<Partial<Lead> & { id?: string; email?: string }>;
  messageTemplate: string;
  subjectTemplate?: string;
  whatsappAccessToken?: string;
  whatsappPhoneNumberId?: string;
  whatsappWebhookUrl?: string;
  whatsappWebhookSecret?: string;
}

export interface MultichannelDispatchResult {
  channel: MultichannelChannel;
  leadId: string;
  leadEmail: string;
  renderedMessage: string;
  renderedSubject?: string;
  status: 'sent' | 'simulated' | 'task_created' | 'skipped' | 'error';
  provider: 'whatsapp_cloud' | 'whatsapp_webhook' | 'simulation' | 'sales_task' | 'email_render';
  target?: string;
  statusCode?: number;
  messageId?: string;
  task?: SalesTask;
  error?: string;
}

export interface SalesTaskFilter {
  workspaceId?: string;
  campaignId?: string;
  status?: 'pending' | 'completed';
  channel?: SalesTaskChannel;
}

interface FallbackTaskStore {
  tasks: SalesTask[];
}

function getTaskStore(): FallbackTaskStore {
  const g = globalThis as unknown as { __misenderMultichannelTaskStore?: FallbackTaskStore };
  if (!g.__misenderMultichannelTaskStore) {
    g.__misenderMultichannelTaskStore = { tasks: [] };
  }
  return g.__misenderMultichannelTaskStore;
}

function shouldUseSupabase(): boolean {
  const hasEnv = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
  if (hasEnv) return true;

  // Avoid triggering the real placeholder Proxy warning when Supabase env vars are absent
  if (utilTypes.isProxy(supabase)) {
    return false;
  }

  const clientUrl = (supabase as unknown as { supabaseUrl?: string })?.supabaseUrl;
  const hasFrom = typeof (supabase as unknown as { from?: unknown })?.from === 'function';
  return Boolean(hasFrom && clientUrl && clientUrl !== 'https://placeholder.supabase.co');
}

function mapDbRowToTask(row: Record<string, unknown>): SalesTask {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id ?? row.workspaceId ?? 'ws-primary'),
    campaignId: String(row.campaign_id ?? row.campaignId ?? 'campaign-1'),
    leadId: String(row.lead_id ?? row.leadId ?? ''),
    leadEmail: String(row.lead_email ?? row.leadEmail ?? ''),
    leadName: String(row.lead_name ?? row.leadName ?? ''),
    companyName: String(row.company_name ?? row.companyName ?? ''),
    channel: (row.channel === 'call_task' ? 'call_task' : 'linkedin_task') as SalesTaskChannel,
    actionUrl: String(row.action_url ?? row.actionUrl ?? ''),
    script: String(row.script ?? ''),
    status: row.status === 'completed' ? 'completed' : 'pending',
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    completedAt:
      typeof (row.completed_at ?? row.completedAt) === 'string'
        ? String(row.completed_at ?? row.completedAt)
        : undefined,
    notes: typeof row.notes === 'string' ? row.notes : undefined
  };
}

function mapTaskToDbRow(task: SalesTask): Record<string, unknown> {
  return {
    id: task.id,
    workspace_id: task.workspaceId,
    campaign_id: task.campaignId,
    lead_id: task.leadId,
    lead_email: task.leadEmail,
    lead_name: task.leadName,
    company_name: task.companyName,
    channel: task.channel,
    action_url: task.actionUrl,
    script: task.script,
    status: task.status,
    created_at: task.createdAt,
    completed_at: task.completedAt ?? null,
    notes: task.notes ?? null
  };
}

function extractCustomVar(
  lead: Partial<Lead>,
  keys: string[]
): string | undefined {
  const vars = lead.customVariables || {};
  for (const key of keys) {
    const val = vars[key];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  const lowerMap = new Map<string, string>();
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === 'string' && v.trim()) {
      lowerMap.set(k.toLowerCase(), v.trim());
    }
  }
  for (const key of keys) {
    const found = lowerMap.get(key.toLowerCase());
    if (found) return found;
  }
  return undefined;
}

function extractLeadPhone(lead: Partial<Lead>, explicitPhone?: string): string {
  const raw =
    explicitPhone?.trim() ||
    extractCustomVar(lead, [
      'phone',
      'telefono',
      'teléfono',
      'whatsapp',
      'mobile',
      'celular',
      'phoneNumber',
      'tel'
    ]) ||
    '';
  return raw.trim();
}

function normalizePhoneForTel(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('+') ? `+${cleaned.slice(1).replace(/\+/g, '')}` : cleaned;
}

function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

function buildLinkedInActionUrl(lead: Partial<Lead>, explicitUrl?: string): string {
  const raw =
    explicitUrl?.trim() ||
    extractCustomVar(lead, [
      'linkedinUrl',
      'linkedin_url',
      'linkedin',
      'linkedinProfile'
    ]) ||
    '';

  if (raw) {
    try {
      const candidate = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
      const parsed = new URL(candidate);
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        parsed.hostname.toLowerCase().includes('linkedin.com')
      ) {
        return parsed.toString().replace(/^http:\/\//i, 'https://');
      }
    } catch {
      // fall through to LinkedIn search URL
    }
  }

  const keywords = `${lead.firstName || ''} ${lead.lastName || ''} ${lead.companyName || ''}`.trim() ||
    lead.email ||
    'prospect';
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}

function buildLeadRenderContext(lead: Partial<Lead>): Partial<Lead> {
  const customVars: Record<string, string> = {
    ...(lead.title ? { title: lead.title, cargo: lead.title } : {}),
    ...(lead.customVariables || {})
  };
  return {
    ...lead,
    customVariables: customVars
  };
}

function createHmacSignature(bodyStr: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
}

export function isValidMultichannelChannel(channel: unknown): channel is MultichannelChannel {
  return (
    channel === 'email' ||
    channel === 'whatsapp' ||
    channel === 'linkedin_task' ||
    channel === 'call_task'
  );
}

export class MultichannelDispatcherService {
  private templateRenderer: ITemplateRenderer;
  private spintaxService: ISpintaxService;

  constructor(templateRenderer?: ITemplateRenderer, spintaxService?: ISpintaxService) {
    this.templateRenderer = templateRenderer || new TemplateRenderer();
    this.spintaxService = spintaxService || new SpintaxService();
  }

  static async dispatch(input: MultichannelDispatchInput): Promise<MultichannelDispatchResult> {
    return new MultichannelDispatcherService().dispatch(input);
  }

  static async dispatchBatch(input: MultichannelBatchInput): Promise<MultichannelDispatchResult[]> {
    return new MultichannelDispatcherService().dispatchBatch(input);
  }

  static async getTasks(filter?: SalesTaskFilter): Promise<SalesTask[]> {
    return new MultichannelDispatcherService().getTasks(filter);
  }

  static async completeTask(
    taskId: string,
    options?: { workspaceId?: string; campaignId?: string; notes?: string }
  ): Promise<SalesTask | null> {
    return new MultichannelDispatcherService().completeTask(taskId, options);
  }

  static clearTasks(filter?: { workspaceId?: string; campaignId?: string }): void {
    const store = getTaskStore();
    if (!filter) {
      store.tasks = [];
      return;
    }
    store.tasks = store.tasks.filter(t => {
      if (filter.workspaceId && t.workspaceId !== filter.workspaceId) return true;
      if (filter.campaignId && t.campaignId !== filter.campaignId) return true;
      return false;
    });
  }

  renderText(template: string, lead: Partial<Lead>): string {
    const ctx = buildLeadRenderContext(lead);
    const rendered = this.templateRenderer.render(template, ctx);
    return this.spintaxService.resolve(rendered);
  }

  async dispatchBatch(input: MultichannelBatchInput): Promise<MultichannelDispatchResult[]> {
    const results: MultichannelDispatchResult[] = [];
    for (const lead of input.leads) {
      const res = await this.dispatch({
        channel: input.channel,
        workspaceId: input.workspaceId || lead.workspaceId,
        campaignId: input.campaignId || lead.campaignId,
        lead,
        messageTemplate: input.messageTemplate,
        subjectTemplate: input.subjectTemplate,
        whatsappAccessToken: input.whatsappAccessToken,
        whatsappPhoneNumberId: input.whatsappPhoneNumberId,
        whatsappWebhookUrl: input.whatsappWebhookUrl,
        whatsappWebhookSecret: input.whatsappWebhookSecret
      });
      results.push(res);
    }
    return results;
  }

  async dispatch(input: MultichannelDispatchInput): Promise<MultichannelDispatchResult> {
    const workspaceId = input.workspaceId || input.lead.workspaceId || 'ws-primary';
    const campaignId = input.campaignId || input.lead.campaignId || 'campaign-1';
    const leadId = input.lead.id || `lead-${uuidv4()}`;
    const leadEmail = (input.lead.email || '').trim().toLowerCase();
    const renderedMessage = this.renderText(input.messageTemplate, input.lead);

    if (input.channel === 'email') {
      const renderedSubject = input.subjectTemplate
        ? this.renderText(input.subjectTemplate, input.lead)
        : undefined;
      return {
        channel: 'email',
        leadId,
        leadEmail,
        renderedMessage,
        renderedSubject,
        status: 'simulated',
        provider: 'email_render',
        target: leadEmail
      };
    }

    if (input.channel === 'whatsapp') {
      return this.dispatchWhatsApp({
        ...input,
        workspaceId,
        campaignId,
        leadId,
        leadEmail,
        renderedMessage
      });
    }

    if (input.channel === 'linkedin_task' || input.channel === 'call_task') {
      const phoneRaw = extractLeadPhone(input.lead, input.phone);
      const telNormalized = normalizePhoneForTel(phoneRaw);
      const actionUrl =
        input.channel === 'linkedin_task'
          ? buildLinkedInActionUrl(input.lead, input.linkedinUrl)
          : `tel:${telNormalized}`;

      const leadName =
        `${input.lead.firstName || ''} ${input.lead.lastName || ''}`.trim() ||
        leadEmail ||
        'Lead';

      const task: SalesTask = {
        id: `task-${uuidv4()}`,
        workspaceId,
        campaignId,
        leadId,
        leadEmail,
        leadName,
        companyName: input.lead.companyName || '',
        channel: input.channel,
        actionUrl,
        script: renderedMessage,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      await this.saveTask(task);

      return {
        channel: input.channel,
        leadId,
        leadEmail,
        renderedMessage,
        status: 'task_created',
        provider: 'sales_task',
        target: actionUrl,
        task
      };
    }

    return {
      channel: input.channel,
      leadId,
      leadEmail,
      renderedMessage,
      status: 'error',
      provider: 'simulation',
      error: `Unsupported channel: ${String(input.channel)}`
    };
  }

  private async dispatchWhatsApp(
    params: MultichannelDispatchInput & {
      workspaceId: string;
      campaignId: string;
      leadId: string;
      leadEmail: string;
      renderedMessage: string;
    }
  ): Promise<MultichannelDispatchResult> {
    const rawPhone = extractLeadPhone(params.lead, params.phone);
    const phoneDigits = normalizePhoneDigits(rawPhone);

    const explicitWebhook = params.whatsappWebhookUrl?.trim() || '';
    const accessToken =
      params.whatsappAccessToken?.trim() || process.env.WHATSAPP_ACCESS_TOKEN?.trim() || '';
    const phoneNumberId =
      params.whatsappPhoneNumberId?.trim() || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '';
    const envWebhook = process.env.WHATSAPP_WEBHOOK_URL?.trim() || '';
    const webhookUrl = explicitWebhook || envWebhook;
    const webhookSecret =
      params.whatsappWebhookSecret?.trim() || process.env.WHATSAPP_WEBHOOK_SECRET?.trim() || '';

    const useCloudApi = Boolean(!explicitWebhook && accessToken && phoneNumberId);

    if (useCloudApi) {
      if (!phoneDigits) {
        return {
          channel: 'whatsapp',
          leadId: params.leadId,
          leadEmail: params.leadEmail,
          renderedMessage: params.renderedMessage,
          status: 'skipped',
          provider: 'whatsapp_cloud',
          error: 'Lead phone number missing for WhatsApp Cloud API dispatch'
        };
      }

      const graphUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(phoneNumberId)}/messages`;
      const validation = await validateWebhookUrl(graphUrl, false);
      if (!validation.valid) {
        return {
          channel: 'whatsapp',
          leadId: params.leadId,
          leadEmail: params.leadEmail,
          renderedMessage: params.renderedMessage,
          status: 'error',
          provider: 'whatsapp_cloud',
          target: phoneDigits,
          error: `SSRF Block: ${validation.reason}`
        };
      }

      try {
        const signal =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(5000)
            : undefined;

        const res = await fetch(graphUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phoneDigits,
            type: 'text',
            text: { body: params.renderedMessage }
          }),
          signal
        });

        let messageId: string | undefined;
        try {
          const json = (await res.json()) as { messages?: Array<{ id?: string }> };
          messageId = json?.messages?.[0]?.id;
        } catch {
          // ignore non-JSON body
        }

        return {
          channel: 'whatsapp',
          leadId: params.leadId,
          leadEmail: params.leadEmail,
          renderedMessage: params.renderedMessage,
          status: res.ok ? 'sent' : 'error',
          provider: 'whatsapp_cloud',
          target: phoneDigits,
          statusCode: res.status,
          messageId,
          error: res.ok ? undefined : `WhatsApp Cloud API returned HTTP ${res.status}`
        };
      } catch (err: unknown) {
        return {
          channel: 'whatsapp',
          leadId: params.leadId,
          leadEmail: params.leadEmail,
          renderedMessage: params.renderedMessage,
          status: 'error',
          provider: 'whatsapp_cloud',
          target: phoneDigits,
          error: err instanceof Error ? err.message : 'WhatsApp Cloud API network error'
        };
      }
    }

    if (webhookUrl) {
      const validation = await validateWebhookUrl(webhookUrl, false);
      if (!validation.valid) {
        return {
          channel: 'whatsapp',
          leadId: params.leadId,
          leadEmail: params.leadEmail,
          renderedMessage: params.renderedMessage,
          status: 'error',
          provider: 'whatsapp_webhook',
          target: webhookUrl,
          error: `SSRF Block: ${validation.reason}`
        };
      }

      try {
        const payloadObj = {
          event: 'multichannel.whatsapp',
          workspaceId: params.workspaceId,
          campaignId: params.campaignId,
          leadId: params.leadId,
          leadEmail: params.leadEmail,
          number: phoneDigits || rawPhone,
          to: phoneDigits || rawPhone || params.leadEmail,
          text: params.renderedMessage,
          message: params.renderedMessage
        };
        const bodyStr = JSON.stringify(payloadObj);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'MiSender-Multichannel/1.0'
        };
        if (accessToken) {
          headers.apikey = accessToken;
          headers.Authorization = `Bearer ${accessToken}`;
        }
        if (webhookSecret) {
          headers['X-MiSender-Signature'] = createHmacSignature(bodyStr, webhookSecret);
        }

        const signal =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(5000)
            : undefined;

        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: bodyStr,
          signal
        });

        let messageId: string | undefined;
        try {
          const json = (await res.json()) as { id?: string; key?: { id?: string }; messageId?: string };
          messageId = json?.messageId || json?.key?.id || json?.id;
        } catch {
          // ignore non-JSON body
        }

        return {
          channel: 'whatsapp',
          leadId: params.leadId,
          leadEmail: params.leadEmail,
          renderedMessage: params.renderedMessage,
          status: res.ok ? 'sent' : 'error',
          provider: 'whatsapp_webhook',
          target: phoneDigits || rawPhone || webhookUrl,
          statusCode: res.status,
          messageId,
          error: res.ok ? undefined : `WhatsApp webhook returned HTTP ${res.status}`
        };
      } catch (err: unknown) {
        return {
          channel: 'whatsapp',
          leadId: params.leadId,
          leadEmail: params.leadEmail,
          renderedMessage: params.renderedMessage,
          status: 'error',
          provider: 'whatsapp_webhook',
          target: webhookUrl,
          error: err instanceof Error ? err.message : 'WhatsApp webhook network error'
        };
      }
    }

    // Unconfigured: simulate cleanly
    return {
      channel: 'whatsapp',
      leadId: params.leadId,
      leadEmail: params.leadEmail,
      renderedMessage: params.renderedMessage,
      status: 'simulated',
      provider: 'simulation',
      target: phoneDigits || rawPhone || params.leadEmail,
      messageId: `sim-wa-${uuidv4()}`
    };
  }

  private async saveTask(task: SalesTask): Promise<void> {
    const store = getTaskStore();
    store.tasks.unshift(task);

    if (shouldUseSupabase()) {
      try {
        await supabase.from('multichannel_tasks').upsert(mapTaskToDbRow(task), { onConflict: 'id' });
      } catch {
        // Fallback store already persisted the task safely
      }
    }
  }

  async getTasks(filter?: SalesTaskFilter): Promise<SalesTask[]> {
    const store = getTaskStore();

    if (shouldUseSupabase()) {
      try {
        let query = supabase
          .from('multichannel_tasks')
          .select('*')
          .order('created_at', { ascending: false });

        if (filter?.workspaceId) {
          query = query.eq('workspace_id', filter.workspaceId);
        }
        if (filter?.campaignId) {
          query = query.eq('campaign_id', filter.campaignId);
        }
        if (filter?.status) {
          query = query.eq('status', filter.status);
        }
        if (filter?.channel) {
          query = query.eq('channel', filter.channel);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          return data.map(row => mapDbRowToTask(row as Record<string, unknown>));
        }
      } catch {
        // Fallback to in-memory/globalThis store
      }
    }

    return store.tasks.filter(task => {
      if (filter?.workspaceId && task.workspaceId !== filter.workspaceId) return false;
      if (filter?.campaignId && task.campaignId !== filter.campaignId) return false;
      if (filter?.status && task.status !== filter.status) return false;
      if (filter?.channel && task.channel !== filter.channel) return false;
      return true;
    });
  }

  async completeTask(
    taskId: string,
    options?: { workspaceId?: string; campaignId?: string; notes?: string }
  ): Promise<SalesTask | null> {
    const store = getTaskStore();
    const idx = store.tasks.findIndex(t => {
      if (t.id !== taskId) return false;
      if (options?.workspaceId && t.workspaceId !== options.workspaceId) return false;
      if (options?.campaignId && t.campaignId !== options.campaignId) return false;
      return true;
    });

    const completedAt = new Date().toISOString();
    let updated: SalesTask | null = null;

    if (idx >= 0) {
      updated = {
        ...store.tasks[idx],
        status: 'completed',
        completedAt,
        ...(options?.notes !== undefined ? { notes: options.notes } : {})
      };
      store.tasks[idx] = updated;
    }

    if (shouldUseSupabase()) {
      try {
        let query = supabase.from('multichannel_tasks').select('*').eq('id', taskId);
        if (options?.workspaceId) {
          query = query.eq('workspace_id', options.workspaceId);
        }
        if (options?.campaignId) {
          query = query.eq('campaign_id', options.campaignId);
        }
        const { data, error } = await query.maybeSingle();
        if (!error && data) {
          const existing = mapDbRowToTask(data as Record<string, unknown>);
          updated = {
            ...existing,
            status: 'completed',
            completedAt,
            ...(options?.notes !== undefined ? { notes: options.notes } : {})
          };
          await supabase
            .from('multichannel_tasks')
            .update({
              status: 'completed',
              completed_at: completedAt,
              ...(options?.notes !== undefined ? { notes: options.notes } : {})
            })
            .eq('id', taskId);
        }
      } catch {
        // Fallback store handles local state
      }
    }

    return updated;
  }
}
