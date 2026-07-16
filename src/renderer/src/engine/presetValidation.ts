/** Validates the common { id, name } envelope shared by all preset/palette records. */
export function parseNamedRecordBase(
  raw: unknown
): { p: Record<string, unknown>; id: string; name: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.id !== 'string' || !p.id) return null
  if (typeof p.name !== 'string' || !p.name) return null
  return { p, id: p.id, name: p.name }
}
