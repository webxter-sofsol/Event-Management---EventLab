export function extractApiError(
  err: unknown,
  fallback = 'An error occurred. Please try again.'
): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (!data) return fallback;
  if (typeof (data as { detail?: unknown }).detail === 'string')
    return (data as { detail: string }).detail;
  if (
    (data as { errors?: unknown }).errors &&
    typeof (data as { errors: unknown }).errors === 'object'
  ) {
    return Object.entries((data as { errors: Record<string, unknown> }).errors)
      .map(
        ([field, msgs]) =>
          `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`
      )
      .join(' | ');
  }
  if (typeof data === 'string') return data;
  return fallback;
}
