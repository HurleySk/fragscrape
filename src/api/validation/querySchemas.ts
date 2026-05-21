import { z } from 'zod';

export const createQuerySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').max(200, 'Query too long'),
  name: z.string().min(1).max(100).optional(),
});

export const updateQuerySchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100, 'Name too long'),
});

export const queryIdParamsSchema = z.object({
  id: z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) throw new Error('Invalid query ID');
    return num;
  }),
});

export const queryItemParamsSchema = z.object({
  id: z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) throw new Error('Invalid query ID');
    return num;
  }),
  itemId: z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) throw new Error('Invalid item ID');
    return num;
  }),
});

export const updateQueryItemSchema = z.object({
  reviewed: z.boolean().optional(),
  skipped: z.boolean().optional(),
});

export const perfumeIdParamsSchema = z.object({
  id: z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) throw new Error('Invalid perfume ID');
    return num;
  }),
});

export const addTagSchema = z.object({
  tag: z.string().min(1, 'Tag cannot be empty').max(50, 'Tag too long').transform(val => val.trim().toLowerCase()),
});

export const tagParamsSchema = z.object({
  id: z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) throw new Error('Invalid perfume ID');
    return num;
  }),
  tag: z.string().min(1).max(50),
});

export const userDataSchema = z.object({
  notes: z.string().min(1).max(5000).optional(),
  interest: z.number().int().min(1).max(5).optional(),
}).refine(data => data.notes !== undefined || data.interest !== undefined, {
  message: 'At least one of notes or interest must be provided',
});

export const collectionQuerySchema = z.object({
  tag: z.string().min(1, 'Tag is required').max(50),
});
