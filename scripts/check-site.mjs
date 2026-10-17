import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Window } from 'happy-dom';

const root = 'web/dist';
async function files(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
const htmlFiles = (await files('site/dist')).filter(file => file.endsWith('.html'));
const pages = new Map();
const titles = new Set(), descriptions = new Set(), canonicals = new Set();
const sitemap = await readFile(join(root, 'sitemap-0.xml'), 'utf8');
const sitemapURLs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
const parser = new window.DOMParser();
const languages = ['tr', 'de'];
const sharedCopy = Object.fromEntries(await Promise.all(languages.map(async language => [language, JSON.parse(await readFile(`site/src/data/site-${language}.json`, 'utf8'))])));
async function checkPublicAsset(value, route) {
  assert.ok(value.startsWith('/') && !value.startsWith('//'), `${route}: assets must be self-hosted (${value})`);
  const url = new URL(value, 'https://glotworld.com');
  assert.ok(!/^\/(?:assets|game|api)\//.test(url.pathname), `${route}: public pages must not load game assets (${value})`);
  await stat(join(root, decodeURIComponent(url.pathname)));
}
async function checkCSS(css, route) {
  for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
    // Embedded decorative SVGs do not make network requests.
    if (match[1].startsWith('data:image/')) continue;
    await checkPublicAsset(match[1], route);
  }
}
for (const file of htmlFiles) {
  const rel = relative('site/dist', file);
  const route = '/' + (rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''));
  const html = await readFile(join(root, rel), 'utf8');
  const doc = parser.parseFromString(html, 'text/html');
  pages.set(route, doc);
  assert.equal(doc.querySelectorAll('h1').length, 1, `${route}: needs one H1`);
  assert.equal(doc.documentElement.lang, 'en');
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  assert.equal(canonical, `https://glotworld.com${route}`, `${route}: canonical mismatch`);
  assert.ok(!canonicals.has(canonical), `${route}: duplicate canonical`); canonicals.add(canonical);
  const title = doc.title, description = doc.querySelector('meta[name="description"]')?.getAttribute('content');
  assert.equal(doc.querySelectorAll('[data-site-language-select]').length, 1, `${route}: needs the shared language dropdown`);
  const pageKey = doc.body.dataset.sitePage;
  const translatedSources = new Set([title, description]);
  const walker = doc.createTreeWalker(doc.body, window.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('script, style, svg, [lang="de"]:not(html), [data-language-names], [data-language-status]')) continue;
    const source = node.textContent.trim();
    if (/\p{L}/u.test(source) && !/^© \d{4} glotworld$/.test(source)) translatedSources.add(source);
  }
  for (const element of doc.querySelectorAll('[aria-label], img[alt]')) {
    for (const name of ['aria-label', 'alt']) { const source = element.getAttribute(name); if (source) translatedSources.add(source); }
  }
  for (const language of languages) {
    const local = pageKey === 'index' ? {} : JSON.parse(await readFile(`site/src/data/pages/${language}/${pageKey}.json`, 'utf8'));
    const copy = { ...sharedCopy[language], ...local };
    for (const source of translatedSources) assert.ok(typeof copy[source] === 'string' && copy[source].trim(), `${route}: missing ${language} translation for ${source}`);
  }
  assert.ok(title && !titles.has(title), `${route}: missing/duplicate title`); titles.add(title);
  assert.ok(description?.length >= 70 && description.length <= 190 && !descriptions.has(description), `${route}: missing, duplicate or oversized description`); descriptions.add(description);
  assert.equal(doc.querySelector('meta[property="og:url"]')?.getAttribute('content'), canonical);
  assert.equal(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content'), 'summary_large_image');
  const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]')?.textContent || '{}');
  assert.equal(schema['@context'], 'https://schema.org');
  assert.ok(schema['@graph'].some(item => item['@type'] === 'WebPage'));
  if (route !== '/404.html') {
    assert.ok(!doc.querySelector('meta[name="robots"]')?.getAttribute('content')?.includes('noindex'));
    assert.ok(sitemapURLs.includes(canonical), `${route}: absent from sitemap`);
  } else assert.match(doc.querySelector('meta[name="robots"]')?.getAttribute('content'), /noindex/);
  if (route.startsWith('/learn-german/') && route !== '/learn-german/') {
    assert.ok((doc.querySelector('article')?.textContent || '').split(/\s+/).length >= 350, `${route}: guide needs substantial static text`);
    assert.ok(schema['@graph'].some(item => item['@type'] === 'Article'));
    assert.ok(schema['@graph'].some(item => item['@type'] === 'BreadcrumbList'));
    assert.ok(doc.querySelectorAll('.article-toc a[href^="#"]').length >= 4, `${route}: missing table of contents`);
  }
  for (const img of doc.querySelectorAll('img')) {
    assert.ok(img.hasAttribute('alt') && img.hasAttribute('width') && img.hasAttribute('height'), `${route}: image needs alt and dimensions`);
  }
  for (const asset of doc.querySelectorAll('img[src], script[src], link[rel="stylesheet"]')) {
    const url = asset.getAttribute('src') || asset.getAttribute('href');
    await checkPublicAsset(url, route);
    if (asset.localName === 'link') await checkCSS(await readFile(join(root, new URL(url, 'https://glotworld.com').pathname), 'utf8'), route);
  }
  // Gameplay video is decorative motion: muted, looped, inline, fetched only when played, with a poster.
  for (const video of doc.querySelectorAll('video')) {
    for (const attribute of ['muted', 'loop', 'playsinline', 'poster']) assert.ok(video.hasAttribute(attribute), `${route}: video needs ${attribute}`);
    assert.equal(video.getAttribute('preload'), 'none', `${route}: video must not preload`);
    assert.ok(!video.hasAttribute('autoplay'), `${route}: video starts from script so motion preferences apply`);
    await checkPublicAsset(video.getAttribute('poster'), route);
    const sources = [...video.querySelectorAll('source[src]')];
    assert.deepEqual(sources.map(source => source.getAttribute('type')).sort(), ['video/mp4', 'video/webm'], `${route}: video needs WebM and MP4 sources`);
    for (const source of sources) await checkPublicAsset(source.getAttribute('src'), route);
  }
  for (const style of doc.querySelectorAll('style')) await checkCSS(style.textContent, route);
  for (const element of doc.querySelectorAll('[style]')) await checkCSS(element.getAttribute('style'), route);
  for (const element of doc.querySelectorAll('[srcset], [imagesrcset]')) {
    const candidates = element.getAttribute('srcset') || element.getAttribute('imagesrcset');
    for (const candidate of candidates.split(',')) await checkPublicAsset(candidate.trim().split(/\s+/)[0], route);
  }
  // Inlined JS plus external JS should stay tiny: no framework/game runtime.
  let jsBytes = [...doc.querySelectorAll('script:not([type="application/ld+json"])')].reduce((sum, script) => sum + Buffer.byteLength(script.textContent), 0);
  for (const script of doc.querySelectorAll('script[src]')) jsBytes += (await stat(join(root, script.getAttribute('src')))).size;
  assert.ok(jsBytes < 20 * 1024, `${route}: website JS exceeds 20 KiB (${jsBytes})`);
}
for (const [route, doc] of pages) {
  for (const anchor of doc.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    const url = new URL(href, `https://glotworld.com${route}`);
    if (url.origin !== 'https://glotworld.com') continue;
    if (url.pathname === '/game/') { await stat(join(root, 'game/index.html')); continue; }
    const target = pages.get(url.pathname);
    assert.ok(target, `${route}: broken link to ${href}`);
    if (url.hash) assert.ok(target.getElementById(decodeURIComponent(url.hash.slice(1))), `${route}: broken fragment ${href}`);
  }
}
assert.equal(sitemapURLs.length, pages.size - 1, 'Sitemap should contain exactly the indexable pages');
assert.ok(!sitemapURLs.some(url => /\/game|\/404|admin|reset-password/.test(url)));
assert.match(await readFile(join(root, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/glotworld.com\/sitemap-index.xml/);
assert.match(await readFile(join(root, 'game/index.html'), 'utf8'), /noindex, follow/);
for (const file of await files(join(root, 'images'))) assert.ok((await stat(file)).size < 550 * 1024, `${file}: website image exceeds 550 KiB`);
// Keep in step with scripts/record-site-gameplay.mjs.
for (const file of await files(join(root, 'video'))) assert.ok((await stat(file)).size <= 1.5 * 1024 * 1024, `${file}: website video exceeds 1.5 MiB`);
await window.happyDOM.close();
console.log(`Website checks pass: ${pages.size - 1} indexable pages, complete Turkish and German translations, unique metadata, structured data, crawlable guides, sitemap, internal links, image, video and JavaScript budgets.`);
