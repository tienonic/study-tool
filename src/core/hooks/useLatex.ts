import renderMathInElement from 'katex/contrib/auto-render';

export function renderLatex(el: HTMLElement) {
  renderMathInElement(el, {
    delimiters: [
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
  });
}
