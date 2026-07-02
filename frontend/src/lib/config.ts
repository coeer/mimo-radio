/**
 * API base URL.
 * In production, use relative path so requests go through Next.js rewrites
 * (which proxy to the backend), avoiding CORS and API key exposure.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ''

/**
 * API Key — only used when directly connecting to backend (development).
 * In production with rewrites, this should be empty.
 */
export const API_KEY = process.env.NEXT_PUBLIC_API_KEY || ''

/**
 * Default headers for all API requests.
 * Includes X-API-Key when configured.
 */
export function getApiHeaders(contentType = true): Record<string, string> {
  const headers: Record<string, string> = {}
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY
  }
  if (contentType) {
    headers['Content-Type'] = 'application/json'
  }
  return headers
}
