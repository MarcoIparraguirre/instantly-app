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
  extractSheetGid(urlOrId: string): string | undefined;
  fetchSheetRows(sheetIdOrUrl: string, accessToken?: string): Promise<Record<string, string>[]>;
  mapRowsToLeads(rows: Record<string, string>[], campaignId?: string): SheetLeadRow[];
  mapRowsWithSelection(
    rows: Record<string, string>[],
    emailColumn: string,
    selectedColumns: string[]
  ): SheetLeadRow[];
  detectEmailColumn(columns: string[], rows: Record<string, string>[]): string;
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
   * Extracts the specific tab/worksheet gid from a Google Sheets URL if present.
   */
  extractSheetGid(urlOrId: string): string | undefined {
    if (!urlOrId) return undefined;
    const match = urlOrId.match(/[#?&]gid=([0-9]+)/);
    return match && match[1] ? match[1] : undefined;
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
      // Public / Link-shared Sheet CSV Export endpoint (preserving tab gid if present)
      const gid = this.extractSheetGid(sheetIdOrUrl);
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
      const res = await fetch(csvUrl, {
        headers: {
          Accept: 'text/csv'
        }
      });

      if (!res.ok) {
        throw new Error(
          'No se pudo leer el Google Sheet. Asegúrate de que el archivo esté compartido como "Cualquier persona con el enlace puede ver (Lector)".'
        );
      }

      const csvText = await res.text();
      const trimmedText = (csvText || '').trim();
      if (
        trimmedText.startsWith('<!DOCTYPE html') ||
        trimmedText.startsWith('<html') ||
        trimmedText.includes('accounts.google.com/ServiceLogin')
      ) {
        throw new Error(
          'El documento de Google Sheets es privado. Haz clic en "Compartir" > "Cualquier persona con el enlace" (Lector) e intenta de nuevo.'
        );
      }

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
   * Parses CSV string into structured records, supporting multiline quoted cells,
   * escaped quotes (""), and automatic comma (,) vs semicolon (;) delimiter detection.
   */
  parseCsvToRecords(csv: string): Record<string, string>[] {
    if (!csv || !csv.trim()) return [];

    // Strip UTF-8 BOM if present
    const cleanCsv = csv.replace(/^\uFEFF/, '');

    // Detect delimiter (',' vs ';') on the first header line outside quotes
    const firstLineEnd = cleanCsv.search(/\r?\n/);
    const headerSample = firstLineEnd !== -1 ? cleanCsv.slice(0, firstLineEnd) : cleanCsv;
    let commaCount = 0;
    let semiCount = 0;
    let sampleInQuotes = false;
    for (let i = 0; i < headerSample.length; i++) {
      const ch = headerSample[i];
      if (ch === '"') sampleInQuotes = !sampleInQuotes;
      else if (!sampleInQuotes && ch === ',') commaCount++;
      else if (!sampleInQuotes && ch === ';') semiCount++;
    }
    const delimiter = semiCount > commaCount ? ';' : ',';

    // Full state-machine parser supporting multiline quoted values
    const grid: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < cleanCsv.length; i++) {
      const char = cleanCsv[i];
      const nextChar = cleanCsv[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField.trim());
        if (currentRow.some(cell => cell.length > 0)) {
          grid.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }

    // Flush last field/row
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(cell => cell.length > 0)) {
        grid.push(currentRow);
      }
    }

    if (grid.length < 2) return [];

    const headers = grid[0].map(h => h.replace(/^"|"$/g, '').trim());
    const records: Record<string, string>[] = [];

    for (let i = 1; i < grid.length; i++) {
      const row = grid[i];
      if (row.length === 0 || row.every(c => !c)) continue;

      const record: Record<string, string> = {};
      headers.forEach((header, idx) => {
        if (header) {
          record[header] = (row[idx] || '').replace(/^"|"$/g, '').trim();
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
   * Auto-detects the column most likely containing email addresses.
   */
  detectEmailColumn(columns: string[], rows: Record<string, string>[]): string {
    if (!columns || columns.length === 0) return '';

    // 1. Exact common header match
    const exactMatch = columns.find(col => {
      const norm = col.toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        norm === 'email' ||
        norm === 'correo' ||
        norm === 'mail' ||
        norm === 'emailaddress' ||
        norm === 'correoelectronico' ||
        norm === 'e_mail'
      );
    });
    if (exactMatch) return exactMatch;

    // 2. Partial header match
    const partialMatch = columns.find(col => {
      const norm = col.toLowerCase();
      return norm.includes('mail') || norm.includes('correo');
    });
    if (partialMatch) return partialMatch;

    // 3. Content inspection across first 5 rows
    const sampleRows = rows.slice(0, 5);
    for (const col of columns) {
      const hasAt = sampleRows.some(r => {
        const val = (r[col] || '').trim();
        return val.includes('@') && val.includes('.');
      });
      if (hasAt) return col;
    }

    return columns[0];
  }

  /**
   * Maps rows using an explicitly chosen emailColumn and filters customVariables
   * to ONLY the columns selected by the user.
   */
  mapRowsWithSelection(
    rows: Record<string, string>[],
    emailColumn: string,
    selectedColumns: string[]
  ): SheetLeadRow[] {
    const leads: SheetLeadRow[] = [];
    const selectedSet = new Set(selectedColumns);

    for (const row of rows) {
      let email = (row[emailColumn] || '').trim();

      // Fallback search if emailColumn wasn't matched directly
      if (!email || !email.includes('@')) {
        for (const [k, v] of Object.entries(row)) {
          const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (norm === 'email' || norm === 'correo' || norm === 'mail' || norm === 'emailaddress') {
            if (v && v.includes('@')) {
              email = v.trim();
              break;
            }
          }
        }
      }

      if (!email || !email.includes('@')) continue;

      let firstName = '';
      let lastName = '';
      let companyName = '';
      let website = '';
      const customVariables: Record<string, string> = {};

      for (const [rawKey, rawVal] of Object.entries(row)) {
        const key = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '');
        const val = (rawVal || '').trim();

        // Only include in customVariables if the column was selected by the user
        if (selectedSet.has(rawKey) && val) {
          customVariables[rawKey] = val;
        }

        if (!val) continue;

        if (
          key === 'firstname' ||
          key === 'first' ||
          key === 'nombre' ||
          key === 'name' ||
          key === 'fname' ||
          key === 'Destinatario'.toLowerCase()
        ) {
          if (!firstName) firstName = val;
        } else if (key === 'lastname' || key === 'last' || key === 'apellido' || key === 'lname') {
          if (!lastName) lastName = val;
        } else if (
          key === 'company' ||
          key === 'companyname' ||
          key === 'empresa' ||
          key === 'organization'
        ) {
          if (!companyName) companyName = val;
        } else if (key === 'website' || key === 'url' || key === 'sitio' || key === 'web') {
          if (!website) website = val;
        }
      }

      leads.push({
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        companyName: companyName || undefined,
        website: website || undefined,
        customVariables
      });
    }

    return leads;
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
