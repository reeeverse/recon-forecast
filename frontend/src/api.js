// TODO Day 5 (Person A): thin fetch wrapper, base URL from VITE_API_BASE, bearer token injection
const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'
const TOKEN = import.meta.env.VITE_DASHBOARD_TOKEN ?? ''

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}
