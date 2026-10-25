import { For, Show, onCleanup, onMount } from 'solid-js';
import {
  activeProject, activeTab, setActiveTab, easyMode, toggleEasyMode, mergedMode,
  toggleMergedMode, headerVisible, setHeaderVisible, headerLocked,
} from '../../core/store/app.ts';
import { goToLauncher } from '../../features/launcher/store.ts';
import { sectionHandlers, handlerVersion } from '../../core/store/sections.ts';
import { canUseMergedQuiz, resolveStudyTab } from '../../features/quiz/merged.ts';
import { SettingsPanel } from '../../features/settings/SettingsPanel.tsx';
import { KeybindsPanel } from '../../features/settings/KeybindsPanel.tsx';
import { TipsPanel } from '../../features/settings/TipsPanel.tsx';
import { nextMenuIndex, typeaheadMenuIndex } from '../overlays/menuNavigation.ts';
import type { ViewportLike } from '../overlays/anchoredPosition.ts';
import { calculateHeaderMenuBounds } from './headerMenuBounds.ts';

export function Header() {
  const project = activeProject;
  let triggerRef!: HTMLButtonElement;
  let menuRef!: HTMLDivElement;
  let visualViewport: VisualViewport | null = null;
  let typeahead = '';
  let typeaheadTimer: ReturnType<typeof setTimeout> | undefined;

  function currentViewport(): ViewportLike {
    const visual = window.visualViewport;
    return visual
      ? { left: visual.offsetLeft, top: visual.offsetTop, width: visual.width, height: visual.height }
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  function updateViewportBounds() {
    if (!triggerRef?.isConnected) return;
    const bounds = calculateHeaderMenuBounds(currentViewport());
    triggerRef.style.left = `${bounds.triggerLeft}px`;
    triggerRef.style.top = `${bounds.triggerTop}px`;
    if (!menuRef?.isConnected) return;
    menuRef.style.left = `${bounds.menuLeft}px`;
    menuRef.style.top = `${bounds.menuTop}px`;
    menuRef.style.width = `${bounds.menuWidth}px`;
    menuRef.style.maxHeight = `${bounds.menuMaxHeight}px`;
  }

  function menuItems(): HTMLElement[] {
    if (!menuRef) return [];
    return [...menuRef.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
      .filter(item => !item.hasAttribute('disabled') && item.getAttribute('aria-hidden') !== 'true');
  }

  function focusMenuItem(index: number) {
    queueMicrotask(() => {
      updateViewportBounds();
      menuItems()[index]?.focus();
    });
  }

  function openMenu(focusIndex?: number) {
    setHeaderVisible(true);
    queueMicrotask(updateViewportBounds);
    if (focusIndex !== undefined) focusMenuItem(focusIndex);
  }

  function closeMenu(restoreFocus = false) {
    setHeaderVisible(false);
    if (restoreFocus) queueMicrotask(() => triggerRef?.focus());
  }

  const hasMultipleQuizSections = () => canUseMergedQuiz(project());

  function handleMergeToggle() {
    const nextMerged = !mergedMode();
    toggleMergedMode();
    const p = project();
    if (!p) return;
    setActiveTab(resolveStudyTab(p, nextMerged));
  }

  const currentEntry = () => {
    handlerVersion();
    const tab = activeTab();
    return tab ? sectionHandlers.get(tab) : undefined;
  };
  const canFlash = () => currentEntry()?.kind === 'quiz';
  const quizSession = () => {
    const entry = currentEntry();
    return entry?.kind === 'quiz' ? entry.session : undefined;
  };

  function handleTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Home') {
      event.preventDefault();
      openMenu(0);
    } else if (event.key === 'ArrowUp' || event.key === 'End') {
      event.preventDefault();
      setHeaderVisible(true);
      queueMicrotask(() => {
        updateViewportBounds();
        focusMenuItem(menuItems().length - 1);
      });
    } else if (event.key === 'Escape' && headerVisible()) {
      event.preventDefault();
      closeMenu(true);
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent) {
    const items = menuItems();
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu(false);
      return;
    }
    if (event.key === 'ArrowRight' && current >= 0 && items[current].getAttribute('aria-haspopup') === 'dialog') {
      event.preventDefault();
      items[current].click();
      return;
    }
    const next = nextMenuIndex(event.key, current, items.length);
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
      return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
    typeahead += event.key.toLocaleLowerCase();
    if (typeaheadTimer) clearTimeout(typeaheadTimer);
    typeaheadTimer = setTimeout(() => { typeahead = ''; typeaheadTimer = undefined; }, 500);
    const repeatedCharacter = [...typeahead].every(character => character === typeahead[0]);
    const query = repeatedCharacter ? typeahead[0] : typeahead;
    const match = typeaheadMenuIndex(items.map(item => item.textContent ?? ''), query, current);
    if (match !== null) {
      event.preventDefault();
      items[match]?.focus();
    }
  }

  const clickOutsideHandler = (event: MouseEvent) => {
    if (!headerVisible() || headerLocked()) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.header-menu') || event.target.closest('.header-pull') || event.target.closest('.settings-backdrop')) return;
    closeMenu(false);
  };

  onMount(() => {
    visualViewport = window.visualViewport;
    document.addEventListener('mousedown', clickOutsideHandler);
    window.addEventListener('resize', updateViewportBounds);
    visualViewport?.addEventListener('resize', updateViewportBounds);
    visualViewport?.addEventListener('scroll', updateViewportBounds);
    queueMicrotask(updateViewportBounds);
  });
  onCleanup(() => {
    document.removeEventListener('mousedown', clickOutsideHandler);
    window.removeEventListener('resize', updateViewportBounds);
    visualViewport?.removeEventListener('resize', updateViewportBounds);
    visualViewport?.removeEventListener('scroll', updateViewportBounds);
    if (typeaheadTimer) clearTimeout(typeaheadTimer);
  });

  return (
    <div class="header-wrap">
      <button
        type="button"
        ref={triggerRef}
        class={`header-pull ${headerVisible() ? 'header-pull-open' : ''}`}
        aria-label={headerVisible() ? 'Close study menu' : 'Open study menu'}
        aria-haspopup="menu"
        aria-expanded={headerVisible()}
        aria-controls="study-header-menu"
        onKeyDown={handleTriggerKeyDown}
        onClick={(event) => {
          if (headerVisible()) closeMenu(false);
          else openMenu(event.detail === 0 ? 0 : undefined);
        }}
      >
        <span aria-hidden="true">{headerVisible() ? '\u25B2' : '\u25BC'}</span>
      </button>
      <Show when={headerVisible()}>
        <div
          ref={menuRef}
          id="study-header-menu"
          class="header-menu"
          role="menu"
          aria-label="Study menu"
          onKeyDown={handleMenuKeyDown}
        >
          <div class="header-menu-label" role="presentation" title={project()?.name}>{project()?.name}</div>
          <button type="button" class="header-menu-item" role="menuitem" onClick={() => { closeMenu(false); goToLauncher(); }}>Home</button>
          <button type="button" class="header-menu-item header-menu-check" role="menuitemcheckbox" aria-checked={easyMode()} onClick={toggleEasyMode}>
            <span class="header-checkmark" aria-hidden="true">{easyMode() ? '\u2713' : ''}</span>Simple mode
          </button>
          <Show when={hasMultipleQuizSections()}>
            <button type="button" class="header-menu-item header-menu-check" role="menuitemcheckbox" aria-checked={mergedMode()} onClick={handleMergeToggle}>
              <span class="header-checkmark" aria-hidden="true">{mergedMode() ? '\u2713' : ''}</span>Merge sections
            </button>
          </Show>
          <SettingsPanel />
          <KeybindsPanel />
          <TipsPanel />
          <div class="header-menu-divider" role="separator" />
          <Show when={!mergedMode()}>
            <For each={project()?.sections ?? []}>
              {(section) => (
                <button
                  type="button"
                  class={`header-menu-item header-menu-tab ${activeTab() === section.id ? 'active' : ''}`}
                  role="menuitemradio"
                  aria-checked={activeTab() === section.id}
                  onClick={() => { setActiveTab(section.id); closeMenu(false); }}
                >{section.name}</button>
              )}
            </For>
          </Show>
          <Show when={mergedMode()}>
            <button type="button" class="header-menu-item header-menu-tab active" role="menuitemradio" aria-checked="true" onClick={() => closeMenu(false)}>All sections</button>
          </Show>
          <Show when={canFlash()}>
            <div class="header-menu-divider" role="separator" />
            <button
              type="button"
              class={`header-menu-item header-menu-tab ${!quizSession()!.flashMode() ? 'active' : ''}`}
              role="menuitemradio"
              aria-checked={!quizSession()!.flashMode()}
              onClick={() => { if (quizSession()!.flashMode()) quizSession()!.toggleFlashMode(); closeMenu(false); }}
            >Quiz</button>
            <button
              type="button"
              class={`header-menu-item header-menu-tab ${quizSession()!.flashMode() ? 'active' : ''}`}
              role="menuitemradio"
              aria-checked={quizSession()!.flashMode()}
              onClick={() => { if (!quizSession()!.flashMode()) quizSession()!.toggleFlashMode(); closeMenu(false); }}
            >Flashcards</button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
