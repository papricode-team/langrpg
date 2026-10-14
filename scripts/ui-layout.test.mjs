import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveUiMedia, uiLayout, uiLayoutPlugin, uiMedia } from './ui-layout.mjs';

test('layout predicates preserve the exact inclusive boundaries and their complements', () => {
  assert.deepEqual(uiLayout, { phone: 600, tablet: 1000, landscapeShort: 520 });
  assert.equal(uiMedia['--phone'], '(max-width: 600px)');
  assert.equal(uiMedia['--above-phone'], '(min-width: 601px)');
  assert.equal(uiMedia['--tablet'], '(max-width: 1000px)');
  assert.equal(uiMedia['--desktop'], '(min-width: 1001px)');
  assert.equal(uiMedia['--above-short'], '(min-height: 521px)');
  assert.ok(Object.isFrozen(uiLayout));
});

test('compiles every named clause and keeps compound queries and rule bodies intact', () => {
  const source = '@media (--phone), (pointer: coarse) and (--short-landscape) { .hint { display: none } }\n@media screen and (--above-phone) and (--tablet) { .rail { display: grid } }\n@media (--desktop) and (--above-short) { .pane { display: flex } }';
  assert.equal(resolveUiMedia(source), '@media (max-width: 600px), (pointer: coarse) and ((max-height: 520px) and (orientation: landscape)) { .hint { display: none } }\n@media screen and (min-width: 601px) and (max-width: 1000px) { .rail { display: grid } }\n@media (min-width: 1001px) and (min-height: 521px) { .pane { display: flex } }');
});

test('groups short landscape so negation and additional conditions keep their meaning', () => {
  assert.equal(resolveUiMedia('@media not (--short-landscape) { .x {} }'), '@media not ((max-height: 520px) and (orientation: landscape)) { .x {} }');
  assert.equal(resolveUiMedia('@media (--phone) and (--short-landscape) { .x {} }'), '@media (max-width: 600px) and ((max-height: 520px) and (orientation: landscape)) { .x {} }');
});

test('ignores comments, quoted content, container queries and partial alias names', () => {
  const source = '/* @media (--unknown) {} */\n.x { content: "@media (--phone) {"; --label: "escaped \\" @media (--unknown)" }\n@container (--phone) { .x {} }\n@media (min-width: 600px) /* (--unknown) */ { .x { content: "(--phone)" } }';
  assert.equal(resolveUiMedia(source), source);
  assert.equal(resolveUiMedia('@media (--phone: true) { .x {} }'), '@media (--phone: true) { .x {} }');
  assert.equal(resolveUiMedia('@media (width: var(--phone)) { .x {} }'), '@media (width: var(--phone)) { .x {} }');
});

test('rejects unknown complete aliases instead of silently disabling a layout', () => {
  assert.throws(() => resolveUiMedia('@media (--phoen) { .x {} }'), /Unknown UI media alias: --phoen/);
  assert.throws(() => resolveUiMedia('@media (--phone) and (--unknown) { .x {} }'), /Unknown UI media alias: --unknown/);
});

test('the Vite pre-transform handles CSS imports with queries and leaves other modules alone', () => {
  const plugin = uiLayoutPlugin();
  assert.equal(plugin.enforce, 'pre');
  assert.deepEqual(plugin.transform('@media (--phone) { .x {} }', '/src/style.css?direct'), { code: '@media (max-width: 600px) { .x {} }', map: null });
  assert.equal(plugin.transform('@media (--unknown) {}', '/src/copy.ts'), null);
  assert.equal(plugin.transform('@media (pointer: coarse) {}', '/src/style.css'), null);
});
