/**
 * Recursively strips `undefined` values from Firestore payloads while preserving
 * `null`, arrays (filtering `undefined` entries), and special Firestore/JS instances
 * (`Date`, `Timestamp`, `FieldValue`, `GeoPoint`, etc., even under JS minification).
 */
export function omitUndefinedFields<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => omitUndefinedFields(item)) as unknown as T;
  }

  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    const ctorName = (value as any)?.constructor?.name || '';
    const isPlainObject = proto === Object.prototype || proto === null;

    if (
      !isPlainObject ||
      ctorName.includes('FieldValue') ||
      ctorName.includes('Timestamp') ||
      ctorName.includes('Transform') ||
      typeof (value as any)._methodName === 'string' ||
      typeof (value as any).toDate === 'function' ||
      value instanceof Date
    ) {
      return value;
    }

    const cleaned: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value as Record<string, any>)) {
      if (entry !== undefined) {
        cleaned[key] = omitUndefinedFields(entry);
      }
    }
    return cleaned as T;
  }

  return value;
}
