import { describe, it, expect } from 'vitest';
import { SpintaxService } from '@/core/services/SpintaxService';

describe('SpintaxService (Unit Tests)', () => {
  const service = new SpintaxService();

  it('resolves basic spintax pattern {A|B|C} while preserving template variables like {{firstName}}', () => {
    const text = '{Hi|Hello|Hey} {{firstName}}!';
    const resolved = service.resolve(text);
    const validGreetings = ['Hi {{firstName}}!', 'Hello {{firstName}}!', 'Hey {{firstName}}!'];
    expect(validGreetings).toContain(resolved);
  });

  it('resolves nested spintax patterns recursively', () => {
    const text = '{Quick question|{Good morning|Good afternoon}}, {{firstName}}!';
    const resolved = service.resolve(text);
    const validOutcomes = [
      'Quick question, {{firstName}}!',
      'Good morning, {{firstName}}!',
      'Good afternoon, {{firstName}}!'
    ];
    expect(validOutcomes).toContain(resolved);
  });

  it('returns plain text unchanged if no spintax is present', () => {
    const text = 'This is a standard text with no spintax brackets.';
    expect(service.resolve(text)).toBe(text);
  });

  it('generates English spintax variations for common phrases', () => {
    const input = 'Hi John, let me know what you think. Can we talk this week?';
    const output = service.generate(input, 'en');

    expect(output).toContain('{Hi|Hello|Hey}');
    expect(output).toContain('{Let me know if you would be open to exploring this|Worth a quick conversation?|Curious to get your take on this}');
    expect(output).toMatch(/\{.+\}/);
  });

  it('generates Spanish spintax variations for common phrases', () => {
    const input = 'Hola Juan, avísame si te interesa. ¿Tienes 10 minutos?';
    const output = service.generate(input, 'es');

    expect(output).toContain('{Hola|Qué tal|Espero que todo vaya bien}');
    expect(output).toMatch(/\{.+\}/);
  });

  it('handles empty or null strings safely', () => {
    expect(service.resolve('')).toBe('');
    expect(service.generate('')).toBe('');
  });
});
