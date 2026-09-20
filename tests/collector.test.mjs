import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock, isJevRelated, mergeRecords, readJson, sinceFor } from '../scripts/collector/core.mjs';
import { extractRecords, collectGithub, collectDev, collectHackerNews, githubRecord, hnRecord, devRecord } from '../scripts/collector/sources.mjs';
import { runCollector } from '../scripts/collector/run.mjs';

const t0 = '2026-09-17T00:00:00.000Z';
const t1 = '2026-09-20T00:00:00.000Z';
const record = (id = '1', fields = {}) => ({
  id, canonicalUrl: `https://x.com/demo/status/${id}`, text: 'Jev by TypeSafe powers an AI agent.',
  author: { name: 'Developer' }, createdAt: t0, media: [], links: [], ...fields,
});
const config = {
  schemaVersion: 1, intervalHours: 6, initialSince: '2026-09-15T00:00:00.000Z',
  overlapHours: 48, sourceTimeoutMs: 1000,
  sources: [{ id: 'a', name: 'A', type: 'fixture', enabled: true }, { id: 'b', name: 'B', type: 'fixture', enabled: true }],
};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'jev-collector-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public/data'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'dist/index.html'), '<html></html>');
  await writeFile(join(root, 'src/data/supplemental.json'), JSON.stringify([record('curated')]));
  const data = { schemaVersion: 1, collectedAt: t0, sourceUrl: 'https://reference.invalid/', records: [record()] };
  await writeFile(join(root, 'public/data/source-cases.json'), JSON.stringify(data));
  return { root, data, file: join(root, 'public/data/source-cases.json') };
}

test('AST extraction reads literal public data without executing untrusted JavaScript', () => {
  const code = `globalThis.UNTRUSTED_EXECUTED = true; const data = JSON.parse(${JSON.stringify(JSON.stringify([record()]))});`;
  assert.deepEqual(extractRecords(code), [record()]);
  assert.equal(globalThis.UNTRUSTED_EXECUTED, undefined);
  assert.equal(extractRecords('JSON.parse(dynamicExpression())'), undefined);
});

test('incremental merge preserves old cases, IDs, original media, first-seen time and canonical deduplication', () => {
  const old = record('1', { firstSeenAt: t0, media: [{ publicUrl: 'https://video.invalid/demo.mp4' }] });
  const update = record('different-id', { canonicalUrl: 'https://twitter.com/demo/status/1?s=20', text: 'Updated Jev by TypeSafe AI' });
  const result = mergeRecords([old, record('missing-upstream')], [update, record('new'), record('curated')], {
    now: t1, sourceId: 'a', excludedUrls: new Set(['https://x.com/demo/status/curated']),
  });
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.records.length, 3);
  const stored = result.records.find(item => item.id === '1');
  assert.equal(stored.firstSeenAt, t0);
  assert.equal(stored.media[0].publicUrl, old.media[0].publicUrl);
  const second = mergeRecords(result.records, [update, record('new')], { now: t1, sourceId: 'a' });
  assert.equal(second.added, 0);
  assert.equal(second.updated, 0);
});

test('unrelated Jev terms, unsafe URLs, invalid dates and ID collisions do not enter catalog', () => {
  assert.equal(isJevRelated('Japanese encephalitis virus (JEV) AI paper'), false);
  assert.equal(isJevRelated('Jevons paradox in AI'), false);
  assert.equal(isJevRelated('Jev playing chess with TypeSafe'), true);
  assert.equal(githubRecord({ id: 1, full_name: 'user/jev', html_url: 'https://github.com/user/jev', description: 'Java editor viewer', created_at: t0 }), null);
  const result = mergeRecords([record()], [
    record('evil', { canonicalUrl: 'javascript:alert(1)' }),
    record('date', { createdAt: 'bad-date' }),
    record('1', { canonicalUrl: 'https://elsewhere.invalid/' }),
  ], { now: t1, sourceId: 'a' });
  assert.equal(result.invalid, 3);
  assert.equal(result.records.length, 1);
});

test('cross-platform discovery never downgrades an existing original or curated record', () => {
  const original = record('1', { title: 'Original X demo', media: [{ publicUrl: 'https://video.invalid/demo.mp4' }] });
  const discovery = record('hn-42', { canonicalUrl: original.canonicalUrl, title: 'HN repost', autoCollected: true, platform: 'Hacker News' });
  const result = mergeRecords([original], [discovery], { now: t1, sourceId: 'hn' });
  assert.equal(result.updated, 0);
  assert.equal(result.duplicate, 1);
  assert.deepEqual(result.records[0], original);
});

test('same-source duplicate links keep the newest first result and stay stable across retries', () => {
  const newest = record('hn-42', { canonicalUrl: 'https://demo.invalid/', title: 'Newest title', autoCollected: true });
  const older = { ...newest, id: 'hn-41', title: 'Older title' };
  const first = mergeRecords([], [newest, older], { now: t0, sourceId: 'hn' });
  assert.equal(first.records[0].title, 'Newest title');
  const second = mergeRecords(first.records, [newest, older], { now: t1, sourceId: 'hn' });
  assert.equal(second.updated, 0);
  assert.equal(second.added, 0);
  assert.equal(second.records.length, 1);
});

test('one failed source does not block successful sources, and watermarks advance only on complete fetch', async t => {
  const { root, file } = await fixture(t);
  const summary = await runCollector({
    root, config, now: t1,
    adapters: { fixture: async source => { if (source.id === 'a') throw new Error('HTTP 429'); return { records: [record('2'), record('curated')], complete: true }; } },
  });
  assert.equal(summary.outcome, 'partial');
  assert.equal(summary.added, 1);
  const next = await readJson(file);
  assert.equal(next.records.length, 2);
  assert.equal(next.collection.sources.find(source => source.id === 'a').lastSuccessAt, null);
  assert.equal(next.collection.sources.find(source => source.id === 'b').lastSuccessAt, t1);
  assert.deepEqual(await readJson(join(root, 'dist/data/source-cases.json')), next);
  assert.equal(next.collection.history.length, 1);
});

test('all-source failure preserves content and content timestamp; dry run never commits', async t => {
  const { root, file, data } = await fixture(t);
  const adapters = { fixture: async () => { throw new Error('Offline'); } };
  const summary = await runCollector({ root, config, now: t1, adapters });
  assert.equal(summary.outcome, 'error');
  const after = await readJson(file);
  assert.deepEqual(after.records, data.records);
  assert.equal(after.collectedAt, t0);
  const beforeDryRun = await readFile(file, 'utf8');
  await runCollector({ root, config, now: t1, dryRun: true, adapters: { fixture: async () => ({ records: [record('3')], complete: true }) } });
  assert.equal(await readFile(file, 'utf8'), beforeDryRun);
});

test('process lock prevents competing writes and can be acquired after release', async t => {
  const { root } = await fixture(t);
  const directory = join(root, '.collector');
  const release = await acquireLock(directory);
  await assert.rejects(acquireLock(directory), { code: 'COLLECTOR_BUSY' });
  await release();
  const releaseAgain = await acquireLock(directory);
  await releaseAgain();
});

test('GitHub result caps create resumable windows, and no-progress errors retain cursors', async () => {
  const source = { query: 'jev typesafe', perPage: 2, maxPages: 1, maxRequests: 2 };
  const request = async () => ({ json: () => ({ total_count: 20, incomplete_results: false, items: [] }) });
  const result = await collectGithub(source, { request, previous: null, config, now: t1 });
  assert.equal(result.complete, false);
  assert.equal(result.cursor.windows.length, 3);
  assert.equal(result.cursor.queuedThrough, t1);
  const error = await collectGithub(source, { request: async () => { throw new Error('429'); }, previous: { cursor: result.cursor }, config, now: '2026-09-20T06:00:00.000Z' });
  assert.equal(error.complete, false);
  assert.equal(error.cursor.windows.length, 4);
  assert.ok(error.issue.includes('429'));
});

test('GitHub fixed-window pagination continues through pages and returns original metadata', async () => {
  const source = { query: 'jev typesafe', perPage: 1, maxPages: 3, maxRequests: 3 };
  const seen = [];
  const request = async url => {
    const page = Number(new URL(url).searchParams.get('page'));
    seen.push(page);
    return { json: () => ({
      total_count: 2, incomplete_results: false,
      items: [{ id: page, full_name: `user/jev-${page}`, description: 'TypeSafe AI model demo', html_url: `https://github.com/user/jev-${page}`, created_at: t0 }],
    }) };
  };
  const result = await collectGithub(source, { request, previous: null, config, now: t1 });
  assert.deepEqual(seen, [1, 2]);
  assert.equal(result.complete, true);
  assert.equal(result.records.length, 2);
  assert.ok(result.records.every(item => item.autoCollected));
});

test('DEV tag pages are filtered and pagination bounds are surfaced', async () => {
  const request = async () => ({ json: () => [
    { id: 1, title: 'Jev model demo', description: 'TypeSafe AI tools', url: 'https://dev.to/a/demo', published_at: t1, tag_list: ['jev'], user: { name: 'A' } },
    { id: 2, title: 'Unrelated', description: 'other', url: 'https://dev.to/a/no', published_at: t1, tag_list: [] },
  ] });
  const result = await collectDev({ tags: ['jev'], perPage: 2, maxPages: 1 }, { request, config });
  assert.equal(result.records.length, 1);
  assert.equal(result.complete, false);
  assert.equal(devRecord({ title: 'Jevons paradox', description: 'AI economics', tag_list: [] }), null);
});

test('HN exact words, source provenance and pagination are preserved', async () => {
  const result = await collectHackerNews({ query: 'jev', perPage: 100, maxPages: 2 }, {
    config,
    request: async () => ({ json: () => ({ nbPages: 1, hits: [
      { objectID: '42', title: 'Show HN: Jev agent demo', story_text: 'TypeSafe AI project', url: 'https://demo.invalid/', author: 'Author', created_at: t1 },
      { objectID: '43', title: 'Jevons paradox', story_text: 'AI economics', url: 'https://noise.invalid/', created_at: t1 },
    ] }) }),
  });
  assert.equal(result.complete, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].sourceUrl, 'https://news.ycombinator.com/item?id=42');
  assert.equal(hnRecord({ title: 'Electrify everything', objectID: 2 }), null);
  assert.equal(sinceFor({ lastSuccessAt: t1 }, config), '2026-09-18T00:00:00.000Z');
});
