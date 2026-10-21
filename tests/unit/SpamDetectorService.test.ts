import { describe, it, expect } from 'vitest';
import { SpamDetectorService } from '@/core/services/SpamDetectorService';

describe('SpamDetectorService (Unit Tests)', () => {
  const detector = new SpamDetectorService();

  describe('English spam word detection', () => {
    it('detects high-risk English spam trigger phrases', () => {
      const text = 'This is a 100% free opportunity to make money with zero risk free setup.';
      const matches = detector.check(text, 'en');

      const foundWords = matches.map(m => m.word);
      expect(foundWords).toContain('100% free');
      expect(foundWords).toContain('make money');
      expect(foundWords).toContain('risk free');
    });

    it('replaces English spam words with high-deliverability alternatives', () => {
      const text = 'Get your 100% free trial and act now to buy now.';
      const cleaned = detector.applyFixes(text, 'en');

      expect(cleaned).not.toContain('100% free');
      expect(cleaned).toContain('complimentary');
      expect(cleaned).toContain('time-sensitive');
      expect(cleaned).toContain('get started');
    });
  });

  describe('Spanish spam word detection', () => {
    it('detects Spanish spam trigger words', () => {
      const text = 'Esta oferta es 100% gratis, sin riesgo para que ganes dinero urgente.';
      const matches = detector.check(text, 'es');

      const foundWords = matches.map(m => m.word);
      expect(foundWords).toContain('100% gratis');
      expect(foundWords).toContain('sin riesgo');
      expect(foundWords).toContain('urgente');
    });

    it('replaces Spanish spam words with deliverability-friendly alternatives', () => {
      const text = 'Aprovecha esta oferta exclusiva que es 100% gratis y sin riesgo.';
      const cleaned = detector.applyFixes(text, 'es');

      expect(cleaned).not.toContain('100% gratis');
      expect(cleaned).toContain('de cortesía');
      expect(cleaned).toContain('con total respaldo');
      expect(cleaned).toContain('propuesta especial');
    });
  });

  describe('Boundary & Extensibility', () => {
    it('does not trigger on partial word matches (word boundary test)', () => {
      // "freedom" contains "free" but should not falsely trigger if boundary matching is enforced
      const text = 'We value freedom and creativity in all projects.';
      const matches = detector.check(text, 'en');
      const freeMatch = matches.find(m => m.word === 'free');
      expect(freeMatch).toBeUndefined();
    });

    it('allows registering custom spam words dynamically (Open/Closed Principle)', () => {
      detector.registerWords({
        'crypto rocket': { replacement: 'digital growth', category: 'high' }
      }, 'en');

      const text = 'Join our crypto rocket strategy.';
      const matches = detector.check(text, 'en');
      expect(matches.some(m => m.word === 'crypto rocket')).toBe(true);

      const cleaned = detector.applyFixes(text, 'en');
      expect(cleaned).toBe('Join our digital growth strategy.');
    });

    it('returns empty array when text has no spam words', () => {
      const text = 'Would you have 5 minutes next Tuesday to chat about SaaS retention?';
      const matches = detector.check(text, 'all');
      expect(matches).toEqual([]);
    });
  });
});
