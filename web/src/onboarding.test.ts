// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as i18n from './i18n';
import { turkishOverlay } from './i18n-tr';
import { mountLanguageOnboarding, onboardingStepsMarkup } from './onboarding';

async function flush() { for (let index = 0; index < 5; index++) await Promise.resolve(); }
function click(selector: string) { document.querySelector<HTMLButtonElement>(selector)!.click(); }
function mount(initialLanguage: i18n.BaseLanguage = 'en') {
  const onConfirm = vi.fn(), onLogin = vi.fn();
  mountLanguageOnboarding(document.body, { initialLanguage, onConfirm, onLogin });
  return { onConfirm, onLogin };
}

beforeEach(async () => {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  i18n.installOverlay(turkishOverlay);
  await i18n.setBaseLanguage('en');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await i18n.setBaseLanguage('en');
  i18n.installOverlay(undefined);
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('two-step language onboarding', () => {
  it('asks for the mother tongue and offers only German as the learning language', () => {
    const { onConfirm } = mount();
    expect([...document.querySelectorAll<HTMLInputElement>('[name="mother-tongue"]')].map(input => input.value)).toEqual(['en', 'tr']);
    expect([...document.querySelectorAll<HTMLInputElement>('[name="learning-language"]')].map(input => input.value)).toEqual(['de']);
    expect(document.querySelector<HTMLInputElement>('[name="learning-language"]')!.checked).toBe(true);
    expect(document.querySelector('.character-builder')).toBeNull();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toBe('1Languages');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('requires an explicit answer to the confirmation question before opening the builder', async () => {
    const { onConfirm } = mount();
    click('[type="submit"]'); await flush();
    expect(document.querySelector('#account-title')?.textContent).toBe('Is this the right language pair?');
    expect(document.body.textContent).toContain('Your mother tongue is English, and you want to learn German. Is that right?');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('account-title');
    click('#confirm-languages');
    expect(onConfirm).toHaveBeenCalledWith({ motherTongue: 'en', learningLanguage: 'de' });
    document.body.innerHTML = onboardingStepsMarkup(2);
    expect(document.querySelector('[aria-current="step"]')?.textContent).toBe('2Character');
  });

  it('confirms Turkish in Turkish and applies the choice before the builder opens', async () => {
    const { onConfirm } = mount();
    click('[value="tr"]'); click('[type="submit"]'); await flush();
    expect(i18n.baseLanguage()).toBe('tr');
    expect(document.documentElement.lang).toBe('tr');
    expect(localStorage.getItem('atlas.baseLanguage')).toBe('tr');
    expect(document.querySelector('#account-title')?.textContent).toBe('Bu dil seçimi doğru mu?');
    expect(document.body.textContent).toContain('Ana dilin Türkçe ve Almanca öğrenmek istiyorsun. Doğru mu?');
    expect(onConfirm).not.toHaveBeenCalled();
    click('#confirm-languages');
    expect(onConfirm).toHaveBeenCalledWith({ motherTongue: 'tr', learningLanguage: 'de' });
  });

  it('retains selections when going back and asks again after changing the mother tongue', async () => {
    const { onConfirm } = mount('tr');
    click('[type="submit"]'); await flush();
    click('#change-languages');
    expect(document.querySelector<HTMLInputElement>('[value="tr"]')!.checked).toBe(true);
    click('[value="en"]'); click('[type="submit"]'); await flush();
    expect(document.body.textContent).toContain('Your mother tongue is English, and you want to learn German. Is that right?');
    expect(onConfirm).not.toHaveBeenCalled();
    click('#confirm-languages');
    expect(onConfirm).toHaveBeenCalledWith({ motherTongue: 'en', learningLanguage: 'de' });
  });

  it('keeps language selection open if the selected translation cannot load', async () => {
    vi.spyOn(i18n, 'setBaseLanguage').mockResolvedValueOnce('en');
    const { onConfirm } = mount('tr');
    click('[type="submit"]'); await flush();
    expect(document.querySelector('#language-entry-form')).not.toBeNull();
    expect(document.querySelector('#account-error')?.textContent).toContain('Turkish support could not load.');
    expect(document.querySelector<HTMLInputElement>('[value="tr"]')!.checked).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('passes the current selections to login without skipping confirmation', () => {
    const { onConfirm, onLogin } = mount();
    click('[value="tr"]'); click('#entry-login');
    expect(onLogin).toHaveBeenCalledWith({ motherTongue: 'tr', learningLanguage: 'de' });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables navigation and ignores repeated submits while loading the language', async () => {
    let resolve!: (language: i18n.BaseLanguage) => void;
    const apply = vi.spyOn(i18n, 'setBaseLanguage').mockReturnValueOnce(new Promise(result => { resolve = result; }));
    mount();
    const form = document.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(document.querySelector<HTMLButtonElement>('#entry-login')!.disabled).toBe(true);
    resolve('en'); await flush();
    expect(document.querySelector('#confirm-languages')).not.toBeNull();
  });
});
