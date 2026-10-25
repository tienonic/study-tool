const allowedTags = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL']);
const droppedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE']);

export function sanitizeStudyHtml(html: string): string {
  const source = document.createElement('template');
  source.innerHTML = html;
  const output = document.createElement('div');

  function append(node: Node, parent: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ''));
      return;
    }
    if (!(node instanceof Element) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || droppedTags.has(node.tagName)) return;
    if (!allowedTags.has(node.tagName)) {
      for (const child of node.childNodes) append(child, parent);
      return;
    }
    const clean = document.createElement(node.tagName.toLowerCase());
    for (const name of ['title', 'alt']) {
      if (node.hasAttribute(name)) clean.setAttribute(name, node.getAttribute(name)!);
    }
    const urlAttribute = node.tagName === 'A' ? 'href' : node.tagName === 'IMG' ? 'src' : null;
    if (urlAttribute && node.hasAttribute(urlAttribute)) {
      const value = node.getAttribute(urlAttribute)!;
      try {
        const url = new URL(value, window.location.href);
        if (url.protocol === 'https:' || url.protocol === 'http:') clean.setAttribute(urlAttribute, url.href);
      } catch { /* Invalid media and link URLs are omitted. */ }
    }
    if (node.tagName === 'A') clean.setAttribute('rel', 'noopener noreferrer');
    for (const name of ['width', 'height', 'colspan', 'rowspan']) {
      const value = node.getAttribute(name);
      if (value && /^\d{1,4}$/.test(value)) clean.setAttribute(name, value);
    }
    for (const child of node.childNodes) append(child, clean);
    parent.appendChild(clean);
  }

  for (const node of source.content.childNodes) append(node, output);
  return output.innerHTML;
}
