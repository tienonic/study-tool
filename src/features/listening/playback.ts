import type { Flashcard, ListeningConfig } from '../../projects/types.ts';

export type PronunciationProvider = 'cached-audio' | 'speech-synthesis';

export interface PronunciationResult {
  played: boolean;
  provider?: PronunciationProvider;
  reason?: 'disabled' | 'missing-text';
}

interface PlaybackEnvironment {
  createAudio: (url: string) => HTMLAudioElement;
  speechSynthesis?: SpeechSynthesis;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
  development: boolean;
}

function browserEnvironment(): PlaybackEnvironment {
  return {
    createAudio: url => new Audio(url),
    speechSynthesis: typeof window !== 'undefined' ? window.speechSynthesis : undefined,
    createUtterance: typeof SpeechSynthesisUtterance !== 'undefined'
      ? text => new SpeechSynthesisUtterance(text)
      : undefined,
    development: import.meta.env.DEV,
  };
}

export function audioCacheUrl(source: string, development = import.meta.env.DEV): string {
  if (/^(?:https?:|data:|blob:|\/)/iu.test(source)) return source;
  return development ? `/__audio-cache?path=${encodeURIComponent(source)}` : source;
}

function pronunciationText(card: Flashcard): string {
  return (card.pronunciation_override || card.audio_text || '').normalize('NFC').trim();
}

export function canPlayPronunciation(config: ListeningConfig, card: Flashcard | null): boolean {
  if (!config.enabled || !card || !pronunciationText(card)) return false;
  const provider = config.provider ?? 'auto';
  if (provider === 'cached-audio') return !!card.audio_src;
  if (provider === 'speech-synthesis') {
    return typeof window !== 'undefined' && !!window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined';
  }
  return !!card.audio_src
    || (typeof window !== 'undefined' && !!window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined');
}

export class PronunciationPlayer {
  private activeAudio: HTMLAudioElement | null = null;
  private abortPendingSpeech: (() => void) | null = null;
  private generation = 0;

  constructor(
    private readonly environment: PlaybackEnvironment = browserEnvironment(),
    private readonly speechStartTimeoutMs = 3_000,
  ) {}

  stop(): void {
    this.generation += 1;
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.currentTime = 0;
      this.activeAudio = null;
    }
    this.abortPendingSpeech?.();
    this.abortPendingSpeech = null;
    this.environment.speechSynthesis?.cancel();
  }

  async play(config: ListeningConfig, card: Flashcard | null): Promise<PronunciationResult> {
    if (!config.enabled) return { played: false, reason: 'disabled' };
    if (!card) return { played: false, reason: 'missing-text' };
    const text = pronunciationText(card);
    if (!text) return { played: false, reason: 'missing-text' };

    this.stop();
    const generation = this.generation;
    const provider = config.provider ?? 'auto';
    if ((provider === 'cached-audio' || provider === 'auto') && card.audio_src) {
      const audio = this.environment.createAudio(audioCacheUrl(card.audio_src, this.environment.development));
      this.activeAudio = audio;
      try {
        await audio.play();
        if (generation !== this.generation) audio.pause();
        return { played: generation === this.generation, provider: 'cached-audio' };
      } catch {
        if (this.activeAudio === audio) this.activeAudio = null;
        if (generation !== this.generation) {
          audio.pause();
          return { played: false, provider: 'cached-audio' };
        }
        if (provider === 'cached-audio') {
          throw new Error('Pronunciation audio is unavailable. Regenerate this deck\'s audio cache.');
        }
      }
    }

    if (provider === 'cached-audio') {
      throw new Error('Pronunciation audio is missing. Generate this deck\'s audio cache.');
    }
    return this.playSpeech(config, text, generation);
  }

  playText(config: ListeningConfig, text: string): Promise<PronunciationResult> {
    const audioText = text.normalize('NFC').trim();
    return this.play(
      { ...config, provider: 'speech-synthesis' },
      audioText ? { front: audioText, back: '', audio_text: audioText } : null,
    );
  }

  private async playSpeech(config: ListeningConfig, text: string, generation: number): Promise<PronunciationResult> {
    const synthesis = this.environment.speechSynthesis;
    const createUtterance = this.environment.createUtterance;
    if (!synthesis || !createUtterance) {
      throw new Error('Speech playback is unavailable in this browser.');
    }
    const utterance = createUtterance(text);
    utterance.lang = config.locale
      || (typeof document !== 'undefined' ? document.documentElement.lang : '')
      || 'en-US';
    utterance.rate = config.rate ?? 1;
    const voices = synthesis.getVoices();
    const languagePrefix = utterance.lang.split('-')[0].toLowerCase();
    const requestedVoice = config.voice
      ? voices.find(voice => voice.name === config.voice)
      : voices.find(voice => voice.lang.toLowerCase() === utterance.lang.toLowerCase())
        ?? voices.find(voice => voice.lang.toLowerCase().split('-')[0] === languagePrefix);
    if (config.voice && !requestedVoice) {
      throw new Error(`The configured pronunciation voice "${config.voice}" is unavailable.`);
    }
    if (requestedVoice) utterance.voice = requestedVoice;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (this.abortPendingSpeech === abort) this.abortPendingSpeech = null;
        utterance.onstart = null;
        utterance.onerror = null;
        callback();
      };
      const abort = () => finish(resolve);
      const timeout = setTimeout(() => {
        synthesis.cancel();
        finish(() => reject(new Error('Speech playback did not start. Check browser audio permission and the selected voice.')));
      }, this.speechStartTimeoutMs);
      this.abortPendingSpeech = abort;
      utterance.onstart = () => finish(resolve);
      utterance.onerror = () => finish(() => reject(new Error('Pronunciation playback was blocked or failed.')));
      try {
        synthesis.speak(utterance);
      } catch {
        finish(() => reject(new Error('Pronunciation playback was blocked or failed.')));
      }
    });
    return { played: generation === this.generation, provider: 'speech-synthesis' };
  }
}

const sharedPlayer = new PronunciationPlayer();

export function playPronunciation(config: ListeningConfig, card: Flashcard | null) {
  return sharedPlayer.play(config, card);
}

/** Speak an arbitrary highlighted term without looking for card-level cached audio. */
export function playPronunciationText(config: ListeningConfig, text: string) {
  return sharedPlayer.playText(config, text);
}

export function stopPronunciation() {
  sharedPlayer.stop();
}
