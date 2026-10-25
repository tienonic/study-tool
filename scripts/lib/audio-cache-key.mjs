import { createHash } from 'node:crypto';

export function normalizeAudioText(value) {
  return String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function audioCacheDescriptor({ text, voice, rate, pronunciationOverride, engineVersion, provider }) {
  return {
    normalized_text: normalizeAudioText(text),
    voice: String(voice),
    rate: Number(rate),
    pronunciation_override: normalizeAudioText(pronunciationOverride),
    engine_version: String(engineVersion),
    provider: String(provider),
  };
}

export function audioCacheKey(descriptor) {
  return createHash('sha256').update(JSON.stringify(descriptor)).digest('hex');
}

export function edgeTtsRateArgument(rate) {
  const percent = Math.round((Number(rate) - 1) * 100);
  return `--rate=${percent >= 0 ? '+' : ''}${percent}%`;
}
