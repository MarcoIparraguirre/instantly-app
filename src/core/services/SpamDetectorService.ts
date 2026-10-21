export interface SpamWordMatch {
  word: string;
  replacement: string;
  category: 'high' | 'medium' | 'low';
}

export interface ISpamDetectorService {
  check(text: string, language?: 'en' | 'es' | 'all'): SpamWordMatch[];
  applyFixes(text: string, language?: 'en' | 'es' | 'all'): string;
  registerWords(words: Record<string, { replacement: string; category: 'high' | 'medium' | 'low' }>, lang?: 'en' | 'es'): void;
}

export const ENGLISH_SPAM_WORDS: Record<string, { replacement: string; category: 'high' | 'medium' | 'low' }> = {
  '100% free': { replacement: 'complimentary', category: 'high' },
  'free': { replacement: 'complimentary', category: 'medium' },
  'guaranteed': { replacement: 'proven', category: 'high' },
  'act now': { replacement: 'time-sensitive', category: 'high' },
  'limited time': { replacement: 'current window', category: 'medium' },
  'risk free': { replacement: 'seamless', category: 'high' },
  'risk-free': { replacement: 'seamless', category: 'high' },
  'make money': { replacement: 'drive revenue', category: 'high' },
  'urgent': { replacement: 'priority', category: 'high' },
  'winner': { replacement: 'selected', category: 'high' },
  'no cost': { replacement: 'zero upfront commitment', category: 'high' },
  'buy now': { replacement: 'get started', category: 'high' },
  'click here': { replacement: 'take a look here', category: 'high' },
  'miracle': { replacement: 'breakthrough', category: 'high' },
  'earn extra cash': { replacement: 'increase profitability', category: 'high' },
  'extra income': { replacement: 'additional revenue stream', category: 'high' },
  'eliminate debt': { replacement: 'optimize finances', category: 'high' },
  'cash bonus': { replacement: 'added value', category: 'high' },
  'congratulations': { replacement: 'kudos', category: 'medium' },
  'dear friend': { replacement: 'hi {{firstName}}', category: 'high' },
  'as seen on': { replacement: 'featured in', category: 'medium' },
  'order now': { replacement: 'explore options', category: 'high' },
  'exclusive deal': { replacement: 'special offering', category: 'medium' },
  'lowest price': { replacement: 'competitive rate', category: 'medium' },
  'unlimited': { replacement: 'extensive', category: 'medium' },
  'be your own boss': { replacement: 'scale your business', category: 'high' },
  'million dollars': { replacement: 'high valuation', category: 'high' },
};

export const SPANISH_SPAM_WORDS: Record<string, { replacement: string; category: 'high' | 'medium' | 'low' }> = {
  '100% gratis': { replacement: 'de cortesía', category: 'high' },
  'gratis': { replacement: 'sin costo inicial', category: 'medium' },
  'garantizado': { replacement: 'comprobado', category: 'high' },
  'actúa ahora': { replacement: 'oportuno', category: 'high' },
  'tiempo limitado': { replacement: 'ventana actual', category: 'medium' },
  'sin riesgo': { replacement: 'con total respaldo', category: 'high' },
  'gana dinero': { replacement: 'impulsa tus ingresos', category: 'high' },
  'hazte rico': { replacement: 'escala tus finanzas', category: 'high' },
  'urgente': { replacement: 'prioritario', category: 'high' },
  'ganador': { replacement: 'seleccionado', category: 'high' },
  'sin costo': { replacement: 'sin compromiso inicial', category: 'high' },
  'compra ya': { replacement: 'comienza hoy', category: 'high' },
  'haz clic aquí': { replacement: 'puedes verlo aquí', category: 'high' },
  'ingresos extra': { replacement: 'rentabilidad adicional', category: 'high' },
  'felicitaciones': { replacement: 'enhorabuena', category: 'medium' },
  'oferta exclusiva': { replacement: 'propuesta especial', category: 'medium' },
  'precio más bajo': { replacement: 'tarifa competitiva', category: 'medium' },
  'sé tu propio jefe': { replacement: 'impulsa tu negocio', category: 'high' },
  'millón de dólares': { replacement: 'alto impacto financiero', category: 'high' },
};

export class SpamDetectorService implements ISpamDetectorService {
  private enDictionary: Record<string, { replacement: string; category: 'high' | 'medium' | 'low' }>;
  private esDictionary: Record<string, { replacement: string; category: 'high' | 'medium' | 'low' }>;

  constructor() {
    this.enDictionary = { ...ENGLISH_SPAM_WORDS };
    this.esDictionary = { ...SPANISH_SPAM_WORDS };
  }

  registerWords(
    words: Record<string, { replacement: string; category: 'high' | 'medium' | 'low' }>,
    lang: 'en' | 'es' = 'en'
  ): void {
    if (lang === 'es') {
      Object.assign(this.esDictionary, words);
    } else {
      Object.assign(this.enDictionary, words);
    }
  }

  private getDictionary(lang: 'en' | 'es' | 'all' = 'all') {
    if (lang === 'en') return this.enDictionary;
    if (lang === 'es') return this.esDictionary;
    return { ...this.enDictionary, ...this.esDictionary };
  }

  check(text: string, language: 'en' | 'es' | 'all' = 'all'): SpamWordMatch[] {
    if (!text) return [];
    const lower = text.toLowerCase();
    const dictionary = this.getDictionary(language);
    const matches: SpamWordMatch[] = [];

    for (const [phrase, info] of Object.entries(dictionary)) {
      const escaped = phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      if (regex.test(lower)) {
        matches.push({
          word: phrase,
          replacement: info.replacement,
          category: info.category
        });
      }
    }

    return matches;
  }

  applyFixes(text: string, language: 'en' | 'es' | 'all' = 'all'): string {
    if (!text) return text;
    let fixed = text;
    const dictionary = this.getDictionary(language);

    for (const [phrase, info] of Object.entries(dictionary)) {
      const escaped = phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      fixed = fixed.replace(regex, info.replacement);
    }

    return fixed;
  }
}
