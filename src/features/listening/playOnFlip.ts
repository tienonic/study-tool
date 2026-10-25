import type { ListeningConfig } from '../../projects/types.ts';

export function shouldPlayAfterFlashFlip(
  config: ListeningConfig | undefined,
  before: boolean,
  after: boolean,
): boolean {
  return before !== after && config?.enabled === true && config.play_on_flip !== false;
}

export function createManualPronunciationGate() {
  let manuallyPlayedCardId: string | null = null;
  return {
    mark(cardId: string | null) {
      manuallyPlayedCardId = cardId;
    },
    consume(cardId: string | null): boolean {
      const shouldSuppress = !!cardId && manuallyPlayedCardId === cardId;
      manuallyPlayedCardId = null;
      return shouldSuppress;
    },
  };
}
