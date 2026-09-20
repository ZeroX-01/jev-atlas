import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalKey, safeUrl, normalizeRecord, filterCases, validateLocalRecord } from '../src/lib/catalog.mjs';

const source = JSON.parse(await readFile(new URL('../public/data/source-cases.json', import.meta.url)));
const extras = JSON.parse(await readFile(new URL('../src/data/supplemental.json', import.meta.url)));
const editorial = JSON.parse(await readFile(new URL('../src/data/editorial.json', import.meta.url)));
const cases = [...source.records.map((raw) => normalizeRecord(raw, editorial, source.sourceUrl)), ...extras.map((raw) => normalizeRecord(raw))];

test('collected content preserves unique public source URLs, authors and provenance', () => {
  assert.equal(new Set(cases.map((item) => canonicalKey(item.canonicalUrl))).size, cases.length);
  assert.ok(cases.length >= 209);
  for (const item of cases) {
    assert.ok(safeUrl(item.canonicalUrl), item.id);
    assert.ok(item.author.name, item.id);
    assert.ok(item.verification, item.id);
    assert.ok(Number.isFinite(Date.parse(item.createdAt)), item.id);
    for (const media of item.media) assert.ok(safeUrl(media.publicUrl), item.id);
  }
});

test('Chinese editorial search still finds the original author and English source text', () => {
  assert.ok(filterCases(cases, { query: '电脑 日历' }).some((item) => item.id === '2100864907046768890'));
  assert.ok(filterCases(cases, { query: 'Tony sponsor' }).some((item) => item.id === '2100793777103466615'));
  assert.equal(filterCases(cases, { query: 'NO_SUCH_CASE_743889' }).length, 0);
});

test('combined content, category, source and bookmark filters intersect without modifying the catalog', () => {
  const before = cases.map((item) => item.id);
  const filtered = filterCases(cases, { kind: 'code', category: '电脑操作', platform: 'GitHub', saved: ['jev-browser-control', 'jev-ultrafast'], sort: 'latest' });
  assert.deepEqual(filtered.map((item) => item.id), ['jev-ultrafast', 'jev-browser-control']);
  assert.deepEqual(cases.map((item) => item.id), before);
  assert.equal(filterCases(cases, { saved: [] }).length, 0);
});

test('unsafe or broken submission URLs are rejected, including imported records', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,hi', 'file:///tmp/test', 'not-a-link']) {
    assert.equal(safeUrl(value), '');
    assert.equal(validateLocalRecord({ title: 'Unsafe', canonicalUrl: value }), null);
  }
  assert.equal(validateLocalRecord({ title: '', canonicalUrl: 'https://github.com/example/repo' }), null);
});

test('tracking and Twitter aliases deduplicate, meaningful project query parameters remain', () => {
  assert.equal(canonicalKey('https://twitter.com/user/status/123?s=20&utm_source=test'), canonicalKey('https://x.com/user/status/123'));
  assert.notEqual(canonicalKey('https://example.org/?project=one'), canonicalKey('https://example.org/?project=two'));
});

test('imported personal records cannot claim trusted verification or inject remote media', () => {
  const record = validateLocalRecord({
    title: 'My project', canonicalUrl: 'https://github.com/example/demo', category: 'invalid',
    platform: 'TypeSafe', verification: 'verified', media: [{ publicUrl: 'https://evil.invalid/video' }],
  });
  assert.equal(record.platform, '个人收录');
  assert.equal(record.isLocal, true);
  assert.equal(record.category, '资料与讨论');
  assert.deepEqual(record.media, []);
  assert.ok(record.verification.includes('尚未核验'));
  assert.equal(normalizeRecord(record).isOpenSource, true);
});

test('supplementary source counts are derived from actual media, and official background stays labeled', () => {
  assert.equal(cases.find((item) => item.id === 'jev-ultrafast').media.length, 1);
  assert.equal(cases.find((item) => item.id === 'typesafe-introducing-jev').category, '资料与讨论');
  assert.ok(filterCases(cases, { kind: 'article' }).every((item) => item.media.length === 0));
  assert.ok(filterCases(cases, { kind: 'code' }).every((item) => item.links.some((link) => /github/.test(link.url))));
});
