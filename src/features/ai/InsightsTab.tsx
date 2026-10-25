import { sanitizeStudyHtml } from '../../utils/studyHtml.ts';
import { Show } from 'solid-js';
import { insightsOutput, insightsLoading, insightsError, runInsights, abortStream } from './store.ts';

export function InsightsTab() {
  return (
    <div>
      <div class="ai-analyze-row">
        <Show when={insightsLoading()} fallback={
          <button type="button" class="ai-btn" onClick={runInsights}>
            Analyze Performance
          </button>
        }>
          <button type="button" class="ai-btn ai-btn-secondary" onClick={abortStream}>
            <span class="ai-spinner ai-spinner-dark" /> Stop
          </button>
        </Show>
      </div>

      <Show when={insightsError()}>
        <div class="ai-error">{insightsError()}</div>
      </Show>

      <Show when={insightsOutput()}>
        <div class="ai-insights-output" innerHTML={sanitizeStudyHtml(markdownToHtml(insightsOutput()))} />
      </Show>

      <Show when={!insightsOutput() && !insightsLoading() && !insightsError()}>
        <div class="ai-empty">
          Click "Analyze Performance" to get AI-powered insights on your study progress.
        </div>
      </Show>
    </div>
  );
}

function markdownToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match.replace(/\n/g, '')}</ul>`)
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}
