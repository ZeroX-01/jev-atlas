import ts from 'typescript';
import { discoveryRecord, isJevRelated, plainText, safeError, sinceFor, validRecord } from './core.mjs';
import { safeUrl } from '../../src/lib/catalog.mjs';

export function extractRecords(source) {
  const tree = ts.createSourceFile('source.js', source, ts.ScriptTarget.Latest, true);
  let records;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'JSON.parse') {
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
        try {
          const value = JSON.parse(arg.text);
          if (Array.isArray(value) && value.length && value[0]?.canonicalUrl) records = value;
        } catch { /* Ignore non-catalog constants. Never evaluate downloaded scripts. */ }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return records;
}

export function createRequest(config, fetchImpl = fetch) {
  return async (url, { signal, github = false } = {}) => {
    const headers = { 'User-Agent': 'JEV-Atlas-Collector/1.1', Accept: 'application/json,text/html,text/javascript' };
    if (github) {
      headers.Accept = 'application/vnd.github+json';
      headers['X-GitHub-Api-Version'] = '2022-11-28';
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const response = await fetchImpl(url, {
      headers, redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(config.requestTimeoutMs), ...(signal ? [signal] : [])]),
    });
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const reset = response.headers.get('x-ratelimit-reset');
      const hint = retry ? `；建议 ${retry} 秒后重试` : reset && Number.isFinite(Number(reset)) ? `；配额重置于 ${new Date(Number(reset) * 1000).toISOString()}` : '';
      throw new Error(`${new URL(url).hostname} 返回 HTTP ${response.status}${hint}`);
    }
    // A malformed endpoint must not fill the collector's memory or disk indefinitely.
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 12 * 1024 * 1024) throw new Error('来源响应超过 12 MB，停止本次读取。');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const text = Buffer.concat(chunks).toString('utf8');
    return { text, json: () => JSON.parse(text) };
  };
}

function checkedQmuse(records) {
  if (!records?.length || records.some(record => !validRecord(record))) {
    throw new Error('QMuse 数据结构变更或包含无效记录；本轮保留历史数据。');
  }
  return { records, complete: true };
}

export async function collectQmuse(source, context) {
  const { request, signal, bundle } = context;
  if (bundle) return checkedQmuse(extractRecords(bundle));
  const { text: html } = await request(source.url, { signal });
  const entry = html.match(/src="(https:\/\/renderstatic\.qmuse\.pub\/[^"]+\.js)"/)?.[1];
  if (!entry) throw new Error('QMuse 页面入口发生变化；本轮保留历史数据。');
  const { text } = await request(entry, { signal });
  const direct = extractRecords(text);
  if (direct) return checkedQmuse(direct);
  const chunks = [...new Set([...text.matchAll(/import\("\.\/([^"]+\.js)"\)/g)].map(match => match[1]))];
  for (const chunk of chunks.slice(0, source.maxChunks)) {
    const url = new URL(chunk, entry);
    if (url.origin !== 'https://renderstatic.qmuse.pub') continue;
    const { text: module } = await request(url.href, { signal });
    const records = extractRecords(module);
    if (records) return checkedQmuse(records);
  }
  throw new Error('未找到可解析的 QMuse 案例数据；本轮保留历史数据。');
}

export function githubRecord(item) {
  if (item.fork || item.archived || !item.full_name || !item.html_url) return null;
  return discoveryRecord({
    id: `github-${item.id}`, url: item.html_url, title: item.full_name,
    text: `${item.description || ''}${item.topics?.length ? `\nTopics: ${item.topics.join(', ')}` : ''}`,
    author: item.owner?.login || item.full_name.split('/')[0], date: item.created_at,
    platform: 'GitHub', sourceUrl: item.html_url,
    links: [{ url: item.html_url, title: 'GitHub 仓库' }, ...(safeUrl(item.homepage) ? [{ url: item.homepage, title: '作者提供的项目主页' }] : [])],
  });
}

// Persist fixed time windows so large result sets are backfilled, not repeatedly truncated.
export async function collectGithub(source, { request, signal, previous, config, now }) {
  const state = previous?.cursor || { queuedThrough: config.initialSince, windows: [] };
  const windows = state.windows.map(window => ({ ...window }));
  const start = new Date(Math.max(Date.parse(config.initialSince), Date.parse(state.queuedThrough) - 3600000)).toISOString();
  windows.unshift({ from: start, to: now, page: 1 });
  const records = [];
  let requests = 0;
  let issue = '';
  while (windows.length && requests < source.maxRequests) {
    const window = windows[0];
    const query = `${source.query} pushed:${window.from.replace(/\.\d+Z$/, 'Z')}..${window.to.replace(/\.\d+Z$/, 'Z')}`;
    const url = 'https://api.github.com/search/repositories?' + new URLSearchParams({
      q: query, sort: 'updated', order: 'desc', per_page: String(source.perPage), page: String(window.page),
    });
    let data;
    try {
      requests++;
      data = (await request(url, { signal, github: true })).json();
      if (!Array.isArray(data.items) || !Number.isFinite(data.total_count)) throw new Error('GitHub 搜索响应结构异常。');
    } catch (error) { issue = safeError(error); break; }
    if (data.incomplete_results) { issue = 'GitHub 搜索结果不完整，时间窗口将在后续任务重新检查。'; break; }
    const span = Date.parse(window.to) - Date.parse(window.from);
    if (data.total_count > source.perPage * source.maxPages && window.page === 1 && span > 2000) {
      const midpoint = new Date(Math.floor((Date.parse(window.from) + Date.parse(window.to)) / 2000) * 1000).toISOString();
      windows.splice(0, 1, { from: midpoint, to: window.to, page: 1 }, { from: window.from, to: midpoint, page: 1 });
      continue;
    }
    records.push(...data.items.map(githubRecord).filter(Boolean));
    if (window.page * source.perPage >= data.total_count || data.items.length < source.perPage) windows.shift();
    else if (window.page >= 10) { issue = '单秒窗口超过 GitHub 的 1000 条搜索上限，需要缩小查询范围。'; break; }
    else window.page++;
  }
  return {
    records, complete: windows.length === 0 && !issue,
    issue: issue || (windows.length ? `本轮达到请求预算，剩余 ${windows.length} 个时间窗口将在后续自动补采。` : ''),
    cursor: { queuedThrough: now, windows },
    scanned: requests,
  };
}

export function devRecord(item) {
  const record = discoveryRecord({
    id: `dev-${item.id}`, url: item.url, title: item.title,
    text: `${item.description || ''}\n${(item.tag_list || []).join(' ')}`,
    author: item.user?.name || item.user?.username || 'DEV 作者',
    date: item.published_at, platform: 'DEV', sourceUrl: item.url,
    links: safeUrl(item.canonical_url) && item.canonical_url !== item.url ? [{ url: item.canonical_url, title: '作者标注的原始文章' }] : [],
  });
  if (record) record.summary = plainText(item.description).slice(0, 1800);
  return record;
}

export async function collectDev(source, { request, signal, previous, config }) {
  const since = Date.parse(sinceFor(previous, config));
  const records = new Map();
  let complete = true;
  for (const tag of source.tags) {
    let reachedEnd = false;
    for (let page = 1; page <= source.maxPages; page++) {
      const url = 'https://dev.to/api/articles?' + new URLSearchParams({ tag, per_page: String(source.perPage), page: String(page) });
      const data = (await request(url, { signal })).json();
      if (!Array.isArray(data)) throw new Error('DEV 返回了非文章列表。');
      for (const item of data) {
        if (Date.parse(item.published_at) < since) continue;
        const record = devRecord(item);
        if (record) records.set(record.id, record);
      }
      // The tag endpoint is not strictly chronological; an old page is not an end marker.
      if (data.length < source.perPage) { reachedEnd = true; break; }
    }
    if (!reachedEnd) complete = false;
  }
  return { records: [...records.values()], complete, issue: complete ? '' : 'DEV 达到分页上限；保留时间水位，后续继续检查。' };
}

export function hnRecord(item) {
  const text = plainText(item.story_text);
  // Show HN is itself an explicit project context; exact Jev still required.
  if (!isJevRelated(`${item.title} ${text} ${item.url || ''} ${/^Show HN:/i.test(item.title || '') ? 'AI project' : ''}`)) return null;
  const sourceUrl = `https://news.ycombinator.com/item?id=${item.objectID}`;
  return discoveryRecord({
    id: `hn-${item.objectID}`, url: safeUrl(item.url) || sourceUrl, title: item.title,
    text: text || 'Hacker News 社区的 JEV / AI 相关分享，详情请查看原始链接与讨论。',
    author: item.author || 'Hacker News 用户', date: item.created_at,
    platform: 'Hacker News', sourceUrl,
    links: [{ url: sourceUrl, title: 'Hacker News 原始讨论' }],
  });
}

export async function collectHackerNews(source, { request, signal, previous, config }) {
  const since = Math.floor(Date.parse(sinceFor(previous, config)) / 1000);
  const records = [];
  let complete = false;
  for (let page = 0; page < source.maxPages; page++) {
    const url = 'https://hn.algolia.com/api/v1/search_by_date?' + new URLSearchParams({
      query: source.query, tags: 'story', restrictSearchableAttributes: 'title,story_text',
      typoTolerance: 'false', hitsPerPage: String(source.perPage), page: String(page), numericFilters: `created_at_i>=${since}`,
    });
    const data = (await request(url, { signal })).json();
    if (!Array.isArray(data.hits) || !Number.isFinite(data.nbPages)) throw new Error('Hacker News 搜索响应结构异常。');
    records.push(...data.hits.map(hnRecord).filter(Boolean));
    if (page + 1 >= data.nbPages) { complete = true; break; }
  }
  return { records, complete, issue: complete ? '' : 'Hacker News 达到分页上限；保留时间水位，后续继续检查。' };
}

export const collectors = { qmuse: collectQmuse, github: collectGithub, dev: collectDev, hackernews: collectHackerNews };
