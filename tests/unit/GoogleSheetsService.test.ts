import { describe, it, expect } from 'vitest';
import { GoogleSheetsService } from '@/core/services/GoogleSheetsService';

describe('GoogleSheetsService (Unit Tests)', () => {
  const service = new GoogleSheetsService();

  it('extracts spreadsheet ID from various Google Sheet URL formats', () => {
    const urls = [
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0',
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv',
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
    ];

    urls.forEach(url => {
      expect(service.extractSheetId(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    });
  });

  it('parses CSV text into structured records', () => {
    const csv = `email,first_name,last_name,company,role\nalice@tech.com,Alice,Wonder,Tech Corp,VP Sales\nbob@dev.io,Bob,Builder,Build LLC,Founder`;
    const records = service.parseCsvToRecords(csv);

    expect(records.length).toBe(2);
    expect(records[0]).toEqual({
      email: 'alice@tech.com',
      first_name: 'Alice',
      last_name: 'Wonder',
      company: 'Tech Corp',
      role: 'VP Sales'
    });
    expect(records[1].email).toBe('bob@dev.io');
  });

  it('maps English and Spanish column headers intelligently to Lead objects', () => {
    const spanishRows = [
      {
        correo: 'carlos@empresa.es',
        nombre: 'Carlos',
        apellido: 'Santana',
        empresa: 'Guitarras SL',
        sector: 'Música'
      }
    ];

    const leads = service.mapRowsToLeads(spanishRows);
    expect(leads.length).toBe(1);
    expect(leads[0].email).toBe('carlos@empresa.es');
    expect(leads[0].firstName).toBe('Carlos');
    expect(leads[0].lastName).toBe('Santana');
    expect(leads[0].companyName).toBe('Guitarras SL');
    expect(leads[0].customVariables?.sector).toBe('Música');
  });

  it('filters out rows without valid email addresses', () => {
    const mixedRows = [
      { email: 'valid@domain.com', name: 'Valid User' },
      { email: 'not-an-email', name: 'Invalid' },
      { email: '', name: 'Empty' }
    ];

    const leads = service.mapRowsToLeads(mixedRows);
    expect(leads.length).toBe(1);
    expect(leads[0].email).toBe('valid@domain.com');
  });
});
