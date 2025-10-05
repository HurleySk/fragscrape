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
  rating?: number;
  totalRatings?: number;
  longevity?: number;
  sillage?: number;
  priceValue?: number;
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