import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { canonicalKey, safeUrl } from '../../src/lib/catalog.mjs';

export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}

export async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeSynced(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
}

async function writeSynced(path, content) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); }
  finally { await handle.close(); }
}

export async function acquireLock(directory) {
  await mkdir(directory, { recursive: true });
  const path = `${directory}/collector.lock`;
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeSynced(path, JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() }));
      return async () => {
        const current = await readJson(path, {});
        if (current.token === token) await unlink(path);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { owner = await readJson(path); } catch { owner = null; }
      if (owner?.pid) {
        try { process.kill(owner.pid, 0); }
        catch (check) {
          if (check.code === 'ESRCH') { await unlink(path).catch(() => {}); continue; }
        }
      } else if (Date.now() - (await stat(path)).mtimeMs > 300000) {
        await unlink(path).catch(() => {});
        continue;
      }
      const busy = new Error('另一个采集任务正在运行，本次跳过。');
      busy.code = 'COLLECTOR_BUSY';
      throw busy;
    }
  }
  throw new Error('无法取得采集锁。');
}

export function validRecord(record) {
  return record && typeof record.id === 'string' && record.id.length > 0
    && safeUrl(record.canonicalUrl) && typeof record.text === 'string'
    && typeof record.author?.name === 'string'
    && Number.isFinite(Date.parse(record.createdAt))
    && (!record.media || Array.isArray(record.media))
    && (!record.links || Array.isArray(record.links));
}

export function plainText(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value || '').replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code) => {
      if (code[0] !== '#') return entities[code.toLowerCase()] || match;
      const num = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return num > 0 && num <= 0x10ffff ? String.fromCodePoint(num) : '';
    }).replace(/\s+/g, ' ').trim();
}

export function isJevRelated(value) {
  const text = plainText(value);
  if (/Japanese encephalitis|encephalitis virus|日本脑炎|乙脑/i.test(text)) return false;
  return /(?:^|[^a-z])jev(?:$|[^a-z])/i.test(text)
    && /typesafe|system[\s-]*(?:one|1)|\bai\b|\bagent\b|\bllm\b|人工智能|模型|智能体/i.test(text);
}

export function discoveryRecord({ id, url, title, text, author, date, platform, sourceUrl, links = [], media = [] }) {
  if (!isJevRelated(`${title} ${text}`)) return null;
  return {
    id, canonicalUrl: safeUrl(url), title: plainText(title).slice(0, 240),
    summary: plainText(text).slice(0, 1800), text: plainText(text).slice(0, 12000),
    author: { name: plainText(author), screenName: plainText(author) },
    createdAt: date, platform, lang: /[\u4e00-\u9fff]/.test(title) ? 'zh' : 'en',
    category: '资料与讨论',
    media, links: links.filter(link => safeUrl(link.url)),
    autoCollected: true, sourceUrl,
    verification: `由 ${platform} 公开接口自动发现，关键词匹配，尚未人工核验；标题、简介和日期来自来源，是否实际使用 JEV 请查看原文。`,
  };
}

function contentHash(record) {
  const { firstSeenAt, lastSeenAt, contentUpdatedAt, collectorSource, ...content } = record;
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

export function mergeRecords(previous, incoming, { now, sourceId, excludedUrls = new Set() }) {
  const records = new Map(previous.map(record => [canonicalKey(record.canonicalUrl), record]));
  const ids = new Map(previous.map(record => [record.id, canonicalKey(record.canonicalUrl)]));
  const seen = new Set();
  let added = 0, updated = 0, invalid = 0, duplicate = 0;
  for (const raw of incoming) {
    if (!validRecord(raw)) { invalid++; continue; }
    const key = canonicalKey(raw.canonicalUrl);
    if (excludedUrls.has(key)) { duplicate++; continue; }
    if (seen.has(key)) { duplicate++; continue; }
    if (ids.has(raw.id) && ids.get(raw.id) !== key) { invalid++; continue; }
    seen.add(key);
    const existing = records.get(key);
    // A discussion linking a known original must not replace its author, video or curated context.
    if (existing && raw.autoCollected && (!existing.autoCollected || existing.collectorSource !== sourceId)) {
      duplicate++;
      continue;
    }
    const next = { ...raw, id: existing?.id || raw.id };
    // Missing upstream media/translation must not erase already collected evidence.
    if (existing) {
      if (!next.media?.length && existing.media?.length) next.media = existing.media;
      if (!next.links?.length && existing.links?.length) next.links = existing.links;
      if (!next.translation && existing.translation) next.translation = existing.translation;
    }
    const changed = !existing || contentHash(existing) !== contentHash(next);
    if (!existing) added++;
    else if (changed) updated++;
    else duplicate++;
    records.set(key, {
      ...next,
      collectorSource: existing?.collectorSource || sourceId,
      firstSeenAt: existing?.firstSeenAt || existing?.curatedAt || now,
      lastSeenAt: now,
      contentUpdatedAt: changed ? now : existing.contentUpdatedAt || existing.curatedAt || now,
    });
    ids.set(next.id, key);
  }
  return { records: [...records.values()], added, updated, invalid, duplicate };
}

export function sinceFor(previousSource, config) {
  const from = previousSource?.lastSuccessAt || config.initialSince;
  return new Date(Math.max(Date.parse(config.initialSince), Date.parse(from) - config.overlapHours * 3600000)).toISOString();
}

export function safeError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return '来源请求超时；保留已有记录，下次继续检查。';
  return String(error?.message || '采集失败').replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g, '[redacted]').slice(0, 400);
}
