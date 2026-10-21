export interface SheetLeadRow {
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  website?: string;
  customVariables?: Record<string, string>;
}

export interface IGoogleSheetsService {
  extractSheetId(urlOrId: string): string;
  fetchSheetRows(sheetIdOrUrl: string, accessToken?: string): Promise<Record<string, string>[]>;
  mapRowsToLeads(rows: Record<string, string>[], campaignId?: string): SheetLeadRow[];
}

export class GoogleSheetsService implements IGoogleSheetsService {
  /**
   * Extracts Google Spreadsheet ID from a standard URL or returns the raw ID.
   * e.g. https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0
   */
  extractSheetId(urlOrId: string): string {
    if (!urlOrId) return '';
    const trimmed = urlOrId.trim();

    // Regex matching /spreadsheets/d/([a-zA-Z0-9-_]+)
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }

    // If it's already an alphanumeric ID
    if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
      return trimmed;
    }

    return trimmed;
  }

  /**
   * Fetches rows from Google Sheets.
   * If accessToken is provided, queries the Google Sheets API v4.
   * Otherwise, fetches the published / public CSV export endpoint.
   */
  async fetchSheetRows(sheetIdOrUrl: string, accessToken?: string): Promise<Record<string, string>[]> {
    const sheetId = this.extractSheetId(sheetIdOrUrl);
    if (!sheetId) {
      throw new Error('Invalid Google Sheet URL or Spreadsheet ID.');
    }

    if (accessToken) {
      // Authenticated Google Sheets API v4 Call
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:ZZ5000`;
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Google Sheets API error: HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawValues: string[][] = json.values || [];
      return this.parseGridToRecords(rawValues);
    } else {
      // Public / Link-shared Sheet CSV Export endpoint
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const res = await fetch(csvUrl, {
        headers: {
          Accept: 'text/csv'
        }
      });

      if (!res.ok) {
        throw new Error(
          'Could not fetch Google Sheet. Please make sure the sheet sharing is set to "Anyone with the link can view", or authenticate with Google.'
        );
      }

      const csvText = await res.text();
      return this.parseCsvToRecords(csvText);
    }
  }

  /**
   * Parses raw 2D array grid into array of objects using first row as headers.
   */
  parseGridToRecords(grid: string[][]): Record<string, string>[] {
    if (!grid || grid.length < 2) return [];

    const headers = grid[0].map(h => (h || '').trim());
    const records: Record<string, string>[] = [];

    for (let i = 1; i < grid.length; i++) {
      const row = grid[i];
      if (!row || row.length === 0 || row.every(cell => !cell?.trim())) continue;

      const record: Record<string, string> = {};
      headers.forEach((header, colIdx) => {
        if (header) {
          record[header] = (row[colIdx] || '').trim();
        }
      });
      records.push(record);
    }

    return records;
  }

  /**
   * Parses CSV string into structured records.
   */
  parseCsvToRecords(csv: string): Record<string, string>[] {
    if (!csv || !csv.trim()) return [];

    // Simple CSV row parser handling quotes
    const parseLine = (line: string): string[] => {
      const entries: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          entries.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      entries.push(current.trim().replace(/^"|"$/g, ''));
      return entries;
    };

    const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = parseLine(lines[0]);
    const records: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseLine(lines[i]);
      if (row.length === 0 || row.every(c => !c)) continue;

      const record: Record<string, string> = {};
      headers.forEach((header, idx) => {
        if (header) {
          record[header] = row[idx] || '';
        }
      });
      records.push(record);
    }

    return records;
  }

  /**
   * Returns list of unique column headers detected across all rows.
   */
  getDetectedColumns(rows: Record<string, string>[]): string[] {
    const colSet = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (k && k.trim()) colSet.add(k.trim());
      }
    }
    return Array.from(colSet);
  }

  /**
   * Intelligently maps Sheet columns (English and Spanish variations) to Lead properties.
   */
  mapRowsToLeads(rows: Record<string, string>[]): SheetLeadRow[] {
    const leads: SheetLeadRow[] = [];

    for (const row of rows) {
      let email = '';
      let firstName = '';
      let lastName = '';
      let companyName = '';
      let website = '';
      const customVariables: Record<string, string> = {};

      for (const [rawKey, rawVal] of Object.entries(row)) {
        const key = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '');
        const val = (rawVal || '').trim();

        if (!val) continue;

        // Keep all non-empty columns as custom variables so ANY header like {{Cargo}}, {{Nombre}}, {{Ciudad}} works!
        customVariables[rawKey] = val;

        if (key === 'email' || key === 'correo' || key === 'mail' || key === 'emailaddress') {
          email = val;
        } else if (
          key === 'firstname' ||
          key === 'first' ||
          key === 'nombre' ||
          key === 'name' ||
          key === 'fname'
        ) {
          firstName = val;
        } else if (key === 'lastname' || key === 'last' || key === 'apellido' || key === 'lname') {
          lastName = val;
        } else if (
          key === 'company' ||
          key === 'companyname' ||
          key === 'empresa' ||
          key === 'organization'
        ) {
          companyName = val;
        } else if (key === 'website' || key === 'url' || key === 'sitio' || key === 'web') {
          website = val;
        }
      }

      // Only add valid prospects with an email address
      if (email && email.includes('@')) {
        leads.push({
          email,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          companyName: companyName || undefined,
          website: website || undefined,
          customVariables: Object.keys(customVariables).length > 0 ? customVariables : undefined
        });
      }
    }

    return leads;
  }
}
