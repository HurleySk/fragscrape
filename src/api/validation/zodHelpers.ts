import { z } from 'zod';

export function positiveIntParam(label: string, opts?: { min?: number; max?: number; default?: number }) {
  const min = opts?.min ?? 1;

  if (opts?.default !== undefined) {
    const defaultVal = opts.default;
    return z.string().optional().transform((val) => {
      if (!val) return defaultVal;
      const num = parseInt(val, 10);
      if (isNaN(num) || num < min || (opts?.max && num > opts.max)) {
        throw new Error(`${label} must be between ${min} and ${opts?.max ?? '∞'}`);
      }
      return num;
    });
  }

  return z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < min || (opts?.max && num > opts.max)) {
      throw new Error(`Invalid ${label}`);
    }
    return num;
  });
}
