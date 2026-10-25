import { createSignal, onCleanup, onMount } from 'solid-js';
import { createPopupMenu } from './createHoverMenu.ts';
import { ProjectBrowserModal } from './ProjectBrowserModal.tsx';
import { ProjectFilePickerModal } from './ProjectFilePickerModal.tsx';
import { CreateFlowModal } from './CreateFlowModal.tsx';
import { SourceMaterialModal } from './SourceMaterialModal.tsx';
import { DiyEditorModal } from './DiyEditorModal.tsx';
import { flowConfigs, type FlowConfig } from './flowConfigs.ts';
import { getGeminiKey, setGeminiKey } from './gemini.ts';
import { nextMenuIndex, typeaheadMenuIndex } from '../../components/overlays/menuNavigation.ts';
import { calculateViewportShift, type ViewportLike } from '../../components/overlays/anchoredPosition.ts';

export function CreateTab() {
  const menu = createPopupMenu();
  const [browserOpen, setBrowserOpen] = createSignal(false);
  const [filePickerOpen, setFilePickerOpen] = createSignal(false);
  const [sourceOpen, setSourceOpen] = createSignal(false);
  const [activeFlow, setActiveFlow] = createSignal<FlowConfig | null>(null);
  const [diyOpen, setDiyOpen] = createSignal(false);
  const [apiKey, setApiKey] = createSignal(getGeminiKey() ?? '');
  const triggerRefs = new Map<string, HTMLButtonElement>();
  const topMenuRefs = new Map<string, HTMLDivElement>();
  const positionFrames = new Map<string, number>();
  const positionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let typeahead = '';
  let typeaheadTimer: ReturnType<typeof setTimeout> | undefined;

  function openFlow(id: string) {
    closeMenus();
    setActiveFlow(flowConfigs[id] ?? null);
  }

  function closeMenus() {
    menu.closeAll();
  }

  function openTopMenu(key: string, e: MouseEvent) {
    e.stopPropagation();
    const opening = !menu.isOpen(key);
    menu.toggleOnly(key);
    if (opening) scheduleTopMenuPosition(key);
  }

  function openSubMenu(key: string, e: MouseEvent | PointerEvent) {
    if ((e.target as Element).closest('.db-submenu-l2')) return;
    e.stopPropagation();
    menu.openBranch('ai', key);
    scheduleTopMenuPosition('ai');
  }

  function currentViewport(): ViewportLike {
    const visual = window.visualViewport;
    return visual
      ? { left: visual.offsetLeft, top: visual.offsetTop, width: visual.width, height: visual.height }
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  function positionTopMenu(key: string) {
    const container = topMenuRefs.get(key);
    if (!container || !menu.isOpen(key)) return;
    container.style.setProperty('--db-menu-shift-x', '0px');
    container.style.setProperty('--db-menu-shift-y', '0px');
    const surface = container.getBoundingClientRect();
    const shift = calculateViewportShift(surface, currentViewport());
    const scaleX = container.offsetWidth > 0 ? surface.width / container.offsetWidth : 1;
    const scaleY = container.offsetHeight > 0 ? surface.height / container.offsetHeight : 1;
    const localX = scaleX > 0 ? shift.x / scaleX : shift.x;
    const localY = scaleY > 0 ? shift.y / scaleY : shift.y;
    container.style.setProperty('--db-menu-shift-x', `${localX}px`);
    container.style.setProperty('--db-menu-shift-y', `${localY}px`);
  }

  function scheduleTopMenuPosition(key: string) {
    const pendingFrame = positionFrames.get(key);
    if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame);
    const pendingTimer = positionTimers.get(key);
    if (pendingTimer !== undefined) clearTimeout(pendingTimer);
    positionFrames.set(key, requestAnimationFrame(() => {
      positionFrames.delete(key);
      positionTopMenu(key);
      positionTimers.set(key, setTimeout(() => {
        positionTimers.delete(key);
        positionTopMenu(key);
      }, 220));
    }));
  }

  function repositionOpenMenus() {
    for (const key of topMenuRefs.keys()) {
      if (menu.isOpen(key)) scheduleTopMenuPosition(key);
    }
  }

  function handleKeyChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    setApiKey(val);
    setGeminiKey(val);
  }

  function directMenuItems(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>('[data-menu-item]')]
      .filter(item => item.closest('[role="menu"]') === container && !item.hasAttribute('disabled'));
  }

  function focusFirst(menuId: string) {
    setTimeout(() => {
      const container = document.getElementById(menuId);
      if (container) directMenuItems(container)[0]?.focus();
    }, 0);
  }

  function handleTriggerKeyDown(key: string, menuId: string, event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      menu.openOnly(key);
      scheduleTopMenuPosition(key);
      focusFirst(menuId);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      menu.openOnly(key);
      scheduleTopMenuPosition(key);
      queueMicrotask(() => {
        const container = document.getElementById(menuId);
        const items = container ? directMenuItems(container) : [];
        items.at(-1)?.focus();
      });
    } else if (event.key === 'Escape' && menu.isOpen(key)) {
      event.preventDefault();
      menu.closeAll();
    }
  }

  function handleTriggerKeyUp(key: string, menuId: string, event: KeyboardEvent) {
    if ((event.key === 'Enter' || event.key === ' ') && menu.isOpen(key)) {
      event.preventDefault();
      focusFirst(menuId);
    }
  }

  function handleMenuKeyDown(key: string, event: KeyboardEvent, parentKey?: string) {
    if (parentKey) event.stopPropagation();
    const container = event.currentTarget as HTMLElement;
    const items = directMenuItems(container);
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape' || (event.key === 'ArrowLeft' && parentKey)) {
      event.preventDefault();
      event.stopPropagation();
      if (parentKey) {
        menu.close(key);
        queueMicrotask(() => triggerRefs.get(parentKey)?.focus());
      } else {
        menu.closeAll();
        queueMicrotask(() => triggerRefs.get(key)?.focus());
      }
      return;
    }
    if (event.key === 'Tab') {
      menu.closeAll();
      return;
    }
    const active = items[current];
    if (event.key === 'ArrowRight' && active?.getAttribute('aria-haspopup') === 'menu') {
      event.preventDefault();
      active.click();
      const childId = active.getAttribute('aria-controls');
      if (childId) focusFirst(childId);
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
    const repeated = [...typeahead].every(character => character === typeahead[0]);
    const match = typeaheadMenuIndex(items.map(item => item.textContent ?? ''), repeated ? typeahead[0] : typeahead, current);
    if (match !== null) {
      event.preventDefault();
      items[match]?.focus();
    }
  }

  onMount(() => {
    const closeOnOutsidePointer = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest('.db-create')) return;
      closeMenus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', repositionOpenMenus);
    window.visualViewport?.addEventListener('resize', repositionOpenMenus);
    window.visualViewport?.addEventListener('scroll', repositionOpenMenus);
    onCleanup(() => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', repositionOpenMenus);
      window.visualViewport?.removeEventListener('resize', repositionOpenMenus);
      window.visualViewport?.removeEventListener('scroll', repositionOpenMenus);
      for (const frame of positionFrames.values()) cancelAnimationFrame(frame);
      positionFrames.clear();
      for (const timer of positionTimers.values()) clearTimeout(timer);
      positionTimers.clear();
      if (typeaheadTimer) clearTimeout(typeaheadTimer);
    });
  });

  return (
    <div class="db-create">
      <div class="db-create-menu">
        {/* Import */}
        <div class="db-create-item">
          <button type="button" ref={element => triggerRefs.set('import', element)} class="db-create-item-trigger" aria-haspopup="menu" aria-expanded={menu.isOpen('import')} aria-controls="create-import-menu" onKeyDown={(event) => handleTriggerKeyDown('import', 'create-import-menu', event)} onKeyUp={(event) => handleTriggerKeyUp('import', 'create-import-menu', event)} onClick={(e) => openTopMenu('import', e)}>
            <span class="db-create-item-label">Import</span>
            <span class="db-create-item-sub">Decks & files</span>
          </button>
          <div ref={element => topMenuRefs.set('import', element)} id="create-import-menu" role="menu" aria-label="Import" onKeyDown={(event) => handleMenuKeyDown('import', event)} class={`db-submenu db-submenu-top ${menu.isOpen('import') ? 'db-submenu--open' : ''}`}>
            <button type="button" role="menuitem" data-menu-item class="db-submenu-action" onClick={() => { setBrowserOpen(true); closeMenus(); }}>
              <span>Browse decks</span>
              <span class="db-submenu-action-sub">Select from your deck library</span>
            </button>
            <button type="button" role="menuitem" data-menu-item class="db-submenu-action" onClick={() => { closeMenus(); setFilePickerOpen(true); }}>
              <span>Open file (.json)</span>
              <span class="db-submenu-action-sub">Import a project file</span>
            </button>
            <button type="button" role="menuitem" data-menu-item class="db-submenu-action" onClick={() => { setSourceOpen(true); closeMenus(); }}>
              <span>Source material</span>
              <span class="db-submenu-action-sub">Paste text to generate cards</span>
            </button>
          </div>
        </div>

        {/* Manual */}
        <div class="db-create-item">
          <button type="button" ref={element => triggerRefs.set('manual', element)} class="db-create-item-trigger" aria-haspopup="menu" aria-expanded={menu.isOpen('manual')} aria-controls="create-manual-menu" onKeyDown={(event) => handleTriggerKeyDown('manual', 'create-manual-menu', event)} onKeyUp={(event) => handleTriggerKeyUp('manual', 'create-manual-menu', event)} onClick={(e) => openTopMenu('manual', e)}>
            <span class="db-create-item-label">Manual</span>
            <span class="db-create-item-sub">Your own cards</span>
          </button>
          <div ref={element => topMenuRefs.set('manual', element)} id="create-manual-menu" role="menu" aria-label="Manual creation" onKeyDown={(event) => handleMenuKeyDown('manual', event)} class={`db-submenu db-submenu-top ${menu.isOpen('manual') ? 'db-submenu--open' : ''}`}>
            <button type="button" role="menuitem" data-menu-item class="db-submenu-action" onClick={() => { setDiyOpen(true); closeMenus(); }}>
              <span>DIY flashcards</span>
              <span class="db-submenu-action-sub">Create front/back card pairs</span>
            </button>
            <button type="button" role="menuitem" data-menu-item class="db-submenu-action" onClick={() => { fetch('/__open-folder?path=GENERATING_PROJECTS.md').catch(() => {}); closeMenus(); }}>
              <span>LLM prompt guide</span>
              <span class="db-submenu-action-sub">Open GENERATING_PROJECTS.md</span>
            </button>
          </div>
        </div>

        {/* AI-Powered */}
        <div class="db-create-item">
          <button type="button" ref={element => triggerRefs.set('ai', element)} class="db-create-item-trigger" aria-haspopup="menu" aria-expanded={menu.isOpen('ai')} aria-controls="create-ai-menu" onKeyDown={(event) => handleTriggerKeyDown('ai', 'create-ai-menu', event)} onKeyUp={(event) => handleTriggerKeyUp('ai', 'create-ai-menu', event)} onClick={(e) => openTopMenu('ai', e)}>
            <span class="db-create-item-label">AI-powered</span>
            <span class="db-create-item-sub">Gemini-generated</span>
          </button>
          <div ref={element => topMenuRefs.set('ai', element)} id="create-ai-menu" role="menu" aria-label="AI-powered creation" onKeyDown={(event) => handleMenuKeyDown('ai', event)} class={`db-submenu db-submenu-top ${menu.isOpen('ai') ? 'db-submenu--open' : ''}`}>
            <div
              class="db-submenu-group"
            >
              <button type="button" ref={element => triggerRefs.set('ai-lang', element)} role="menuitem" data-menu-item class="db-submenu-group-trigger" aria-haspopup="menu" aria-expanded={menu.isOpen('ai-lang')} aria-controls="create-ai-language-menu" onPointerDown={(e) => openSubMenu('ai-lang', e)} onClick={(e) => openSubMenu('ai-lang', e)}>
                <span class="db-submenu-item-label">Language</span>
                <span class="db-submenu-item-sub">E.g., Spanish</span>
              </button>
              <div id="create-ai-language-menu" role="menu" aria-label="Language" onKeyDown={(event) => handleMenuKeyDown('ai-lang', event, 'ai-lang')} class={`db-submenu db-submenu-l2 ${menu.isOpen('ai-lang') ? 'db-submenu--open' : ''}`}>
                <button type="button" role="menuitem" data-menu-item class="db-submenu-action" onClick={() => openFlow('translation')}>
                  <span>Translation</span>
                  <span class="db-submenu-action-sub">Generate bilingual flashcards</span>
                </button>
                <button type="button" role="menuitem" data-menu-item class="db-submenu-action" onClick={() => openFlow('conversation')}>
                  <span>Conversation</span>
                  <span class="db-submenu-action-sub">Target language Q&A</span>
                </button>
                <button type="button" role="menuitem" data-menu-item class="db-submenu-action" onClick={() => openFlow('language_checkit')}>
                  <span>CheckIt</span>
                  <span class="db-submenu-action-sub">Spot intentional errors</span>
                </button>
              </div>
            </div>
            <div
              class="db-submenu-group"
            >
              <button type="button" ref={element => triggerRefs.set('ai-acad', element)} role="menuitem" data-menu-item class="db-submenu-group-trigger" aria-haspopup="menu" aria-expanded={menu.isOpen('ai-acad')} aria-controls="create-ai-academic-menu" onPointerDown={(e) => openSubMenu('ai-acad', e)} onClick={(e) => openSubMenu('ai-acad', e)}>
                <span class="db-submenu-item-label">Academic</span>
                <span class="db-submenu-item-sub">E.g., Physics</span>
              </button>
              <div id="create-ai-academic-menu" role="menu" aria-label="Academic" onKeyDown={(event) => handleMenuKeyDown('ai-acad', event, 'ai-acad')} class={`db-submenu db-submenu-l2 ${menu.isOpen('ai-acad') ? 'db-submenu--open' : ''}`}>
                <button type="button" role="menuitem" data-menu-item class="db-submenu-action" onClick={() => openFlow('academic_qa')}>
                  <span>Q&A</span>
                  <span class="db-submenu-action-sub">Traditional flashcards</span>
                </button>
                <button type="button" role="menuitem" data-menu-item class="db-submenu-action" onClick={() => openFlow('academic_checkit')}>
                  <span>CheckIt</span>
                  <span class="db-submenu-action-sub">Spot intentional errors</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ProjectBrowserModal open={browserOpen()} onClose={() => setBrowserOpen(false)} />
      <ProjectFilePickerModal open={filePickerOpen()} onClose={() => setFilePickerOpen(false)} />
      <CreateFlowModal config={activeFlow()} onClose={() => setActiveFlow(null)} />
      <SourceMaterialModal open={sourceOpen()} onClose={() => setSourceOpen(false)} />
      <DiyEditorModal open={diyOpen()} onClose={() => setDiyOpen(false)} />
    </div>
  );
}
