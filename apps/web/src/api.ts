/** API base for a split frontend/API deploy. Empty means same origin (Vite proxy or Fastify static). */
export const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${p}`
}
