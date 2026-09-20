import type { CollectionInfo } from '../types';

const time = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const statuses = { ok: '检查完成', partial: '部分完成', error: '检查失败' };

export function CollectionStatus({ info }: { info: CollectionInfo | null }) {
  if (!info) return null;
  const overdue = Date.now() - Date.parse(info.lastRunAt) > info.intervalHours * 2 * 3600000;
  return <details className="collection-status">
    <summary><span>来源更新</span><span>上次检查 {time(info.lastRunAt)}</span><span>{overdue ? '较长时间未检查' : statuses[info.outcome]} · 新增 {info.added} 条</span></summary>
    <div className="collection-status-content">
      <p>公开站由 GitHub Actions 每 {info.intervalHours} 小时检查来源并重新发布；本页每分钟检查已发布数据的更新。</p>
      <ul>{info.sources.map(source => <li key={source.id}>
        <div><strong>{source.name}</strong><span>{statuses[source.status]} · 新增 {source.added} · 更新 {source.updated}</span></div>
        <p>{source.lastSuccessAt ? `最近完整检查：${time(source.lastSuccessAt)}` : '尚无完整检查记录'}{source.error ? `。${source.error}` : ''}</p>
      </li>)}</ul>
      <p>自动发现的链接标注为「待核验」，不会自动成为精选案例。X 内容通过公开案例索引跟踪，其他未接入的平台暂不自动抓取。</p>
    </div>
  </details>;
}
