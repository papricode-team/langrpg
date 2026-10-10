import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'public/**', 'src/data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts', 'vite.config.ts'], languageOptions: { globals: {
    window: 'readonly', document: 'readonly', localStorage: 'readonly', navigator: 'readonly', console: 'readonly',
    HTMLElement: 'readonly', HTMLCanvasElement: 'readonly', HTMLDialogElement: 'readonly', Image: 'readonly', Audio: 'readonly',
    ResizeObserver: 'readonly', fetch: 'readonly', performance: 'readonly', crypto: 'readonly', URL: 'readonly',
    process: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
    requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', queueMicrotask: 'readonly', Event: 'readonly',
    WebSocket: 'readonly', location: 'readonly', confirm: 'readonly', AbortController: 'readonly',
  } }, rules: {
    // tsc owns symbol/type checks. Existing Phaser harnesses intentionally use
    // dynamic fake scenes; strengthen individual modules as they are extracted.
    'no-undef': 'off', 'no-unused-vars': 'off', '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-non-null-assertion': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
  } },
);
