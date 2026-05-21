export interface ProxyConfig {
  endpoint: string;
  port: number;
  username: string;
  password: string;
}

export interface Perfume {
  id?: string;
  brand: string;
  name: string;
  year?: number;
  url: string;
  imageUrl?: string;
  concentration?: string;
  gender?: 'male' | 'female' | 'unisex';
  description?: string;
  notes?: {
    top: string[];
    heart: string[];
    base: string[];
  };
  accords?: string[];
  rating?: number; // Overall scent rating (main rating on Parfumo)
  totalRatings?: number; // Total number of ratings for scent
  longevity?: number; // Longevity rating dimension
  longevityRatingCount?: number; // Number of votes for longevity
  sillage?: number; // Sillage rating dimension
  sillageRatingCount?: number; // Number of votes for sillage
  bottleRating?: number; // Bottle design rating dimension
  bottleRatingCount?: number; // Number of votes for bottle
  priceValue?: number; // Value for money rating dimension
  priceValueRatingCount?: number; // Number of votes for price-value
  reviewCount?: number; // Number of in-depth reviews
  statementCount?: number; // Number of user statements
  photoCount?: number; // Number of community photos
  rank?: number; // Ranking position (e.g., 26)
  rankCategory?: string; // Category ranked in (e.g., "Men's Perfume")
  perfumer?: string; // Perfumer name(s)
  similarFragrances?: string[];
  scrapedAt: Date;
}

export interface SearchResult {
  brand: string;
  name: string;
  year?: number;
  url: string;
  imageUrl?: string;
  rating?: number;
}

export interface ScraperOptions {
  useProxy: boolean;
  cacheResults: boolean;
  cacheDuration?: number; // in seconds
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export * from './queries';
export * from './parfumo';