import { baseLanguageNames, isBaseLanguage, setBaseLanguage, t, type BaseLanguage } from './i18n';
import { escapeHtml as e, icon } from './icons';
import { brandMarkup } from './branding';

export interface OnboardingLanguages { motherTongue: BaseLanguage; learningLanguage: 'de' | 'en'; }
export function onboardingStepsMarkup(step: 1 | 2): string {
  return `<ol class="onboarding-steps" aria-label="${e(t('Onboarding progress'))}"><li ${step === 1 ? 'aria-current="step"' : ''}><span>1</span>${t('Languages')}</li><li ${step === 2 ? 'aria-current="step"' : ''}><span>2</span>${t('Character')}</li></ol>`;
}
export function onboardingLanguageSummary(language: BaseLanguage, target: 'de' | 'en' = 'de'): string {
  return `<span lang="${language}">${baseLanguageNames[language]}</span><span aria-hidden="true">→</span><span>${t(target === 'de' ? 'German' : 'English')} <span lang="${target}">${target === 'de' ? 'Deutsch' : 'English'}</span></span>`;
}
export function mountLanguageOnboarding(host: HTMLElement, options: {
  initialLanguage: BaseLanguage; initialLearningLanguage?: 'de' | 'en';
  onConfirm(languages: OnboardingLanguages): void; onLogin(languages: OnboardingLanguages): void;
}): void {
  let languages: OnboardingLanguages = { motherTongue: options.initialLanguage, learningLanguage: options.initialLearningLanguage ?? 'de' }, busy = false;
  const heading = () => `${brandMarkup}${onboardingStepsMarkup(1)}`;
  const focusHeading = () => host.querySelector<HTMLElement>('#account-title')?.focus({ preventScroll: true });
  function selectLanguages() {
    const supports: BaseLanguage[] = languages.learningLanguage === 'de' ? ['en', 'tr'] : ['tr', 'de'];
    if (!supports.includes(languages.motherTongue)) languages.motherTongue = supports[0];
    host.innerHTML = `${heading()}<h2 id="account-title" tabindex="-1">${t('Which languages will guide your adventure?')}</h2><p>${t('Choose your mother tongue and the language you want to learn.')}</p><form id="language-entry-form"><fieldset class="onboarding-language-picker"><legend>${t('I want to learn')}</legend>${(['de','en'] as const).map(target => `<label class="onboarding-language-option"><input type="radio" name="learning-language" value="${target}" ${languages.learningLanguage === target ? 'checked' : ''} required/><span>${t(target === 'de' ? 'German' : 'English')} <span lang="${target}">${target === 'de' ? 'Deutsch' : 'English'}</span></span></label>`).join('')}</fieldset><fieldset class="onboarding-language-picker"><legend>${t('My mother tongue')}</legend><div class="onboarding-language-options">${supports.map(language => `<label class="onboarding-language-option" lang="${language}"><input type="radio" name="mother-tongue" value="${language}" ${languages.motherTongue === language ? 'checked' : ''} required/><span>${baseLanguageNames[language]}</span></label>`).join('')}</div><span class="caption">${t('Meanings, hints and menus will use your mother tongue.')}</span></fieldset><p id="account-error" class="account-error" role="alert"></p><button class="primary-button" type="submit">${t('Continue')} ${icon('arrow')}</button></form><button type="button" class="text-button" id="entry-login">${t('Already played? Log in with email')}</button>`;
    const form = host.querySelector<HTMLFormElement>('#language-entry-form')!;
    const readChoice = () => { const selected = new FormData(form), motherTongue = selected.get('mother-tongue'), target = selected.get('learning-language'); if (isBaseLanguage(motherTongue) && (target === 'de' || target === 'en')) languages = { motherTongue, learningLanguage: target }; };
    form.querySelectorAll<HTMLInputElement>('[name="learning-language"]').forEach(input => { input.onchange = () => { readChoice(); selectLanguages(); }; });
    host.querySelector<HTMLButtonElement>('#entry-login')!.onclick = () => { readChoice(); options.onLogin(languages); };
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || !form.checkValidity()) return;
      readChoice(); busy = true; host.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input').forEach(control => { control.disabled = true; });
      const applied = await setBaseLanguage(languages.motherTongue); busy = false;
      if (applied !== languages.motherTongue) { selectLanguages(); host.querySelector<HTMLElement>('#account-error')!.textContent = t('Turkish support could not load. Check your connection and try again.'); return; }
      confirmLanguages();
    };
    focusHeading();
  }
  function confirmLanguages() {
    host.innerHTML = `${heading()}<h2 id="account-title" tabindex="-1">${t('Is this the right language pair?')}</h2><p>${e(t('Your mother tongue is {language}, and you want to learn {target}. Is that right?', { language: baseLanguageNames[languages.motherTongue], target: t(languages.learningLanguage === 'de' ? 'German' : 'English') }))}</p><div class="onboarding-language-pair">${onboardingLanguageSummary(languages.motherTongue,languages.learningLanguage)}</div><div class="onboarding-confirm-actions"><button class="primary-button" type="button" id="confirm-languages">${t('Yes, build my character')} ${icon('arrow')}</button><button class="outline-button" type="button" id="change-languages">${t('Change languages')}</button></div>`;
    host.querySelector<HTMLButtonElement>('#confirm-languages')!.onclick = () => options.onConfirm(languages);
    host.querySelector<HTMLButtonElement>('#change-languages')!.onclick = selectLanguages; focusHeading();
  }
  selectLanguages();
}
