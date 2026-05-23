import { z } from 'zod';
import { positiveIntParam } from './zodHelpers';

export const createQuerySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').max(200, 'Query too long'),
  name: z.string().min(1).max(100).optional(),
});

export const updateQuerySchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100, 'Name too long'),
});

export const queryIdParamsSchema = z.object({
  id: positiveIntParam('query ID'),
});

export const queryItemParamsSchema = z.object({
  id: positiveIntParam('query ID'),
  itemId: positiveIntParam('item ID'),
});

export const updateQueryItemSchema = z.object({
  reviewed: z.boolean().optional(),
  skipped: z.boolean().optional(),
});

export const perfumeIdParamsSchema = z.object({
  id: positiveIntParam('perfume ID'),
});

export const addTagSchema = z.object({
  tag: z.string().min(1, 'Tag cannot be empty').max(50, 'Tag too long').transform(val => val.trim().toLowerCase()),
});

export const tagParamsSchema = z.object({
  id: positiveIntParam('perfume ID'),
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
