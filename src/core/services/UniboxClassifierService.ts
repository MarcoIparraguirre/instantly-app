import { AiSentimentTag, Deal } from '@/types';
import { IDealRepository } from '../interfaces/storage';
import { v4 as uuidv4 } from 'uuid';

export interface ClassificationResult {
  sentiment: AiSentimentTag;
  confidence: number;
  summary: string;
  suggestedReply: string;
  autoCreatedDeal?: Deal;
}

export class UniboxClassifierService {
  constructor(private dealRepo?: IDealRepository) {}

  classify(subject: string, body: string, context?: {
    leadId?: string;
    leadName?: string;
    leadEmail?: string;
    companyName?: string;
  }): ClassificationResult {
    const text = `${subject} ${body}`.toLowerCase();

    // 1. Out of Office Detection
    if (
      text.includes('out of office') ||
      text.includes('fuera de la oficina') ||
      text.includes('automatic reply') ||
      text.includes('vacation') ||
      text.includes('vacaciones') ||
      text.includes('auto-reply')
    ) {
      return {
        sentiment: 'out-of-office',
        confidence: 0.95,
        summary: 'Respuesta automática de ausencia temporal (Out of office).',
        suggestedReply: '¡Gracias por avisar! Me pondré en contacto nuevamente a tu regreso.'
      };
    }

    // 2. Not Interested Detection (Check negations before positive triggers)
    if (
      text.includes('no me interesa') ||
      text.includes('no nos interesa') ||
      text.includes('no estoy interesado') ||
      text.includes('no estamos interesados') ||
      text.includes('no es de mi interés') ||
      text.includes('no es de nuestro interés') ||
      text.includes('cero interés') ||
      text.includes('not interested') ||
      text.includes('uninterested') ||
      text.includes('no me contactes') ||
      text.includes('no me escribas') ||
      text.includes('remove me') ||
      text.includes('unsubscribe') ||
      text.includes('desuscribir') ||
      text.includes('dar de baja') ||
      text.includes('no gracias') ||
      text.includes('stop sending')
    ) {
      return {
        sentiment: 'not-interested',
        confidence: 0.95,
        summary: 'El prospecto indicó desinterés o solicitó remoción de lista.',
        suggestedReply: 'Entendido y disculpa las molestias. Te he removido de nuestros contactos. ¡Éxitos!'
      };
    }

    // 3. Wrong Person / Referral
    if (
      text.includes('wrong person') ||
      text.includes('not the right person') ||
      text.includes('no soy la persona') ||
      text.includes('contacta a') ||
      text.includes('habla con') ||
      text.includes('reach out to')
    ) {
      return {
        sentiment: 'wrong-person',
        confidence: 0.88,
        summary: 'El contacto sugiere derivar a otro colega o responsable.',
        suggestedReply: '¡Muchas gracias por la aclaración! ¿Podrías indicarme el correo directo o nombre de la persona a cargo?'
      };
    }

    // 4. Meeting Booked
    if (
      text.includes('booked') ||
      text.includes('calendly') ||
      text.includes('agendé') ||
      text.includes('agendado') ||
      text.includes('reunión confirmada') ||
      text.includes('confirmado para')
    ) {
      return {
        sentiment: 'meeting-booked',
        confidence: 0.96,
        summary: 'Reunión o llamada comercial agendada.',
        suggestedReply: '¡Perfecto! Ya veo la reunión confirmada en agenda. Nos vemos pronto para revisar los detalles.'
      };
    }

    // 5. Interested (Default positive indicator)
    if (
      text.includes('interesa') ||
      text.includes('interested') ||
      text.includes('hablemos') ||
      text.includes('llamada') ||
      text.includes('call') ||
      text.includes('demo') ||
      text.includes('precio') ||
      text.includes('pricing') ||
      text.includes('más información') ||
      text.includes('more info') ||
      text.includes('cuéntame más')
    ) {
      return {
        sentiment: 'interested',
        confidence: 0.9,
        summary: 'El prospecto muestra interés o solicita detalles/llamada.',
        suggestedReply: '¡Excelente! Te propongo una breve llamada de 10 minutos para mostrártelo en acción. ¿Te viene bien este jueves por la mañana?'
      };
    }

    // Default neutral/interested probe
    return {
      sentiment: 'interested',
      confidence: 0.65,
      summary: 'Respuesta recibida en conversación activa.',
      suggestedReply: '¡Hola! Gracias por tu respuesta. ¿Te gustaría coordinar una breve llamada para profundizar?'
    };
  }

  async processIncomingReply(
    subject: string,
    body: string,
    context: {
      leadId: string;
      leadName: string;
      leadEmail: string;
      companyName?: string;
    }
  ): Promise<ClassificationResult> {
    const result = this.classify(subject, body, context);

    // Auto-create or update Deal in CRM if positive sentiment and dealRepo provided
    if ((result.sentiment === 'interested' || result.sentiment === 'meeting-booked') && this.dealRepo) {
      try {
        const existingDeals = await this.dealRepo.getDeals();
        const existingDeal = existingDeals.find(
          d => (d.leadId && d.leadId === context.leadId) ||
               (d.contactEmail && d.contactEmail.toLowerCase() === context.leadEmail.toLowerCase())
        );

        if (existingDeal) {
          if (result.sentiment === 'meeting-booked' && existingDeal.stage !== 'won' && existingDeal.stage !== 'demo') {
            existingDeal.stage = 'demo';
            existingDeal.value = Math.max(existingDeal.value, 5000);
            await this.dealRepo.updateDeal(existingDeal);
          }
          result.autoCreatedDeal = existingDeal;
        } else {
          const deal: Deal = {
            id: `deal-${uuidv4()}`,
            leadId: context.leadId,
            contactName: context.leadName,
            contactEmail: context.leadEmail,
            companyName: context.companyName || '',
            title: `Oportunidad: ${context.companyName || context.leadName}`,
            value: result.sentiment === 'meeting-booked' ? 5000 : 2500,
            stage: result.sentiment === 'meeting-booked' ? 'demo' : 'positive',
            daysInactive: 0,
            createdAt: new Date().toISOString()
          };
          await this.dealRepo.saveDeal(deal);
          result.autoCreatedDeal = deal;
        }
      } catch (err: any) {
        console.warn('Could not auto-create or update CRM deal:', err.message);
      }
    }

    return result;
  }
}
