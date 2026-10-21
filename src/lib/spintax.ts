import { SpintaxService } from '@/core/services/SpintaxService';

const spintaxService = new SpintaxService();

export function resolveSpintax(text: string): string {
  return spintaxService.resolve(text);
}

export function generateSpintax(text: string, language?: 'en' | 'es'): string {
  return spintaxService.generate(text, language);
}
