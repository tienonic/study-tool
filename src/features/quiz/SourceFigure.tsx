import { Show } from 'solid-js';
import { imgSrc } from '../../utils/imgSrc.ts';
import { figureAttempt, figureState, reportFigureState, retryFigure } from './sourceFigures.ts';

export function SourceFigureNotice(props: { source: string }) {
  return <Show when={figureState(props.source) !== 'ready'}>
    <div class="source-figure-notice" role="status" onClick={event => event.stopPropagation()}>
      <p>{figureState(props.source) === 'error'
        ? 'Figure unavailable. Open the original image or retry.'
        : 'Loading figure. Wait before answering.'}</p>
      <a href={props.source} target="_blank" rel="noopener noreferrer">Open the original image</a>
      <Show when={figureState(props.source) === 'error'}>
        <button type="button" class="action-sm" onClick={() => retryFigure(props.source)}>Retry figure</button>
      </Show>
    </div>
  </Show>;
}

function FigureAsset(props: { source: string; class: string; attempt: number }) {
  const { source, attempt } = props;
  reportFigureState(source, 'loading', attempt);
  return <img src={imgSrc(source)} alt="Question figure" class={props.class} loading="eager" crossorigin="anonymous"
    style={{ display: figureState(source) === 'error' ? 'none' : undefined }}
    onLoad={event => reportFigureState(source, event.currentTarget.naturalWidth > 0 ? 'ready' : 'error', attempt)}
    onError={() => reportFigureState(source, 'error', attempt)} />;
}

export function SourceFigure(props: { source: string; class: string }) {
  return <Show when={props.source} keyed>{source => <>
    <Show when={figureAttempt(source) + 1} keyed>{attempt =>
      <FigureAsset source={source} class={props.class} attempt={attempt - 1} />
    }</Show>
    <SourceFigureNotice source={source} />
  </>}</Show>;
}
