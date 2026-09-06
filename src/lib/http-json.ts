/**
 * Parse a fetch Response as JSON without throwing on empty or non-JSON bodies.
 * Product APIs should always return JSON, but empty 500s and HTML error pages still happen.
 */
export async function readResponseJson<T extends object = Record<string, unknown>>(
  res: Response,
): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}
