/** Shared layout predicates, expanded before Vite parses application CSS. */
export const uiLayout = Object.freeze({ phone: 600, tablet: 1000, laptop: 1279, landscapeShort: 520, desktopShort: 800 });
export const uiMedia = Object.freeze({
  '--phone': `(max-width: ${uiLayout.phone}px)`,
  '--above-phone': `(min-width: ${uiLayout.phone + 1}px)`,
  '--tablet': `(max-width: ${uiLayout.tablet}px)`,
  '--desktop': `(min-width: ${uiLayout.tablet + 1}px)`,
  '--laptop': `(max-width: ${uiLayout.laptop}px)`,
  '--short-desktop': `(max-height: ${uiLayout.desktopShort}px)`,
  '--short-landscape': `((max-height: ${uiLayout.landscapeShort}px) and (orientation: landscape))`,
  '--above-short': `(min-height: ${uiLayout.landscapeShort + 1}px)`,
});

function tokenEnd(source, index) {
  if (source.startsWith('/*', index)) {
    const end = source.indexOf('*/', index + 2);
    return end === -1 ? source.length : end + 2;
  }
  const quote = source[index];
  if (quote !== '"' && quote !== "'") return index;
  for (let end = index + 1; end < source.length; end++) {
    if (source[end] === '\\') end++;
    else if (source[end] === quote) return end + 1;
  }
  return source.length;
}

function resolveConditions(prelude) {
  let output = '', previous = 0;
  for (let index = 0; index < prelude.length;) {
    const end = tokenEnd(prelude, index);
    if (end > index) { index = end; continue; }
    if (prelude[index] === '(' && !/[\w-]/.test(prelude[index - 1] ?? '')) {
      const alias = /^\(\s*(--[\w-]+)\s*\)/.exec(prelude.slice(index));
      if (alias) {
        if (!Object.hasOwn(uiMedia, alias[1])) throw new Error(`Unknown UI media alias: ${alias[1]}`);
        output += prelude.slice(previous, index) + uiMedia[alias[1]];
        index += alias[0].length;
        previous = index;
        continue;
      }
    }
    index++;
  }
  return output + prelude.slice(previous);
}

/** Replace whole alias clauses in real @media rules; strings, comments and containers stay intact. */
export function resolveUiMedia(source) {
  let output = '', previous = 0;
  for (let index = 0; index < source.length;) {
    const end = tokenEnd(source, index);
    if (end > index) { index = end; continue; }
    const media = source[index] === '@' && /^@media\b/i.exec(source.slice(index));
    if (!media) { index++; continue; }
    const start = index + media[0].length;
    index = start;
    while (index < source.length && source[index] !== '{' && source[index] !== ';') {
      const token = tokenEnd(source, index);
      index = token > index ? token : index + 1;
    }
    if (source[index] !== '{') continue;
    output += source.slice(previous, start) + resolveConditions(source.slice(start, index));
    previous = index;
    index++;
  }
  return output + source.slice(previous);
}

export function uiLayoutPlugin() {
  return {
    name: 'atlas-ui-layout',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.css(?:$|\?)/i.test(id)) return null;
      const resolved = resolveUiMedia(code);
      return resolved === code ? null : { code: resolved, map: null };
    },
  };
}
