import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Bookmark, Check, FileText, Github, Play } from 'lucide-react';
import { formatDuration, formatNumber } from '../lib/catalog.mjs';
import type { CaseItem } from '../types';

export function PlatformMark({ platform }: { platform: string }) {
  if (platform === 'X') return <span className="x-mark" aria-label="X">𝕏</span>;
  if (platform === 'GitHub') return <Github size={13} aria-hidden="true" />;
  return <span className="platform-abbr">{platform === 'Callstack' ? 'cs' : platform === 'DEV' ? 'dev' : platform === 'TypeSafe' ? 'ts' : platform === 'Hacker News' ? 'HN' : '+'}</span>;
}

function VideoPreview({ item, open }: { item: CaseItem; open: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const container = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const media = item.media[0];
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '120px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <button ref={container} className={`case-media ${ready ? 'media-ready' : ''}`} onClick={open} aria-label={`观看：${item.title}`}>
    {visible && <video
      ref={video}
      src={`${media.publicUrl}#t=0.1`}
      muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true"
      onLoadedData={() => setReady(true)}
      onError={() => setFailed(true)}
    />}
    {!ready && <div className="media-loading"><Play size={28} strokeWidth={1} /><span>{failed ? '打开详情查看原帖' : '正在载入演示'}</span></div>}
    <span className="media-top"><span className="media-kind"><Play size={10} fill="currentColor" />视频演示</span>{item.featured <= 6 && <span className="featured-label">精选</span>}</span>
    <span className="media-bottom"><span className="play-circle"><Play size={12} fill="currentColor" /></span><span>{formatDuration(media.durationMs)}</span><ArrowUpRight size={16} /></span>
  </button>;
}

function ArticlePreview({ item, open }: { item: CaseItem; open: () => void }) {
  return <button className={`case-media article-preview article-${item.platform.toLowerCase()}`} onClick={open} aria-label={`阅读：${item.title}`}>
    <span className="article-source"><PlatformMark platform={item.platform} />{item.platform}<ArrowUpRight size={15} /></span>
    <span className="article-headline">{item.title}</span>
    <span className="article-bottom">{item.isOpenSource ? <Github size={14} /> : <FileText size={14} />}{item.isOpenSource ? '开源项目 · 源码与说明' : '图文分享 · 阅读原文'}<span>↗</span></span>
  </button>;
}

export function CaseCard({ item, saved, toggleSave, open }: {
  item: CaseItem;
  saved: boolean;
  toggleSave: (id: string) => void;
  open: () => void;
}) {
  return <article className="case-card">
    {item.media.length ? <VideoPreview item={item} open={open} /> : <ArticlePreview item={item} open={open} />}
    <div className="case-body">
      <div className="case-byline"><span className={`author-avatar tone-${item.author.name.length % 5}`} aria-hidden="true">{[...item.author.name][0]}</span><span className="author-name">{item.author.name}</span>{item.author.verified && <Check size={11} className="author-verified" aria-label="来源标记认证作者" />}<span className="byline-separator">·</span><PlatformMark platform={item.platform} /><span className="byline-date">{new Date(item.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span></div>
      <h3><button onClick={open}>{item.title}</button></h3>
      <p className="case-summary">{item.summary}</p>
      <div className="case-footer">
        <span className="category-label">{item.category}</span>
        {item.isOpenSource && <span className="code-label"><Github size={11} />开源</span>}
        <span className="view-count" title={item.autoCollected ? '公开接口自动发现，尚未人工核验' : '来源收录时的浏览量'}>{item.autoCollected ? '自动收录 · 待核验' : item.metrics ? `${formatNumber(item.metrics.views)} 浏览` : item.isLocal ? '个人收录' : '图文'}</span>
        <button className={`save-button icon-button ${saved ? 'is-saved' : ''}`} aria-label={`${saved ? '取消收藏' : '收藏'}：${item.title}`} aria-pressed={saved} onClick={() => toggleSave(item.id)}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /></button>
      </div>
    </div>
  </article>;
}
