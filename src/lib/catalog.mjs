export const categories = ['电脑操作', '游戏智能体', '数据分析', '工作流', '开发工具', '创意交互', '资料与讨论'];

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function canonicalKey(value) {
  const safe = safeUrl(value);
  if (!safe) return '';
  const url = new URL(safe);
  url.hostname = url.hostname.replace(/^www\./, '').replace(/^twitter\.com$/, 'x.com');
  if (['github.com', 'gist.github.com', 'x.com'].includes(url.hostname)) {
    url.protocol = 'https:';
    url.pathname = url.pathname.toLowerCase();
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || ['s', 't', 'ref'].includes(key)) url.searchParams.delete(key);
  }
  return url.href.replace(/\/$/, '');
}

export function inferCategory(text) {
  if (/OpenJev|speaker announcement|gemma 4|co-invented|introducing system one/i.test(text)) return '资料与讨论';
  const rules = [
    ['游戏智能体', /tetris|snake|doom|chess|minecraft|subway surfers|flappy|gameplay|balatro|贪吃蛇|俄罗斯方块|游戏|下棋/i],
    ['电脑操作', /computer.?use|browser|voice.*control|control.*voice|macos|macbook|浏览器|操作电脑|电脑操作/i],
    ['创意交互', /figma|robot|mujoco|music|音乐|机器人|fight scene/i],
    ['数据分析', /spreadsheet|classif|scoring|rank|research|knowledge graph|label|数据|分类|图谱|广告|新闻/i],
    ['开发工具', /routing|router|debug|guardrail|api|sdk|e2e|tool.call|test|路由|测试|代码|skill/i],
    ['工作流', /workflow|agent|automat|document|slack|email|trading|trade|工作流|自动|文档|邮件|交易/i],
  ];
  return rules.find(([, regex]) => regex.test(text))?.[0] || '资料与讨论';
}

const tidy = (text) => String(text || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();

export function normalizeRecord(raw, editorial = {}, sourceUrl = '') {
  const edit = editorial[raw.id];
  const translated = raw.translation?.text;
  const summary = raw.summary || edit?.[1] || tidy(translated || raw.text);
  const originalLine = tidy((translated || raw.text || '').split('\n')[0]);
  const title = raw.title || edit?.[0] || originalLine || `${raw.author?.name || '社区作者'} 的 JEV 分享`;
  const media = (raw.media || []).filter((item) => item.type === 'video' && safeUrl(item.publicUrl));
  const links = [...new Map((raw.links || []).filter((item) => safeUrl(item.url)).map((item) => [
    canonicalKey(item.url), { url: safeUrl(item.url), title: item.title || item.displayUrl || new URL(item.url).hostname },
  ])).values()];
  const platform = raw.platform || 'X';
  return {
    id: String(raw.id),
    canonicalUrl: safeUrl(raw.canonicalUrl),
    title,
    summary,
    text: String(raw.text || ''),
    translation: translated || '',
    author: { name: raw.author?.name || '社区作者', screenName: raw.author?.screenName || '', verified: Boolean(raw.author?.verified) },
    createdAt: raw.createdAt,
    dateKind: raw.dateKind || '发布日期',
    platform,
    category: raw.category || edit?.[2] || inferCategory(raw.text || ''),
    media,
    links,
    lang: raw.lang || 'und',
    metrics: raw.metrics || null,
    featured: raw.featured || edit?.[3] || 1000,
    verification: raw.verification || '来自 QMuse 公开索引；原帖与演示未逐一复核，播放与互动数据为来源快照。',
    sourceUrl: safeUrl(raw.sourceUrl) || (raw.platform ? raw.canonicalUrl : sourceUrl),
    autoCollected: Boolean(raw.autoCollected),
    firstSeenAt: raw.firstSeenAt || raw.curatedAt || raw.createdAt,
    isOpenSource: links.some((link) => /github\.com|gitlab\.com|codeberg\.org/.test(new URL(link.url).hostname)),
    isLocal: Boolean(raw.isLocal),
    editorial: Boolean(edit || raw.summary),
  };
}

export function filterCases(items, options) {
  const { query = '', category = 'all', kind = 'all', platform = 'all', sort = 'featured', saved = null } = options;
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (saved && !saved.includes(item.id)) return false;
    if (category !== 'all' && item.category !== category) return false;
    if (platform !== 'all' && item.platform !== platform) return false;
    if (kind === 'video' && !item.media.length) return false;
    if (kind === 'article' && item.media.length) return false;
    if (kind === 'code' && !item.isOpenSource) return false;
    const haystack = `${item.title} ${item.summary} ${item.text} ${item.author.name} ${item.author.screenName} ${item.category}`.toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  }).sort((a, b) => {
    if (sort === 'collected') return Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (sort === 'latest') return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (sort === 'popular') return (b.metrics?.views || 0) - (a.metrics?.views || 0);
    return a.featured - b.featured || Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

export function validateLocalRecord(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string' || !raw.title.trim()) return null;
  const url = safeUrl(raw.canonicalUrl);
  if (!url) return null;
  // Imported records are always personal notes, never silently promoted to verified sources.
  return {
    id: `local-${canonicalKey(url)}`,
    canonicalUrl: url,
    title: raw.title.trim().slice(0, 160),
    summary: String(raw.summary || '').slice(0, 2000),
    text: String(raw.summary || '').slice(0, 2000),
    author: { name: String(raw.author?.name || '我的收录').slice(0, 80), screenName: '' },
    category: categories.includes(raw.category) ? raw.category : '资料与讨论',
    platform: '个人收录',
    createdAt: Number.isFinite(Date.parse(raw.createdAt)) ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    dateKind: '收录日期',
    lang: 'zh',
    media: [],
    links: /github\.com|gitlab\.com/.test(new URL(url).hostname) ? [{ url, title: '项目源码' }] : [],
    isLocal: true,
    verification: '个人保存的线索，尚未核验。仅保存在当前浏览器。',
  };
}

export function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatDuration(ms) {
  const seconds = Math.floor((ms || 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
