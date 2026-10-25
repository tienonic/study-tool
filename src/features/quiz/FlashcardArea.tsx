import { Show, For, createEffect, createMemo, createSignal, untrack } from 'solid-js';
import type { FlashView } from './types.ts';
import { easyMode } from '../../core/store/app.ts';
import { LatexHtml } from '../../components/LatexText.tsx';
import { AddNewCards } from './McqCard.tsx';
import { SourceFigure, SourceFigureNotice } from './SourceFigure.tsx';
import { figuresReady } from './sourceFigures.ts';
import { stripDuplicateFlashTitle } from './flashIdentity.ts';
import { getLabel } from '../settings/keybinds.ts';
import { cleanFlashBack, cleanFlashFront } from '../../projects/studyCopy.ts';
import { activeProject } from '../../core/store/app.ts';
import { chooseMixedDefinitionFirst, presentFlashcard } from './flashPresentation.ts';
import { mixedPromptSides } from './mixedPromptSides.ts';
import { formatRussianStudyHtml, type RussianStudyFormatOptions } from './russianText.ts';
import { isFavorite, toggleFavorite } from './favorites.ts';
import { playPronunciationText } from '../listening/playback.ts';

const RATING_CSS: Record<number, string> = { 1: 'rating-again', 2: 'rating-hard', 3: 'rating-good', 4: 'rating-easy' };
const COMPLEX_RATINGS = [
  { rating: 1, name: 'Again' },
  { rating: 3, name: 'Good' },
  { rating: 2, name: 'Hard' },
  { rating: 3, name: 'Good' },
  { rating: 4, name: 'Easy' },
] as const;

export function FlashcardArea(props: { session: FlashView }) {
  const s = props.session;
  const mixedChoices = new Map<string, boolean>();
  const [mixedDefinitionFirst, setMixedDefinitionFirst] = createSignal<boolean | null>(null);
  let observedCardId = s.flashCardId();

  createEffect(() => {
    const cardId = s.flashCardId();
    if (cardId === observedCardId) return;
    observedCardId = cardId;
    if (!cardId || !untrack(mixedPromptSides)) {
      setMixedDefinitionFirst(null);
      return;
    }
    setMixedDefinitionFirst(chooseMixedDefinitionFirst(mixedChoices, cardId));
  });

  const definitionFirst = () => mixedDefinitionFirst() ?? s.flashDefFirst();
  const presentation = createMemo(() => {
    const card = s.activeFlashcard();
    if (card) return presentFlashcard(card, definitionFirst());
    return {
      front: s.flashFront(),
      back: s.flashBack(),
      frontImage: s.flashFrontImage(),
      backImage: s.flashBackImage(),
    };
  });
  const answerImage = () => presentation().backImage || presentation().frontImage;
  const expandedBack = () => s.flashFlipped() && !!answerImage();
  const front = () => cleanFlashFront(presentation().front);
  const title = () => cleanFlashFront(s.flashTitle());
  const backBody = () => cleanFlashBack(stripDuplicateFlashTitle(presentation().back, s.flashTitle()));
  const reviewingHistory = () => s.state() === 'reviewing-history';
  const figureReady = () => figuresReady(presentation().frontImage, answerImage());
  const listeningEnabled = () => activeProject()?.config.listening.enabled === true;
  const isRussianDeck = () => activeProject()?.config.listening.locale?.toLowerCase().startsWith('ru') === true;
  const hasPronunciation = () => !!(s.activeFlashcard()?.pronunciation_override || s.activeFlashcard()?.audio_text);
  const pronunciationLabel = () => s.pronunciationPlayed() ? 'Replay pronunciation' : 'Play pronunciation';
  const pronunciationStatusLabel = () => s.pronunciationPlaying() ? 'Playing pronunciation' : pronunciationLabel();
  const pronunciationVisible = () => listeningEnabled() && hasPronunciation() && (!definitionFirst() || s.flashFlipped());
  const favorite = () => isFavorite(activeProject()?.slug, s.flashCardId());
  const plainFormInTitle = () => !!title() && !definitionFirst();
  const russianBackOptions = (showPlainForm: boolean): RussianStudyFormatOptions => ({
    interactive: listeningEnabled(),
    showPlainForm,
    partOfSpeech: s.activeFlashcard()?.part_of_speech,
  });
  const readableHtml = (value: string | undefined, options: boolean | RussianStudyFormatOptions = false) => isRussianDeck()
    ? formatRussianStudyHtml(value, s.activeFlashcard()?.pronunciation_en, options)
    : (value ?? '');

  function russianAudioTarget(event: MouseEvent | KeyboardEvent): { element: HTMLElement; text: string } | null {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-russian-syllable-audio], [data-russian-audio]')
      : null;
    if (!target || !isRussianDeck()) return null;
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return null;
    const text = target.dataset.russianSyllableAudio?.trim() || target.dataset.russianAudio?.trim();
    return text ? { element: target, text } : null;
  }

  function playHighlightedRussian(event: MouseEvent | KeyboardEvent): void {
    const audioTarget = russianAudioTarget(event);
    if (!audioTarget) return;
    event.preventDefault();
    event.stopPropagation();
    audioTarget.element.closest<HTMLElement>('.russian-word')?.classList.add('is-syllable-colored');
    const config = activeProject()?.config.listening;
    if (!config?.enabled) return;
    s.noteManualPronunciation();
    playPronunciationText(config, audioTarget.text).catch(() => {});
  }

  return (
    <div>
      <Show when={s.state() !== 'done'}>
        <div class="flashcard-container" onClick={() => s.flipFlash()}>
          <div class={`flashcard ${s.flashFlipped() ? 'flipped' : ''}${expandedBack() ? ' has-image' : ''}${isRussianDeck() ? ' russian-deck' : ''}`} onClick={playHighlightedRussian} onKeyDown={playHighlightedRussian}>
            <Show when={s.flashCardId()}>
              <div class="flashcard-tools" aria-label="Card actions">
                <button
                  type="button"
                  class={`flashcard-tool favorite-tool${favorite() ? ' is-favorite' : ''}`}
                  aria-label={favorite() ? 'Remove from favorites' : 'Add to favorites'}
                  aria-pressed={favorite()}
                  title={favorite() ? 'Remove from favorites' : 'Add to favorites'}
                  onClick={(event) => { event.stopPropagation(); toggleFavorite(activeProject()?.slug, s.flashCardId()); }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4 4.3 13A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 7.7 7Z" /></svg>
                </button>
                <button
                  type="button"
                  class="flashcard-tool incorrect-tool"
                  aria-label="Mark incorrect"
                  disabled={!figureReady()}
                  title="Mark incorrect and reschedule soon"
                  onClick={(event) => { event.stopPropagation(); s.markFlashWrong().catch(() => {}); }}
                >&times;</button>
              </div>
            </Show>
              <div class="flashcard-face flashcard-back" style={{ display: s.flashFlipped() ? undefined : 'none' }}>
                <Show when={plainFormInTitle()}><div class="flashcard-title"><LatexHtml html={readableHtml(title(), russianBackOptions(true))} /></div></Show>
                <Show when={answerImage()}>{(image) => <SourceFigure source={image()} class="flashcard-image" />}</Show>
                <Show when={backBody()}><div class="flashcard-copy"><LatexHtml html={readableHtml(backBody(), russianBackOptions(!plainFormInTitle()))} /></div></Show>
              </div>
              <div class="flashcard-face flashcard-front" style={{ display: s.flashFlipped() ? 'none' : undefined }}>
                <Show when={presentation().frontImage}>{(image) => <SourceFigure source={image()} class="flashcard-image" />}</Show>
                <Show when={front()}><div class="flashcard-copy"><LatexHtml html={readableHtml(front(), listeningEnabled())} /></div></Show>
              </div>

            <Show when={pronunciationVisible()}>
              <button
                type="button"
                class={`pronunciation-icon ${s.flashFlipped() ? 'pronunciation-icon-back' : 'pronunciation-icon-front'}${s.pronunciationPlaying() ? ' playing' : ''}`}
                aria-label={pronunciationStatusLabel()}
                aria-busy={s.pronunciationPlaying()}
                onClick={(event) => { event.stopPropagation(); s.playPronunciation().catch(() => {}); }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z" fill="currentColor" />
                  <path d="M15 9.25c1.7 1.45 1.7 4.05 0 5.5M17.5 7c3.1 2.7 3.1 7.3 0 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </button>
            </Show>
          </div>
        </div>

        <Show when={!s.flashFlipped() && answerImage() && answerImage() !== presentation().frontImage}>
          <SourceFigureNotice source={answerImage()!} />
        </Show>

        <Show when={pronunciationVisible()}>
          <Show when={s.pronunciationError()}>{(message) => <span class="pronunciation-error" role="status">{message()}</span>}</Show>
        </Show>


        <Show when={reviewingHistory()}>
          <div class="key-hints flash-history-hints">History {s.historyPosition().current}/{s.historyPosition().total} — <kbd>{getLabel('goBack')}</kbd>/<kbd>&larr;</kbd> back, <kbd>{getLabel('forward')}</kbd>/<kbd>&rarr;</kbd> forward</div>
        </Show>

        <Show when={s.flashCardId() && !reviewingHistory()}>
          <div class="mobile-flash-controller">
            <button type="button" class="mobile-flip-btn" disabled={!figureReady()} onClick={(e) => { e.stopPropagation(); s.flipFlash(); }}>{s.flashFlipped() ? 'Flip Back' : 'Flip'}</button>
          </div>
        </Show>

        <Show when={s.flashFlipped() && s.flashCardId() && !reviewingHistory()}>
          <Show when={easyMode()}>
            <div class="flash-rating-area flash-rating-area-easy">
              <button type="button" class="flash-rating-btn rating-again" disabled={!figureReady()} onClick={(e) => { e.stopPropagation(); s.rateFlash(1).catch(() => {}); }}>Again</button>
              <button type="button" class="flash-rating-btn rating-good" disabled={!figureReady()} onClick={(e) => { e.stopPropagation(); s.rateFlash(3).catch(() => {}); }}>Good</button>
            </div>
          </Show>
          <Show when={!easyMode()}>
            <div class="flash-rating-area flash-rating-area-complex"><For each={COMPLEX_RATINGS}>{(choice) => <button type="button" class={`flash-rating-btn ${RATING_CSS[choice.rating]}`} disabled={!figureReady()} onClick={(e) => { e.stopPropagation(); s.rateFlash(choice.rating).catch(() => {}); }}><span class="rating-label">{choice.name}</span><span class="rating-interval">{s.ratingLabels()[choice.rating] ?? ''}</span></button>}</For></div>
          </Show>
        </Show>
      </Show>

      <Show when={s.state() === 'done'}>
        <div class="done-screen">
          <h3 class="done-title">Session Complete</h3>
          <div class="done-due"><span>{s.dueCount().due} due now</span><span>{s.dueCount().newCount} new remaining</span><span>{s.dueCount().total} total cards</span></div>
          <div class="done-actions">
            <button type="button" class="action-sm" onClick={() => s.studyMore().catch(() => {})}>Study More</button>
            <button type="button" class="action-sm cram-btn" onClick={() => s.startCram().catch(() => {})}>Cram</button>
            <AddNewCards session={s} />
            <button type="button" class="action-sm" onClick={() => s.unburyAll().catch(() => {})}>Unbury Cards</button>
          </div>
        </div>
      </Show>
    </div>
  );
}
