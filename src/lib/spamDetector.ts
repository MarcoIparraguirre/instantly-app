import {
  SpamDetectorService,
  SpamWordMatch,
  ENGLISH_SPAM_WORDS,
  SPANISH_SPAM_WORDS
} from '@/core/services/SpamDetectorService';

export type { SpamWordMatch };
export const SPAM_TRIGGER_DICTIONARY = { ...ENGLISH_SPAM_WORDS, ...SPANISH_SPAM_WORDS };

const spamDetectorService = new SpamDetectorService();

export function checkSpamWords(text: string, language?: 'en' | 'es' | 'all'): SpamWordMatch[] {
  return spamDetectorService.check(text, language);
}

export function applySpamFixes(text: string, language?: 'en' | 'es' | 'all'): string {
  return spamDetectorService.applyFixes(text, language);
}
