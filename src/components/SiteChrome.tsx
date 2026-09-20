import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, Plus } from 'lucide-react';
import { PixelField } from './PixelField';
import type { Page } from '../types';

export function Logo() {
  return <span className="logo"><span className="logo-pixels" aria-hidden="true">{[1, 1, 1, 0, 1, 1, 1, 1, 0].map((on, i) => <i key={i} className={on ? 'on' : ''} />)}</span><strong>jev</strong><span className="logo-divider">/</span><span>atlas</span></span>;
}

export function Header({ page, navigate, savedCount, submit, about }: { page: Page; navigate: (page: Page) => void; savedCount: number; submit: () => void; about: () => void }) {
  return <header className="site-header"><div className="header-inner">
    <a href="#explore" className="brand-link" aria-label="JEV Atlas 首页" onClick={(event) => { event.preventDefault(); navigate('explore'); window.scrollTo({ top: 0 }); }}><Logo /></a>
    <nav className="main-nav" aria-label="主导航">
      <button onClick={() => navigate('explore')} className={page === 'explore' ? 'active' : ''} aria-current={page === 'explore' ? 'page' : undefined}>探索案例</button>
      <button onClick={() => navigate('collections')} className={page === 'collections' ? 'active' : ''} aria-current={page === 'collections' ? 'page' : undefined}>精选专题</button>
      <button onClick={() => navigate('saved')} className={page === 'saved' ? 'active' : ''} aria-current={page === 'saved' ? 'page' : undefined}><Bookmark size={13} />我的收藏{savedCount > 0 && <span className="nav-count">{savedCount}</span>}</button>
    </nav>
    <div className="header-actions"><button className="about-button" onClick={about}>关于 JEV<ArrowUpRight size={13} /></button><button className="button button-outline add-case" onClick={submit}><Plus size={15} />收录案例</button></div>
  </div></header>;
}

export function Hero({ total, videos, explore }: { total: number; videos: number; explore: () => void }) {
  return <section className="hero" aria-labelledby="hero-title">
    <div className="hero-main">
      <div className="hero-copy">
        <div className="hero-intro"><span className="status-dot" />A COMMUNITY FIELD GUIDE<span className="hero-edition">VOL. 001</span></div>
        <h1 id="hero-title">让灵感，<br />进入执行<span className="heading-period">。</span></h1>
        <p className="hero-subtitle">看看大家，正在用 JEV 做什么。</p>
        <p className="hero-description">汇集全球开发者的真实探索。视频演示、图文分享与开源项目，为你的下一个想法找到起点。</p>
        <div className="hero-actions"><button className="button button-dark" onClick={explore}>探索案例<ArrowDown size={15} /></button><a className="button button-quiet" href="https://typesafe.ai/" target="_blank" rel="noreferrer">认识 JEV<ArrowUpRight size={14} /></a></div>
      </div>
      <div className="hero-visual"><span className="art-corner top-left" /><span className="art-corner top-right" /><PixelField /><div className="art-caption"><span>CONTEXT IN.</span><span>DECISIONS OUT.</span></div><span className="art-corner bottom-left" /><span className="art-corner bottom-right" /></div>
    </div>
    <div className="hero-meta"><div><span className="status-dot" /><span><strong>{total || '—'}</strong> 条公开收录</span><span className="meta-divider" /><span><strong>{videos || '—'}</strong> 个视频演示</span><span className="meta-divider" /><span className="meta-source">保留原始出处<ArrowUpRight size={12} /></span></div><span className="mono hero-meta-right">BUILT WITH JEV. COLLECTED FOR YOU.</span></div>
  </section>;
}

export function Footer({ about, submit, collectedAt }: { about: () => void; submit: () => void; collectedAt: string }) {
  return <footer className="site-footer">
    <div className="footer-invite"><div><span className="invite-icon" aria-hidden="true">↗</span><div><h3>你的下一个想法，值得被看见。</h3><p>发现了有趣的 JEV 项目？把它加入你的灵感收藏。</p></div></div><button className="button button-dark" onClick={submit}>收录一个案例<Plus size={15} /></button></div>
    <div className="footer-bottom"><Logo /><span className="footer-disclaimer">非官方社区索引 · 内容归原作者所有</span><div><span className="mono">{collectedAt ? new Date(collectedAt).toISOString().slice(0, 10) : '2026'}</span><button onClick={about}>关于与来源<ArrowRight size={12} /></button><a href="https://typesafe.ai/" target="_blank" rel="noreferrer">TypeSafe<ArrowUpRight size={12} /></a></div></div>
  </footer>;
}
