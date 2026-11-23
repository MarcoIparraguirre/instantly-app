import { generateText, LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { AiSentimentTag, Lead } from '@/types';

export type AiProvider = 'openai' | 'google' | 'deterministic';
export type AiLanguage = 'es' | 'en';
export type IcebreakerTone = 'consultative' | 'direct' | 'friendly' | 'executive';
export type UniboxReplyTone = 'direct' | 'consultative' | 'meeting';

export interface IcebreakerLeadInput {
  id?: string;
  workspaceId?: string;
  campaignId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  title?: string;
  website?: string;
  status?: Lead['status'];
  currentStep?: number;
  customVariables?: Record<string, string>;
}

export interface GeneratedIcebreaker {
  leadId?: string;
  email?: string;
  icebreaker: string;
  provider: AiProvider;
  tone: string;
  language: AiLanguage;
}

export interface SuggestReplyInput {
  subject: string;
  body: string;
  leadName?: string;
  companyName?: string;
  sentiment?: AiSentimentTag | string;
  language?: AiLanguage;
}

export interface UniboxReplyDraft {
  id: string;
  tone: UniboxReplyTone;
  label: string;
  subject: string;
  body: string;
}

export interface SuggestUniboxRepliesResult {
  provider: AiProvider;
  language: AiLanguage;
  drafts: UniboxReplyDraft[];
}

const ICEBREAKER_BATCH_SIZE = 15;
const LLM_TIMEOUT_MS = 15000;

function getLlmTimeoutMs(): number {
  return process.env.VITEST ? 1500 : LLM_TIMEOUT_MS;
}

export function normalizeAiLanguage(language?: string): AiLanguage {
  return typeof language === 'string' && language.trim().toLowerCase().startsWith('en') ? 'en' : 'es';
}

function normalizeTone(tone?: string): IcebreakerTone {
  const normalized = (tone || '').trim().toLowerCase();
  if (normalized === 'direct' || normalized === 'friendly' || normalized === 'executive') {
    return normalized;
  }
  return 'consultative';
}

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function extractLeadMetadata(lead: IcebreakerLeadInput) {
  const vars = lead.customVariables || {};
  const firstName = (lead.firstName || '').trim();
  const company = (lead.companyName || '').trim();
  const role = (
    lead.title ||
    vars.Cargo ||
    vars.cargo ||
    vars.Title ||
    vars.title ||
    vars.Role ||
    vars.role ||
    ''
  ).trim();
  const city = (vars.Ciudad || vars.ciudad || vars.City || vars.city || '').trim();
  const industry = (
    vars.Industria ||
    vars.industria ||
    vars.Industry ||
    vars.industry ||
    vars.Sector ||
    vars.sector ||
    ''
  ).trim();
  const rawWebsite = (lead.website || '').trim();
  const cleanedWebsite = rawWebsite.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0].trim();
  const emailDomain = lead.email && lead.email.includes('@') ? lead.email.split('@')[1].trim() : '';
  const domain = cleanedWebsite || emailDomain;

  return { firstName, company, role, city, industry, domain };
}

export class AiOutreachService {
  detectProvider(): AiProvider {
    if (process.env.OPENAI_API_KEY?.trim()) {
      return 'openai';
    }
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
      return 'google';
    }
    return 'deterministic';
  }

  private resolveModel(): { provider: Exclude<AiProvider, 'deterministic'>; model: LanguageModel } | null {
    const provider = this.detectProvider();
    if (provider === 'openai') {
      return { provider: 'openai', model: openai('gpt-4o-mini') };
    }
    if (provider === 'google') {
      return { provider: 'google', model: google('gemini-2.5-flash') };
    }
    return null;
  }

  async generateIcebreakers(
    leads: IcebreakerLeadInput[],
    language: AiLanguage = 'es',
    tone: string = 'consultative'
  ): Promise<GeneratedIcebreaker[]> {
    if (!Array.isArray(leads) || leads.length === 0) {
      return [];
    }

    const lang = normalizeAiLanguage(language);
    const normalizedTone = normalizeTone(tone);
    const resolved = this.resolveModel();

    if (!resolved) {
      return leads.map((lead) => ({
        leadId: lead.id,
        email: lead.email,
        icebreaker: this.buildDeterministicIcebreaker(lead, lang, normalizedTone),
        provider: 'deterministic',
        tone: normalizedTone,
        language: lang,
      }));
    }

    const results: GeneratedIcebreaker[] = [];

    for (let offset = 0; offset < leads.length; offset += ICEBREAKER_BATCH_SIZE) {
      const batch = leads.slice(offset, offset + ICEBREAKER_BATCH_SIZE);
      const batchIcebreakers = await this.generateIcebreakerBatchWithLLM(
        resolved.model,
        batch,
        lang,
        normalizedTone
      );

      for (let i = 0; i < batch.length; i++) {
        const lead = batch[i];
        const llmLine = batchIcebreakers[i]?.trim();
        if (llmLine) {
          results.push({
            leadId: lead.id,
            email: lead.email,
            icebreaker: llmLine,
            provider: resolved.provider,
            tone: normalizedTone,
            language: lang,
          });
        } else {
          results.push({
            leadId: lead.id,
            email: lead.email,
            icebreaker: this.buildDeterministicIcebreaker(lead, lang, normalizedTone),
            provider: 'deterministic',
            tone: normalizedTone,
            language: lang,
          });
        }
      }
    }

    return results;
  }

  async suggestUniboxReplies(input: SuggestReplyInput): Promise<SuggestUniboxRepliesResult> {
    const lang = normalizeAiLanguage(input.language);
    const resolved = this.resolveModel();

    if (!resolved) {
      return {
        provider: 'deterministic',
        language: lang,
        drafts: this.buildDeterministicUniboxDrafts({ ...input, language: lang }),
      };
    }

    try {
      const systemPrompt =
        lang === 'es'
          ? 'Eres un estratega experto en ventas B2B outbound. Responde ÚNICAMENTE con un JSON válido (sin markdown extra) conteniendo un arreglo de exactamente 3 borradores de respuesta con las claves: tone ("direct" | "consultative" | "meeting"), label, subject, body.'
          : 'You are an expert B2B outbound sales strategist. Respond ONLY with valid JSON (no extra markdown) containing an array of exactly 3 reply drafts with keys: tone ("direct" | "consultative" | "meeting"), label, subject, body.';

      const labels =
        lang === 'es'
          ? ['Directo / Ejecutivo', 'Consultivo / Valor', 'Propuesta de Reunión']
          : ['Direct / Executive', 'Consultative / Value', 'Meeting Proposal'];

      const userPrompt = [
        `Language: ${lang === 'es' ? 'Spanish' : 'English'}`,
        `Lead Name: ${input.leadName || 'Prospect'}`,
        `Company: ${input.companyName || 'Company'}`,
        `Detected Sentiment: ${input.sentiment || 'interested'}`,
        `Original Subject: ${input.subject || '(No subject)'}`,
        `Incoming Email Body:\n${input.body}`,
        `Generate 3 tailored one-click reply drafts using these exact tone & label pairs:`,
        `1. tone="direct", label="${labels[0]}"`,
        `2. tone="consultative", label="${labels[1]}"`,
        `3. tone="meeting", label="${labels[2]}"`,
      ].join('\n');

      const response = await generateText({
        model: resolved.model,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.6,
        maxOutputTokens: 1000,
        maxRetries: 1,
        timeout: getLlmTimeoutMs(),
      });

      const parsed = this.parseUniboxDraftsResponse(response.text, { ...input, language: lang });
      if (parsed) {
        return {
          provider: resolved.provider,
          language: lang,
          drafts: parsed,
        };
      }
    } catch (err) {
      console.warn('AiOutreachService.suggestUniboxReplies falling back to deterministic:', err);
    }

    return {
      provider: 'deterministic',
      language: lang,
      drafts: this.buildDeterministicUniboxDrafts({ ...input, language: lang }),
    };
  }

  async askCopilotLLM(
    prompt: string,
    campaignSummary: string | Record<string, unknown>,
    language: AiLanguage = 'es'
  ): Promise<string | null> {
    const resolved = this.resolveModel();
    if (!resolved || !prompt || !prompt.trim()) {
      return null;
    }

    const lang = normalizeAiLanguage(language);
    const serializedSummary =
      typeof campaignSummary === 'string'
        ? campaignSummary
        : JSON.stringify(campaignSummary, null, 2);

    try {
      const systemPrompt =
        lang === 'es'
          ? 'Eres MiSender Copilot, un asesor práctico de email B2B y entregabilidad. Da recomendaciones accionables, breves y específicas basadas en las métricas y pasos reales de la campaña. Responde en español en máximo 160 palabras.'
          : 'You are MiSender Copilot, a practical B2B cold email and deliverability strategist. Give concise, actionable advice grounded in the campaign metrics and steps. Respond in English in at most 160 words.';

      const fullPrompt = `Campaign Context:\n${serializedSummary}\n\nUser Question:\n${prompt.trim()}`;

      const result = await generateText({
        model: resolved.model,
        system: systemPrompt,
        prompt: fullPrompt,
        temperature: 0.5,
        maxOutputTokens: 500,
        maxRetries: 1,
        timeout: getLlmTimeoutMs(),
      });

      const text = result.text?.trim();
      return text || null;
    } catch (err) {
      console.warn('AiOutreachService.askCopilotLLM fallback to null:', err);
      return null;
    }
  }

  private async generateIcebreakerBatchWithLLM(
    model: LanguageModel,
    batch: IcebreakerLeadInput[],
    language: AiLanguage,
    tone: IcebreakerTone
  ): Promise<(string | null)[]> {
    try {
      const systemPrompt =
        language === 'es'
          ? `Redacta una primera línea (icebreaker) personalizada y natural de 1 o 2 frases para cada prospecto B2B en tono "${tone}". Sin saludos genéricos vacíos ni clichés. Responde ÚNICAMENTE con un JSON array de objetos [{"index": 0, "icebreaker": "..."}].`
          : `Write a natural, personalized 1-2 sentence cold email opening line (icebreaker) for each B2B prospect in a "${tone}" tone. Avoid generic filler or clichés. Respond ONLY with a JSON array of objects [{"index": 0, "icebreaker": "..."}].`;

      const serializedLeads = batch.map((lead, index) => {
        const meta = extractLeadMetadata(lead);
        return {
          index,
          firstName: meta.firstName || undefined,
          companyName: meta.company || undefined,
          role: meta.role || undefined,
          city: meta.city || undefined,
          industry: meta.industry || undefined,
          domain: meta.domain || undefined,
        };
      });

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: `Prospects:\n${JSON.stringify(serializedLeads, null, 2)}`,
        temperature: 0.7,
        maxOutputTokens: 1200,
        maxRetries: 1,
        timeout: getLlmTimeoutMs(),
      });

      return this.parseIcebreakerBatchResponse(result.text, batch);
    } catch (err) {
      console.warn('AiOutreachService.generateIcebreakers falling back to deterministic:', err);
      return batch.map(() => null);
    }
  }

  private parseIcebreakerBatchResponse(rawText: string, batch: IcebreakerLeadInput[]): (string | null)[] {
    const cleaned = stripJsonCodeFences(rawText || '');
    if (!cleaned) {
      return batch.map(() => null);
    }

    try {
      const parsed = JSON.parse(cleaned);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.icebreakers)
          ? parsed.icebreakers
          : null;

      if (list) {
        const out: (string | null)[] = batch.map(() => null);
        list.forEach((item: unknown, idx: number) => {
          if (typeof item === 'string' && idx < out.length) {
            out[idx] = item.trim() || null;
            return;
          }
          if (item && typeof item === 'object') {
            const record = item as Record<string, unknown>;
            const text =
              typeof record.icebreaker === 'string'
                ? record.icebreaker
                : typeof record.line === 'string'
                  ? record.line
                  : typeof record.text === 'string'
                    ? record.text
                    : '';
            if (!text.trim()) return;

            if (typeof record.index === 'number' && record.index >= 0 && record.index < out.length) {
              out[record.index] = text.trim();
            } else if (typeof record.id === 'string') {
              const targetIdx = batch.findIndex((l) => l.id === record.id);
              if (targetIdx >= 0) out[targetIdx] = text.trim();
            } else if (typeof record.email === 'string') {
              const targetIdx = batch.findIndex(
                (l) => l.email?.toLowerCase() === String(record.email).toLowerCase()
              );
              if (targetIdx >= 0) out[targetIdx] = text.trim();
            } else if (idx < out.length) {
              out[idx] = text.trim();
            }
          }
        });
        return out;
      }
    } catch {
      // Non-JSON response handling for single-lead mocks or plain lines
    }

    if (batch.length === 1) {
      return [cleaned];
    }

    const lines = cleaned
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
      .filter(Boolean);

    if (lines.length === batch.length) {
      return lines;
    }

    return batch.map(() => null);
  }

  private parseUniboxDraftsResponse(
    rawText: string,
    input: SuggestReplyInput & { language: AiLanguage }
  ): UniboxReplyDraft[] | null {
    const cleaned = stripJsonCodeFences(rawText || '');
    if (!cleaned) return null;

    try {
      const parsed = JSON.parse(cleaned);
      const rawList = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.drafts)
          ? parsed.drafts
          : Array.isArray(parsed?.replies)
            ? parsed.replies
            : null;

      if (!rawList || rawList.length === 0) return null;

      const fallbackDrafts = this.buildDeterministicUniboxDrafts(input);
      const tones: UniboxReplyTone[] = ['direct', 'consultative', 'meeting'];

      const mapped = tones.map((tone, idx) => {
        const fallback = fallbackDrafts[idx];
        const candidate = rawList.find(
          (item: unknown) =>
            item &&
            typeof item === 'object' &&
            String((item as Record<string, unknown>).tone || '').toLowerCase() === tone
        ) || rawList[idx];

        if (!candidate || typeof candidate !== 'object') {
          return fallback;
        }

        const record = candidate as Record<string, unknown>;
        const body = typeof record.body === 'string' && record.body.trim() ? record.body.trim() : fallback.body;
        const subject =
          typeof record.subject === 'string' && record.subject.trim()
            ? record.subject.trim()
            : fallback.subject;
        const label =
          typeof record.label === 'string' && record.label.trim() ? record.label.trim() : fallback.label;

        return {
          id: `draft-${tone}`,
          tone,
          label,
          subject,
          body,
        };
      });

      const hasAnyLLMContent = rawList.some(
        (item: unknown) =>
          item &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).body === 'string' &&
          String((item as Record<string, unknown>).body).trim().length > 0
      );

      return hasAnyLLMContent ? mapped : null;
    } catch {
      return null;
    }
  }

  private buildDeterministicIcebreaker(
    lead: IcebreakerLeadInput,
    language: AiLanguage,
    tone: IcebreakerTone
  ): string {
    const { firstName, company, role, city, industry, domain } = extractLeadMetadata(lead);

    if (language === 'es') {
      const citySuffix = city ? ` en ${city}` : '';
      const industrySuffix = industry ? ` dentro de ${industry}` : '';

      switch (tone) {
        case 'direct':
          if (company && role) {
            return `Viendo tu liderazgo como ${role} en ${company}, voy directo al punto: detectamos mejoras concretas para acelerar sus reuniones B2B sin sumar carga operativa.`;
          }
          if (company) {
            return `Analizando la operación de ${company}${citySuffix}, voy directo al grano con una idea práctica para generar más reuniones cualificadas este trimestre.`;
          }
          return `${firstName ? `${firstName}, voy` : 'Voy'} directo al punto: revisé el enfoque comercial de ${domain || 'tu equipo'} y veo una palanca clara para elevar su tasa de respuesta.`;

        case 'friendly':
          if (company) {
            return `¡Hola${firstName ? ` ${firstName}` : ''}! Qué interesante lo que vienen construyendo en ${company}${industrySuffix}; me dio mucha curiosidad conectar.`;
          }
          return `¡Hola${firstName ? ` ${firstName}` : ''}! Estuve mirando lo que están impulsando${domain ? ` en ${domain}` : ''} y quería saludarte brevemente.`;

        case 'executive':
          if (company && role) {
            return `Seguimos de cerca la evolución de ${company} y tu foco como ${role}; quería compartirte un benchmark breve de ROI en captación B2B.`;
          }
          if (company) {
            return `En ${company}${city ? ` (${city})` : ''} seguramente priorizan eficiencia comercial; te acerco una perspectiva ejecutiva en dos líneas.`;
          }
          return `Compartiendo una mirada ejecutiva para ${domain || 'tu dirección comercial'}: cómo convertir la prospección saliente en pipeline predecible.`;

        case 'consultative':
        default:
          if (company && role) {
            return `Vi tu trabajo como ${role} en ${company}${city ? ` (${city})` : ''} y me llamó la atención cómo están posicionando su propuesta${industrySuffix}.`;
          }
          if (company) {
            return `Estuve revisando el posicionamiento de ${company}${industrySuffix}${citySuffix} y noté oportunidades claras para potenciar su prospección B2B.`;
          }
          if (firstName) {
            return `Hola ${firstName}, estuve analizando la presencia de ${domain || 'tu empresa'} y vi un punto clave para mejorar la conversión de sus campañas.`;
          }
          return `Estuve revisando el perfil de ${domain || 'tu equipo'} y detecté oportunidades prácticas para optimizar el alcance a cuentas clave.`;
      }
    }

    const citySuffix = city ? ` in ${city}` : '';
    const industrySuffix = industry ? ` in ${industry}` : '';

    switch (tone) {
      case 'direct':
        if (company && role) {
          return `Given your role as ${role} at ${company}, I'll get straight to the point—I spotted a practical way to add qualified pipeline without extra SDR overhead.`;
        }
        if (company) {
          return `Looking at ${company}${citySuffix}, I'll keep this direct: here is a focused angle to drive more qualified B2B meetings this quarter.`;
        }
        return `${firstName ? `${firstName}, getting` : 'Getting'} straight to the point—after reviewing ${domain || 'your team'}, I see a clear lever to lift cold reply rates.`;

      case 'friendly':
        if (company) {
          return `Hi${firstName ? ` ${firstName}` : ''}! Really impressed by what the team at ${company}${industrySuffix} has been building lately.`;
        }
        return `Hi${firstName ? ` ${firstName}` : ''}! Came across ${domain || 'your work'} recently and wanted to reach out briefly.`;

      case 'executive':
        if (company && role) {
          return `Following ${company}'s growth and your leadership as ${role}, I wanted to share a concise ROI benchmark on outbound pipeline efficiency.`;
        }
        if (company) {
          return `With ${company}${city ? ` (${city})` : ''} focused on scalable acquisition, here is a two-line executive perspective on predictable B2B pipeline.`;
        }
        return `Sharing a brief executive note for ${domain || 'your leadership team'} on turning cold outreach into measurable pipeline ROI.`;

      case 'consultative':
      default:
        if (company && role) {
          return `I noticed your work as ${role} at ${company}${city ? ` (${city})` : ''} and wanted to reach out around how your team scales outbound growth${industrySuffix}.`;
        }
        if (company) {
          return `I was reviewing ${company}'s positioning${industrySuffix}${citySuffix} and spotted a few practical ways to strengthen your B2B conversion.`;
        }
        if (firstName) {
          return `Hi ${firstName}, I took a quick look at ${domain || 'your company'} and noticed a practical angle to sharpen your cold email reply rates.`;
        }
        return `I reviewed ${domain || 'your team'}'s outbound presence and spotted a clear opportunity to boost engagement with target accounts.`;
    }
  }

  private buildDeterministicUniboxDrafts(
    input: SuggestReplyInput & { language: AiLanguage }
  ): UniboxReplyDraft[] {
    const lang = input.language;
    const firstName = (input.leadName || '').trim().split(/\s+/)[0] || '';
    const company = (input.companyName || '').trim();
    const sentiment = (input.sentiment || 'interested').toLowerCase();
    const rawSubject = (input.subject || '').trim();
    const replySubject = rawSubject
      ? /^re:/i.test(rawSubject)
        ? rawSubject
        : `Re: ${rawSubject}`
      : lang === 'es'
        ? 'Re: Seguimiento'
        : 'Re: Following up';

    const rawBodyLower = (input.body || '').toLowerCase();
    const asksPricing =
      rawBodyLower.includes('precio') ||
      rawBodyLower.includes('tarifa') ||
      rawBodyLower.includes('cost') ||
      rawBodyLower.includes('pricing') ||
      rawBodyLower.includes('budget');

    if (lang === 'es') {
      const greeting = firstName ? `Hola ${firstName},` : 'Hola,';
      const companyRef = company ? ` en ${company}` : '';

      if (sentiment === 'not-interested') {
        return [
          {
            id: 'draft-direct',
            tone: 'direct',
            label: 'Directo / Ejecutivo',
            subject: replySubject,
            body: `${greeting}\n\nEntendido perfectamente. Ya te di de baja de esta secuencia para no quitarte más tiempo.\n\n¡Éxitos${companyRef}!`,
          },
          {
            id: 'draft-consultative',
            tone: 'consultative',
            label: 'Consultivo / Valor',
            subject: replySubject,
            body: `${greeting}\n\nMuchas gracias por tu sinceridad y por tomarte el tiempo de responder. Respeto totalmente tus prioridades actuales y no volveré a escribirte.\n\nSi en otro momento evalúan optimizar su canal outbound${companyRef}, aquí quedo a disposición.`,
          },
          {
            id: 'draft-meeting',
            tone: 'meeting',
            label: 'Propuesta de Reunión',
            subject: replySubject,
            body: `${greeting}\n\nComprendo que ahora no sea prioridad. Si más adelante desean revisar métricas o casos reales${companyRef} en una charla breve de 10 minutos, avísame cuando tenga sentido.\n\nUn saludo cordial.`,
          },
        ];
      }

      if (sentiment === 'wrong-person') {
        return [
          {
            id: 'draft-direct',
            tone: 'direct',
            label: 'Directo / Ejecutivo',
            subject: replySubject,
            body: `${greeting}\n\nGracias por avisarme. ¿Me podrías compartir el nombre o correo de la persona indicada${companyRef} para dirigirle la consulta directamente?`,
          },
          {
            id: 'draft-consultative',
            tone: 'consultative',
            label: 'Consultivo / Valor',
            subject: replySubject,
            body: `${greeting}\n\n¡Muchas gracias por la aclaración! Para no molestar al área equivocada${companyRef}, ¿me orientarías sobre quién lidera hoy adquisición comercial o growth en el equipo?`,
          },
          {
            id: 'draft-meeting',
            tone: 'meeting',
            label: 'Propuesta de Reunión',
            subject: replySubject,
            body: `${greeting}\n\nTe agradezco la orientación. Si me indicas con quién coordinar, le comparto una propuesta breve para tener 10 minutos esta semana y revisar si aplica${companyRef}.`,
          },
        ];
      }

      if (sentiment === 'out-of-office') {
        return [
          {
            id: 'draft-direct',
            tone: 'direct',
            label: 'Directo / Ejecutivo',
            subject: replySubject,
            body: `${greeting}\n\nGracias por el aviso automático. Retomo el contacto contigo la próxima semana cuando estés de vuelta.`,
          },
          {
            id: 'draft-consultative',
            tone: 'consultative',
            label: 'Consultivo / Valor',
            subject: replySubject,
            body: `${greeting}\n\n¡Espero que disfrutes estos días fuera de la oficina! A tu regreso te comparto brevemente cómo venimos ayudando a equipos similares${companyRef}.`,
          },
          {
            id: 'draft-meeting',
            tone: 'meeting',
            label: 'Propuesta de Reunión',
            subject: replySubject,
            body: `${greeting}\n\nQuedo atento a tu regreso. Cuando vuelvas a agenda normal, ¿te parece si coordinamos 15 minutos la semana siguiente para revisarlo con calma?`,
          },
        ];
      }

      if (sentiment === 'meeting-booked') {
        return [
          {
            id: 'draft-direct',
            tone: 'direct',
            label: 'Directo / Ejecutivo',
            subject: replySubject,
            body: `${greeting}\n\n¡Confirmado! Ya tengo la reunión en agenda. Nos conectamos en el horario acordado con los puntos clave preparados${companyRef}.`,
          },
          {
            id: 'draft-consultative',
            tone: 'consultative',
            label: 'Consultivo / Valor',
            subject: replySubject,
            body: `${greeting}\n\nExcelente, muchas gracias por agendar. Para aprovechar al máximo la sesión, prepararé ejemplos concretos aplicados al contexto de ${company || 'tu equipo'}. ¿Hay algún objetivo puntual que quieras priorizar?`,
          },
          {
            id: 'draft-meeting',
            tone: 'meeting',
            label: 'Propuesta de Reunión',
            subject: replySubject,
            body: `${greeting}\n\n¡Nos vemos pronto en la llamada! Si deseas sumar a alguien más del equipo${companyRef} a la invitación, siéntete libre de reenviarle el evento.`,
          },
        ];
      }

      // Default / interested
      return [
        {
          id: 'draft-direct',
          tone: 'direct',
          label: 'Directo / Ejecutivo',
          subject: replySubject,
          body: `${greeting}\n\n¡Gracias por tu respuesta! ${asksPricing ? 'Nuestros planes parten desde $39/mes con entregabilidad y rotación incluidas. ' : ''}En 10 minutos te muestro el flujo exacto aplicado a ${company || 'tu equipo'} para generar reuniones esta misma semana.\n\n¿Te funciona mañana por la mañana?`,
        },
        {
          id: 'draft-consultative',
          tone: 'consultative',
          label: 'Consultivo / Valor',
          subject: replySubject,
          body: `${greeting}\n\nQué bueno conectar. Antes de entrar en detalle${companyRef}, me encantaría entender cómo manejan hoy su prospección y qué meta de reuniones tienen este trimestre${asksPricing ? ' para recomendarte el plan más eficiente' : ''}.\n\nSi te sirve, te comparto un caso breve de referencia o lo vemos en vivo.`,
        },
        {
          id: 'draft-meeting',
          tone: 'meeting',
          label: 'Propuesta de Reunión',
          subject: replySubject,
          body: `${greeting}\n\n¡Excelente! Te propongo una demo enfocada de 15 minutos para revisar cómo implementarlo${companyRef}.\n\n¿Te queda cómodo este jueves a las 10:00 o el viernes a las 11:30? Si prefieres otra franja, me adapto sin problema.`,
        },
      ];
    }

    // English drafts
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    const companyRef = company ? ` at ${company}` : '';

    if (sentiment === 'not-interested') {
      return [
        {
          id: 'draft-direct',
          tone: 'direct',
          label: 'Direct / Executive',
          subject: replySubject,
          body: `${greeting}\n\nUnderstood completely. I have removed you from this sequence so we won't take up any more of your time.\n\nWishing you and the team${companyRef} all the best!`,
        },
        {
          id: 'draft-consultative',
          tone: 'consultative',
          label: 'Consultative / Value',
          subject: replySubject,
          body: `${greeting}\n\nThanks for letting me know directly. I completely respect your current priorities and won't follow up further.\n\nIf outbound pipeline becomes a focus${companyRef} down the road, feel free to reach back out anytime.`,
        },
        {
          id: 'draft-meeting',
          tone: 'meeting',
          label: 'Meeting Proposal',
          subject: replySubject,
          body: `${greeting}\n\nTotally understand timing isn't right today. Should you ever want a quick 10-minute benchmark walkthrough${companyRef} in a future quarter, just let me know.\n\nBest regards.`,
        },
      ];
    }

    if (sentiment === 'wrong-person') {
      return [
        {
          id: 'draft-direct',
          tone: 'direct',
          label: 'Direct / Executive',
          subject: replySubject,
          body: `${greeting}\n\nThanks for the heads-up. Could you point me to the right person${companyRef} so I can direct this note properly?`,
        },
        {
          id: 'draft-consultative',
          tone: 'consultative',
          label: 'Consultative / Value',
          subject: replySubject,
          body: `${greeting}\n\nAppreciate you clarifying! To avoid bothering the wrong team${companyRef}, who usually owns outbound sales or growth initiatives on your side?`,
        },
        {
          id: 'draft-meeting',
          tone: 'meeting',
          label: 'Meeting Proposal',
          subject: replySubject,
          body: `${greeting}\n\nThanks for pointing me in the right direction. Once you share their name or email, I'll send a brief note to see if a 10-minute intro this week makes sense${companyRef}.`,
        },
      ];
    }

    if (sentiment === 'out-of-office') {
      return [
        {
          id: 'draft-direct',
          tone: 'direct',
          label: 'Direct / Executive',
          subject: replySubject,
          body: `${greeting}\n\nThanks for the automatic update. I'll follow back up next week once you're back in the office.`,
        },
        {
          id: 'draft-consultative',
          tone: 'consultative',
          label: 'Consultative / Value',
          subject: replySubject,
          body: `${greeting}\n\nHope you enjoy your time away! When you're back, I'll share a brief breakdown of how similar teams${companyRef} are improving reply rates.`,
        },
        {
          id: 'draft-meeting',
          tone: 'meeting',
          label: 'Meeting Proposal',
          subject: replySubject,
          body: `${greeting}\n\nNo rush while you're away. Would a quick 15-minute call the week you return work to walk through this?`,
        },
      ];
    }

    if (sentiment === 'meeting-booked') {
      return [
        {
          id: 'draft-direct',
          tone: 'direct',
          label: 'Direct / Executive',
          subject: replySubject,
          body: `${greeting}\n\nConfirmed! Looking forward to speaking at the scheduled time with tailored numbers ready${companyRef}.`,
        },
        {
          id: 'draft-consultative',
          tone: 'consultative',
          label: 'Consultative / Value',
          subject: replySubject,
          body: `${greeting}\n\nGreat, thanks for booking! To make our session as relevant as possible for ${company || 'your team'}, is there a specific goal or bottleneck you'd like to focus on first?`,
        },
        {
          id: 'draft-meeting',
          tone: 'meeting',
          label: 'Meeting Proposal',
          subject: replySubject,
          body: `${greeting}\n\nSee you soon on the call! Feel free to forward the calendar invite to anyone else${companyRef} who should join.`,
        },
      ];
    }

    // Default / interested
    return [
      {
        id: 'draft-direct',
        tone: 'direct',
        label: 'Direct / Executive',
        subject: replySubject,
        body: `${greeting}\n\nThanks for getting back to me! ${asksPricing ? 'Plans start at $39/mo with mailbox rotation and deliverability protection included. ' : ''}In 10 minutes I can show you the exact workflow applied to ${company || 'your team'}.\n\nDoes tomorrow morning work?`,
      },
      {
        id: 'draft-consultative',
        tone: 'consultative',
        label: 'Consultative / Value',
        subject: replySubject,
        body: `${greeting}\n\nGreat to hear from you. Before diving in${companyRef}, I'd love to understand how you currently run outbound and your pipeline goals this quarter${asksPricing ? ' so I can recommend the right tier' : ''}.\n\nHappy to share a short case study or walk through it live.`,
      },
      {
        id: 'draft-meeting',
        tone: 'meeting',
        label: 'Meeting Proposal',
        subject: replySubject,
        body: `${greeting}\n\nGlad this resonates! Let's schedule a focused 15-minute walkthrough for ${company || 'your team'}.\n\nDo you have availability this Thursday at 10:00 AM or Friday at 11:30 AM? Happy to adjust to another slot that fits your calendar.`,
      },
    ];
  }
}

export const aiOutreachService = new AiOutreachService();
