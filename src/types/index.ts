export interface Workspace {
  id: string;
  name: string;
  clientName: string;
  credits: number;
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
  parameters: any;
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
    result: any;
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
