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
    assert.ok(url.startsWith('/'), `${route}: assets must be self-hosted`);
    await stat(join(root, url));
    assert.ok(!url.startsWith('/assets/'), `${route}: public pages must not load game bundles`);
  }
  for (const element of doc.querySelectorAll('[srcset], [imagesrcset]')) {
    const candidates = element.getAttribute('srcset') || element.getAttribute('imagesrcset');
    for (const candidate of candidates.split(',')) await stat(join(root, candidate.trim().split(/\s+/)[0]));
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
await window.happyDOM.close();
console.log(`Website checks pass: ${pages.size - 1} indexable pages, unique metadata, structured data, crawlable guides, sitemap, internal links, image and JavaScript budgets.`);
