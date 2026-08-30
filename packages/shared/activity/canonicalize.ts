import { createHash } from 'node:crypto';

function normalizeString(value: string): string {
  return value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
}

export function canonicalize(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(normalizeString(value));
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}
