import type { Capabilities, ConversionOption, ConversionType } from './types'

/** Every conversion the frontend knows how to present. */
export const CONVERSION_CATALOG: Record<ConversionType, ConversionOption> = {
  TXT_TO_UPPERCASE: {
    id: 'TXT_TO_UPPERCASE',
    label: 'TXT → Uppercase TXT',
    description: 'Converts every letter in a plain-text file to uppercase.',
    inputExtensions: ['txt'],
    inputMimeTypes: ['text/plain'],
    outputExtension: 'txt',
    outputMimeType: 'text/plain',
  },
  CSV_TO_JSON: {
    id: 'CSV_TO_JSON',
    label: 'CSV → JSON',
    description: 'Parses CSV rows (first row = headers) into a JSON array of objects.',
    inputExtensions: ['csv'],
    // Browsers report CSV inconsistently, especially on Windows.
    inputMimeTypes: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
    outputExtension: 'json',
    outputMimeType: 'application/json',
  },
  PNG_TO_JPEG: {
    id: 'PNG_TO_JPEG',
    label: 'PNG → JPEG',
    description: 'Re-encodes a PNG image as JPEG using the sharp image library on AWS Lambda.',
    inputExtensions: ['png'],
    inputMimeTypes: ['image/png'],
    outputExtension: 'jpg',
    outputMimeType: 'image/jpeg',
  },
}

export const ALL_CONVERSIONS = Object.values(CONVERSION_CATALOG)

/** Conversions that run locally in the browser in demo mode. */
export const LOCAL_DEMO_CONVERSIONS: ConversionType[] = ['TXT_TO_UPPERCASE']

export function conversionLabel(id: string): string {
  return CONVERSION_CATALOG[id as ConversionType]?.label ?? id
}

/** Keep only the catalog entries the backend reports as supported. */
export function optionsFromCapabilities(caps: Capabilities | null): ConversionOption[] {
  if (!caps) return []
  const ids = new Set(caps.conversions.map((c) => c.id))
  return ALL_CONVERSIONS.filter((c) => ids.has(c.id))
}
