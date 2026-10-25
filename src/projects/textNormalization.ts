import type { ProjectData } from './types.ts';

const CP1252_OVERRIDES = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

const MOJIBAKE_SEQUENCE =
  /(?:Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]?|â[\u0080-\u00bf\u02c6\u02dc\u2018-\u2026\u2030\u20ac\u2122]{1,3})/g;

function cp1252ByteFor(char: string): number | null {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return null;
  if (codePoint <= 0xff) return codePoint;
  return CP1252_OVERRIDES.get(codePoint) ?? null;
}

function decodeCp1252AsUtf8(text: string): string | null {
  const bytes: number[] = [];
  for (const char of text) {
    const byte = cp1252ByteFor(char);
    if (byte === null) return null;
    bytes.push(byte);
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

export function normalizeTextEncoding(text: string): string {
  return text.replace(MOJIBAKE_SEQUENCE, (match) => decodeCp1252AsUtf8(match) ?? match);
}

export function normalizeProjectText<T>(value: T): T {
  if (typeof value === 'string') return normalizeTextEncoding(value) as T;
  if (Array.isArray(value)) return value.map(item => normalizeProjectText(item)) as T;
  if (!value || typeof value !== 'object') return value;

  const normalized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    normalized[key] = normalizeProjectText(nested);
  }
  return normalized as T;
}

export function normalizeProjectData(data: ProjectData): ProjectData {
  return normalizeProjectText(data);
}
