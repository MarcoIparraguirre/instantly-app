import { describe, it, expect } from 'vitest';
import { translations } from '@/i18n/translations';

describe('Translations Coverage & Invariance (Regression Tests)', () => {
  function getDeepKeys(obj: Record<string, any>, prefix = ''): string[] {
    let keys: string[] = [];
    for (const key of Object.keys(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        keys = keys.concat(getDeepKeys(obj[key], fullPath));
      } else {
        keys.push(fullPath);
      }
    }
    return keys;
  }

  const enKeys = getDeepKeys(translations.en);
  const esKeys = getDeepKeys(translations.es);

  it('all English translation keys have matching Spanish translation keys', () => {
    const missingInEs = enKeys.filter(k => !esKeys.includes(k));
    expect(missingInEs, `Missing Spanish keys: ${missingInEs.join(', ')}`).toEqual([]);
  });

  it('all Spanish translation keys have matching English translation keys', () => {
    const missingInEn = esKeys.filter(k => !enKeys.includes(k));
    expect(missingInEn, `Missing English keys: ${missingInEn.join(', ')}`).toEqual([]);
  });

  it('no translation values are empty or undefined', () => {
    enKeys.forEach(k => {
      const keys = k.split('.');
      let val: any = translations.en;
      keys.forEach(sub => (val = val?.[sub]));
      expect(typeof val).toBe('string');
      expect(val.trim().length).toBeGreaterThan(0);
    });

    esKeys.forEach(k => {
      const keys = k.split('.');
      let val: any = translations.es;
      keys.forEach(sub => (val = val?.[sub]));
      expect(typeof val).toBe('string');
      expect(val.trim().length).toBeGreaterThan(0);
    });
  });
});
