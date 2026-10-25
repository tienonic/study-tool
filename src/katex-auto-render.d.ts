declare module 'katex/contrib/auto-render' {
  interface RenderOptions {
    delimiters?: { left: string; right: string; display: boolean }[];
    throwOnError?: boolean;
  }
  export default function renderMathInElement(el: HTMLElement, options?: RenderOptions): void;
}
