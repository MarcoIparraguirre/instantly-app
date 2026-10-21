import { JsonStorageDriver, IJsonStorageDriver } from './storage/JsonDriver';
import {
  ICampaignRepository,
  ILeadRepository,
  IAccountRepository,
  ICopilotRepository
} from './interfaces/storage';
import { CampaignRepository } from './storage/CampaignRepository';
import { LeadRepository } from './storage/LeadRepository';
import { AccountRepository } from './storage/AccountRepository';
import { CopilotRepository } from './storage/CopilotRepository';

import { SupabaseCampaignRepository } from './storage/supabase/SupabaseCampaignRepository';
import { SupabaseLeadRepository } from './storage/supabase/SupabaseLeadRepository';
import { SupabaseAccountRepository } from './storage/supabase/SupabaseAccountRepository';
import { SupabaseCopilotRepository } from './storage/supabase/SupabaseCopilotRepository';

import { ITemplateRenderer, TemplateRenderer } from './services/TemplateRenderer';
import { ISpintaxService, SpintaxService } from './services/SpintaxService';
import { ISpamDetectorService, SpamDetectorService } from './services/SpamDetectorService';
import { IAccountRotator, RoundRobinAccountRotator } from './services/AccountRotator';

import { IMailer } from './mailers/interfaces';
import { SmtpMailer } from './mailers/SmtpMailer';
import { SimulatedMailer } from './mailers/SimulatedMailer';

import { ICampaignDispatcher, CampaignDispatcher } from './services/CampaignDispatcher';
import { CopilotActionRegistry } from './copilot/CopilotActionRegistry';
import {
  ActivateCampaignAction,
  PauseCampaignAction,
  ApplySpamFixesAction,
  ApplySpintaxAction,
  RemoveStepAction,
  ScheduleStrategyAction
} from './copilot/actions';
import { CopilotService } from './copilot/CopilotService';

export interface AppContainer {
  storageDriver: IJsonStorageDriver;
  campaignRepo: ICampaignRepository;
  leadRepo: ILeadRepository;
  accountRepo: IAccountRepository;
  copilotRepo: ICopilotRepository;
  templateRenderer: ITemplateRenderer;
  spintaxService: ISpintaxService;
  spamDetector: ISpamDetectorService;
  accountRotator: IAccountRotator;
  smtpMailer: IMailer;
  simulatedMailer: IMailer;
  dispatcher: ICampaignDispatcher;
  copilotRegistry: CopilotActionRegistry;
  copilotService: CopilotService;
}

export function createContainer(customDriver?: IJsonStorageDriver): AppContainer {
  const storageDriver = customDriver || new JsonStorageDriver();

  const isSupabaseConfigured = Boolean(
    !customDriver &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const campaignRepo: ICampaignRepository = isSupabaseConfigured
    ? new SupabaseCampaignRepository()
    : new CampaignRepository(storageDriver);

  const leadRepo: ILeadRepository = isSupabaseConfigured
    ? new SupabaseLeadRepository()
    : new LeadRepository(storageDriver);

  const accountRepo: IAccountRepository = isSupabaseConfigured
    ? new SupabaseAccountRepository()
    : new AccountRepository(storageDriver);

  const copilotRepo: ICopilotRepository = isSupabaseConfigured
    ? new SupabaseCopilotRepository()
    : new CopilotRepository(storageDriver);

  const templateRenderer = new TemplateRenderer();
  const spintaxService = new SpintaxService();
  const spamDetector = new SpamDetectorService();
  const accountRotator = new RoundRobinAccountRotator();

  const smtpMailer = new SmtpMailer();
  const simulatedMailer = new SimulatedMailer();

  const dispatcher = new CampaignDispatcher(
    campaignRepo,
    leadRepo,
    accountRepo,
    templateRenderer,
    spintaxService,
    accountRotator,
    smtpMailer,
    simulatedMailer
  );

  const copilotRegistry = new CopilotActionRegistry();
  copilotRegistry
    .register(new ActivateCampaignAction())
    .register(new PauseCampaignAction())
    .register(new ApplySpamFixesAction(spamDetector))
    .register(new ApplySpintaxAction(spintaxService))
    .register(new RemoveStepAction())
    .register(new ScheduleStrategyAction());

  const copilotService = new CopilotService(
    campaignRepo,
    leadRepo,
    accountRepo,
    spamDetector,
    copilotRegistry
  );

  return {
    storageDriver,
    campaignRepo,
    leadRepo,
    accountRepo,
    copilotRepo,
    templateRenderer,
    spintaxService,
    spamDetector,
    accountRotator,
    smtpMailer,
    simulatedMailer,
    dispatcher,
    copilotRegistry,
    copilotService
  };
}

// Global default singleton instance
export const container = createContainer();
