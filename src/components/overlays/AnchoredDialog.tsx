import { type JSX, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { calculateAnchoredPosition, type ViewportLike } from './anchoredPosition.ts';

interface AnchoredDialogProps {
  anchor: HTMLElement;
  class: string;
  label: string;
  onDismiss: () => void;
  children: JSX.Element;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )].filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

function currentViewport(): ViewportLike {
  const visual = window.visualViewport;
  return visual
    ? { left: visual.offsetLeft, top: visual.offsetTop, width: visual.width, height: visual.height }
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

export function AnchoredDialog(props: AnchoredDialogProps) {
  const [position, setPosition] = createSignal({ left: 8, top: 8, ready: false });
  let panel!: HTMLDivElement;

  function updatePosition() {
    if (!panel || !props.anchor?.isConnected) return;
    const viewport = currentViewport();
    panel.style.maxWidth = `${Math.max(0, viewport.width - 16)}px`;
    panel.style.maxHeight = `${Math.max(0, viewport.height - 16)}px`;
    const resolved = calculateAnchoredPosition(
      props.anchor.getBoundingClientRect(),
      panel.getBoundingClientRect(),
      viewport,
    );
    setPosition({ left: resolved.left, top: resolved.top, ready: true });
  }

  function dismiss() {
    props.onDismiss();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableElements(panel);
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    queueMicrotask(() => {
      updatePosition();
      panel.focus();
    });
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
  });

  onCleanup(() => {
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
    window.visualViewport?.removeEventListener('resize', updatePosition);
    window.visualViewport?.removeEventListener('scroll', updatePosition);
    if (props.anchor?.isConnected) props.anchor.focus();
  });

  return (
    <Portal>
      <div class="settings-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
        <div
          ref={panel}
          class={`${props.class} anchored-dialog-panel`}
          style={{ left: `${position().left}px`, top: `${position().top}px`, visibility: position().ready ? 'visible' : 'hidden' }}
          role="dialog"
          aria-modal="true"
          aria-label={props.label}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {props.children}
        </div>
      </div>
    </Portal>
  );
}
