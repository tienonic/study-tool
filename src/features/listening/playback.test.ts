import { describe, expect, it, vi } from 'vitest';
import { PronunciationPlayer, audioCacheUrl } from './playback.ts';
import type { Flashcard, ListeningConfig } from '../../projects/types.ts';

function card(overrides: Partial<Flashcard> = {}): Flashcard {
  return { front: 'hola', back: 'hello', audio_text: 'hola', audio_src: 'sample/key.mp3', ...overrides };
}

function config(overrides: Partial<ListeningConfig> = {}): ListeningConfig {
  return { enabled: true, provider: 'cached-audio', locale: 'es-ES', ...overrides };
}

describe('deck-scoped pronunciation playback', () => {
  it('does nothing when listening is disabled', async () => {
    const createAudio = vi.fn();
    const player = new PronunciationPlayer({ createAudio, development: true });
    await expect(player.play(config({ enabled: false }), card())).resolves.toEqual({ played: false, reason: 'disabled' });
    expect(createAudio).not.toHaveBeenCalled();
  });

  it('plays the immutable local cache path and stops overlap before replay', async () => {
    const first = { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), currentTime: 5 } as unknown as HTMLAudioElement;
    const second = { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), currentTime: 2 } as unknown as HTMLAudioElement;
    const createAudio = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const player = new PronunciationPlayer({ createAudio, development: true });

    await expect(player.play(config(), card())).resolves.toMatchObject({ played: true, provider: 'cached-audio' });
    await player.play(config(), card());

    expect(createAudio).toHaveBeenNthCalledWith(1, '/__audio-cache?path=sample%2Fkey.mp3');
    expect(first.pause).toHaveBeenCalledOnce();
    expect(first.currentTime).toBe(0);
  });

  it('does not let a cancelled stale play clear the newer active audio', async () => {
    let rejectFirst: (reason?: unknown) => void = () => {};
    const first = {
      play: vi.fn(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject; })),
      pause: vi.fn(),
      currentTime: 5,
    } as unknown as HTMLAudioElement;
    const second = { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), currentTime: 2 } as unknown as HTMLAudioElement;
    const third = { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), currentTime: 1 } as unknown as HTMLAudioElement;
    const createAudio = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third);
    const player = new PronunciationPlayer({ createAudio, development: true });

    const stalePlay = player.play(config(), card());
    await expect(player.play(config(), card())).resolves.toMatchObject({ played: true, provider: 'cached-audio' });
    rejectFirst(new Error('cancelled'));
    await expect(stalePlay).resolves.toMatchObject({ played: false, provider: 'cached-audio' });
    await player.play(config(), card());

    expect(first.pause).toHaveBeenCalled();
    expect(second.pause).toHaveBeenCalledOnce();
    expect(second.currentTime).toBe(0);
  });

  it('reports a missing or corrupt required cache with an actionable error', async () => {
    const failedAudio = { play: vi.fn().mockRejectedValue(new Error('404')), pause: vi.fn(), currentTime: 0 } as unknown as HTMLAudioElement;
    const player = new PronunciationPlayer({ createAudio: () => failedAudio, development: true });
    await expect(player.play(config(), card())).rejects.toThrow('Regenerate this deck\'s audio cache');
    await expect(player.play(config(), card({ audio_src: undefined }))).rejects.toThrow('Generate this deck\'s audio cache');
  });

  it('keeps absolute and packaged audio URLs unchanged', () => {
    expect(audioCacheUrl('/audio/key.mp3', true)).toBe('/audio/key.mp3');
    expect(audioCacheUrl('https://example.test/key.mp3', true)).toBe('https://example.test/key.mp3');
    expect(audioCacheUrl('sample/key.mp3', false)).toBe('sample/key.mp3');
  });

  it('falls back from a failed optional cache to browser speech', async () => {
    let utterance: SpeechSynthesisUtterance | undefined;
    const synthesis = {
      cancel: vi.fn(),
      getVoices: () => [],
      speak: vi.fn((value: SpeechSynthesisUtterance) => {
        utterance = value;
        queueMicrotask(() => value.onstart?.(new Event('start') as SpeechSynthesisEvent));
      }),
    } as unknown as SpeechSynthesis;
    const failedAudio = { play: vi.fn().mockRejectedValue(new Error('network')), pause: vi.fn(), currentTime: 0 } as unknown as HTMLAudioElement;
    const player = new PronunciationPlayer({
      createAudio: () => failedAudio,
      speechSynthesis: synthesis,
      createUtterance: text => ({ text } as unknown as SpeechSynthesisUtterance),
      development: true,
    });

    await expect(player.play(config({ provider: 'auto' }), card())).resolves.toMatchObject({ played: true, provider: 'speech-synthesis' });
    expect(utterance?.lang).toBe('es-ES');
  });

  it('uses browser speech directly for a clicked highlighted word', async () => {
    let utterance: SpeechSynthesisUtterance | undefined;
    const synthesis = {
      cancel: vi.fn(),
      getVoices: () => [],
      speak: vi.fn((value: SpeechSynthesisUtterance) => {
        utterance = value;
        queueMicrotask(() => value.onstart?.(new Event('start') as SpeechSynthesisEvent));
      }),
    } as unknown as SpeechSynthesis;
    const createAudio = vi.fn();
    const player = new PronunciationPlayer({
      createAudio,
      speechSynthesis: synthesis,
      createUtterance: text => ({ text } as unknown as SpeechSynthesisUtterance),
      development: true,
    });

    await expect(player.playText(config(), 'образ')).resolves.toMatchObject({ played: true, provider: 'speech-synthesis' });
    expect(createAudio).not.toHaveBeenCalled();
    expect((utterance as unknown as { text: string })?.text).toBe('образ');
    expect(utterance?.lang).toBe('es-ES');
  });

  it('fails promptly when speech is denied or never starts', async () => {
    vi.useFakeTimers();
    try {
      const synthesis = {
        cancel: vi.fn(),
        getVoices: () => [],
        speak: vi.fn(),
      } as unknown as SpeechSynthesis;
      const player = new PronunciationPlayer({
        createAudio: vi.fn(),
        speechSynthesis: synthesis,
        createUtterance: text => ({ text } as unknown as SpeechSynthesisUtterance),
        development: true,
      }, 50);

      const pending = player.play(config({ provider: 'speech-synthesis' }), card({ audio_src: undefined }));
      const rejection = expect(pending).rejects.toThrow('Check browser audio permission');
      await vi.advanceTimersByTimeAsync(50);
      await rejection;
      expect(synthesis.cancel).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles an in-flight speech request when the deck is switched or disposed', async () => {
    const synthesis = { cancel: vi.fn(), getVoices: () => [], speak: vi.fn() } as unknown as SpeechSynthesis;
    const player = new PronunciationPlayer({
      createAudio: vi.fn(),
      speechSynthesis: synthesis,
      createUtterance: text => ({ text } as unknown as SpeechSynthesisUtterance),
      development: true,
    });

    const pending = player.play(config({ provider: 'speech-synthesis' }), card({ audio_src: undefined }));
    player.stop();
    await expect(pending).resolves.toMatchObject({ played: false, provider: 'speech-synthesis' });
    expect(synthesis.cancel).toHaveBeenCalled();
  });
});
