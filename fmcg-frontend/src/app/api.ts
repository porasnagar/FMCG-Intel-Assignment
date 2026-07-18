/**
 * api.ts — Centralised fetch layer for all backend endpoints.
 * In development: BASE="" so Vite's proxy routes /api/* → http://127.0.0.1:8000
 * In production: set VITE_API_URL to your deployed backend URL (e.g. https://your-backend.railway.app)
 */

const isLocal = typeof window !== 'undefined' && window.location.hostname === "localhost";
const BASE = import.meta.env.VITE_API_URL || (isLocal ? "" : "https://benori-production.up.railway.app");

async function get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const url = new URL(`${BASE}${path}`, BASE ? BASE : window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const fetchDashboardMetrics = () => get("/api/dashboard/metrics");
export const fetchMarketInsight    = () => get("/api/dashboard/insight");
export const fetchLiveFeed         = () => get("/api/dashboard/feed");

// ─── News ────────────────────────────────────────────────────────────────────
export const fetchNews = (params?: {
  search?: string; category?: string; country?: string;
  status?: string; skip?: number; limit?: number;
}) => get("/api/news", params as Record<string, string | number | boolean>);

// ─── Events ──────────────────────────────────────────────────────────────────
export const fetchEvents  = (skip = 0, limit = 20) => get("/api/events", { skip, limit });
export const fetchEvent   = (id: number) => get(`/api/events/${id}`);
export const askAIAboutEvent = (event_id: number, question: string) =>
  post("/api/ai/ask", { event_id, question });

// ─── Deals ───────────────────────────────────────────────────────────────────
export const fetchDeals = (skip = 0, limit = 20) => get("/api/deals", { skip, limit });
export const fetchDeal  = (id: number) => get(`/api/deals/${id}`);

// ─── Analytics ───────────────────────────────────────────────────────────────
export const fetchAnalytics = () => get("/api/analytics");

// ─── Companies ───────────────────────────────────────────────────────────────
export const fetchCompanies = (skip = 0, limit = 50) => get("/api/companies", { skip, limit });
export const fetchCompany   = (id: number) => get(`/api/companies/${id}`);

// ─── Newsletters ─────────────────────────────────────────────────────────────
export const fetchNewsletters    = () => get("/api/newsletters");
export const generateNewsletter  = () => post("/api/newsletters/generate", {});

// ─── Agents ──────────────────────────────────────────────────────────────────
export const fetchAgents       = () => get("/api/agents");
export const triggerAgent      = (name: string) => post(`/api/agents/${name}/trigger`, {});

// ─── AI Search ───────────────────────────────────────────────────────────────
export const aiSearch = (query: string) => post("/api/ai/search", { query });

// ─── Pipeline ─────────────────────────────────────────────────────────────────
export const triggerPipeline = () => {
  const secret = import.meta.env.VITE_PIPELINE_SECRET ?? "";
  return fetch(`${BASE}/api/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Pipeline-Secret": secret },
  }).then(r => r.json());
};

// ─── Health ──────────────────────────────────────────────────────────────────
export const fetchHealth = () => get("/api/health");
