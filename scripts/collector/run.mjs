import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicJson, acquireLock, mergeRecords, readJson, safeError } from './core.mjs';
import { collectors, createRequest } from './sources.mjs';
import { canonicalKey } from '../../src/lib/catalog.mjs';

export async function mirrorData(root, dataset) {
  // Static previews must receive the same new data as the Vite development server.
  try {
    await stat(join(root, 'dist/index.html'));
    await mkdir(join(root, 'dist/data'), { recursive: true });
    await atomicJson(join(root, 'dist/data/source-cases.json'), dataset);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function runCollector({ root, config, selectedSources, bundle, adapters = collectors, request = createRequest(config), now = new Date().toISOString(), dryRun = false, onProgress = () => {} }) {
  const runtime = join(root, '.collector');
  const release = await acquireLock(runtime);
  try {
    const file = join(root, 'public/data/source-cases.json');
    const previous = await readJson(file);
    if (previous.schemaVersion !== 1 || !Array.isArray(previous.records)) throw new Error('现有数据格式无效，停止以避免覆盖。');
    const curated = await readJson(join(root, 'src/data/supplemental.json'), []);
    const excludedUrls = new Set([
      ...curated.map(item => canonicalKey(item.canonicalUrl)),
      ...(config.excludeUrls || []).map(canonicalKey),
    ].filter(Boolean));
    let records = previous.records.filter(record => !(record.autoCollected && excludedUrls.has(canonicalKey(record.canonicalUrl))));
    const removed = previous.records.length - records.length;
    const oldHealth = new Map((previous.collection?.sources || []).map(source => [source.id, source]));
    const health = new Map(oldHealth);
    const enabled = config.sources.filter(source => source.enabled && (!selectedSources || selectedSources.includes(source.id)));
    if (!enabled.length) throw new Error('没有可运行的采集来源。');
    let added = 0, updated = 0;
    for (const source of enabled) {
      const prior = oldHealth.get(source.id);
      onProgress(`检查 ${source.name}…`);
      try {
        const adapter = adapters[source.type];
        if (!adapter) throw new Error('未知采集器类型。');
        const result = await adapter(source, {
          request, config, previous: prior, now, bundle,
          signal: AbortSignal.timeout(config.sourceTimeoutMs),
        });
        if (!Array.isArray(result.records)) throw new Error('采集器没有返回有效记录列表。');
        const merged = mergeRecords(records, result.records, { now, sourceId: source.id, excludedUrls });
        records = merged.records;
        added += merged.added;
        updated += merged.updated;
        const complete = result.complete !== false && !merged.invalid;
        const status = complete ? 'ok' : 'partial';
        health.set(source.id, {
          id: source.id, name: source.name, status, checkedAt: now,
          lastSuccessAt: complete ? now : prior?.lastSuccessAt || null,
          discovered: result.records.length, added: merged.added, updated: merged.updated,
          skipped: merged.invalid + merged.duplicate,
          error: result.issue || (merged.invalid ? `${merged.invalid} 条记录校验失败，未写入。` : ''),
          cursor: result.cursor ?? prior?.cursor ?? null,
          consecutiveFailures: complete ? 0 : (prior?.consecutiveFailures || 0) + 1,
        });
        onProgress(`${source.name}: ${status}; 新增 ${merged.added}，更新 ${merged.updated}${result.issue ? `；${result.issue}` : ''}`);
      } catch (error) {
        health.set(source.id, {
          ...prior, id: source.id, name: source.name, status: 'error', checkedAt: now,
          lastSuccessAt: prior?.lastSuccessAt || null,
          discovered: 0, added: 0, updated: 0, skipped: 0,
          error: safeError(error), consecutiveFailures: (prior?.consecutiveFailures || 0) + 1,
        });
        onProgress(`${source.name}: error; ${safeError(error)}`);
      }
    }
    const current = enabled.map(source => health.get(source.id));
    const anyProgress = current.some(source => source.status === 'ok' || source.discovered > 0);
    const complete = current.every(source => source.status === 'ok');
    const outcome = complete ? 'ok' : anyProgress ? 'partial' : 'error';
    const summary = { startedAt: now, finishedAt: new Date().toISOString(), outcome, added, updated, removed, total: records.length, sources: current.map(({ cursor, ...source }) => source) };
    const next = {
      ...previous,
      collectedAt: anyProgress ? now : previous.collectedAt,
      records,
      collection: {
        schemaVersion: 1, intervalHours: config.intervalHours, lastRunAt: now,
        lastSuccessAt: complete ? now : previous.collection?.lastSuccessAt || null,
        lastContentChangeAt: added || updated ? now : previous.collection?.lastContentChangeAt || previous.collectedAt,
        outcome, added, updated, removed, sources: [...health.values()],
        history: [summary, ...(previous.collection?.history || [])].slice(0, 40),
      },
    };
    if (!dryRun) {
      await mkdir(join(runtime, 'backups'), { recursive: true });
      if (added || updated || removed) await atomicJson(join(runtime, 'backups', `${now.replace(/[:.]/g, '-')}.json`), previous);
      // One snapshot atomically commits both records and pagination/watermarks.
      await atomicJson(file, next);
      await mirrorData(root, next);
      await atomicJson(join(runtime, 'last-run.json'), summary);
      const backups = (await readdir(join(runtime, 'backups'))).filter(name => name.endsWith('.json')).sort().reverse();
      for (const obsolete of backups.slice(10)) await unlink(join(runtime, 'backups', obsolete));
    }
    return summary;
  } finally { await release(); }
}
