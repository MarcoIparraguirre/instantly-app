export interface ISpintaxService {
  resolve(text: string): string;
  generate(text: string, language?: 'en' | 'es'): string;
}

export class SpintaxService implements ISpintaxService {
  resolve(text: string): string {
    if (!text) return '';
    // Only resolve spintax groups that contain '|', protecting template variables like {{firstName}}
    const spintaxRegex = /\{([^{}]+?\|[^{}]+?)\}/g;

    let resolved = text;
    let iterations = 0;
    const maxIterations = 20; // Prevent infinite loops on malformed inputs

    while (spintaxRegex.test(resolved) && iterations < maxIterations) {
      resolved = resolved.replace(spintaxRegex, (_, choices) => {
        const options = choices.split('|');
        const randomChoice = options[Math.floor(Math.random() * options.length)];
        return randomChoice.trim();
      });
      iterations++;
    }

    return resolved;
  }

  generate(text: string, language: 'en' | 'es' = 'en'): string {
    if (!text) return text;
    let result = text;

    if (language === 'es') {
      // Spanish greetings and calls to action
      result = result.replace(/\b(hola|buenos días|buenas tardes)\b/gi, '{Hola|Qué tal|Espero que todo vaya bien}');
      result = result.replace(/\b(avísame si te interesa|dime qué opinas)\b/gi,
        '{Cuéntame si te gustaría explorarlo|¿Valdría la pena una breve llamada?|Me encantaría saber tu opinión}');
      result = result.replace(/\b(podemos hablar esta semana\?|tienes 10 minutos\?)\b/gi,
        '{¿Tendrías 5 minutos el próximo martes?|¿Podríamos hablar brevemente esta semana?|¿Estarías disponible para una charla rápida?}');
    } else {
      // English greetings and calls to action
      result = result.replace(/\b(hi|hello|hey)\b/gi, '{Hi|Hello|Hey}');
      result = result.replace(/\b(good morning|good afternoon)\b/gi, '{Hope your week is going well|Good day}');
      result = result.replace(/\b(let me know if you are interested|let me know what you think)\b/gi, 
        '{Let me know if you would be open to exploring this|Worth a quick conversation?|Curious to get your take on this}');
      result = result.replace(/\b(can we talk this week\?|are you free for a 10 min call\?)\b/gi,
        '{Do you have 10 minutes sometime this week?|Open to a brief 5-min intro call next Tuesday?|Would you be opposed to a short chat?}');
    }

    return result;
  }
}
