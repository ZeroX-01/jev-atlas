import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Bookmark, Check, ChevronDown, Code2, Download, FileText, LayoutGrid, List, Play, Plus, Search, Upload, X } from 'lucide-react';
import editorial from './data/editorial.json';
import supplemental from './data/supplemental.json';
import { canonicalKey, categories, filterCases, normalizeRecord, validateLocalRecord } from './lib/catalog.mjs';
import type { CaseItem, CollectionInfo, Page, PersonalRecord } from './types';
import { CaseCard } from './components/CaseCard';
import { AboutDialog, DetailDialog, SubmitDialog } from './components/Dialogs';
import { Collections } from './components/Collections';
import { Footer, Header, Hero } from './components/SiteChrome';
import { CollectionStatus } from './components/CollectionStatus';

const STORAGE_KEY = 'jev-atlas:v1';
const SOURCE_URL = 'https://render.qmuse.pub/p/muse/8079593307628562/index.html';
function readPersonal(): { saved: string[]; records: PersonalRecord[] } {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      saved: Array.isArray(value.saved) ? value.saved.filter((id: unknown) => typeof id === 'string') : [],
      records: Array.isArray(value.records) ? value.records.map(validateLocalRecord).filter(Boolean) : [],
    };
  } catch { return { saved: [], records: [] }; }
}

const tabs = [
  { id: 'all', label: '全部内容', Icon: LayoutGrid },
  { id: 'video', label: '视频演示', Icon: Play },
  { id: 'article', label: '图文分享', Icon: FileText },
  { id: 'code', label: '开源项目', Icon: Code2 },
];
const initialPage = (): Page => location.hash === '#saved' ? 'saved' : location.hash === '#collections' ? 'collections' : 'explore';
function readCaseId() {
  if (!location.hash.startsWith('#case/')) return '';
  try { return decodeURIComponent(location.hash.slice(6)); }
  catch { return 'unknown'; }
}

export default function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [source, setSource] = useState<CaseItem[]>([]);
  const [collectedAt, setCollectedAt] = useState('2026-09-20T00:00:00Z');
  const [collectionInfo, setCollectionInfo] = useState<CollectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [personal, setPersonal] = useState(readPersonal);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [kind, setKind] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [sort, setSort] = useState('featured');
  const [layout, setLayout] = useState('grid');
  const [limit, setLimit] = useState(12);
  const [modal, setModal] = useState<'submit' | 'about' | null>(null);
  const [caseId, setCaseId] = useState(readCaseId);
  const [toast, setToast] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const priorPage = useRef<Page>(page);

  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    let revision = '';
    setLoading(true);
    setLoadError(false);
    const refresh = async () => {
      if (controller || disposed) return;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 20000);
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/source-cases.json`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json();
        if (!Array.isArray(data.records) || data.schemaVersion !== 1) throw new Error('Invalid dataset');
        if (disposed) return;
        const nextRevision = `${data.collection?.lastRunAt || ''}:${data.collectedAt}:${data.records.length}`;
        if (nextRevision !== revision) {
          setSource(data.records.map((record: unknown) => normalizeRecord(record, editorial, data.sourceUrl)));
          setCollectedAt(data.collectedAt);
          setCollectionInfo(data.collection || null);
          revision = nextRevision;
        }
        setLoadError(false);
      } catch { if (!disposed) setLoadError(true); }
      finally {
        clearTimeout(timeout);
        controller = null;
        if (!disposed) setLoading(false);
      }
    };
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    const interval = setInterval(refreshWhenVisible, 60000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => { disposed = true; controller?.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', refreshWhenVisible); };
  }, [attempt]);

  useEffect(() => {
    const update = () => {
      if (location.hash.startsWith('#case/')) {
        setCaseId(readCaseId());
      } else { setCaseId(''); setPage(initialPage()); }
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        if (modal || caseId) return;
        if (page === 'collections') { setPage('explore'); location.hash = 'explore'; }
        requestAnimationFrame(() => { search.current?.focus(); search.current?.scrollIntoView({ block: 'center' }); });
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [modal, caseId, page]);

  useEffect(() => { setLimit(12); }, [query, category, kind, platform, sort, page]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer); } }, [toast]);

  const allCases = useMemo<CaseItem[]>(() => {
    const combined = [...source, ...supplemental.map((record) => normalizeRecord(record)), ...personal.records.map((record) => normalizeRecord(record))];
    return [...new Map(combined.map((item) => [canonicalKey(item.canonicalUrl), item])).values()];
  }, [source, personal.records]);
  const results: CaseItem[] = useMemo(() => filterCases(allCases, { query, category, kind, platform, sort, saved: page === 'saved' ? personal.saved : null }), [allCases, query, category, kind, platform, sort, page, personal.saved]);
  const selected = allCases.find((item) => item.id === caseId);
  const savedCount = allCases.filter((item) => personal.saved.includes(item.id)).length;
  const totalPublic = allCases.filter((item) => !item.isLocal).length;
  const videoCount = allCases.filter((item) => item.media.length > 0).length;
  const countByKind = { all: allCases.length, video: videoCount, article: allCases.length - videoCount, code: allCases.filter((item) => item.isOpenSource).length };

  function persist(next: typeof personal) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setPersonal(next); return true; }
    catch { setToast('浏览器存储不可用，未保存。请检查可用空间或浏览器设置。'); return false; }
  }
  function toggleSave(id: string) {
    const existing = personal.saved.includes(id);
    if (persist({ ...personal, saved: existing ? personal.saved.filter((savedId) => savedId !== id) : [...personal.saved, id] })) setToast(existing ? '已取消收藏' : '已加入我的收藏');
  }
  function add(record: PersonalRecord) {
    if (allCases.some((item) => canonicalKey(item.canonicalUrl) === canonicalKey(record.canonicalUrl))) return false;
    return persist({ records: [...personal.records, record], saved: [...new Set([...personal.saved, record.id])] });
  }
  function resetFilters() { setQuery(''); setCategory('all'); setKind('all'); setPlatform('all'); }
  function navigate(next: Page) {
    setPage(next);
    resetFilters();
    location.hash = next;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function explore() {
    library.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
  function openCase(item: CaseItem) { priorPage.current = page; location.hash = `case/${encodeURIComponent(item.id)}`; setCaseId(item.id); }
  const closeCase = useCallback(() => { setCaseId(''); history.replaceState(null, '', `#${priorPage.current}`); }, []);
  function exportData() {
    const data = { schemaVersion: 1, exportedAt: new Date().toISOString(), sourceUrl: SOURCE_URL, saved: personal.saved, records: personal.records, selection: results };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jev-atlas-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(`已导出 ${results.length} 条内容与个人收藏备份`);
  }
  async function importData(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('请导入小于 5 MB 的备份。');
      const data = JSON.parse(await file.text());
      if (data.schemaVersion !== 1 || !Array.isArray(data.records) || !Array.isArray(data.saved)) throw new Error('请选择 JEV Atlas 导出的 JSON 备份。');
      const records = new Map(personal.records.map((item) => [canonicalKey(item.canonicalUrl), item]));
      const publicUrls = new Set(allCases.filter((item) => !item.isLocal).map((item) => canonicalKey(item.canonicalUrl)));
      for (const raw of data.records) {
        const item = validateLocalRecord(raw);
        if (!item) throw new Error('备份包含无效记录，未导入任何内容。');
        if (!publicUrls.has(canonicalKey(item.canonicalUrl))) records.set(canonicalKey(item.canonicalUrl), item);
      }
      const saved = [...new Set<string>([...personal.saved, ...data.saved.filter((id: unknown) => typeof id === 'string')])];
      if (persist({ records: [...records.values()], saved })) setToast('收藏备份已合并，现有记录已保留');
    } catch (error) { setToast(error instanceof Error ? error.message : '导入失败，请检查文件格式。'); }
    finally { if (importInput.current) importInput.current.value = ''; }
  }

  return <>
    <a className="skip-link" href="#library">跳到案例库</a>
    <Header page={page} navigate={navigate} savedCount={savedCount} submit={() => setModal('submit')} about={() => setModal('about')} />
    <main className="main-container">
      {page === 'explore' && <Hero total={totalPublic} videos={videoCount} explore={explore} />}
      {page === 'collections' ? <Collections cases={allCases} select={(next) => { navigate('explore'); setCategory(next); requestAnimationFrame(explore); }} /> : <section className={`library ${page === 'saved' ? 'saved-library' : ''}`} ref={library} id="library" aria-label="案例库">
        <div className="library-heading">
          <div><div className="section-caption"><span className="tiny-cross" aria-hidden="true">+</span>{page === 'saved' ? 'YOUR PERSONAL COLLECTION' : 'THE EXPLORER'}</div><h2>{page === 'saved' ? '好想法，留在这里。' : '发现，正在发生。'}</h2><p>{page === 'saved' ? '你的收藏与个人收录，仅保存在当前浏览器。' : '从一个真实案例，走向你的下一次尝试。'}</p></div>
          <label className="search-field"><Search size={17} /><input ref={search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索案例、作者、关键词…" aria-label="搜索案例、作者、关键词" /><kbd>⌘ K</kbd></label>
        </div>
        {loadError && <div className="load-error" role="alert">最新数据暂时无法读取，已保留当前可用内容。<button onClick={() => setAttempt((value) => value + 1)}>重新加载</button></div>}
        <div className="library-tabs-row">
          <div className="library-tabs" role="tablist" aria-label="内容类型">{tabs.map(({ id, label, Icon }) => <button key={id} role="tab" aria-selected={kind === id} className={kind === id ? 'active' : ''} onClick={() => setKind(id)}><Icon size={14} />{label}<span>{countByKind[id as keyof typeof countByKind]}</span></button>)}</div>
          <div className="library-tools">
            {page === 'saved' && <button className="tool-button" onClick={() => importInput.current?.click()}><Upload size={13} />导入</button>}
            <button className="tool-button" onClick={exportData} title="导出当前筛选内容和个人收藏备份"><Download size={13} />导出</button><span className="tools-divider" />
            <button className={`icon-button layout-button ${layout === 'grid' ? 'active' : ''}`} aria-label="网格视图" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={15} /></button>
            <button className={`icon-button layout-button ${layout === 'list' ? 'active' : ''}`} aria-label="列表视图" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={17} /></button>
          </div>
        </div>
        <div className="filters"><div className="category-filters" aria-label="应用场景">{['all', ...categories].map((entry) => <button key={entry} aria-pressed={category === entry} className={category === entry ? 'active' : ''} onClick={() => setCategory(entry)}>{entry === 'all' ? '全部场景' : entry}</button>)}</div>
          <label className="select-label sort-select"><span className="sr-only">排序方式</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="排序方式"><option value="featured">精选优先</option><option value="collected">最近收录</option><option value="latest">最新发布</option><option value="popular">浏览最多</option></select><ChevronDown size={12} /></label>
        </div>
        <div className="results-meta"><p role="status" aria-live="polite">{loading ? '正在整理公开案例…' : <>找到 <strong>{results.length}</strong> 条内容{category !== 'all' && ` · ${category}`}</>}</p><div><label className="select-label"><select aria-label="内容来源" value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">所有来源</option>{[...new Set(allCases.map((item) => item.platform))].map((entry) => <option key={entry}>{entry}</option>)}</select><ChevronDown size={11} /></label>{(query || category !== 'all' || kind !== 'all' || platform !== 'all') && <button className="reset-button" onClick={resetFilters}>清除筛选<X size={12} /></button>}</div></div>
        {loading ? <div className="case-grid" aria-busy="true" aria-label="案例加载中">{[0, 1, 2].map((i) => <div className="skeleton-card" key={i}><div /><span /><span /></div>)}</div> : results.length ? <>
          <div className={`case-grid ${layout === 'list' ? 'case-list' : ''}`}>{results.slice(0, limit).map((item) => <CaseCard key={item.id} item={item} saved={personal.saved.includes(item.id)} toggleSave={toggleSave} open={() => openCase(item)} />)}</div>
          <div className="load-more">{limit < results.length ? <button className="button button-outline" onClick={() => setLimit((value) => value + 12)}>继续探索<ArrowDown size={15} /><span>{Math.min(12, results.length - limit)} 条</span></button> : <p>你已看完当前的 {results.length} 条内容。新的灵感，下一次见。</p>}<span className="mono">{Math.min(limit, results.length)} / {results.length}</span></div>
        </> : <div className="empty-state">{page === 'saved' && !personal.saved.length ? <Bookmark size={36} strokeWidth={1.2} /> : <Search size={36} strokeWidth={1.2} />}<h3>{page === 'saved' && !personal.saved.length ? '先收下你的第一个灵感。' : '还没找到这样的案例。'}</h3><p>{page === 'saved' && !personal.saved.length ? '点击案例卡片的收藏图标，或收录你发现的新项目。' : '试试更短的关键词，或者放宽场景与来源筛选。'}</p><button className="button button-dark" onClick={page === 'saved' && !personal.saved.length ? () => navigate('explore') : resetFilters}>{page === 'saved' && !personal.saved.length ? '去探索案例' : '清除所有筛选'}<ArrowUpRight size={15} /></button>{page === 'saved' && <button className="button button-quiet" onClick={() => setModal('submit')}><Plus size={14} />收录新案例</button>}</div>}
      </section>}
      <CollectionStatus info={collectionInfo} />
      <Footer about={() => setModal('about')} submit={() => setModal('submit')} collectedAt={collectedAt} />
    </main>
    <input ref={importInput} className="sr-only" type="file" accept=".json,application/json" aria-label="导入收藏备份" onChange={(event) => importData(event.target.files?.[0])} />
    {selected && <DetailDialog key={selected.id} item={selected} close={closeCase} saved={personal.saved.includes(selected.id)} toggleSave={toggleSave} />}
    {caseId && !selected && !loading && <div className="missing-case" role="alert">未找到这条案例。<button onClick={closeCase}>返回案例库</button></div>}
    {modal === 'submit' && <SubmitDialog close={() => setModal(null)} add={add} />}
    {modal === 'about' && <AboutDialog close={() => setModal(null)} total={totalPublic} collectedAt={collectedAt} />}
    {toast && <div className="toast" role="status"><Check size={15} />{toast}<button aria-label="关闭通知" onClick={() => setToast('')}><X size={14} /></button></div>}
  </>;
}
