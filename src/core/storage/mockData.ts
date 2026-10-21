import { Workspace, B2BLead, EmailThread, Deal, SenderAccount } from '@/types';

export const initialWorkspaces: Workspace[] = [
  { id: 'ws-primary', name: 'Primary Growth Workspace', clientName: 'Internal SaaS', credits: 2500 },
  { id: 'ws-agency-1', name: 'FinTech Labs Outbound', clientName: 'Client: FinTech Labs', credits: 1200 },
  { id: 'ws-agency-2', name: 'HyperScale Cloud Expansion', clientName: 'Client: HyperScale Cloud', credits: 850 },
];

export const initialB2BLeads: B2BLead[] = [
  {
    id: 'b2b-1',
    firstName: 'Marcus',
    lastName: 'Vance',
    title: 'VP of Sales & Revenue Operations',
    companyName: 'CloudMatrix Analytics',
    industry: 'Software & SaaS',
    headcount: '51-200',
    location: 'San Francisco, CA, USA',
    domain: 'cloudmatrix.io',
    email: 'marcus.vance@cloudmatrix.io',
    verified: true,
    techStack: ['HubSpot', 'Salesforce', 'Segment', 'Stripe'],
    linkedinUrl: 'https://linkedin.com/in/demo-marcus'
  },
  {
    id: 'b2b-2',
    firstName: 'Elena',
    lastName: 'Rostova',
    title: 'Head of Outbound Demand Gen',
    companyName: 'FinNova Technologies',
    industry: 'Financial Technology',
    headcount: '201-500',
    location: 'London, United Kingdom',
    domain: 'finnova.tech',
    email: 'elena.r@finnova.tech',
    verified: true,
    techStack: ['GSuite', 'Outreach', 'Snowflake'],
    linkedinUrl: 'https://linkedin.com/in/demo-elena'
  },
  {
    id: 'b2b-3',
    firstName: 'Santiago',
    lastName: 'Morales',
    title: 'Founder & Chief Commercial Officer',
    companyName: 'Iberia Logistics Global',
    industry: 'E-Commerce & Retail',
    headcount: '11-50',
    location: 'Madrid, Spain',
    domain: 'iberialogistics.es',
    email: 'smorales@iberialogistics.es',
    verified: true,
    techStack: ['Shopify Plus', 'Google Workspace', 'PostgreSQL'],
    linkedinUrl: 'https://linkedin.com/in/demo-santiago'
  },
  {
    id: 'b2b-4',
    firstName: 'Claire',
    lastName: 'Dupont',
    title: 'Director of B2B Partnerships',
    companyName: 'BioHealth Therapeutics',
    industry: 'Healthcare & Biotech',
    headcount: '500+',
    location: 'Paris, France',
    domain: 'biohealth.fr',
    email: 'c.dupont@biohealth.fr',
    verified: true,
    techStack: ['Microsoft 365', 'Marketo', 'ZoomInfo'],
    linkedinUrl: 'https://linkedin.com/in/demo-claire'
  },
  {
    id: 'b2b-5',
    firstName: 'David',
    lastName: 'Kim',
    title: 'Chief Revenue Officer (CRO)',
    companyName: 'NextWave AI Platform',
    industry: 'Software & SaaS',
    headcount: '51-200',
    location: 'Austin, TX, USA',
    domain: 'nextwave.ai',
    email: 'david@nextwave.ai',
    verified: true,
    techStack: ['Instantly.ai', 'Supabase', 'Next.js', 'Postmark'],
    linkedinUrl: 'https://linkedin.com/in/demo-david'
  }
];

export const initialEmailAccountsWithWarmup: SenderAccount[] = [
  {
    id: 'acc-1',
    name: 'Growth Outreach Mailbox 1',
    email: 'alex.morgan@growthpilot.io',
    provider: 'google',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: 'alex.morgan@growthpilot.io',
    smtpPass: 'demo-app-pass',
    dailyLimit: 50,
    sentToday: 18,
    status: 'active',
    warmupEnabled: true,
    warmupToday: 24,
    warmupTotal: 640,
    warmupRescueRate: 98.5,
    healthScore: 98,
    dnsChecks: [
      { type: 'SPF', expected: 'v=spf1 include:_spf.google.com ~all', current: 'v=spf1 include:_spf.google.com ~all', valid: true, description: 'Authorizes mail server to send on behalf of domain.' },
      { type: 'DKIM', expected: 'google._domainkey.growthpilot.io (2048-bit RSA)', current: 'google._domainkey.growthpilot.io', valid: true, description: 'Cryptographic signature proving message integrity.' },
      { type: 'DMARC', expected: 'v=DMARC1; p=quarantine; pct=100', current: 'v=DMARC1; p=quarantine', valid: true, description: 'Policy telling receiving servers how to handle non-aligned emails.' },
      { type: 'MX', expected: 'ASPMX.L.GOOGLE.COM (Priority 1)', current: 'ASPMX.L.GOOGLE.COM', valid: true, description: 'Directs incoming emails to mail servers.' },
      { type: 'CTD', expected: 'inst.growthpilot.io CNAME prox.instantly.ai', current: 'inst.growthpilot.io CNAME prox.instantly.ai', valid: true, description: 'Custom Tracking Domain isolates open/click tracking from main brand domain.' }
    ]
  },
  {
    id: 'acc-2',
    name: 'Sales Direct Mailbox 2',
    email: 'outbound@growthpilot-team.com',
    provider: 'microsoft',
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpUser: 'outbound@growthpilot-team.com',
    smtpPass: 'demo-app-pass',
    dailyLimit: 40,
    sentToday: 12,
    status: 'active',
    warmupEnabled: true,
    warmupToday: 16,
    warmupTotal: 410,
    warmupRescueRate: 96.0,
    healthScore: 94,
    dnsChecks: [
      { type: 'SPF', expected: 'v=spf1 include:spf.protection.outlook.com -all', current: 'v=spf1 include:spf.protection.outlook.com -all', valid: true, description: 'Microsoft 365 SPF validation.' },
      { type: 'DKIM', expected: 'selector1._domainkey.growthpilot-team.com', current: 'selector1._domainkey.growthpilot-team.com', valid: true, description: 'DKIM key 2048-bit verification.' },
      { type: 'DMARC', expected: 'v=DMARC1; p=reject', current: 'v=DMARC1; p=none', valid: false, description: 'Warning: DMARC policy is set to "none". Change to quarantine or reject.' },
      { type: 'MX', expected: 'growthpilotteam-com.mail.protection.outlook.com', current: 'growthpilotteam-com.mail.protection.outlook.com', valid: true, description: 'MX routing configured correctly.' },
      { type: 'CTD', expected: 'track.growthpilot-team.com CNAME prox.instantly.ai', current: 'track.growthpilot-team.com CNAME prox.instantly.ai', valid: true, description: 'Custom Tracking Domain active.' }
    ]
  }
];

export const initialUniboxThreads: EmailThread[] = [
  {
    id: 'thread-1',
    campaignId: 'campaign-1',
    leadId: 'b2b-1',
    leadName: 'Marcus Vance',
    leadEmail: 'marcus.vance@cloudmatrix.io',
    companyName: 'CloudMatrix Analytics',
    sentiment: 'interested',
    unread: true,
    lastMessageSnippet: 'Hi Alex, thanks for reaching out. We are actually evaluating cold outreach tools this quarter. Can you share pricing and demo slots for next Tuesday?',
    lastActivityAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(), // 35 min ago
    senderAccountId: 'acc-1',
    messages: [
      {
        id: 'msg-1',
        sender: 'alex.morgan@growthpilot.io',
        recipient: 'marcus.vance@cloudmatrix.io',
        subject: 'Quick question regarding CloudMatrix Analytics outbound scale',
        body: 'Hi Marcus,\n\nNoticed CloudMatrix Analytics is scaling sales operations. We recently helped a similar SaaS book 45 qualified sales meetings last month by optimizing deliverability and sequence timing.\n\nWould you be open to a 5-minute chat next Tuesday?\n\nBest,\nAlex',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
        isIncoming: false
      },
      {
        id: 'msg-2',
        sender: 'marcus.vance@cloudmatrix.io',
        recipient: 'alex.morgan@growthpilot.io',
        subject: 'Re: Quick question regarding CloudMatrix Analytics outbound scale',
        body: 'Hi Alex, thanks for reaching out. We are actually evaluating cold outreach tools this quarter. Can you share pricing and demo slots for next Tuesday?',
        timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        isIncoming: true
      }
    ]
  },
  {
    id: 'thread-2',
    campaignId: 'campaign-1',
    leadId: 'b2b-2',
    leadName: 'Elena Rostova',
    leadEmail: 'elena.r@finnova.tech',
    companyName: 'FinNova Technologies',
    sentiment: 'meeting-booked',
    unread: false,
    lastMessageSnippet: 'Great! Booked 10:30 AM via your calendar link. Looking forward to speaking with the team.',
    lastActivityAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(), // 3 hours ago
    senderAccountId: 'acc-1',
    messages: [
      {
        id: 'msg-3',
        sender: 'alex.morgan@growthpilot.io',
        recipient: 'elena.r@finnova.tech',
        subject: 'Deliverability review for FinNova Technologies',
        body: 'Hi Elena,\n\nReaching out to see if you have 5 minutes this week to discuss multi-inbox rotation.\n\nBest,\nAlex',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        isIncoming: false
      },
      {
        id: 'msg-4',
        sender: 'elena.r@finnova.tech',
        recipient: 'alex.morgan@growthpilot.io',
        subject: 'Re: Deliverability review for FinNova Technologies',
        body: 'Great! Booked 10:30 AM via your calendar link. Looking forward to speaking with the team.',
        timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        isIncoming: true
      }
    ]
  },
  {
    id: 'thread-3',
    campaignId: 'campaign-1',
    leadId: 'b2b-4',
    leadName: 'Claire Dupont',
    leadEmail: 'c.dupont@biohealth.fr',
    companyName: 'BioHealth Therapeutics',
    sentiment: 'out-of-office',
    unread: false,
    lastMessageSnippet: 'Automatic reply: I am currently out of the office attending BioTech Global 2026 until Friday.',
    lastActivityAt: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    senderAccountId: 'acc-2',
    messages: [
      {
        id: 'msg-5',
        sender: 'outbound@growthpilot-team.com',
        recipient: 'c.dupont@biohealth.fr',
        subject: 'Partnership inquiry for BioHealth Therapeutics',
        body: 'Bonjour Claire,\n\nWanted to check if you would be open to exploring potential synergy.\n\nBest,\nAlex',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
        isIncoming: false
      },
      {
        id: 'msg-6',
        sender: 'c.dupont@biohealth.fr',
        recipient: 'outbound@growthpilot-team.com',
        subject: 'Automatic reply: Partnership inquiry for BioHealth Therapeutics',
        body: 'Automatic reply: I am currently out of the office attending BioTech Global 2026 until Friday.',
        timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
        isIncoming: true
      }
    ]
  }
];

export const initialDeals: Deal[] = [
  {
    id: 'deal-1',
    leadId: 'b2b-1',
    contactName: 'Marcus Vance',
    contactEmail: 'marcus.vance@cloudmatrix.io',
    companyName: 'CloudMatrix Analytics',
    title: 'Enterprise Outbound 50 Seats License',
    stage: 'demo',
    value: 8500,
    daysInactive: 1,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString()
  },
  {
    id: 'deal-2',
    leadId: 'b2b-2',
    contactName: 'Elena Rostova',
    contactEmail: 'elena.r@finnova.tech',
    companyName: 'FinNova Technologies',
    title: 'FinNova Annual Growth Plan',
    stage: 'proposal',
    value: 14000,
    daysInactive: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString()
  },
  {
    id: 'deal-3',
    leadId: 'b2b-3',
    contactName: 'Santiago Morales',
    contactEmail: 'smorales@iberialogistics.es',
    companyName: 'Iberia Logistics Global',
    title: 'E-commerce Expansion Sequence',
    stage: 'positive',
    value: 4500,
    daysInactive: 5, // Warning: >4 days inactive!
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString()
  },
  {
    id: 'deal-4',
    leadId: 'b2b-5',
    contactName: 'David Kim',
    contactEmail: 'david@nextwave.ai',
    companyName: 'NextWave AI Platform',
    title: 'NextWave Agency Unlimited Seats',
    stage: 'won',
    value: 22000,
    daysInactive: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString()
  }
];
