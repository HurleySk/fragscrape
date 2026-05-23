import { z } from 'zod';

/**
 * Search query validation schema
 */
export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query cannot be empty').max(200, 'Search query too long'),
  limit: z.string().optional().transform((val) => {
    if (!val) return 20;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1 || num > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
    return num;
  }),
  cache: z.string().optional().transform((val) => val !== 'false'),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/**
 * Perfume by brand and name params validation
 */
export const perfumeParamsSchema = z.object({
  brand: z.string().min(1, 'Brand name is required').max(100, 'Brand name too long'),
  name: z.string().min(1, 'Perfume name is required').max(200, 'Perfume name too long'),
});

export type PerfumeParams = z.infer<typeof perfumeParamsSchema>;

/**
 * Perfume query params validation
 */
export const perfumeQuerySchema = z.object({
  year: z.string().optional().transform((val) => {
    if (!val) return undefined;
    const num = parseInt(val, 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(num) || num < 1800 || num > currentYear + 1) {
      throw new Error(`Year must be between 1800 and ${currentYear + 1}`);
    }
    return num;
  }),
  cache: z.string().optional().transform((val) => val !== 'false'),
});

export type PerfumeQuery = z.infer<typeof perfumeQuerySchema>;

/**
 * Perfume by URL body validation
 */
export const perfumeByUrlSchema = z.object({
  url: z.string().url('Invalid URL format').max(500, 'URL too long'),
});

export type PerfumeByUrl = z.infer<typeof perfumeByUrlSchema>;

/**
 * Perfume by URL query validation
 */
export const perfumeByUrlQuerySchema = z.object({
  cache: z.string().optional().transform((val) => val !== 'false'),
});

export type PerfumeByUrlQuery = z.infer<typeof perfumeByUrlQuerySchema>;

/**
 * Brand params validation
 */
export const brandParamsSchema = z.object({
  brand: z.string().min(1, 'Brand name is required').max(100, 'Brand name too long'),
});

export type BrandParams = z.infer<typeof brandParamsSchema>;

/**
 * Brand query params validation
 */
export const brandQuerySchema = z.object({
  page: z.string().optional().transform((val) => {
    if (!val) return 1;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1 || num > 1000) {
      throw new Error('Page must be between 1 and 1000');
    }
    return num;
  }),
});

export type BrandQuery = z.infer<typeof brandQuerySchema>;

/**
 * Rankings query params validation
 */
export const rankingsQuerySchema = z.object({
  category: z.enum(['mens', 'womens', 'unisex']),
  page: z.string().optional().transform((val) => {
    if (!val) return 1;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1 || num > 100) {
      throw new Error('Page must be between 1 and 100');
    }
    return num;
  }),
  limit: z.string().optional().transform((val) => {
    if (!val) return 20;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1 || num > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
    return num;
  }),
  production: z.enum(['in-production', 'discontinued', 'all']).optional().default('all'),
  edition: z.enum(['regular', 'limited', 'collectors', 'all']).optional().default('all'),
});

export type RankingsQuery = z.infer<typeof rankingsQuerySchema>;

