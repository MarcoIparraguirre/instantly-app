export type WorkspacePlan = 'starter' | 'growth' | 'agency';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export type BillingCycle = 'monthly' | 'annual';

export type BillingProvider = 'stripe' | 'mercadopago' | 'lemonsqueezy' | 'sandbox';

export type UserRole = 'super_admin' | 'admin' | 'campaign_manager' | 'viewer';

export type AppTab =
  | 'finder'
  | 'accounts'
  | 'campaigns'
  | 'unibox'
  | 'crm'
  | 'analytics'
  | 'team'
  | 'billing'
  | 'backoffice';

export interface TeamMember {
  id: string;
  workspaceId: string;
  allowedWorkspaceIds?: string[];
  agencyId?: string;
  accessCode?: string;
  fullName: string;
  email: string;
  company?: string;
  roleId: UserRole;
  roleName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RolePermissionConfig {
  labelEs: string;
  labelEn: string;
  descriptionEs: string;
  descriptionEn: string;
  allowedTabs: AppTab[];
  canManageWorkspaces: boolean;
  canManageTeam: boolean;
  canManageBilling: boolean;
  canAccessBackoffice: boolean;
  isReadOnly: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissionConfig> = {
  super_admin: {
    labelEs: 'Super Admin',
    labelEn: 'Super Admin',
    descriptionEs: 'Dueño del SaaS: da de alta agencias, asigna planes y administra usuarios de agencias.',
    descriptionEn: 'SaaS Owner: onboards agencies, assigns plans, and manages agency admin users.',
    allowedTabs: ['backoffice'],
    canManageWorkspaces: true,
    canManageTeam: true,
    canManageBilling: true,
    canAccessBackoffice: true,
    isReadOnly: false,
  },
  admin: {
    labelEs: 'Admin Agencia',
    labelEn: 'Agency Admin',
    descriptionEs: 'Cliente principal: administra sus Workspaces de clientes, equipo y facturación.',
    descriptionEn: 'Agency Owner: manages client workspaces, team members, and billing.',
    allowedTabs: ['finder', 'accounts', 'campaigns', 'unibox', 'crm', 'analytics', 'team', 'billing'],
    canManageWorkspaces: true,
    canManageTeam: true,
    canManageBilling: true,
    canAccessBackoffice: false,
    isReadOnly: false,
  },
  campaign_manager: {
    labelEs: 'Gestor de Campañas',
    labelEn: 'Campaign Manager',
    descriptionEs: 'Operador / SDR: opera campañas, leads, casillas y Unibox sin ver facturación ni equipo.',
    descriptionEn: 'Operator / SDR: manages campaigns, leads, mailboxes & Unibox without billing or team access.',
    allowedTabs: ['finder', 'accounts', 'campaigns', 'unibox', 'crm', 'analytics'],
    canManageWorkspaces: false,
    canManageTeam: false,
    canManageBilling: false,
    canAccessBackoffice: false,
    isReadOnly: false,
  },
  viewer: {
    labelEs: 'Solo Lectura',
    labelEn: 'Read Only',
    descriptionEs: 'Cliente final de la agencia: visualiza campañas, Unibox, CRM y analíticas sin editar.',
    descriptionEn: 'Agency end-client: view-only access to campaigns, Unibox, CRM & analytics.',
    allowedTabs: ['campaigns', 'unibox', 'crm', 'analytics'],
    canManageWorkspaces: false,
    canManageTeam: false,
    canManageBilling: false,
    canAccessBackoffice: false,
    isReadOnly: true,
  },
};

export function normalizeRole(role?: string | null): UserRole {
  if (role === 'super_admin' || role === 'admin' || role === 'campaign_manager' || role === 'viewer') {
    return role;
  }
  return 'admin';
}

export function canAccessTab(role: UserRole | undefined | null, tab: string): boolean {
  const effectiveRole = normalizeRole(role);
  return ROLE_PERMISSIONS[effectiveRole].allowedTabs.includes(tab as AppTab);
}

export function getDefaultTabForRole(role?: UserRole | string | null): AppTab {
  return normalizeRole(role) === 'super_admin' ? 'backoffice' : 'campaigns';
}

export interface PlanConfig {
  id: WorkspacePlan;
  name: string;
  monthlyPriceUsd: number;
  maxAccounts: number;
  maxLeads: number;
  credits: number;
}

export const SAAS_PLANS: Record<WorkspacePlan, PlanConfig> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPriceUsd: 39,
    maxAccounts: 3,
    maxLeads: 1000,
    credits: 1000,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthlyPriceUsd: 79,
    maxAccounts: 10,
    maxLeads: 10000,
    credits: 2500,
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    monthlyPriceUsd: 149,
    maxAccounts: 999,
    maxLeads: 50000,
    credits: 15000,
  },
};

export function normalizePlan(plan?: string | null): WorkspacePlan {
  if (plan === 'starter' || plan === 'growth' || plan === 'agency') {
    return plan;
  }
  return 'growth';
}

export function getPlanConfig(plan?: string | null): PlanConfig {
  return SAAS_PLANS[normalizePlan(plan)];
}

export interface Workspace {
  id: string;
  name: string;
  clientName: string;
  credits: number;
  agencyId?: string;
  ownerId?: string;
  ownerEmail?: string;
  plan?: WorkspacePlan;
  subscriptionStatus?: SubscriptionStatus;
  trialEndsAt?: string;
  maxAccounts?: number;
  maxLeads?: number;
  billingProvider?: string;
  billingSubscriptionId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SequenceStep {
  id: string;
  stepNumber: number;
  waitDays: number;
  variants: StepVariant[];
}

export interface StepVariant {
  id: string;
  name: string;
  subject: string;
  body: string;
  distributionWeight?: number; // percentage weight for A/Z testing
}

export interface CampaignSchedule {
  timing: {
    from: string;
    to: string;
  };
  days: number[]; // 0: Sun, 1: Mon, etc.
  timezone: string;
  dailyLimit: number;
  strategy: 'office-hours' | 'anytime' | 'outside-office-hours' | 'custom';
}

export interface CampaignStats {
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  opportunities: number;
}

export interface CampaignOptions {
  stopOnReply: boolean;
  stopOnDomainReply: boolean;
  plainTextMode: boolean;
  openTracking: boolean;
  clickTracking: boolean;
}

export interface Campaign {
  id: string;
  workspaceId?: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  steps: SequenceStep[];
  schedule: CampaignSchedule;
  senderAccountIds: string[];
  openTracking: boolean;
  clickTracking: boolean;
  options?: CampaignOptions;
  stats: CampaignStats;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus = 'pending' | 'sent' | 'opened' | 'replied' | 'bounced' | 'unsubscribed' | 'completed';

export interface Lead {
  id: string;
  workspaceId?: string;
  campaignId: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  website?: string;
  title?: string;
  customVariables?: Record<string, string>;
  status: LeadStatus;
  currentStep: number;
  lastContactedAt?: string;
}

export interface DnsCheckItem {
  type: 'SPF' | 'DKIM' | 'DMARC' | 'MX' | 'CTD';
  expected: string;
  current: string;
  valid: boolean;
  description: string;
}

export interface SenderAccount {
  id: string;
  workspaceId?: string;
  name: string;
  email: string;
  provider?: 'google' | 'microsoft' | 'smtp';
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  dailyLimit: number;
  sentToday: number;
  status: 'active' | 'warmup' | 'error';
  // Warmup & DNS fields as specified in functional doc
  warmupEnabled?: boolean;
  warmupToday?: number;
  warmupTotal?: number;
  warmupRescueRate?: number; // e.g. 98%
  healthScore?: number; // 0 - 100%
  dnsChecks?: DnsCheckItem[];
}

export type AiSentimentTag =
  | 'interested'
  | 'meeting-booked'
  | 'not-interested'
  | 'out-of-office'
  | 'wrong-person';

export interface EmailMessage {
  id: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  timestamp: string;
  isIncoming: boolean;
}

export interface EmailThread {
  id: string;
  workspaceId?: string;
  campaignId: string;
  leadId: string;
  leadName: string;
  leadEmail: string;
  companyName: string;
  sentiment: AiSentimentTag;
  unread: boolean;
  lastMessageSnippet: string;
  lastActivityAt: string;
  senderAccountId: string;
  messages: EmailMessage[];
}

export type DealStage = 'positive' | 'demo' | 'proposal' | 'won' | 'lost';

export interface Deal {
  id: string;
  workspaceId?: string;
  leadId: string;
  contactName: string;
  contactEmail: string;
  companyName: string;
  title: string;
  stage: DealStage;
  value: number; // currency amount in USD
  daysInactive: number;
  createdAt: string;
}

export interface ActionApproval {
  id: string;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  approval?: ActionApproval;
  toolResults?: {
    toolName: string;
    result: unknown;
  }[];
}

export interface BlocklistItem {
  id: string;
  workspaceId?: string;
  type: 'email' | 'domain';
  value: string;
  reason: 'unsubscribed' | 'bounced' | 'manual' | 'spam_complaint';
  createdAt: string;
}

export interface WebhookItem {
  id: string;
  workspaceId?: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  secret?: string;
  createdAt: string;
}

export interface WarmupLog {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  subject: string;
  status: 'sent' | 'opened' | 'replied' | 'failed';
  createdAt: string;
}

export interface EmailVerificationResult {
  email: string;
  isValid: boolean;
  score: number; // 0 to 100
  syntaxValid: boolean;
  domain: string;
  hasMx: boolean;
  mxRecords?: string[];
  isDisposable: boolean;
  reason: string;
}

export interface DnsAuditResult {
  domain: string;
  spf: { valid: boolean; record?: string; details: string };
  dmarc: { valid: boolean; record?: string; details: string };
  dkim: { valid: boolean; selector?: string; details: string };
  mx: { valid: boolean; records: string[]; details: string };
  ctd: { valid: boolean; details: string };
  overallHealth: number; // 0 to 100
}
