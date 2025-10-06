export interface DecodoCredentials {
  apiKey?: string;
  username?: string;
  password?: string;
}

export interface DecodoSubUser {
  id: string;
  username: string;
  password: string;
  status: 'active' | 'exhausted' | 'error';
  trafficLimit: number; // in bytes
  trafficUsed: number; // in bytes
  serviceType: string;
  createdAt: Date;
  lastChecked: Date;
}

export interface DecodoAuthResponse {
  userId: string;
  token: string;
}

export interface DecodoSubUserResponse {
  id: string | number;
  username: string;
  status: string;
  created_at: string;
  traffic_limit: number;
  traffic_limit_bytes?: number; // v2 API field
  traffic_bytes?: number; // v2 API field (traffic used)
  service_type: string;
}

export interface DecodoTrafficResponse {
  traffic_used: number;
  traffic_limit: number;
}

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