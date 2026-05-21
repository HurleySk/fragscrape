export interface SavedQuery {
  id: number;
  name: string | null;
  query: string;
  createdAt: string;
  updatedAt: string;
  lastRefreshedAt: string | null;
}

export interface SavedQueryWithStats extends SavedQuery {
  totalItems: number;
  reviewedCount: number;
  skippedCount: number;
  unreviewedCount: number;
}

export interface QueryItem {
  id: number;
  queryId: number;
  perfumeId: number;
  position: number;
  reviewed: boolean;
  skipped: boolean;
  addedAt: string;
}

export interface QueryItemWithPerfume extends QueryItem {
  perfume: import('./index').Perfume;
  tags: string[];
  userData: PerfumeUserData | null;
}

export interface PerfumeTag {
  id: number;
  perfumeId: number;
  tag: string;
  createdAt: string;
}

export interface PerfumeUserData {
  id: number;
  perfumeId: number;
  notes: string | null;
  interest: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TagCount {
  tag: string;
  count: number;
}
