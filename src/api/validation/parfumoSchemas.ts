import { z } from 'zod';

export const parfumoCategorySchema = z.enum(['wishlist', 'i_have', 'tested', 'i_had']);

export const collectionActionSchema = z.object({
  perfumeId: z.number().int().positive(),
  category: parfumoCategorySchema,
});

export const ratingSchema = z.object({
  perfumeId: z.number().int().positive(),
  scent: z.number().min(0).max(10).multipleOf(0.5).optional(),
  longevity: z.number().min(0).max(10).multipleOf(0.5).optional(),
  sillage: z.number().min(0).max(10).multipleOf(0.5).optional(),
  bottle: z.number().min(0).max(10).multipleOf(0.5).optional(),
  value: z.number().min(0).max(10).multipleOf(0.5).optional(),
}).refine(data => {
  return data.scent !== undefined || data.longevity !== undefined ||
         data.sillage !== undefined || data.bottle !== undefined || data.value !== undefined;
}, { message: 'At least one rating dimension must be provided' });

export const reviewSchema = z.object({
  perfumeId: z.number().int().positive(),
  text: z.string().min(1, 'Review text cannot be empty').max(10000, 'Review too long'),
});

export const syncScopeSchema = z.object({
  scope: z.enum(['collections', 'ratings', 'reviews', 'all']).default('all'),
});

export const perfumeIdParamSchema = z.object({
  perfumeId: z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) throw new Error('Invalid perfume ID');
    return num;
  }),
});
