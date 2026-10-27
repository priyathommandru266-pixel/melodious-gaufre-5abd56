/**
 * Public, build-time configuration. Only non-secret values belong here —
 * every VITE_ variable is embedded in the browser bundle.
 * Never put AWS access keys, secret keys or session tokens in VITE_ variables.
 */

function readApiBaseUrl(): string {
  const raw = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (!raw) return ''
  const isHttps = raw.startsWith('https://')
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(raw)
  if (!isHttps && !isLocal) {
    console.warn('VITE_API_BASE_URL must use https:// — backend treated as not configured.')
    return ''
  }
  return raw.replace(/\/+$/, '')
}

export const API_BASE_URL = readApiBaseUrl()
export const isBackendConfigured = API_BASE_URL.length > 0

const maxMb = Number(import.meta.env.VITE_MAX_UPLOAD_MB)
/**
 * Client-side upload limit. This is a usability check only — the backend
 * enforces its own limit (MAX_UPLOAD_BYTES) in the presigned S3 POST policy.
 * The effective limit is the smaller of the two.
 */
export const CLIENT_MAX_UPLOAD_BYTES =
  (Number.isFinite(maxMb) && maxMb > 0 ? maxMb : 10) * 1024 * 1024

export const POLL_INTERVAL_MS = 1500
export const POLL_TIMEOUT_MS = 120_000
