export interface CaseMedia {
  id: string;
  type: string;
  publicUrl: string;
  durationMs: number;
  width?: number;
  height?: number;
}

export interface CaseItem {
  id: string;
  canonicalUrl: string;
  title: string;
  summary: string;
  text: string;
  translation: string;
  author: { name: string; screenName: string; verified: boolean };
  createdAt: string;
  dateKind: string;
  platform: string;
  category: string;
  media: CaseMedia[];
  links: { url: string; title: string }[];
  lang: string;
  metrics: { views: number; likes: number; bookmarks: number } | null;
  featured: number;
  verification: string;
  sourceUrl: string;
  autoCollected: boolean;
  firstSeenAt: string;
  isOpenSource: boolean;
  isLocal: boolean;
  editorial: boolean;
}

export interface PersonalRecord {
  id: string;
  canonicalUrl: string;
  title: string;
  summary: string;
  author: { name: string; screenName: string };
  category: string;
  platform: string;
  createdAt: string;
  isLocal: boolean;
}

export type Page = 'explore' | 'collections' | 'saved';

export interface CollectionSource {
  id: string;
  name: string;
  status: 'ok' | 'partial' | 'error';
  checkedAt: string;
  lastSuccessAt: string | null;
  added: number;
  updated: number;
  error: string;
}

export interface CollectionInfo {
  intervalHours: number;
  lastRunAt: string;
  lastSuccessAt: string | null;
  outcome: 'ok' | 'partial' | 'error';
  added: number;
  updated: number;
  sources: CollectionSource[];
}
