const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const GEMINI_MODELS = {
  LITE: 'gemini-2.0-flash-lite',
  FLASH: 'gemini-2.0-flash',
  PRO: 'gemini-2.5-pro',
} as const;

export function getGeminiKey(): string | null {
  try { return sessionStorage.getItem('gemini-api-key'); } catch { return null; }
}

export function setGeminiKey(key: string) {
  try { sessionStorage.setItem('gemini-api-key', key); } catch { /* */ }
}

export async function callGemini(
  prompt: string,
  systemInstruction: string,
  model: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error('Gemini API key not set. Add it in Create tab settings.');

  const resp = await fetch(
    `${GEMINI_BASE}/${model}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      }),
      signal,
    },
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  if (!resp.body) throw new Error('Response body is null');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const event = JSON.parse(data);
        const text = event.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) onChunk(text);
      } catch {
        // Skip malformed SSE lines
      }
    }
  }
}
