import { sanitizeStudyHtml } from '../utils/studyHtml.ts';
import { createEffect } from 'solid-js';
import { renderLatex } from '../core/hooks/useLatex.ts';

/** Convert $...$ to \(...\) and $$...$$ to \[...\] only when content looks like math. */
function preprocessLatex(text: string): string {
  // Convert $$...$$ to \[...\]
  text = text.replace(/\$\$(.+?)\$\$/gs, '\\[$1\\]');
  // Protect currency $ (e.g. $70, $6 tax) so they don't mis-pair with math delimiters.
  // Currency = $ + digits, then a word or punctuation (not a math operator/variable).
  const PH = '\x00';
  text = text.replace(
    /\$(\d+(?:[.,]\d+)*)(?=\s+[a-zA-Z]{2,}|\s*[,;:!?).\]}]|\s*$)/g,
    PH + '$1',
  );
  // Convert $...$ to \(...\) only when content has no English words (3+ lowercase letters)
  text = text.replace(/\$([^$]+?)\$/g, (_match, content) => {
    const stripped = content.replace(/\\[a-zA-Z]+/g, '');
    if (/[a-z]{3,}/.test(stripped)) return _match;
    return `\\(${content}\\)`;
  });
  // Restore currency $
  text = text.replaceAll(PH, '$');
  return text;
}

/** Renders plain text that may contain $...$ or $$...$$ LaTeX delimiters. */
export function LatexText(props: { text: string | undefined; class?: string }) {
  let el!: HTMLSpanElement;
  createEffect(() => {
    el.textContent = preprocessLatex(props.text ?? '');
    renderLatex(el);
  });
  return <span ref={el} class={props.class} />;
}

/** Renders an HTML string that may also contain LaTeX delimiters. */
export function LatexHtml(props: { html: string | undefined; class?: string }) {
  let el!: HTMLDivElement;
  createEffect(() => {
    el.innerHTML = sanitizeStudyHtml(preprocessLatex(props.html ?? ''));
    renderLatex(el);
  });
  return <div ref={el} class={props.class} />;
}
