const BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

export async function apiFetch(path, options = {}) {
  const { raw, ...fetchOpts } = options;
  const token = localStorage.getItem("token");

  const headers = {};
  if (!(fetchOpts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  Object.assign(headers, fetchOpts.headers);

  const res = await fetch(`${BASE}${path}`, { ...fetchOpts, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    throw new Error(detail);
  }

  if (res.status === 204) return null;
  return res.json();
}
