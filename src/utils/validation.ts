/**
 * Generic validation utilities
 */

/**
 * Validates that a value is one of the allowed enum values
 * @param value The value to validate
 * @param allowedValues Array of allowed values
 * @param defaultValue Optional default value if validation fails
 * @returns The validated value or undefined/default
 */
export function validateEnum<T extends string>(
  value: string | null | undefined,
  allowedValues: readonly T[],
  defaultValue?: T
): T | undefined {
  if (!value) return defaultValue;

  if (allowedValues.includes(value as T)) {
    return value as T;
  }

  return defaultValue;
}

/**
 * Type guard to check if a value is a valid enum member
 */
export function isValidEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): value is T {
  return typeof value === 'string' && allowedValues.includes(value as T);
}

/**
 * Validates gender type
 */
export function validateGender(
  gender: string | null | undefined
): 'male' | 'female' | 'unisex' | undefined {
  return validateEnum(gender, ['male', 'female', 'unisex'] as const);
}

/**
 * Validates sub-user status
 */
export function validateSubUserStatus(
  status: string | null | undefined
): 'active' | 'exhausted' | 'error' {
  const result = validateEnum(status, ['active', 'exhausted', 'error'] as const, 'error');
  return result || 'error';
}

/**
 * Parses a number from a string, returns undefined if invalid
 */
export function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}

/**
 * Parses an integer from a string, returns undefined if invalid
 */
export function parseInt(value: unknown): number | undefined {
  if (typeof value === 'number') return Math.floor(value);
  if (typeof value === 'string') {
    const num = Number.parseInt(value, 10);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}

/**
 * Validates that a value is a non-empty string
 */
export function validateNonEmptyString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

/**
 * Validates that a value is a boolean
 */
export function validateBoolean(value: unknown, defaultValue: boolean = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return defaultValue;
}
