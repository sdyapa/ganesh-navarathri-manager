export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID (very old browsers).
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
