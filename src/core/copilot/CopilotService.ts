import { v4 as uuidv4 } from 'uuid';
import { ActionApproval, Campaign, SequenceStep } from '@/types';
import { ICampaignRepository, ILeadRepository, IAccountRepository } from '../interfaces/storage';
import { ISpamDetectorService } from '../services/SpamDetectorService';
import { CopilotActionRegistry } from './CopilotActionRegistry';

export interface CopilotChatInput {
  message?: string;
  campaignId?: string;
  actionApproval?: ActionApproval;
  language?: 'en' | 'es';
}

export interface CopilotChatOutput {
  reply: string;
  approval?: ActionApproval;
  toolResult?: any;
  updatedCampaign: Campaign;
}

export class CopilotService {
  constructor(
    private campaignRepo: ICampaignRepository,
    private leadRepo: ILeadRepository,
    private accountRepo: IAccountRepository,
    private spamDetector: ISpamDetectorService,
    private registry: CopilotActionRegistry
  ) {}

  async process(input: CopilotChatInput): Promise<CopilotChatOutput> {
    const { message, campaignId, actionApproval } = input;
    const campaign = campaignId
      ? await this.campaignRepo.getCampaignById(campaignId)
      : (await this.campaignRepo.getCampaigns())[0];

    if (!campaign) {
      throw new Error('No campaign found');
    }

    // 1. Handle Human-in-the-loop Action Approval
    if (actionApproval) {
      const { toolName, parameters, status } = actionApproval;
      if (status === 'approved') {
        const result = await this.registry.execute(toolName, parameters || {}, campaign);
        await this.campaignRepo.saveCampaign(result.updatedCampaign);
        return {
          reply: result.reply,
          updatedCampaign: result.updatedCampaign
        };
      } else {
        return {
          reply: `Action **${toolName}** was cancelled by the user.`,
          updatedCampaign: campaign
        };
      }
    }

    // 2. Intelligent Outbound Copilot Reasoner
    const rawText = message || '';
    const userText = rawText.toLowerCase();

    // Detect Spanish intent
    const isSpanish =
      input.language === 'es' ||
      userText.includes('crea') ||
      userText.includes('secuencia') ||
      userText.includes('campaña') ||
      userText.includes('escanear') ||
      userText.includes('revisar') ||
      userText.includes('activar') ||
      userText.includes('pausar') ||
      userText.includes('salud') ||
      userText.includes('hola') ||
      userText.includes('gratis');

    let reply = '';
    let approval: ActionApproval | undefined;

    // A. Deliverability & Spam Analysis
    if (
      userText.includes('spam') ||
      userText.includes('deliverability') ||
      userText.includes('revisar') ||
      userText.includes('escanear') ||
      userText.includes('auditoría') ||
      userText.includes('audit')
    ) {
      const allSpamMatches: { step: number; word: string; replacement: string }[] = [];
      campaign.steps.forEach((step, idx) => {
        step.variants.forEach(variant => {
          const subMatches = this.spamDetector.check(variant.subject, isSpanish ? 'es' : 'all');
          const bodyMatches = this.spamDetector.check(variant.body, isSpanish ? 'es' : 'all');
          [...subMatches, ...bodyMatches].forEach(m => {
            allSpamMatches.push({ step: idx + 1, word: m.word, replacement: m.replacement });
          });
        });
      });

      if (allSpamMatches.length > 0) {
        if (isSpanish) {
          reply = `🔍 **Resultado de la Auditoría de Entregabilidad:**\n\nSe detectaron **${allSpamMatches.length}** palabras que podrían activar filtros anti-spam:\n` +
            allSpamMatches.map(m => `• Paso ${m.step}: \`${m.word}\` ➔ Sugerencia: \`${m.replacement}\``).join('\n') +
            `\n\n¿Deseas que reemplace automáticamente estas palabras por alternativas seguras?`;

          approval = {
            id: uuidv4(),
            toolName: 'applyCampaignSpamWordFixes',
            description: `Reemplazar ${allSpamMatches.length} palabras detectadas en todos los pasos de la secuencia`,
            parameters: {},
            status: 'pending'
          };
        } else {
          reply = `🔍 **Deliverability Audit Result:**\n\nFound **${allSpamMatches.length}** risky words that could hurt your inbox placement:\n` +
            allSpamMatches.map(m => `• Step ${m.step}: \`${m.word}\` ➔ Suggestion: \`${m.replacement}\``).join('\n') +
            `\n\nWould you like me to automatically replace these with deliverability-friendly alternatives?`;

          approval = {
            id: uuidv4(),
            toolName: 'applyCampaignSpamWordFixes',
            description: `Replace ${allSpamMatches.length} detected spam words across all sequence steps`,
            parameters: {},
            status: 'pending'
          };
        }
      } else {
        reply = isSpanish
          ? `✅ **¡Excelente!** No se detectaron palabras de riesgo spam en la secuencia. ¡Tu tasa de entregabilidad está protegida!`
          : `✅ **Great news!** No spam trigger words were detected in your sequence. Your deliverability score is in great shape!`;
      }
    }

    // B. Generate Campaign Sequence
    else if (
      userText.includes('generate') ||
      userText.includes('crea') ||
      userText.includes('secuencia') ||
      userText.includes('sequence') ||
      userText.includes('campaña') ||
      userText.includes('campaign')
    ) {
      if (isSpanish) {
        campaign.steps = [
          {
            id: uuidv4(),
            stepNumber: 1,
            waitDays: 0,
            variants: [
              {
                id: uuidv4(),
                name: 'Variante A',
                subject: 'Consulta breve sobre {{companyName}}',
                body: 'Hola {{firstName}},\n\nVi que en {{companyName}} están buscando optimizar la captación B2B. Hace poco ayudamos a una empresa similar a generar más de 35 reuniones cualificadas al mes gracias a secuencias personalizadas.\n\n¿Tendrías 5 minutos este jueves para ver cómo lo hicimos?\n\nUn saludo,\nAlex'
              }
            ]
          },
          {
            id: uuidv4(),
            stepNumber: 2,
            waitDays: 3,
            variants: [
              {
                id: uuidv4(),
                name: 'Variante A',
                subject: 'Re: Consulta breve sobre {{companyName}}',
                body: 'Hola {{firstName}},\n\nTe escribo brevemente por si se te pasó mi correo anterior.\n\n¿Te interesaría que te comparta un resumen de 2 minutos sobre cómo lo implementamos para {{companyName}}?\n\nSaludos,\nAlex'
              }
            ]
          },
          {
            id: uuidv4(),
            stepNumber: 3,
            waitDays: 4,
            variants: [
              {
                id: uuidv4(),
                name: 'Variante A',
                subject: 'Último intento: {{companyName}}',
                body: 'Hola {{firstName}},\n\nEntiendo que estás con muchas prioridades. No quiero insistir de más si no es el momento adecuado.\n\nSi te interesa explorarlo más adelante, házmelo saber.\n\nUn abrazo,\nAlex'
              }
            ]
          }
        ];
        reply = `✨ **Secuencia de 3 pasos generada para "${campaign.name}"**:\n\n1. **Paso 1:** Email de presentación enfocado en valor y prueba social.\n2. **Paso 2 (+3 días):** Follow-up suave con recurso de 2 minutos.\n3. **Paso 3 (+4 días):** Break-up email respetuoso y directo.\n\nEl editor ya ha sido actualizado con los nuevos pasos.`;
      } else {
        campaign.steps = [
          {
            id: uuidv4(),
            stepNumber: 1,
            waitDays: 0,
            variants: [
              {
                id: uuidv4(),
                name: 'Variant A',
                subject: 'Quick question regarding {{companyName}}',
                body: 'Hi {{firstName}},\n\nNoticed {{companyName}} is scaling operations. We recently helped a team in your space book 40+ sales calls last month by optimizing outreach deliverability.\n\nWould you be open to a 5-minute chat next Tuesday?\n\nBest,\nAlex'
              }
            ]
          },
          {
            id: uuidv4(),
            stepNumber: 2,
            waitDays: 3,
            variants: [
              {
                id: uuidv4(),
                name: 'Variant A',
                subject: 'Re: Quick question regarding {{companyName}}',
                body: 'Hi {{firstName}},\n\nFollowing up briefly in case my note got buried.\n\nWould it make sense to connect for 5 minutes this week?\n\nBest,\nAlex'
              }
            ]
          },
          {
            id: uuidv4(),
            stepNumber: 3,
            waitDays: 4,
            variants: [
              {
                id: uuidv4(),
                name: 'Variant A',
                subject: 'Closing the loop on {{companyName}}',
                body: 'Hi {{firstName}},\n\nAssuming timing isn\'t ideal right now. I won\'t clutter your inbox further.\n\nFeel free to reach out if this ever becomes a priority down the line.\n\nBest,\nAlex'
              }
            ]
          }
        ];
        reply = `✨ **Generated complete 3-step outbound sequence for "${campaign.name}"**:\n\n1. **Step 1:** Initial curiosity & value proposition.\n2. **Step 2 (+3 days):** Gentle follow-up referencing previous email.\n3. **Step 3 (+4 days):** Respectful break-up email.\n\nThe campaign editor has been updated with these steps!`;
      }
      this.campaignRepo.saveCampaign(campaign);
    }

    // C. Spintax variations
    else if (userText.includes('spintax') || userText.includes('variaciones') || userText.includes('variations')) {
      reply = isSpanish
        ? `Puedo aplicar Spintax en el Paso 1 para que cada prospecto reciba una variación personalizada, maximizando la entregabilidad.`
        : `I can apply Spintax to Step 1 so that every lead receives a unique variation, improving deliverability.`;

      approval = {
        id: uuidv4(),
        toolName: 'applyCampaignBodySpintax',
        description: isSpanish
          ? `Aplicar Spintax al contenido del Paso 1 en español`
          : `Apply Spintax {Hi|Hello|Hey} to Step 1 body`,
        parameters: { stepIndex: 0, language: isSpanish ? 'es' : 'en' },
        status: 'pending'
      };
    }

    // D. Activate or Pause Campaign
    else if (userText.includes('activate') || userText.includes('activar') || userText.includes('lanzar')) {
      reply = isSpanish
        ? `¿Confirmas que deseas activar la campaña **"${campaign.name}"**? Se iniciará el envío automático a tus prospectos en el horario configurado.`
        : `Are you sure you want to activate campaign **"${campaign.name}"**? Once activated, it will begin scheduling emails to pending leads during your sending window.`;

      approval = {
        id: uuidv4(),
        toolName: 'activateCampaign',
        description: isSpanish ? `Activar campaña "${campaign.name}"` : `Activate campaign "${campaign.name}"`,
        parameters: {},
        status: 'pending'
      };
    } else if (userText.includes('pause') || userText.includes('pausar') || userText.includes('detener')) {
      reply = isSpanish
        ? `¿Deseas pausar la campaña **"${campaign.name}"**? Los envíos programados se detendrán hasta que decidas reanudarla.`
        : `Do you want to pause campaign **"${campaign.name}"**? Scheduled emails will be held until resumed.`;

      approval = {
        id: uuidv4(),
        toolName: 'pauseCampaign',
        description: isSpanish ? `Pausar campaña "${campaign.name}"` : `Pause campaign "${campaign.name}"`,
        parameters: {},
        status: 'pending'
      };
    }

    // E. Health & Deliverability Diagnostics
    else if (
      userText.includes('diagnose') ||
      userText.includes('diagnostico') ||
      userText.includes('diagnóstico') ||
      userText.includes('health') ||
      userText.includes('salud')
    ) {
      const leads = await this.leadRepo.getLeads(campaign.id);
      const accounts = await this.accountRepo.getAccounts();
      const pendingLeads = leads.filter(l => l.status === 'pending').length;

      if (isSpanish) {
        reply = `📊 **Diagnóstico de Salud de la Campaña:**\n` +
          `• **Estado:** ${campaign.status.toUpperCase()}\n` +
          `• **Pasos:** ${campaign.steps.length} pasos configurados\n` +
          `• **Prospectos:** ${leads.length} totales (${pendingLeads} listos para envío)\n` +
          `• **Buzones Conectados:** ${accounts.length} cuentas de envío activas\n` +
          `• **Ventana de Envío:** ${campaign.schedule.timing.from} - ${campaign.schedule.timing.to} (${campaign.schedule.timezone})\n` +
          (pendingLeads === 0
            ? `⚠️ *Nota: No hay prospectos pendientes. Importa una lista para comenzar el envío.*`
            : `✅ *¡Todo listo para comenzar la secuencia de prospección!*`);
      } else {
        reply = `📊 **Campaign Health Diagnostics:**\n` +
          `• **Status:** ${campaign.status.toUpperCase()}\n` +
          `• **Steps:** ${campaign.steps.length} steps configured\n` +
          `• **Leads:** ${leads.length} total (${pendingLeads} ready to send)\n` +
          `• **Mailboxes Connected:** ${accounts.length} sending accounts\n` +
          `• **Sending Window:** ${campaign.schedule.timing.from} - ${campaign.schedule.timing.to} (${campaign.schedule.timezone})\n` +
          (pendingLeads === 0
            ? `⚠️ *Notice: No pending leads available. Import leads to start sending.*`
            : `✅ *Ready for outbound dispatch!*`);
      }
    }

    // F. Fallback / Overview
    else {
      if (isSpanish) {
        reply = `¡Hola! Soy tu **Copilot de MiSender**. Aquí tienes algunas acciones que puedo realizar por ti:\n\n` +
          `1. *"Ayúdame a crear una secuencia completa de prospección"*\n` +
          `2. *"Revisar palabras de spam en esta campaña"*\n` +
          `3. *"Aplicar variaciones spintax para evitar filtros"*\n` +
          `4. *"Diagnóstico de salud y entregabilidad"*\n` +
          `5. *"Activar o pausar la campaña"*`;
      } else {
        reply = `I'm your **MiSender Copilot**. Here are some things I can do for you right now:\n\n` +
          `1. *"Help me create a complete cold email sequence"*\n` +
          `2. *"Check this campaign for spam words"*\n` +
          `3. *"Apply spintax to prevent spam filters"*\n` +
          `4. *"Diagnose campaign health & deliverability"*\n` +
          `5. *"Activate / Pause this campaign"*`;
      }
    }

    return {
      reply,
      approval,
      updatedCampaign: campaign
    };
  }
}
