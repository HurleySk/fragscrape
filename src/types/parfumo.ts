export type ParfumoCategory = 'wishlist' | 'i_have' | 'tested' | 'i_had';

export interface ParfumoSession {
  id: number;
  cookies: string;
  username: string | null;
  loggedInAt: string;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParfumoRating {
  scent?: number;
  longevity?: number;
  sillage?: number;
  bottle?: number;
  value?: number;
}

export interface ParfumoSyncLogEntry {
  id: number;
  direction: 'push' | 'pull';
  perfumeId: number;
  action: string;
  category: string | null;
  status: 'success' | 'failed' | 'skipped';
  errorMessage: string | null;
  syncedAt: string;
}

export interface SyncDiff {
  push: SyncDiffGroup;
  pull: SyncDiffGroup;
}

export interface SyncDiffGroup {
  collections: SyncDiffItem[];
  ratings: SyncDiffItem[];
  reviews: SyncDiffItem[];
}

export interface SyncDiffItem {
  perfumeId: number;
  name: string;
  localTag?: string | null;
  parfumoCategory?: string | null;
  action: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  failed: number;
  skipped: number;
  errors: Array<{ perfumeId: number; error: string }>;
}

export const CATEGORY_TAG_MAP: Record<ParfumoCategory, string> = {
  wishlist: 'want to try',
  i_have: 'own',
  tested: 'tested',
  i_had: 'i had',
};

export const TAG_CATEGORY_MAP: Record<string, ParfumoCategory> = {
  'want to try': 'wishlist',
  'own': 'i_have',
  'tested': 'tested',
};
