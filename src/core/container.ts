import { JsonStorageDriver, IJsonStorageDriver } from './storage/JsonDriver';
import {
  ICampaignRepository,
  ILeadRepository,
  IAccountRepository,
  ICopilotRepository,
  IDealRepository,
  IBlocklistRepository,
  IWebhookRepository,
  IWarmupRepository,
  IThreadRepository
} from './interfaces/storage';
import { CampaignRepository } from './storage/CampaignRepository';
import { LeadRepository } from './storage/LeadRepository';
import { AccountRepository } from './storage/AccountRepository';
import { CopilotRepository } from './storage/CopilotRepository';
import { DealRepository } from './storage/DealRepository';
import { BlocklistRepository } from './storage/BlocklistRepository';
import { WebhookRepository } from './storage/WebhookRepository';
import { WarmupRepository } from './storage/WarmupRepository';
import { ThreadRepository } from './storage/ThreadRepository';

import { SupabaseCampaignRepository } from './storage/supabase/SupabaseCampaignRepository';
import { SupabaseLeadRepository } from './storage/supabase/SupabaseLeadRepository';
import { SupabaseAccountRepository } from './storage/supabase/SupabaseAccountRepository';
import { SupabaseCopilotRepository } from './storage/supabase/SupabaseCopilotRepository';
import { SupabaseDealRepository } from './storage/supabase/SupabaseDealRepository';
import { SupabaseBlocklistRepository } from './storage/supabase/SupabaseBlocklistRepository';
import { SupabaseWebhookRepository } from './storage/supabase/SupabaseWebhookRepository';
import { SupabaseWarmupRepository } from './storage/supabase/SupabaseWarmupRepository';
import { SupabaseThreadRepository } from './storage/supabase/SupabaseThreadRepository';

import { ITemplateRenderer, TemplateRenderer } from './services/TemplateRenderer';
import { ISpintaxService, SpintaxService } from './services/SpintaxService';
import { ISpamDetectorService, SpamDetectorService } from './services/SpamDetectorService';
import { IAccountRotator, RoundRobinAccountRotator } from './services/AccountRotator';
import { DnsCheckerService } from './services/DnsCheckerService';
import { EmailVerifierService } from './services/EmailVerifierService';
import { WebhookDispatcherService } from './services/WebhookDispatcherService';
import { InternalWarmupService } from './services/InternalWarmupService';
import { UniboxClassifierService } from './services/UniboxClassifierService';
import { PlacementTestService } from './services/PlacementTestService';
import { DeliverabilityGuardService } from './services/DeliverabilityGuardService';
import { AiOutreachService } from './services/AiOutreachService';
import { LeadEnrichmentService } from './services/LeadEnrichmentService';
import { MultichannelDispatcherService } from './services/MultichannelDispatcherService';
import { DnsWizardService } from './services/DnsWizardService';

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
  dealRepo: IDealRepository;
  blocklistRepo: IBlocklistRepository;
  webhookRepo: IWebhookRepository;
  warmupRepo: IWarmupRepository;
  threadRepo: IThreadRepository;
  templateRenderer: ITemplateRenderer;
  spintaxService: ISpintaxService;
  spamDetector: ISpamDetectorService;
  accountRotator: IAccountRotator;
  dnsChecker: DnsCheckerService;
  emailVerifier: EmailVerifierService;
  webhookDispatcher: WebhookDispatcherService;
  warmupService: InternalWarmupService;
  uniboxClassifier: UniboxClassifierService;
  placementTester: PlacementTestService;
  deliverabilityGuard: DeliverabilityGuardService;
  aiOutreach: AiOutreachService;
  leadEnrichment: LeadEnrichmentService;
  multichannelDispatcher: MultichannelDispatcherService;
  dnsWizard: DnsWizardService;
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

  const dealRepo: IDealRepository = isSupabaseConfigured
    ? new SupabaseDealRepository()
    : new DealRepository(storageDriver);

  const blocklistRepo: IBlocklistRepository = isSupabaseConfigured
    ? new SupabaseBlocklistRepository()
    : new BlocklistRepository(storageDriver);

  const webhookRepo: IWebhookRepository = isSupabaseConfigured
    ? new SupabaseWebhookRepository()
    : new WebhookRepository(storageDriver);

  const warmupRepo: IWarmupRepository = isSupabaseConfigured
    ? new SupabaseWarmupRepository()
    : new WarmupRepository(storageDriver);

  const threadRepo: IThreadRepository = isSupabaseConfigured
    ? new SupabaseThreadRepository()
    : new ThreadRepository(storageDriver);

  const templateRenderer = new TemplateRenderer();
  const spintaxService = new SpintaxService();
  const spamDetector = new SpamDetectorService();
  const accountRotator = new RoundRobinAccountRotator();
  const dnsChecker = new DnsCheckerService();
  const emailVerifier = new EmailVerifierService();
  const webhookDispatcher = new WebhookDispatcherService(webhookRepo);
  const uniboxClassifier = new UniboxClassifierService(dealRepo);
  const placementTester = new PlacementTestService();
  const deliverabilityGuard = new DeliverabilityGuardService(
    accountRepo,
    dnsChecker,
    webhookDispatcher
  );
  const aiOutreach = new AiOutreachService();
  const leadEnrichment = new LeadEnrichmentService(emailVerifier);
  const multichannelDispatcher = new MultichannelDispatcherService(
    templateRenderer,
    spintaxService
  );
  const dnsWizard = new DnsWizardService(dnsChecker);

  const smtpMailer = new SmtpMailer();
  const simulatedMailer = new SimulatedMailer();

  const warmupService = new InternalWarmupService(
    accountRepo,
    warmupRepo,
    smtpMailer,
    simulatedMailer
  );

  const dispatcher = new CampaignDispatcher(
    campaignRepo,
    leadRepo,
    accountRepo,
    templateRenderer,
    spintaxService,
    accountRotator,
    smtpMailer,
    simulatedMailer,
    blocklistRepo,
    webhookDispatcher
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
    dealRepo,
    blocklistRepo,
    webhookRepo,
    warmupRepo,
    threadRepo,
    templateRenderer,
    spintaxService,
    spamDetector,
    accountRotator,
    dnsChecker,
    emailVerifier,
    webhookDispatcher,
    warmupService,
    uniboxClassifier,
    placementTester,
    deliverabilityGuard,
    aiOutreach,
    leadEnrichment,
    multichannelDispatcher,
    dnsWizard,
    smtpMailer,
    simulatedMailer,
    dispatcher,
    copilotRegistry,
    copilotService
  };
}

// Global default singleton instance
export const container = createContainer();
