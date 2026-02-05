import Papa from 'papaparse';
import type { CSVRow } from '@/types';

interface ParseResult {
  success: boolean;
  data: CSVRow[];
  errors: string[];
}

export function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase(),
      complete: (results) => {
        const errors: string[] = [];
        const data: CSVRow[] = [];

        // Check required columns
        const fields = results.meta.fields || [];
        if (!fields.includes('name')) {
          resolve({ success: false, data: [], errors: ['Missing required column: "name"'] });
          return;
        }
        if (!fields.includes('address')) {
          resolve({ success: false, data: [], errors: ['Missing required column: "address"'] });
          return;
        }

        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i] as Record<string, string>;
          const name = row['name']?.trim();
          const address = row['address']?.trim();

          if (!name) {
            errors.push(`Row ${i + 2}: Missing name`);
            continue;
          }
          if (!address) {
            errors.push(`Row ${i + 2}: Missing address`);
            continue;
          }

          data.push({
            name,
            address,
            lat: row['lat']?.trim() || undefined,
            lng: row['lng']?.trim() || undefined,
            color: row['color']?.trim() || undefined,
          });
        }

        resolve({ success: true, data, errors });
      },
      error: (error) => {
        resolve({ success: false, data: [], errors: [`CSV parsing error: ${error.message}`] });
      },
    });
  });
}

export function generateTemplateCSV(): string {
  return `name,address
"Richmond Main Office","123 Main St, Richmond, VA 23220"
"Norfolk Branch","456 Harbor Blvd, Norfolk, VA 23510"
"DC Metro Office","789 K Street NW, Washington, DC 20001"`;
}
