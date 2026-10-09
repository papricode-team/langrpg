export interface TranslatedSentence {
  german: string;
  english: string;
}

export type Narrative = readonly TranslatedSentence[];

const sentenceSelector = '.translated-sentence[data-translation]';
const translationDelay = 1_000;
const dismissalGrace = 180;
let nextTooltipId = 0;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** Keep each translation attached to its complete German sentence. */
export function renderNarrative(sentences: Narrative): string {
  return sentences.map(sentence => `<span class="translated-sentence" lang="de" tabindex="0" data-translation="${escapeHtml(sentence.english)}">${escapeHtml(sentence.german)}</span>`).join(' ');
}

/** Install once on a stable root; newly rendered encounters work through delegation. */
export function installSentenceTranslations(root: HTMLElement | Document): () => void {
  const page = root.nodeType === 9 ? root as Document : root.ownerDocument!;
  const browser = page.defaultView!;
  const tooltip = page.createElement('div');
  tooltip.id = `sentence-translation-${++nextTooltipId}`;
  tooltip.className = 'sentence-translation-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.lang = 'en';
  tooltip.hidden = true;

  let active: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;
  let pointer: { x: number; y: number } | null = null;
  let hoveredSentence: HTMLElement | null = null;
  let focusedSentence: HTMLElement | null = null;
  let hoverPoint: { x: number; y: number } | null = null;
  let tooltipHovered = false;
  let tooltipPressed = false;
  let touchSentence: HTMLElement | null = null;
  let disposed = false;

  function sentenceFor(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const sentence = target.closest<HTMLElement>(sentenceSelector);
    return sentence && root.contains(sentence) ? sentence : null;
  }

  function isAvailable(sentence: HTMLElement): boolean {
    return sentence.isConnected && root.contains(sentence)
      && !sentence.closest('[hidden], dialog:not([open])');
  }

  function removeDescription(sentence: HTMLElement): void {
    const ids = (sentence.getAttribute('aria-describedby') ?? '').split(/\s+/)
      .filter(id => id && id !== tooltip.id);
    if (ids.length) sentence.setAttribute('aria-describedby', ids.join(' '));
    else sentence.removeAttribute('aria-describedby');
  }

  function clearDismissal(): void {
    if (dismissTimer !== undefined) clearTimeout(dismissTimer);
    dismissTimer = undefined;
  }

  function hideActive(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    clearDismissal();
    if (active) removeDescription(active);
    active = null;
    pointer = null;
    tooltipHovered = false;
    tooltipPressed = false;
    tooltip.hidden = true;
    tooltip.remove();
  }

  function dismiss(): void {
    hideActive();
    hoveredSentence = null;
    focusedSentence = null;
    hoverPoint = null;
    touchSentence = null;
  }

  function isTooltip(target: EventTarget | null): boolean {
    return target instanceof Node && tooltip.contains(target);
  }

  function hasOwner(): boolean {
    return !!active && (hoveredSentence === active || focusedSentence === active
      || touchSentence === active || tooltipHovered || tooltipPressed);
  }

  function releaseOwnership(allowGrace: boolean): void {
    if (!active || hasOwner()) return;
    const remaining = hoveredSentence ?? focusedSentence ?? touchSentence;
    if (remaining) { begin(remaining, remaining === hoveredSentence ? hoverPoint : null); return; }
    // Pending translations require continuous hover/focus. A visible tooltip gets
    // a short bridge across its gap so its English text can be selected or scrolled.
    if (timer !== undefined || !allowGrace) { hideActive(); return; }
    clearDismissal();
    dismissTimer = setTimeout(() => {
      dismissTimer = undefined;
      if (!hasOwner()) hideActive();
    }, dismissalGrace);
  }

  function position(): void {
    if (!active || tooltip.hidden) return;
    const rectangles = [...active.getClientRects()];
    const anchor = (pointer && rectangles.find(rect => pointer!.x >= rect.left && pointer!.x <= rect.right
      && pointer!.y >= rect.top && pointer!.y <= rect.bottom)) ?? active.getBoundingClientRect();
    const viewportWidth = browser.innerWidth;
    const viewportHeight = browser.innerHeight;
    const margin = 12;
    const gap = 8;
    tooltip.style.maxWidth = `${Math.max(0, Math.min(360, viewportWidth - margin * 2))}px`;
    tooltip.style.maxHeight = `${Math.max(0, viewportHeight - margin * 2)}px`;
    const bounds = tooltip.getBoundingClientRect();
    const desiredLeft = anchor.left + (anchor.width - bounds.width) / 2;
    const left = Math.max(margin, Math.min(desiredLeft, viewportWidth - bounds.width - margin));
    const below = anchor.bottom + gap;
    const above = anchor.top - bounds.height - gap;
    const desiredTop = below + bounds.height <= viewportHeight - margin ? below : above;
    const top = Math.max(margin, Math.min(desiredTop, viewportHeight - bounds.height - margin));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function show(): void {
    timer = undefined;
    if (!active || !isAvailable(active)) { dismiss(); return; }
    tooltip.textContent = active.dataset.translation ?? '';
    tooltip.scrollTop = 0;
    // A modal dialog is in the browser's top layer, above overlays in the body.
    (active.closest('dialog[open]') ?? page.body).append(tooltip);
    tooltip.hidden = false;
    const existing = active.getAttribute('aria-describedby');
    active.setAttribute('aria-describedby', [existing, tooltip.id].filter(Boolean).join(' '));
    position();
  }

  function begin(sentence: HTMLElement, location: { x: number; y: number } | null): void {
    if (active === sentence) { clearDismissal(); return; }
    hideActive();
    if (!isAvailable(sentence)) return;
    active = sentence;
    pointer = location;
    timer = setTimeout(show, translationDelay);
  }

  function onPointerOver(event: Event): void {
    const interaction = event as PointerEvent;
    if (interaction.pointerType === 'touch') return;
    if (isTooltip(event.target) && !tooltip.hidden) {
      tooltipHovered = true;
      clearDismissal();
      return;
    }
    if (tooltipPressed) return;
    const sentence = sentenceFor(event.target);
    if (!sentence || sentenceFor(interaction.relatedTarget) === sentence) return;
    hoveredSentence = sentence;
    hoverPoint = { x: interaction.clientX, y: interaction.clientY };
    begin(sentence, hoverPoint);
  }

  function onPointerOut(event: Event): void {
    const interaction = event as PointerEvent;
    if (interaction.pointerType === 'touch') return;
    if (isTooltip(event.target)) {
      if (isTooltip(interaction.relatedTarget)) return;
      tooltipHovered = false;
      releaseOwnership(true);
      return;
    }
    const sentence = sentenceFor(event.target);
    if (!sentence || sentenceFor(interaction.relatedTarget) === sentence) return;
    if (hoveredSentence === sentence) { hoveredSentence = null; hoverPoint = null; }
    releaseOwnership(true);
  }

  function onPointerMove(event: Event): void {
    const interaction = event as PointerEvent;
    if (!active || interaction.pointerType === 'touch' || sentenceFor(event.target) !== active) return;
    hoverPoint = { x: interaction.clientX, y: interaction.clientY };
    pointer = hoverPoint;
    position();
  }

  function onFocusIn(event: Event): void {
    const sentence = sentenceFor(event.target);
    if (sentence) { focusedSentence = sentence; begin(sentence, null); }
  }

  function onFocusOut(event: Event): void {
    const interaction = event as FocusEvent;
    const sentence = sentenceFor(event.target);
    if (!sentence || sentenceFor(interaction.relatedTarget) === sentence) return;
    if (focusedSentence === sentence) focusedSentence = null;
    releaseOwnership(false);
  }

  function onPointerDown(event: Event): void {
    if (isTooltip(event.target)) { tooltipPressed = true; clearDismissal(); return; }
    if (sentenceFor(event.target) !== active) dismiss();
  }

  function onPointerUp(event: Event): void {
    const interaction = event as PointerEvent;
    if (tooltipPressed) { tooltipPressed = false; releaseOwnership(true); }
    if (interaction.pointerType !== 'touch') return;
    const sentence = sentenceFor(event.target);
    if (!sentence) return;
    const wasShown = touchSentence === sentence && !tooltip.hidden;
    dismiss();
    if (wasShown || !isAvailable(sentence)) return;
    active = sentence;
    touchSentence = sentence;
    show();
  }

  function onKeyDown(event: Event): void {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    const wasShown = !!active && !tooltip.hidden;
    dismiss();
    // Dismiss English support first, without also closing the encounter or menu.
    if (wasShown) { event.preventDefault(); event.stopImmediatePropagation(); }
  }

  function onDialogClose(event: Event): void {
    if (active && event.target instanceof Element && event.target.contains(active)) dismiss();
  }

  function verifyConnection(): void {
    if (active && (!isAvailable(active) || (!tooltip.hidden && !tooltip.isConnected))) dismiss();
  }

  const observer = new MutationObserver(verifyConnection);
  observer.observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'hidden'] });
  const listeners: [string, EventListener, boolean?][] = [
    ['pointerover', onPointerOver], ['pointerout', onPointerOut], ['pointermove', onPointerMove],
    ['pointerdown', onPointerDown], ['pointerup', onPointerUp],
    ['focusin', onFocusIn], ['focusout', onFocusOut], ['keydown', onKeyDown],
    ['close', onDialogClose, true], ['cancel', onDialogClose, true],
  ];
  // Listen on the document because the shared tooltip can be outside an element
  // root; sentenceFor still limits source encounters to the installed root.
  for (const [name, listener, capture] of listeners) page.addEventListener(name, listener, capture);
  browser.addEventListener('resize', position);
  page.addEventListener('scroll', position, true);
  browser.addEventListener('blur', dismiss);

  return () => {
    if (disposed) return;
    disposed = true;
    dismiss();
    observer.disconnect();
    for (const [name, listener, capture] of listeners) page.removeEventListener(name, listener, capture);
    browser.removeEventListener('resize', position);
    page.removeEventListener('scroll', position, true);
    browser.removeEventListener('blur', dismiss);
  };
}
