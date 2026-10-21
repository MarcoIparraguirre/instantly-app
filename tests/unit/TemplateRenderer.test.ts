import { describe, it, expect } from 'vitest';
import { TemplateRenderer } from '@/core/services/TemplateRenderer';

describe('TemplateRenderer (Unit Tests)', () => {
  const renderer = new TemplateRenderer();

  it('interpolates standard lead fields correctly', () => {
    const template = 'Hi {{firstName}} {{lastName}}, saw your work at {{companyName}}!';
    const lead = {
      firstName: 'Sarah',
      lastName: 'Connor',
      companyName: 'Cyberdyne',
      email: 'sarah@cyberdyne.com'
    };

    const result = renderer.render(template, lead);
    expect(result).toBe('Hi Sarah Connor, saw your work at Cyberdyne!');
  });

  it('uses intelligent fallbacks when lead fields are missing', () => {
    const template = 'Hi {{firstName}}, reaching out to {{companyName}}.';
    const lead = {
      email: 'lead@example.com'
    };

    const result = renderer.render(template, lead);
    expect(result).toBe('Hi there, reaching out to your company.');
  });

  it('interpolates customVariables dynamically', () => {
    const template = 'Loved your recent {{industry}} report on {{metric}}.';
    const lead = {
      firstName: 'Alex',
      companyName: 'TechCorp',
      email: 'alex@techcorp.com',
      customVariables: {
        industry: 'Fintech',
        metric: 'Q3 retention rates'
      }
    };

    const result = renderer.render(template, lead);
    expect(result).toBe('Loved your recent Fintech report on Q3 retention rates.');
  });

  it('strips unresolved tags cleanly to prevent broken emails', () => {
    const template = 'Hello {{firstName}}, checking {{unresolvedTag1}} and {{unknownVar}}.';
    const lead = { firstName: 'John', email: 'john@example.com' };

    const result = renderer.render(template, lead);
    expect(result).toBe('Hello John, checking  and .');
  });

  it('handles empty template gracefully', () => {
    expect(renderer.render('', {})).toBe('');
  });
});
