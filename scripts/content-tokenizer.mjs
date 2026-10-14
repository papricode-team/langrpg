/** Build-time word tokenization. JavaScript match indices are UTF-16 offsets. */
export function tokenize(text) {
  if (typeof text !== 'string') throw new TypeError('Tokenization requires unchanged text.');
  return [...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’ʼ-][\p{L}\p{M}\p{N}]+)*/gu)].map(match => [match.index, match.index + match[0].length]);
}

export function tokenTexts(value) {
  return value.tokens.map(([start, end]) => value.text.slice(start, end));
}

export function tokenized(text) { return { text, tokens: tokenize(text) }; }
