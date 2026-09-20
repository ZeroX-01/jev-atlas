import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, Bookmark, Check, Copy, ExternalLink, Github, Link2, Plus, X } from 'lucide-react';
import { categories, formatNumber, safeUrl, validateLocalRecord } from '../lib/catalog.mjs';
import type { CaseItem, PersonalRecord } from '../types';
import { PlatformMark } from './CaseCard';

export function Dialog({ children, close, label, wide = false }: { children: ReactNode; close: () => void; label: string; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-label={label} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === ref.current) { const box = ref.current.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } }}>
    <button className="dialog-close icon-button" aria-label="关闭弹窗" onClick={close}><X size={20} /></button>{children}
  </dialog>;
}

export function DetailDialog({ item, close, saved, toggleSave }: { item: CaseItem; close: () => void; saved: boolean; toggleSave: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [failed, setFailed] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const media = item.media[mediaIndex];
  async function copy() {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); }
    catch { setCopyError('无法自动复制，请复制地址栏中的链接。'); }
  }
  return <Dialog close={close} label={item.title} wide>
    <div className="detail-topline"><span className="category-label">{item.category}</span><span>{item.media.length ? '视频案例' : '图文与项目'}</span><span>·</span><PlatformMark platform={item.platform} /><span>{item.platform}</span></div>
    <h2 className="detail-title">{item.title}</h2>
    <div className="detail-author"><span className="author-avatar">{[...item.author.name][0]}</span><strong>{item.author.name}</strong><span>{item.author.screenName ? `@${item.author.screenName}` : ''}</span><span className="detail-date">{item.dateKind} {new Date(item.createdAt).toLocaleDateString('zh-CN')}</span></div>
    {media && <div className="detail-player">
      <video key={media.id} controls playsInline preload="metadata" src={media.publicUrl} onError={() => setFailed(true)} aria-label={`${item.title}的原始演示视频`} />
      {failed && <div className="video-error">当前媒体无法加载，请通过下方「查看原帖」观看。</div>}
    </div>}
    {item.media.length > 1 && <div className="media-switcher">{item.media.map((entry, index) => <button key={entry.id} className={index === mediaIndex ? 'selected' : ''} onClick={() => { setMediaIndex(index); setFailed(false); }}>视频 {index + 1}</button>)}</div>}
    <p className="detail-summary">{item.summary}</p>
    <div className="detail-actions">
      <a className="button button-dark" href={item.canonicalUrl} target="_blank" rel="noreferrer">查看{item.platform === 'X' ? '原帖' : '原文'}<ArrowUpRight size={16} /></a>
      <button className="button button-outline" onClick={() => toggleSave(item.id)}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'} />{saved ? '已收藏' : '收藏案例'}</button>
      <button className="button button-quiet" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制链接' : '分享'}</button>
    </div>
    {copyError && <p role="status">{copyError}</p>}
    {item.links.length > 0 && <section className="related-links"><h3>项目与相关链接</h3>{item.links.map((link) => <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>{/github/.test(link.url) ? <Github size={16} /> : <Link2 size={16} />}<span>{link.title}</span><ArrowUpRight size={15} /></a>)}</section>}
    <details className="source-text"><summary>查看原始内容 <span>{item.lang.toUpperCase()}</span></summary><p>{item.text}</p>{item.translation && <><h4>来源提供的参考译文</h4><p>{item.translation}</p><small>机器翻译可能有误，表达以原文为准。</small></>}</details>
    <div className="source-note"><span className="source-note-title">关于这条收录</span><p>{item.verification}</p>{item.metrics && <p>来源快照：{formatNumber(item.metrics.views)} 浏览 · {formatNumber(item.metrics.likes)} 喜欢 · {formatNumber(item.metrics.bookmarks)} 收藏。数据并非实时更新。</p>}<a href={safeUrl(item.sourceUrl)} target="_blank" rel="noreferrer">查看收录来源<ExternalLink size={12} /></a></div>
  </Dialog>;
}

export function SubmitDialog({ close, add }: { close: () => void; add: (item: PersonalRecord) => boolean }) {
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const record = validateLocalRecord({
      title: form.get('title'),
      canonicalUrl: form.get('url'),
      summary: form.get('summary'),
      category: form.get('category'),
      author: { name: form.get('author') || '我的收录' },
    });
    if (!record) { setError('请填写案例标题与有效的 http / https 链接。'); return; }
    if (add(record)) setDone(true);
    else setError('这个链接已经在案例库里了，可以直接搜索并收藏。');
  }
  return <Dialog close={close} label="收录一个 JEV 案例">
    {done ? <div className="submit-success"><span><Check size={30} /></span><h2>灵感，已收好。</h2><p>案例已加入「我的收藏」。记录保存在当前浏览器，可导出备份。</p><button className="button button-dark" onClick={close}>继续探索<ArrowUpRight size={16} /></button></div> : <>
      <span className="dialog-symbol"><Plus size={24} /></span><h2>发现好案例？收进来。</h2><p className="dialog-intro">保存一个公开链接，为下次动手留个起点。</p>
      <form className="submit-form" onSubmit={submit}>
        <label>案例链接 <span>*</span><input name="url" type="url" required maxLength={2000} placeholder="https://x.com/… 或项目链接" /></label>
        <label>案例标题 <span>*</span><input name="title" required maxLength={160} placeholder="用一句话说说，它做了什么？" /></label>
        <div className="form-row"><label>应用场景<select name="category">{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>作者<input name="author" maxLength={80} placeholder="作者或团队名称" /></label></div>
        <label>简短介绍<textarea name="summary" rows={3} maxLength={2000} placeholder="它解决了什么问题？有什么值得关注的细节？" /></label>
        <p className="local-notice">此版本保存到当前浏览器的个人收藏，不会公开发布。支持导出备份。</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-dark submit-button" type="submit">保存案例<Plus size={16} /></button>
      </form>
    </>}
  </Dialog>;
}

export function AboutDialog({ close, total, collectedAt }: { close: () => void; total: number; collectedAt: string }) {
  return <Dialog close={close} label="关于 JEV Atlas">
    <span className="dialog-symbol mono">j.</span><h2>把分散的探索，连在一起。</h2>
    <p className="dialog-intro">JEV Atlas 是一个非官方的社区案例索引，围绕 TypeSafe 的 JEV 决策模型，整理视频、图文与开源实践。</p>
    <div className="about-content"><h3>JEV 是什么？</h3><p>JEV 是 TypeSafe 推出的 System One 模型。它接收上下文与预定义的问题，返回结构化决策和置信度，由应用代码执行后续动作。</p>
      <h3>收录了哪些内容？</h3><p>当前包含 {total} 条公开内容：用户指定的 QMuse / X 案例索引、补充整理的项目和官方资料，以及从 GitHub、DEV、Hacker News 自动发现的相关链接。实际案例、项目说明与相关讨论分别标注。</p>
      <h3>来源与更新</h3><p>最近获取到来源内容的时间为 {new Date(collectedAt).toLocaleString('zh-CN')}。保留原帖、作者和可用视频地址。索引中的演示与性能指标没有逐一复现；指标属于收录时的快照。精选条目人工整理了中文摘要。</p>
      <p>GitHub Actions 按 6 小时周期检查已接入来源并发布，新增链接标为「自动收录 · 待核验」，不会自动进入精选。部分来源受分页、配额和访问条件限制，收录不代表覆盖全网。具体检查结果可在页面底部「来源更新」查看。</p>
      <p>个人新增记录与收藏仍只保存在当前浏览器。</p>
      <h3>尊重每一位创作者</h3><p>内容与演示归原作者所有。本站提供发现与溯源入口，完整上下文请阅读原帖。来源不可访问时，保留原文入口。</p>
    </div>
    <div className="about-links"><a className="button button-dark" href="https://typesafe.ai/" target="_blank" rel="noreferrer">TypeSafe 官网<ArrowUpRight size={15} /></a><a className="button button-outline" href="https://docs.typesafe.ai/" target="_blank" rel="noreferrer">开发文档<ArrowUpRight size={15} /></a></div>
  </Dialog>;
}
