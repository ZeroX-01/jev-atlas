import { ArrowUpRight, Code2, Gamepad2, Monitor, Workflow } from 'lucide-react';
import type { CaseItem } from '../types';

const topics = [
  { category: '电脑操作', title: '把电脑，交给一句话。', subtitle: '浏览器、桌面与语音控制', description: '从点击到完整任务，探索 JEV 如何成为电脑操作的决策层。', Icon: Monitor, className: 'topic-computer' },
  { category: '游戏智能体', title: '下一步，它会怎么走？', subtitle: '实时决策与游戏智能体', description: '俄罗斯方块、贪吃蛇与开放世界。在游戏中观察模型的每一次选择。', Icon: Gamepad2, className: 'topic-game' },
  { category: '工作流', title: '给重复的工作，一个新答案。', subtitle: '文档、信息流与自动化', description: '从字段映射到文档分类，找到可以接入日常工作的实践。', Icon: Workflow, className: 'topic-workflow' },
  { category: '开发工具', title: '小小的判断，大大的可能。', subtitle: '路由、测试与开发工具', description: '让快速决策嵌入软件，看看开发者如何组合出新的能力。', Icon: Code2, className: 'topic-dev' },
];

export function Collections({ cases, select }: { cases: CaseItem[]; select: (category: string) => void }) {
  return <section className="collections-view">
    <div className="page-heading"><span className="mono">THE COLLECTIONS</span><h1>换个角度，发现灵感。</h1><p>把相似的探索放在一起，找到值得深入的方向。</p></div>
    <div className="topic-grid">{topics.map(({ Icon, ...topic }) => <button key={topic.category} className={`topic ${topic.className}`} onClick={() => select(topic.category)}>
      <div className="topic-top"><Icon size={27} strokeWidth={1.3} /><span>{cases.filter((item) => item.category === topic.category).length} 条内容</span></div>
      <span className="topic-subtitle">{topic.subtitle}</span><h2>{topic.title}</h2><p>{topic.description}</p><span className="topic-link">探索专题<ArrowUpRight size={18} /></span>
    </button>)}</div>
  </section>;
}
