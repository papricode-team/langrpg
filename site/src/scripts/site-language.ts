type SiteLanguage = 'en' | 'tr' | 'de';
type Copy = Record<string, string>;
const isLanguage = (value: unknown): value is SiteLanguage => value === 'en' || value === 'tr' || value === 'de';
const loaders = {
  en: async (): Promise<Copy> => ({}),
  tr: async (): Promise<Copy> => (await import('../data/site-tr.json')).default,
  de: async (): Promise<Copy> => (await import('../data/site-de.json')).default,
};
const pageCopies = import.meta.glob<Copy>('../data/pages/*/*.json', { import: 'default' });

export function mountLanguageSelector() {
  const selector = document.querySelector<HTMLElement>('[data-language-selector]');
  if (!selector) return;
  const buttons = [...selector.querySelectorAll<HTMLButtonElement>('[data-site-language]')];
  const dropdown = document.querySelector<HTMLSelectElement>('[data-site-language-select]')!;
  const status = document.querySelector<HTMLElement>('[data-language-status]')!;
  const page = document.body.dataset.sitePage || 'index';
  const originals = new WeakMap<Node, { source: string; rendered: string }>();
  const attributes = new WeakMap<Element, Map<string, { source: string; rendered: string }>>();
  let copy: Copy = {}, request = 0, current: SiteLanguage = 'en';

  // Retain the English source so language switches are reversible. If the café
  // demo or video controls change text, translate their new source as well.
  function translate() {
    observer.disconnect();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('script, style, svg, [lang="de"]:not(html), [data-language-names], [data-language-status]')) continue;
      const actual = node.nodeValue ?? '';
      let entry = originals.get(node);
      if (!entry || actual !== entry.rendered) entry = { source: actual, rendered: actual };
      const source = entry.source.trim();
      entry.rendered = copy[source] ? entry.source.replace(source, () => copy[source]) : entry.source;
      if (actual !== entry.rendered) node.nodeValue = entry.rendered;
      originals.set(node, entry);
    }
    for (const element of document.querySelectorAll('[aria-label], img[alt], title, meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"], meta[name="twitter:description"]')) {
      const names = element.tagName === 'TITLE' ? ['textContent'] : element.tagName === 'META' ? ['content'] : ['aria-label', 'alt'];
      const entries = attributes.get(element) ?? new Map();
      for (const name of names) {
        const actual = name === 'textContent' ? element.textContent : element.getAttribute(name);
        if (!actual) continue;
        let entry = entries.get(name);
        if (!entry || actual !== entry.rendered) entry = { source: actual, rendered: actual };
        entry.rendered = copy[entry.source] ?? entry.source;
        if (actual !== entry.rendered) {
          if (name === 'textContent') element.textContent = entry.rendered;
          else element.setAttribute(name, entry.rendered);
        }
        entries.set(name, entry);
      }
      attributes.set(element, entries);
    }
    observer.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'alt'] });
  }
  const observer = new MutationObserver(translate);

  async function select(language: SiteLanguage, persist = false) {
    const latest = ++request;
    const expanded = !document.documentElement.hasAttribute('data-language-chosen');
    selector!.setAttribute('aria-busy', 'true');
    dropdown.setAttribute('aria-busy', 'true');
    try {
      const [shared, local] = await Promise.all([loaders[language](), pageCopies[`../data/pages/${language}/${page}.json`]?.()]);
      if (latest !== request) return;
      copy = { ...shared, ...local };
      current = language;
      translate();
      document.documentElement.lang = language;
      document.querySelector('meta[property="og:locale"]')?.setAttribute('content', { en: 'en_GB', tr: 'tr_TR', de: 'de_DE' }[language]);
      buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.siteLanguage === language)));
      dropdown.value = language;
      document.querySelector('[data-language-current]')!.textContent = `${{ en: '🇬🇧', tr: '🇹🇷', de: '🇩🇪' }[language]} ${language.toUpperCase()}`;
      if (persist) {
        document.documentElement.setAttribute('data-language-chosen', '');
        if (expanded) dropdown.focus({ preventScroll: true });
        try {
          localStorage.setItem('atlas.baseLanguage', language);
          // An explicit choice should also win when an existing game resumes.
          localStorage.setItem('atlas.baseLanguagePending', 'true');
        } catch { /* The selector still works when browser storage is unavailable. */ }
      }
      status.textContent = '';
    } catch {
      if (latest === request) {
        dropdown.value = current;
        status.textContent = copy['Could not load this language. Please try again.'] ?? 'Could not load this language. Please try again.';
      }
    } finally {
      if (latest === request) {
        selector!.removeAttribute('aria-busy');
        dropdown.removeAttribute('aria-busy');
      }
    }
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    const language = button.dataset.siteLanguage;
    if (isLanguage(language)) void select(language, true);
  }));
  dropdown.addEventListener('change', () => { if (isLanguage(dropdown.value)) void select(dropdown.value, true); });
  let initial: SiteLanguage = 'en';
  try { const saved = localStorage.getItem('atlas.baseLanguage'); if (isLanguage(saved)) initial = saved; } catch { /* English is the default. */ }
  void select(initial);
}
