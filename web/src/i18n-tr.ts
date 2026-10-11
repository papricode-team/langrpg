/** The Turkish overlay: one lazily loaded chunk, never part of the English bundle. */
import story from './data/i18n/tr-story.json';
import ui from './data/i18n/tr-ui.json';
import course from './data/i18n/tr-course.json';
import type { LanguageOverlay } from './i18n';

export const turkishOverlay = { story, ui, course } as unknown as LanguageOverlay;
