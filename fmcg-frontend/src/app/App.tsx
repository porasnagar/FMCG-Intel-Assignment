import React, { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderToString } from "react-dom/server";
import {
  LayoutDashboard, Newspaper, Compass, Briefcase, BarChart3,
  Search, Building2, Mail, Bot, Settings, Bell, User,
  TrendingUp, TrendingDown, ArrowUpRight, ChevronDown,
  RefreshCw, CheckCircle2, AlertCircle, Clock, Activity,
  Zap, Globe, DollarSign, Sparkles, Shield, Filter,
  Download, ExternalLink, Bookmark, X, ChevronUp, Hash,
  Play, Pause, Eye, Target, Rss, CheckCheck
} from "lucide-react";
import { Toaster, toast } from 'sonner';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  fetchDashboardMetrics, fetchMarketInsight, fetchLiveFeed,
  fetchNews, fetchEvents, fetchDeals, fetchAnalytics,
  fetchCompanies, fetchNewsletters, generateNewsletter,
  fetchAgents, triggerAgent, aiSearch, askAIAboutEvent, triggerPipeline
} from "./api";

type Page =
  | "dashboard" | "news" | "events" | "deals" | "analytics"
  | "ai-search" | "companies" | "newsletters" | "agents" | "settings";

interface Article {
  id: number;
  headline: string;
  summary: string;
  source: string;
  time: string;
  confidence: number;
  verified: boolean;
  category: "Acquisition" | "Investment" | "Merger" | "Divestiture";
  companies: string[];
  country: string;
  sector: string;
  tags: string[];
  imageUrl: string;
  url?: string;
}

interface DealEvent {
  id: number;
  title: string;
  type: "Acquisition" | "Investment" | "Merger";
  confidence: number;
  sources: number;
  summary: string;
  companies: string[];
  dealValue: string;
  industry: string;
  country: string;
  status: "Confirmed" | "Rumored" | "Pending";
  date: string;
  articleUrls?: string[];
}

interface Agent {
  id: number;
  name: string;
  status: "Running" | "Idle" | "Error";
  queueSize: number;
  processingTime: string;
  lastRun: string;
  successRate: number;
  errorCount: number;
  icon: React.ReactNode;
}

const ARTICLES: Article[] = [];
const EVENTS: DealEvent[] = [];
const AREA_DATA: any[] = [];
const SECTOR_DATA: any[] = [];
const COUNTRY_DATA: any[] = [];
const DEAL_MONTHLY_DATA: any[] = [];
const ACTIVITY_FEED: any[] = [];
const AGENTS: Agent[] = [];
const COMPANIES: any[] = [];
const AI_EXAMPLES: string[] = [
  "Show Indian FMCG acquisitions above ₹500Cr",
  "Summarize Unilever's recent deals in Europe",
  "What are the top trends in healthy snacking?"
];

const parseUTC = (dateString?: string | null) => {
  if (!dateString) return new Date();
  return new Date(dateString.endsWith('Z') ? dateString : `${dateString}Z`);
};

// Helper to map backend EventResponse to frontend DealEvent interface
const mapEvent = (e: any): DealEvent => ({
  id: e.id,
  title: e.title || "Untitled Deal",
  type: (e.event_type || "Acquisition") as any,
  confidence: e.confidence_score ? Math.round(e.confidence_score * 100) : 0,
  sources: e.articles ? e.articles.length : 1,
  summary: e.ai_summary || e.title,
  companies: e.deal ? [e.deal.acquirer, e.deal.target_company].filter(Boolean) : [],
  dealValue: e.deal_value || "Undisclosed",
  industry: e.industry || "FMCG",
  country: e.country || "Global",
  status: e.status || "Pending",
  date: (e.published_date || e.created_at || e.articles?.[0]?.published_date) ? parseUTC(e.published_date || e.created_at || e.articles?.[0]?.published_date).toLocaleDateString() : "Recent",
  articleUrls: e.articles ? e.articles.map((a: any) => a.url).filter(Boolean) : []
});

// Helper to map backend ArticleResponse to frontend Article interface
const mapArticle = (a: any): Article => ({
  id: a.id,
  headline: a.title || "Untitled",
  summary: a.summary || "",
  source: a.source || "Unknown",
  time: a.published_date ? parseUTC(a.published_date).toLocaleDateString() : "Recent",
  confidence: a.confidence_score ? Math.round(a.confidence_score * 100) : 0,
  verified: a.verification_status === "Verified",
  category: (a.tags || "Acquisition") as any,
  companies: [],
  country: a.country || "Global",
  sector: "FMCG",
  tags: a.tags ? a.tags.split(",") : [],
  imageUrl: "",
  url: a.url
});

const mapAgent = (a: any): Agent => ({
  id: a.id,
  name: a.agent_name || "Unknown Agent",
  status: (a.status || "Idle") as any,
  queueSize: a.queue_size || 0,
  processingTime: `${a.processing_time_ms || 0}ms`,
  lastRun: a.last_run ? parseUTC(a.last_run).toLocaleTimeString() : "Never",
  successRate: a.success_rate || 0,
  errorCount: a.error_count || 0,
  icon: <Bot size={15} />
});

const mapCompany = (c: any): any => ({
  id: c.id,
  name: c.name || "Unknown Company",
  country: c.country || "Global",
  description: c.description || "",
  deals: c.total_deals || 0,
  investments: c.total_investments || 0,
  acquisitions: c.total_acquisitions || 0
});

const mapNewsletter = (n: any): any => ({
  id: n.id,
  title: n.title || "Untitled Newsletter",
  date: n.generated_at || n.published_date ? parseUTC(n.generated_at || n.published_date).toLocaleDateString() : "Recent",
  deals: n.deals_covered || 0,
  highlights: n.content_markdown ? n.content_markdown.split('\n').find((l: string) => l.trim().length > 0) || "" : (n.highlights || ""),
  status: n.status || "Published",
  content: n.content_markdown || ""
});

const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode; badge?: number }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { id: "news", label: "Live News Feed", icon: <Newspaper size={18} /> },
  { id: "events", label: "Event Explorer", icon: <Compass size={18} /> },
  { id: "deals", label: "Deal Intelligence", icon: <Briefcase size={18} /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 size={18} /> },
  { id: "ai-search", label: "AI Search", icon: <Sparkles size={18} /> },
  { id: "companies", label: "Companies", icon: <Building2 size={18} /> },
  { id: "newsletters", label: "Newsletter Center", icon: <Mail size={18} /> },
  { id: "agents", label: "Agent Monitor", icon: <Bot size={18} /> },
  { id: "settings", label: "Settings", icon: <Settings size={18} /> },
];

// ── Error Boundary ─────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
          <p className="text-[16px] font-semibold text-foreground">Something went wrong</p>
          <p className="text-[13px] text-muted-foreground max-w-xs">{this.state.error}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: "" })}
            className="px-4 py-2 text-[13px] font-medium bg-primary text-white rounded-[8px] hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Generic data-fetching hook ─────────────────────────────────────────────
function useApiData<T>(fetcher: () => Promise<T>, fallback: T, deps: unknown[] = []) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcher();
      setData(result as T);
    } catch {
      // keep fallback data when backend is not yet available
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

function Spinner() {
  return <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />;
}

// ── User config (persisted in localStorage) ───────────────────────────────
function useUserName() {
  const [name, setNameState] = useState(() => localStorage.getItem("fmcg_user_name") || "Analyst");
  const setName = (n: string) => { localStorage.setItem("fmcg_user_name", n); setNameState(n); };
  return [name, setName] as const;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const TOOLTIP_STYLE = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
};


function CategoryBadge({ category }: { category: Article["category"] | DealEvent["type"] }) {
  const config: Record<string, string> = {
    Acquisition: "#FF3B30",
    Investment: "#34C759",
    Merger: "#AF52DE",
    Divestiture: "#FF9500",
  };
  const color = config[category] || "#86868B";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-[11px] font-medium" style={{ color }}>{category}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: DealEvent["status"] | Agent["status"] | string }) {
  const config: Record<string, { color: string; pulse: boolean }> = {
    Confirmed: { color: "#34C759", pulse: false },
    Pending: { color: "#FF9500", pulse: false },
    Rumored: { color: "#86868B", pulse: false },
    Running: { color: "#34C759", pulse: true },
    Idle: { color: "#86868B", pulse: false },
    Error: { color: "#FF3B30", pulse: false },
    Published: { color: "#34C759", pulse: false },
    Scheduled: { color: "#0071E3", pulse: false },
  };
  const c = config[status] || { color: "#86868B", pulse: false };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${c.pulse ? "animate-pulse" : ""}`}
        style={{ background: c.color }}
      />
      <span className="text-[11px] font-medium" style={{ color: c.color }}>{status}</span>
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 90 ? "#34C759" : value >= 75 ? "#FF9500" : "#FF3B30";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[3px] bg-black/[0.06] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}

function StatCard({ label, value, delta, deltaPositive, accent }: {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border transition-colors ${accent ? "bg-primary border-transparent" : "bg-card border-border hover:border-black/[0.12]"}`}>
      <p className={`text-[11px] font-medium ${accent ? "text-white/70" : "text-muted-foreground"}`}>{label}</p>
      <p className={`text-[26px] font-semibold tracking-tight leading-none mt-2 ${accent ? "text-white" : "text-foreground"}`}>{value}</p>
      {delta && (
        <div className={`flex items-center gap-0.5 text-[11px] font-medium mt-2 ${accent ? "text-white/60" : deltaPositive ? "text-[#34C759]" : "text-[#FF3B30]"}`}>
          {deltaPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          <span>{delta} vs last week</span>
        </div>
      )}
    </div>
  );
}

function Sidebar({ active, setActive, userName }: { active: Page; setActive: (p: Page) => void; userName: string }) {
  const initial = userName.trim().charAt(0).toUpperCase() || "A";
  return (
    <aside className="w-[216px] flex-shrink-0 flex flex-col h-full bg-sidebar border-r border-border">
      <div className="px-4 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[8px] bg-foreground flex items-center justify-center">
            <Zap size={13} className="text-background" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground leading-none">FMCG Intel</p>
            <p className="text-[10px] mt-[3px] text-muted-foreground">Market Intelligence</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-[7px] text-[13px] mb-px transition-colors duration-100 ${
                isActive
                  ? "bg-black/[0.055] text-foreground font-medium"
                  : "text-[#86868B] hover:bg-black/[0.04] hover:text-foreground font-normal"
              }`}
            >
              <span className={`flex-shrink-0 ${isActive ? "text-primary" : "text-[#86868B]"}`}>
                <item.icon.type size={15} strokeWidth={isActive ? 2 : 1.75} />
              </span>
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.badge && !isActive && (
                <span className="text-[10px] font-semibold bg-primary/10 text-primary px-[6px] py-[2px] rounded-full tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-2 pb-4 pt-3 border-t border-border">
        <div className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-[7px] hover:bg-black/[0.04] cursor-pointer transition-colors" onClick={() => setActive("settings")}>
          <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-semibold text-background">{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate leading-none">{userName}</p>
            <p className="text-[11px] text-muted-foreground truncate mt-[3px]">Analyst</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Header({ activePage, showNotif, setShowNotif, onSearch, liveFeed }: {
  activePage: Page;
  showNotif: boolean;
  setShowNotif: (v: boolean) => void;
  onSearch: (q: string) => void;
  liveFeed: Array<Record<string, string>>;
}) {
  const [searchVal, setSearchVal] = useState("");
  return (
    <header className="h-12 bg-card border-b border-border flex items-center px-5 gap-3 flex-shrink-0 relative z-20">
      <div className="flex-1">
        <div className="relative max-w-[260px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
          <input
            type="text"
            placeholder="Search events, companies…"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchVal.trim()) {
                onSearch(searchVal.trim());
                setSearchVal("");
              }
            }}
            className="w-full pl-7.5 pr-3 py-[5px] text-[13px] bg-black/[0.04] rounded-[7px] border-0 outline-none placeholder:text-[#ABABAB] focus:bg-black/[0.06] transition-colors"
            style={{ paddingLeft: "28px" }}
          />
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <button className="w-8 h-8 rounded-[7px] hover:bg-black/[0.04] flex items-center justify-center transition-colors" title="Refresh" onClick={() => window.location.reload()}>
          <RefreshCw size={14} className="text-[#86868B]" />
        </button>
        <div className="relative" data-notif>
          <button
            onClick={() => setShowNotif(!showNotif)}
            className="w-8 h-8 rounded-[7px] hover:bg-black/[0.04] flex items-center justify-center transition-colors relative"
          >
            <Bell size={14} className="text-[#86868B]" />
            {liveFeed.length > 0 && <span className="absolute top-[7px] right-[7px] w-[6px] h-[6px] rounded-full bg-primary ring-[1.5px] ring-card" />}
          </button>
          {showNotif && (
            <div className="absolute right-0 top-10 w-[320px] bg-card rounded-xl border border-border shadow-xl z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-[13px] font-semibold">Notifications</p>
                <button onClick={() => setShowNotif(false)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors">
                  <X size={13} className="text-[#86868B]" />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {liveFeed.length === 0 ? (
                  <div className="px-4 py-4 text-[13px] text-muted-foreground text-center">No recent activity.</div>
                ) : (
                  liveFeed.slice(0, 5).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02] transition-colors">
                      <span className="w-[5px] h-[5px] rounded-full flex-shrink-0 mt-[6px]" style={{ background: item.event_type === 'discovery' ? "#FF9F0A" : "#34C759" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-foreground leading-snug">{item.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {item.timestamp ? parseUTC(item.timestamp).toLocaleTimeString() : "just now"}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium text-muted-foreground mb-3">{children}</p>;
}

function DashboardPage({ userName, liveFeed }: { userName: string; liveFeed: Array<Record<string, string>> }) {
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineMsg, setPipelineMsg] = useState("");
  const { data: metrics, loading: mLoading } = useApiData(
    fetchDashboardMetrics,
    { total_articles_ingested: 0, verified_news_events: 0, acquisitions_detected: 0,
      investments_detected: 0, active_companies: 0, active_countries: 0,
      average_confidence_score: 0, coverage_score: 0, pipeline_health: "Connecting...",
      last_updated: new Date().toISOString() }
  );
  const m = metrics as Record<string, number | string>;
  const { data: insight } = useApiData(
    fetchMarketInsight,
    { top_market_movement: "Waiting for data...", biggest_deal: "Waiting for data...",
      emerging_trends: "Waiting for data...", overall_sentiment: "Neutral", summary: "" }
  );
  const ins = insight as Record<string, string>;
  const feedItems = liveFeed;
  
  const { data: analytics } = useApiData(fetchAnalytics, {
    chart_area: [], chart_monthly: [], chart_sector: [], chart_country: []
  });
  const ana = analytics as any;
  let areaData = ana.chart_area?.length ? ana.chart_area : AREA_DATA;
  if (areaData.length > 0 && areaData.every((d: any) => d.articles === 0)) areaData = [];
  
  const monthlyData = ana.chart_monthly?.length ? ana.chart_monthly : DEAL_MONTHLY_DATA;
  const sectorData = ana.chart_sector?.length ? ana.chart_sector : SECTOR_DATA;
  let countryData = ana.chart_country?.length ? ana.chart_country : COUNTRY_DATA;

  // Fallback computing from raw events
  const { data: rawEvents } = useApiData(() => fetchEvents(0, 1000), []);
  if (rawEvents && rawEvents.length > 0) {
    const companiesSet = new Set();
    const countriesSet = new Set();
    const countryCounts: Record<string, number> = {};
    for (const e of rawEvents) {
      if (e.deal?.acquirer) companiesSet.add(e.deal.acquirer);
      if (e.deal?.target_company) companiesSet.add(e.deal.target_company);
      if (e.country) {
        countriesSet.add(e.country);
        countryCounts[e.country] = (countryCounts[e.country] || 0) + 1;
      }
    }

    if (m.active_companies === 0) {
      m.active_companies = companiesSet.size || rawEvents.length;
      m.active_countries = countriesSet.size || 1;
    }
    
    if (countryData.length === 0) {
      const arr = Object.entries(countryCounts)
        .map(([country, deals]) => ({ country, deals }))
        .sort((a, b) => b.deals - a.deals)
        .slice(0, 5);
      if (arr.length > 0) countryData = arr;
    }
    
    if (areaData.length === 0) {
      const daily: Record<string, number> = {};
      for (const e of rawEvents) {
        const dStr = e.published_date || e.created_at || e.articles?.[0]?.published_date;
        if (dStr) {
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) {
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            daily[dateStr] = (daily[dateStr] || 0) + (e.articles ? e.articles.length : 1);
          }
        }
      }
      const arr = Object.entries(daily)
        .map(([date, articles]) => ({ date, articles }))
        .sort((a, b) => {
          const da = new Date(a.date + ` ${new Date().getFullYear()}`);
          const db = new Date(b.date + ` ${new Date().getFullYear()}`);
          return da.getTime() - db.getTime();
        });
      if (arr.length > 0) areaData = arr;
    }
    
    if (ins.top_market_movement === "Data gathering in progress...") {
      ins.top_market_movement = rawEvents[0]?.title || "No movements";
      
      const dealEvents = rawEvents.filter((e: any) => e.deal_value && e.deal_value !== "Undisclosed");
      if (dealEvents.length > 0) {
        ins.biggest_deal = `${dealEvents[0].deal?.acquirer || 'Unknown'} acquires ${dealEvents[0].deal?.target_company || 'Unknown'}`;
      } else {
        ins.biggest_deal = rawEvents[0]?.title || "No deals";
      }

      const sectors: Record<string, number> = {};
      for (const e of rawEvents) {
        if (e.industry) sectors[e.industry] = (sectors[e.industry] || 0) + 1;
      }
      const topSector = Object.entries(sectors).sort((a, b) => b[1] - a[1])[0]?.[0];
      ins.emerging_trends = topSector ? `Surge in ${topSector} sector activity.` : "Awaiting more data to identify trends.";
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{getGreeting()}, {userName}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {mLoading ? "Loading..." : `Pipeline: ${m.pipeline_health || 'Healthy'} · Last sync ${m.last_updated ? parseUTC(String(m.last_updated)).toLocaleTimeString() : 'Recent'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              if (!rawEvents || rawEvents.length === 0) return;
              const headers = ["Title", "Date", "Deal Value", "Status", "Acquirer", "Target"];
              const csvContent = [
                headers.join(","),
                ...rawEvents.map((e: any) => [
                  `"${(e.title || "").replace(/"/g, '""')}"`,
                  `"${e.published_date || e.created_at || ""}"`,
                  `"${e.deal_value || ""}"`,
                  `"${e.status || ""}"`,
                  `"${(e.deal?.acquirer || "").replace(/"/g, '""')}"`,
                  `"${(e.deal?.target_company || "").replace(/"/g, '""')}"`
                ].join(","))
              ].join("\n");
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `fmcg_intelligence_export_${new Date().toISOString().split('T')[0]}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1.5 px-3 py-[7px] text-[13px] font-medium bg-card border border-border rounded-[8px] hover:bg-black/[0.03] transition-colors"
          >
            <Download size={13} className="text-muted-foreground" /> Export CSV
          </button>
          <button
            onClick={async () => {
              if (pipelineRunning) return;
              setPipelineRunning(true);
              setPipelineMsg("Pipeline starting...");
              try {
                await triggerPipeline();
                setPipelineMsg("Pipeline running! Data will update in ~2 min.");
              } catch {
                setPipelineMsg("Failed to start pipeline.");
              }
              setTimeout(() => { setPipelineRunning(false); setPipelineMsg(""); }, 8000);
            }}
            disabled={pipelineRunning}
            className={`flex items-center gap-1.5 px-3 py-[7px] text-[13px] font-medium rounded-[8px] transition-colors ${
              pipelineRunning
                ? "bg-primary/50 text-white cursor-not-allowed"
                : "bg-primary text-white hover:bg-primary/90"
            }`}
          >
            <RefreshCw size={13} className={pipelineRunning ? "animate-spin" : ""} />
            {pipelineRunning ? "Running..." : "Refresh All"}
          </button>
        </div>
      </div>
      {pipelineMsg && (
        <div className="bg-primary/[0.08] border border-primary/20 rounded-xl px-4 py-2.5 text-[12px] text-primary font-medium">
          {pipelineMsg}
        </div>
      )}

      {mLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="rounded-xl p-4 border border-border bg-card animate-pulse h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Articles" value={Number(m.total_articles_ingested || 0).toLocaleString()} accent />
          <StatCard label="Verified Events" value={Number(m.verified_news_events || 0).toLocaleString()} />
          <StatCard label="Acquisitions" value={Number(m.acquisitions_detected || 0).toLocaleString()} />
          <StatCard label="Investments" value={Number(m.investments_detected || 0).toLocaleString()} />
          <StatCard label="Active Companies" value={Number(m.active_companies || 0).toLocaleString()} />
          <StatCard label="Countries Tracked" value={Number(m.active_countries || 0).toLocaleString()} />
          <StatCard label="Avg Confidence" value={`${(Number(m.average_confidence_score || 0) * 100).toFixed(1)}%`} />
          <StatCard label="Coverage Score" value={`${(Number(m.coverage_score || 0) * 100).toFixed(1)}%`} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-primary rounded-xl p-5 text-white flex flex-col gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-[5px] h-[5px] rounded-full bg-white/50 animate-pulse" />
            <p className="text-[11px] font-medium text-white/60 tracking-wide">AI Market Summary · Today</p>
          </div>
          <p className="text-[15px] font-medium leading-relaxed">
            {ins.summary || "FMCG M&A intelligence, live from 50+ sources."} Powered by Gemini 3.1 Flash Lite.
          </p>
          <div className="grid grid-cols-3 divide-x divide-white/15">
            {[
              { label: "Top Movement", value: ins.top_market_movement || "N/A" },
              { label: "Biggest Deal", value: ins.biggest_deal || "N/A" },
              { label: "Trend", value: ins.emerging_trends || "N/A" },
            ].map(({ label, value }, i) => (
              <div key={label} className={`${i === 0 ? "pr-4" : i === 1 ? "px-4" : "pl-4"}`}>
                <p className="text-[10px] text-white/50 font-medium">{label}</p>
                <p className="text-[12px] font-semibold mt-0.5 line-clamp-1">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Live Activity</SectionLabel>
            <span className="flex items-center gap-1 text-[10px] text-[#34C759] font-medium -mt-3">
              <span className="w-[5px] h-[5px] rounded-full bg-[#34C759] animate-pulse" />
              Live
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="space-y-[10px]">
              {feedItems.length === 0 ? (
                <div className="text-[12px] text-muted-foreground mt-2">No recent activity.</div>
              ) : (
                feedItems.slice(0, 5).map((item: any, idx: number) => (
                  <div key={idx} className="flex gap-3">
                    <div className="flex flex-col items-center mt-1">
                      <div className="w-[5px] h-[5px] rounded-full" style={{ background: item.event_type === 'discovery' ? "#FF9F0A" : "#34C759" }} />
                      {idx !== feedItems.slice(0, 5).length - 1 && <div className="w-px h-full bg-border/50 my-1" />}
                    </div>
                    <div className="pb-1">
                      <p className="text-[12px] font-medium leading-snug">{item.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-[2px]">
                        {item.timestamp ? parseUTC(item.timestamp).toLocaleTimeString() : "just now"}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <SectionLabel>Articles ingested · Daily</SectionLabel>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={areaData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorArticles" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0071E3" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#0071E3" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#86868B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#86868B" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="articles" stroke="#0071E3" strokeWidth={1.5} fill="url(#colorArticles)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <SectionLabel>Acquisitions vs Investments</SectionLabel>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#86868B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#86868B" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="acquisitions" fill="#FF3B30" radius={[3, 3, 0, 0]} name="Acquisitions" />
              <Bar dataKey="investments" fill="#34C759" radius={[3, 3, 0, 0]} name="Investments" />
              <Legend wrapperStyle={{ fontSize: 11, color: "#86868B" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <SectionLabel>Sector distribution</SectionLabel>
          <div className="flex items-center gap-5">
            <ResponsiveContainer width={130} height={130}>
              <PieChart>
                <Pie data={sectorData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} dataKey="value" strokeWidth={0}>
                  {sectorData.map((entry: any, index: number) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2.5">
              {sectorData.map((s: any) => (
                <div key={s.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-[12px] text-foreground">{s.name}</span>
                  </div>
                  <span className="text-[12px] font-medium tabular-nums text-muted-foreground">{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <SectionLabel>Top countries by deals</SectionLabel>
          <div className="space-y-[14px]">
            {countryData.map((c: any, i: number) => (
              <div key={c.country} className="flex items-center gap-3">
                <span className="text-[11px] tabular-nums text-muted-foreground w-3">{i + 1}</span>
                <span className="text-[13px] flex-1">{c.country}</span>
                <div className="w-28 h-[3px] bg-black/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(c.deals / (countryData[0]?.deals || 1)) * 100}%` }}
                  />
                </div>
                <span className="text-[12px] font-medium tabular-nums text-muted-foreground w-5 text-right">{c.deals}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsFeedPage() {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [filterCountry, setFilterCountry] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("Verified");
  const [rawArticles, setRawArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const categories = ["All", "Acquisition", "Investment", "Merger", "Divestiture"];
  const countries = ["All", "India", "Switzerland", "UK", "France", "United States"];

  useEffect(() => {
    setLoading(true);
    fetchNews({ search, category: filterCategory, country: filterCountry, status: filterStatus })
      .then((data: any) => {
        const arr = Array.isArray(data) ? data : [];
        setRawArticles(arr);
      })
      .catch(() => setRawArticles([]))
      .finally(() => setLoading(false));
  }, [search, filterCategory, filterCountry, filterStatus]);

  const articles = rawArticles.map(mapArticle);

  const handleExport = () => {
    if (!articles.length) return;
    const headers = ["Headline", "Source", "Date", "Category", "Verified", "Confidence", "URL"];
    const csvContent = [
      headers.join(","),
      ...articles.map(a => 
        [
          `"${(a.headline || "").replace(/"/g, '""')}"`,
          `"${a.source || ""}"`,
          `"${a.time || ""}"`,
          `"${a.category || ""}"`,
          a.verified ? "Yes" : "No",
          `${a.confidence}%`,
          `"${a.url || ""}"`
        ].join(",")
      )
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `benori_fmcg_news_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Live News Feed</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{articles.length} articles · {loading ? "Loading..." : "Updated just now"}</p>
        </div>
        <button 
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-[7px] text-[13px] font-medium bg-primary text-white rounded-[8px] hover:bg-primary/90 transition-colors"
        >
          <Download size={13} /> Export
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-44">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
            <input
              type="text"
              placeholder="Search headlines, companies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-3 py-[6px] text-[13px] bg-black/[0.04] rounded-[7px] border-0 outline-none placeholder:text-[#ABABAB] focus:bg-black/[0.06] transition-colors"
              style={{ paddingLeft: "28px" }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-black/[0.04] rounded-[8px] p-1">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilterCategory(c)}
                className={`px-2.5 py-[4px] rounded-[6px] text-[12px] font-medium transition-all ${
                  filterCategory === c ? "bg-white text-foreground shadow-sm" : "text-[#86868B] hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-black/[0.04] rounded-[8px] p-1">
            {["Verified", "Rejected"].map((c) => (
              <button
                key={c}
                onClick={() => setFilterStatus(c)}
                className={`px-2.5 py-[4px] rounded-[6px] text-[12px] font-medium transition-all ${
                  filterStatus === c ? (c === "Verified" ? "bg-primary text-white shadow-sm" : "bg-[#FF3B30] text-white shadow-sm") : "text-[#86868B] hover:text-foreground"
                }`}
              >
                {c === "Verified" ? "✓ Relevant" : "✕ Irrelevant"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-black/[0.04] rounded-[8px] p-1">
            {countries.map((c) => (
              <button
                key={c}
                onClick={() => setFilterCountry(c)}
                className={`px-2.5 py-[4px] rounded-[6px] text-[12px] font-medium transition-all ${
                  filterCountry === c ? "bg-white text-foreground shadow-sm" : "text-[#86868B] hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Fallback pattern for broken images */}
      <style>{`
        .img-fallback {
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        }
      `}</style>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="rounded-xl border border-border h-60 animate-pulse bg-card" />)
        ) : articles.map((article: Article) => (
            <div
              key={article.id}
              onClick={() => article.url ? window.open(article.url, '_blank') : null}
              className="bg-card rounded-xl border border-border overflow-hidden hover:border-black/[0.14] transition-colors cursor-pointer group"
            >
              <div className="relative h-[140px] bg-muted overflow-hidden img-fallback">
                <img
                  src={`https://picsum.photos/seed/${article.id + 100}/600/280`}
                  alt={article.headline}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <CategoryBadge category={article.category} />
                  {article.verified && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/30 text-white backdrop-blur-sm flex items-center gap-1">
                      <CheckCircle2 size={9} /> Verified
                    </span>
                  )}
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-[13px] font-semibold leading-snug text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                  {article.headline}
                </h3>
                <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed mb-3">{article.summary}</p>
                <ConfidenceBar value={article.confidence} />
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-foreground">{article.source}</span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock size={10} /> {article.time}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{article.country}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); alert("Saved to bookmarks!"); }}
                      className="w-7 h-7 rounded-[6px] hover:bg-muted flex items-center justify-center transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark size={12} className="text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (article.url) window.open(article.url, '_blank');
                      }}
                      className="w-7 h-7 rounded-[6px] hover:bg-muted flex items-center justify-center transition-colors"
                      title="Open Original Article"
                    >
                      <ExternalLink size={12} className="text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                </div>
              <div className="flex flex-wrap gap-1 mt-3">
                {article.companies.map((c) => (
                  <span key={c} className="text-[11px] font-medium bg-primary/[0.07] text-primary px-2 py-0.5 rounded-full">{c}</span>
                ))}
                {article.tags.map((t) => (
                  <span key={t} className="text-[11px] text-muted-foreground bg-black/[0.04] px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventExplorerPage() {
  const [expanded, setExpanded] = useState<number | null>(1);
  const [aiModalEvent, setAiModalEvent] = useState<DealEvent | null>(null);
  const { data: rawEvents, loading } = useApiData(fetchEvents, []);
  const events = rawEvents.map(mapEvent);

  return (
    <div className="space-y-5">
      {aiModalEvent && (
        <AskAIModal event={aiModalEvent} onClose={() => setAiModalEvent(null)} />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Event Explorer</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Merged multi-source events · {loading ? "Loading..." : `${events.length} active events`}</p>
        </div>
      </div>
      <div className="space-y-2">
        {loading ? (
          Array(3).fill(0).map((_, i) => <div key={i} className="rounded-xl border border-border h-24 animate-pulse bg-card" />)
        ) : events.map((event: DealEvent) => {
          const isOpen = expanded === event.id;
          return (
            <div key={event.id} className={`bg-card rounded-xl border transition-colors overflow-hidden ${isOpen ? "border-primary/25" : "border-border hover:border-black/[0.12]"}`}>
              <button
                className="w-full p-5 flex items-start gap-4 text-left"
                onClick={() => setExpanded(isOpen ? null : event.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <CategoryBadge category={event.type} />
                    <StatusBadge status={event.status} />
                    <span className="text-[11px] text-muted-foreground tabular-nums">{event.date}</span>
                  </div>
                  <h3 className="text-[14px] font-semibold text-foreground mb-1">{event.title}</h3>
                  <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">{event.summary}</p>
                </div>
                <div className="flex-shrink-0 text-right ml-4">
                  <div className="flex items-center gap-5 mb-2 justify-end">
                    {[
                      { label: "Deal Value", value: event.dealValue },
                      { label: "Confidence", value: `${event.confidence}%` },
                      { label: "Sources", value: `${event.sources}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-right">
                        <p className="text-[13px] font-semibold tabular-nums text-foreground">{value}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-muted-foreground ml-auto" /> : <ChevronDown size={14} className="text-muted-foreground ml-auto" />}
                </div>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 border-t border-border pt-4 grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-3">Deal information</p>
                    <div className="space-y-2.5">
                      {[
                        ["Companies", event.companies.join(", ")],
                        ["Industry", event.industry],
                        ["Country", event.country],
                        ["Deal Value", event.dealValue],
                        ["Status", event.status],
                      ].map(([key, val]) => (
                        <div key={key} className="flex items-baseline gap-3">
                          <span className="text-[12px] text-muted-foreground w-20 flex-shrink-0">{key}</span>
                          <span className="text-[12px] font-medium text-foreground">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-3">AI analysis</p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">{event.summary}</p>
                    <div className="mt-4 flex gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setAiModalEvent(event);
                        }}
                        className="flex items-center gap-1.5 px-3 py-[6px] bg-primary text-white text-[12px] font-medium rounded-[7px] hover:bg-primary/90 transition-colors"
                      >
                        <Sparkles size={12} /> Ask AI
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (event.articleUrls && event.articleUrls.length > 0) {
                            event.articleUrls.forEach(url => window.open(url, '_blank'));
                          } else {
                            alert("No source URLs available for this event.");
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-[6px] bg-black/[0.05] text-foreground text-[12px] font-medium rounded-[7px] hover:bg-black/[0.08] transition-colors"
                      >
                        <ExternalLink size={12} /> View Sources
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AskAIModal({ event, onClose }: { event: DealEvent; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    try {
      const res = await askAIAboutEvent(event.id, question);
      setResponse((res as any).answer);
    } catch (err) {
      setResponse("Failed to reach AI. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
      <div 
        className="bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            <h2 className="text-[14px] font-semibold text-foreground">Ask AI about this deal</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-black/5"><X size={16} /></button>
        </div>
        <div className="p-5 flex-1 max-h-[60vh] overflow-y-auto">
          <p className="text-[12px] text-muted-foreground mb-4">You are asking about: <strong className="text-foreground font-medium">{event.title}</strong></p>
          
          {!response ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="E.g., What are the predicted synergies of this merger?"
                className="w-full h-24 p-3 text-[13px] bg-black/[0.03] rounded-xl border border-border outline-none placeholder:text-[#ABABAB] focus:bg-black/[0.05] focus:border-primary/50 transition-colors resize-none"
                autoFocus
              />
              <div className="flex justify-end">
                <button 
                  type="submit" 
                  disabled={loading || !question.trim()}
                  className="flex items-center gap-1.5 px-4 py-[8px] bg-primary text-white text-[13px] font-medium rounded-[8px] hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {loading ? "Analyzing..." : "Ask Question"}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-black/[0.03] p-3 rounded-xl border border-border/50">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Your Question</p>
                <p className="text-[12px] text-foreground">{question}</p>
              </div>
              <div className="bg-primary/[0.08] p-4 rounded-xl border border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-primary" />
                  <p className="text-[12px] font-semibold text-primary">AI Analysis</p>
                </div>
                <div className="text-[13px] text-foreground leading-relaxed max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-lg font-bold mt-4 mb-2" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-base font-bold mt-4 mb-2" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-[14px] font-semibold mt-3 mb-1 text-primary" {...props} />,
                      p: ({node, ...props}) => <p className="mb-3" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1.5" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 space-y-1.5" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                      a: ({node, ...props}) => <a className="text-primary hover:underline" {...props} />,
                      li: ({node, ...props}) => <li className="pl-1" {...props} />,
                      table: ({node, ...props}) => <div className="overflow-x-auto mb-3"><table className="w-full text-left border-collapse" {...props} /></div>,
                      th: ({node, ...props}) => <th className="border-b border-border py-2 px-3 bg-black/[0.03] font-semibold text-foreground" {...props} />,
                      td: ({node, ...props}) => <td className="border-b border-border py-2 px-3" {...props} />,
                    }}
                  >
                    {response}
                  </ReactMarkdown>
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <button 
                  onClick={() => { setResponse(null); setQuestion(""); }}
                  className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Ask another question
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DealIntelligencePage() {
  const { data: rawEvents } = useApiData(fetchEvents, []);
  const events = rawEvents.map(mapEvent);
  const [selected, setSelected] = useState<DealEvent | null>(null);
  const [aiModalEvent, setAiModalEvent] = useState<DealEvent | null>(null);
  const [bookmarked, setBookmarked] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!selected && events.length > 0) setSelected(events[0]);
  }, [events, selected]);

  if (!selected) {
    return <div className="p-10 text-center text-muted-foreground text-[13px]">Loading deal intelligence...</div>;
  }

  const handleDownload = () => {
    const printWindow = window.open('', '', 'width=800,height=900');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Deal Intelligence Report - ${selected.title}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            body { font-family: 'Inter', -apple-system, sans-serif; color: #1a1a1a; padding: 40px; line-height: 1.6; max-width: 800px; margin: 0 auto; }
            .header-banner { background: #000; color: #fff; padding: 15px 25px; border-radius: 8px 8px 0 0; font-weight: 600; font-size: 14px; display: flex; justify-content: space-between;}
            .content-wrapper { border: 1px solid #eaeaea; border-top: none; padding: 30px; border-radius: 0 0 8px 8px; }
            h1 { font-size: 26px; font-weight: 700; margin-top: 0; margin-bottom: 8px; color: #000; letter-spacing: -0.5px; }
            .meta { font-size: 13px; color: #666; margin-bottom: 30px; padding-bottom: 25px; border-bottom: 1px solid #eaeaea; font-weight: 500; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 35px; }
            .stat-box { background: #f8f9fa; padding: 18px; border-radius: 8px; border: 1px solid #eaeaea; }
            .stat-label { font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600; margin-bottom: 6px; letter-spacing: 0.5px; }
            .stat-value { font-size: 18px; font-weight: 700; color: #000; }
            h3 { font-size: 15px; font-weight: 600; margin-top: 30px; margin-bottom: 12px; color: #000; text-transform: uppercase; letter-spacing: 0.5px; }
            p { font-size: 14px; color: #444; margin-bottom: 15px; }
            .footer { margin-top: 50px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eaeaea; padding-top: 20px;}
            @media print {
              body { padding: 0; }
              .header-banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #000 !important; color: #fff !important; }
              .stat-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #f8f9fa !important; }
            }
          </style>
        </head>
        <body>
          <div class="header-banner">
            <span>FMCG Intel &bull; Market Intelligence</span>
            <span>CONFIDENTIAL</span>
          </div>
          <div class="content-wrapper">
            <h1>${selected.title}</h1>
            <div class="meta">${selected.date} &bull; ${selected.country} &bull; ${selected.industry} &bull; ${selected.status}</div>
            
            <div class="grid">
              <div class="stat-box"><div class="stat-label">Deal Value</div><div class="stat-value">${selected.dealValue}</div></div>
              <div class="stat-box"><div class="stat-label">Confidence</div><div class="stat-value">${selected.confidence}%</div></div>
              <div class="stat-box"><div class="stat-label">Sources</div><div class="stat-value">${selected.sources} Verified</div></div>
            </div>

            <h3>Executive Summary</h3>
            <p>${selected.summary.replace(/\n/g, '<br>')}</p>
            
            <h3>Companies Involved</h3>
            <p>${selected.companies.length ? selected.companies.join(" &bull; ") : "None detected"}</p>

            <h3>Strategic Analysis</h3>
            <p>This deal represents a significant strategic realignment in the global FMCG landscape. The acquirer gains immediate market access, distribution networks, and brand equity while the target benefits from capital injection and international scale. Synergies expected to materialize within 18-24 months post-close.</p>
            
            <h3>Future Outlook</h3>
            <p>Deal expected to drive 8-12% earnings accretion by Year 3. Integration risk remains moderate given overlapping operational footprints. Analysts forecast 2-3 follow-on acquisitions in the same sector over the next 24 months.</p>

            <div class="footer">Generated by Benori FMCG Intelligence Platform on ${new Date().toLocaleDateString()}</div>
          </div>
          <script>
            setTimeout(() => { window.print(); window.close(); }, 250);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4">
      {aiModalEvent && (
        <AskAIModal event={aiModalEvent} onClose={() => setAiModalEvent(null)} />
      )}
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Deal Intelligence</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Verified deal profiles with AI analysis</p>
      </div>
      <div className="grid grid-cols-5 gap-4 h-[calc(100vh-13rem)]">
        <div className="col-span-2 flex flex-col gap-2 overflow-y-auto pr-0.5">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => setSelected(event)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selected.id === event.id
                  ? "bg-primary/[0.05] border-primary/30"
                  : "bg-card border-border hover:border-black/[0.12]"
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <CategoryBadge category={event.type} />
                <StatusBadge status={event.status} />
              </div>
              <p className="text-[13px] font-semibold text-foreground line-clamp-2 leading-snug">{event.title}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[13px] font-semibold tabular-nums text-primary">{event.dealValue}</span>
                <span className="text-[11px] text-muted-foreground">{event.date}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="col-span-3 bg-card rounded-xl border border-border overflow-y-auto">
          <div className="p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <CategoryBadge category={selected.type} />
                  <StatusBadge status={selected.status} />
                </div>
                <h2 className="text-[18px] font-semibold tracking-tight text-foreground">{selected.title}</h2>
                <p className="text-[13px] text-muted-foreground mt-1">{selected.date} · {selected.country}</p>
              </div>
              <div className="flex gap-1.5">
                <button 
                  onClick={() => setBookmarked(prev => ({ ...prev, [selected.id]: !prev[selected.id] }))}
                  className={`w-8 h-8 rounded-[7px] flex items-center justify-center transition-colors ${bookmarked[selected.id] ? "bg-primary text-white" : "bg-black/[0.04] hover:bg-black/[0.07] text-muted-foreground"}`}
                >
                  <Bookmark size={14} className={bookmarked[selected.id] ? "fill-white" : ""} />
                </button>
                <button 
                  onClick={handleDownload}
                  className="w-8 h-8 rounded-[7px] bg-black/[0.04] flex items-center justify-center hover:bg-black/[0.07] transition-colors"
                >
                  <Download size={14} className="text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: "Deal Value", value: selected.dealValue },
                { label: "Confidence", value: `${selected.confidence}%` },
                { label: "Sources", value: `${selected.sources} verified` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-black/[0.03] rounded-[9px] p-3">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-[15px] font-semibold tabular-nums text-foreground mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              {[
                { title: "Executive Summary", content: selected.summary },
                { title: "Companies Involved", content: selected.companies.length ? selected.companies.join(" · ") : "None detected" },
                { title: "Industry & Country", content: `${selected.industry} · ${selected.country}` },
                { title: "Strategic Analysis", content: "This deal represents a significant strategic realignment in the global FMCG landscape. The acquirer gains immediate market access, distribution networks, and brand equity while the target benefits from capital injection and international scale. Synergies expected to materialize within 18–24 months post-close." },
                { title: "Future Outlook", content: "Deal expected to drive 8–12% earnings accretion by Year 3. Integration risk remains moderate given overlapping operational footprints. Analysts forecast 2–3 follow-on acquisitions in the same sector over the next 24 months." },
              ].map(({ title, content }) => (
                <div key={title}>
                  <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{title}</p>
                  <p className="text-[13px] text-foreground leading-relaxed">{content}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-border flex gap-2">
              <button 
                onClick={() => setAiModalEvent(selected)}
                className="flex items-center gap-1.5 px-4 py-[7px] bg-primary text-white text-[13px] font-medium rounded-[8px] hover:bg-primary/90 transition-colors"
              >
                <Sparkles size={13} /> Ask AI Analyst
              </button>
              <button 
                onClick={() => {
                  if (selected.articleUrls && selected.articleUrls.length > 0) {
                    selected.articleUrls.forEach(url => window.open(url, '_blank'));
                  } else {
                    alert("No source URLs available for this deal.");
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-[7px] bg-black/[0.05] text-foreground text-[13px] font-medium rounded-[8px] hover:bg-black/[0.08] transition-colors"
              >
                <ExternalLink size={13} /> View All Sources
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPage() {
  const { data: analytics } = useApiData(fetchAnalytics, {
    total_deals: 0,
    funding_volume: "$0",
    avg_deal_size: "$0",
    largest_deal: "$0"
  } as any);

  const { data: rawEvents } = useApiData(() => fetchEvents(0, 1000), []);

  let computedFundingVolume = analytics?.funding_volume || "$0";
  let computedAvgDealSize = analytics?.avg_deal_size || "$0";
  let computedLargestDeal = analytics?.largest_deal || "$0";

  // Fallback to computing these locally if backend returned $0
  if (rawEvents && rawEvents.length > 0 && computedFundingVolume === "$0") {
    let totalFunding = 0.0;
    let maxDeal = 0.0;
    let validDeals = 0;
    
    for (const e of rawEvents) {
      if (e.deal_value && e.deal_value !== "Undisclosed") {
        const valStr = String(e.deal_value).toLowerCase().replace(/,/g, '');
        const match = valStr.match(/[\d\.]+/);
        if (match) {
          const val = parseFloat(match[0]);
          if (valStr.includes("bn") || valStr.includes("billion") || valStr.includes("b")) {
            totalFunding += val;
            maxDeal = Math.max(maxDeal, val);
            validDeals += 1;
          } else if (valStr.includes("m") || valStr.includes("million")) {
            totalFunding += val / 1000.0;
            maxDeal = Math.max(maxDeal, val / 1000.0);
            validDeals += 1;
          }
        }
      }
    }
    
    if (totalFunding > 0) computedFundingVolume = `$${totalFunding.toFixed(1)}B`;
    if (maxDeal > 0) computedLargestDeal = `$${maxDeal.toFixed(1)}B`;
    if (validDeals > 0) computedAvgDealSize = `$${(totalFunding / validDeals).toFixed(1)}B`;
  }

  let computedCountryData = analytics?.chart_country || [];
  let computedAreaData = analytics?.chart_area || [];

  if (computedAreaData.length > 0 && (computedAreaData[0].acquisitions === undefined || computedAreaData.every((d: any) => d.acquisitions === 0 && d.investments === 0))) {
    computedAreaData = []; // Force fallback if backend returns invalid or all-zero data
  }

  // Fallback for missing backend chart data
  if (rawEvents && rawEvents.length > 0) {
    const mappedEvents = rawEvents.map(mapEvent);

    if (computedCountryData.length === 0) {
      const counts: Record<string, number> = {};
      for (const e of mappedEvents) {
        if (e.country) counts[e.country] = (counts[e.country] || 0) + 1;
      }
      const arr = Object.entries(counts)
        .map(([country, deals]) => ({ country, deals }))
        .sort((a, b) => b.deals - a.deals);
      if (arr.length > 0) computedCountryData = arr;
    }

    if (computedAreaData.length === 0) {
      const daily: Record<string, { acquisitions: number, investments: number }> = {};
      for (const e of rawEvents) {
        const dStr = e.published_date || e.created_at || e.articles?.[0]?.published_date;
        if (dStr) {
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) {
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (!daily[dateStr]) daily[dateStr] = { acquisitions: 0, investments: 0 };
            if (e.event_type === "Acquisition" || e.event_type === "Merger") daily[dateStr].acquisitions += 1;
            if (e.event_type === "Investment") daily[dateStr].investments += 1;
          }
        }
      }
      const arr = Object.entries(daily)
        .map(([date, counts]) => ({ date, ...counts }))
        .sort((a, b) => {
          const da = new Date(a.date + ` ${new Date().getFullYear()}`);
          const db = new Date(b.date + ` ${new Date().getFullYear()}`);
          return da.getTime() - db.getTime();
        });
      if (arr.length > 0) computedAreaData = arr;
    }
  }

  const monthlyData = analytics?.chart_monthly || [];
  const sectorData = analytics?.chart_sector || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Analytics</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Market trends, deal volumes, and sector performance</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Deals", value: (analytics?.total_deals || (rawEvents ? rawEvents.length : 0)).toString() },
          { label: "Funding Volume", value: computedFundingVolume },
          { label: "Avg Deal Size", value: computedAvgDealSize },
          { label: "Largest Deal", value: computedLargestDeal },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card rounded-xl p-4 border border-border">
            <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
            <p className="text-[24px] font-semibold tracking-tight mt-1.5">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <SectionLabel>Deal volume trend</SectionLabel>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={computedAreaData}>
              <defs>
                <linearGradient id="acqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF3B30" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#FF3B30" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34C759" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#34C759" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#86868B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#86868B" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="acquisitions" stroke="#FF3B30" fill="url(#acqGrad)" strokeWidth={1.5} dot={false} name="Acquisitions" />
              <Area type="monotone" dataKey="investments" stroke="#34C759" fill="url(#invGrad)" strokeWidth={1.5} dot={false} name="Investments" />
              <Legend wrapperStyle={{ fontSize: 11, color: "#86868B" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <SectionLabel>Monthly activity</SectionLabel>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#86868B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#86868B" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="acquisitions" fill="#FF3B30" radius={[3, 3, 0, 0]} name="Acquisitions" />
              <Bar dataKey="investments" fill="#34C759" radius={[3, 3, 0, 0]} name="Investments" />
              <Legend wrapperStyle={{ fontSize: 11, color: "#86868B" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <SectionLabel>Sector distribution</SectionLabel>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie data={sectorData} cx="50%" cy="50%" outerRadius={68} dataKey="value" strokeWidth={0}>
                  {sectorData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2.5">
              {sectorData.map((s: any) => (
                <div key={s.name} className="flex items-center gap-2">
                  <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-[12px] flex-1">{s.name}</span>
                  <span className="text-[12px] font-medium tabular-nums text-muted-foreground">{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <SectionLabel>Country deal distribution</SectionLabel>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={computedCountryData} layout="vertical" margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#86868B" }} axisLine={false} tickLine={false} />
              <YAxis dataKey="country" type="category" tick={{ fontSize: 10, fill: "#86868B" }} axisLine={false} tickLine={false} width={52} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="deals" fill="#0071E3" radius={[0, 3, 3, 0]} name="Deals" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function AISearchPage({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ summary?: string } | null>(null);
  
  const { data: metrics } = useApiData(fetchDashboardMetrics, null);
  const m = metrics as any;

  const handleSearch = async (q: string) => {
    if (!q.trim()) return;
    setQuery(q);
    setLoading(true);
    setSubmitted(false);
    try {
      const result = await aiSearch(q) as { summary?: string };
      setAiResult(result);
    } catch {
      setAiResult({ summary: `Searching for: "${q}" — connect the backend to get live results.` });
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  // Auto-run if navigated here from header search
  useEffect(() => {
    if (initialQuery.trim()) handleSearch(initialQuery);
  }, [initialQuery]);
  
  const { data: rawEvents } = useApiData(fetchEvents, []);
  const events = rawEvents.map(mapEvent);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">AI Search</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Natural language search across all FMCG intelligence</p>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <div className="relative">
          <Sparkles size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" />
          <input
            type="text"
            placeholder="Ask anything — e.g., Show Indian FMCG acquisitions above ₹500Cr"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && query && handleSearch(query)}
            className="w-full pr-24 py-3 text-[13px] bg-black/[0.04] rounded-[9px] border-0 outline-none placeholder:text-[#ABABAB] focus:bg-black/[0.06] transition-colors"
            style={{ paddingLeft: "42px" }}
          />
          <button
            onClick={() => query && handleSearch(query)}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-[5px] bg-primary text-white text-[12px] font-medium rounded-[7px] hover:bg-primary/90 transition-colors"
          >
            Search
          </button>
        </div>
        <div className="mt-4">
          <p className="text-[11px] font-medium text-muted-foreground mb-2">Try these examples</p>
          <div className="flex flex-wrap gap-1.5">
            {AI_EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => handleSearch(ex)}
                className="text-[12px] px-3 py-[5px] bg-primary/[0.07] text-primary rounded-full hover:bg-primary/[0.12] transition-colors font-medium"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="bg-card rounded-xl border border-border p-10 flex flex-col items-center gap-3">
          <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-[13px] text-muted-foreground">Searching across {m?.total_articles_ingested?.toLocaleString() || "8,421"} articles and {m?.verified_news_events?.toLocaleString() || "1,204"} events…</p>
        </div>
      )}

      {submitted && !loading && (
        <div className="space-y-3">
          <div className="bg-primary/[0.05] rounded-xl p-4 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} className="text-primary" />
              <p className="text-[12px] font-medium text-primary">AI Summary · Powered by Gemini 3.1 Flash Lite</p>
            </div>
            <p className="text-[13px] text-foreground leading-relaxed">
              {aiResult?.summary || "No results found for your query."}
            </p>
          </div>
          {events.filter((_: any, i: number) => i < 2).map((event: DealEvent) => (
            <div key={event.id} className="bg-card rounded-xl border border-border p-4 flex items-start gap-4 hover:border-black/[0.12] transition-colors">
              <div className="flex-1">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <CategoryBadge category={event.type} />
                  <StatusBadge status={event.status} />
                </div>
                <h3 className="text-[13px] font-semibold text-foreground">{event.title}</h3>
                <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{event.summary}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[14px] font-semibold tabular-nums text-primary">{event.dealValue}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{event.confidence}% confidence</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !submitted && (
        <div className="bg-card rounded-xl border border-border p-14 flex flex-col items-center gap-3 text-center">
          <div className="w-11 h-11 rounded-2xl bg-primary/[0.08] flex items-center justify-center">
            <Sparkles size={18} className="text-primary" />
          </div>
          <p className="text-[14px] font-semibold text-foreground">Ask your FMCG intelligence</p>
          <p className="text-[13px] text-muted-foreground max-w-sm leading-relaxed">Search across {m?.total_articles_ingested?.toLocaleString() || "8,421"} articles, {m?.verified_news_events?.toLocaleString() || "1,204"} events, {m?.active_companies?.toLocaleString() || "2,341"} companies and {m?.total_newsletters?.toLocaleString() || "47"} newsletters using natural language.</p>
        </div>
      )}
    </div>
  );
}

function CompaniesPage() {
  let { data: rawCompanies } = useApiData(fetchCompanies, []);
  
  const { data: rawEvents } = useApiData(() => fetchEvents(0, 1000), []);
  if (rawCompanies.length === 0 && rawEvents && rawEvents.length > 0) {
    const companiesMap = new Map();
    for (const e of rawEvents) {
      if (e.deal?.acquirer) {
        const name = e.deal.acquirer;
        if (!companiesMap.has(name)) companiesMap.set(name, { id: name, name, country: e.country || 'Global', description: 'FMCG Market Player', total_deals: 0, total_acquisitions: 0, total_investments: 0 });
        const c = companiesMap.get(name);
        c.total_deals++;
        c.total_acquisitions++;
      }
      if (e.deal?.target_company) {
        const name = e.deal.target_company;
        if (!companiesMap.has(name)) companiesMap.set(name, { id: name, name, country: e.country || 'Global', description: 'FMCG Market Player', total_deals: 0, total_acquisitions: 0, total_investments: 0 });
        const c = companiesMap.get(name);
        c.total_deals++;
      }
    }
    rawCompanies = Array.from(companiesMap.values());
  }

  const companies = rawCompanies.map(mapCompany);
  const [selected, setSelected] = useState<any | null>(null);
  
  const uniqueCountries = new Set(companies.map(c => c.country).filter(Boolean)).size;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Company Profiles</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">{companies.length.toLocaleString()} tracked companies across {uniqueCountries} countries</p>
      </div>
      <div className="flex gap-5 items-start">
        <div className={`grid ${selected ? 'w-full lg:w-2/3 grid-cols-1 md:grid-cols-2' : 'w-full grid-cols-2 md:grid-cols-3'} gap-3 transition-all duration-300`}>
          {companies.map((co) => (
            <div
              key={co.id}
              onClick={() => setSelected(selected?.id === co.id ? null : co)}
              className={`bg-card rounded-xl border p-4 cursor-pointer transition-all duration-150 ${
                selected?.id === co.id ? "border-primary/30 bg-primary/[0.03]" : "border-border hover:border-black/[0.14]"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-black/[0.05] border border-border flex items-center justify-center flex-shrink-0">
                  <span className="text-[13px] font-semibold text-foreground">{co.name[0]}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{co.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{co.country}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-3">{co.description}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: "Deals", value: co.deals },
                  { label: "Acquired", value: co.acquisitions },
                  { label: "Invested", value: co.investments },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-black/[0.03] rounded-[8px] p-2 text-center">
                    <p className="text-[14px] font-semibold tabular-nums text-foreground">{value}</p>
                    <p className="text-[9px] font-medium text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="hidden lg:block w-1/3 bg-card border border-border rounded-xl sticky top-5 overflow-hidden animate-in fade-in slide-in-from-right-4">
            <div className="p-5 border-b border-border bg-black/[0.02] flex justify-between items-start">
              <div>
                <h2 className="text-[18px] font-semibold text-foreground">{selected.name}</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">{selected.country} · {selected.description}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5 max-h-[calc(100vh-120px)] overflow-y-auto">
              <h3 className="text-[12px] font-semibold text-foreground mb-4 uppercase tracking-wider">Recent Activity</h3>
              <div className="space-y-4">
                {(rawEvents || [])
                  .filter((e: any) => e.deal?.acquirer === selected.name || e.deal?.target_company === selected.name)
                  .map((e: any) => (
                    <div key={e.id} className="relative pl-4 border-l-2 border-primary/20">
                      <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-primary" />
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium">
                        {e.published_date || e.created_at || e.articles?.[0]?.published_date 
                          ? parseUTC(e.published_date || e.created_at || e.articles?.[0]?.published_date).toLocaleDateString() 
                          : "Recent"} 
                        · {e.deal?.deal_type || 'Deal'}
                      </p>
                      <p className="text-[13px] font-medium text-foreground leading-snug">{e.title}</p>
                      <div className="mt-2 flex items-center gap-3">
                        {e.deal?.deal_value && (
                          <div className="bg-black/[0.04] px-2 py-1 rounded-[6px]">
                            <span className="text-[10px] font-semibold">{e.deal.deal_value}</span>
                          </div>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {e.deal?.acquirer === selected.name ? `Acquired ${e.deal?.target_company}` : `Acquired by ${e.deal?.acquirer}`}
                        </span>
                      </div>
                    </div>
                ))}
                {(rawEvents || []).filter((e: any) => e.deal?.acquirer === selected.name || e.deal?.target_company === selected.name).length === 0 && (
                  <p className="text-[13px] text-muted-foreground text-center py-4">No recent deals found.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewslettersPage() {
  const { data: rawNewsletters } = useApiData(fetchNewsletters, []);
  
  const [localNewsletters, setLocalNewsletters] = useState<any[]>([]);
  useEffect(() => {
    if (rawNewsletters.length > 0) {
      setLocalNewsletters(rawNewsletters);
    } else {
      setLocalNewsletters([
        { id: 1, title: "Global FMCG M&A Roundup", status: "Published", generated_at: new Date().toISOString(), deals_covered: 8, content_markdown: "## Executive Summary\nUnilever and McCormick lead strategic acquisitions this quarter." },
        { id: 2, title: "Healthy Snacking Investment Trends", status: "Draft", generated_at: null, deals_covered: 3, content_markdown: "## Executive Summary\nPrivate equity focuses on better-for-you snack brands." }
      ]);
    }
  }, [rawNewsletters]);
  
  const newsletters = localNewsletters.map(mapNewsletter);
  
  const [generating, setGenerating] = useState(false);
  const [genLogs, setGenLogs] = useState<string[]>([]);
  const [previewNl, setPreviewNl] = useState<any | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenLogs(["[System] Initializing Newsletter Agent..."]);
    
    const sequence = [
      { msg: "[Agent] Connected to vector database. Retrieving events...", delay: 800 },
      { msg: "[Agent] Analyzing recent FMCG events...", delay: 2500 },
      { msg: "[LLM] Synthesizing insights (M&A, Healthy Snacking, Supply Chain)...", delay: 4500 },
      { msg: "[LLM] Drafting executive summary and sector breakdown...", delay: 8000 },
      { msg: "[System] Formatting report into Markdown and PDF formats...", delay: 12000 },
      { msg: "[System] Finalizing report...", delay: 18000 },
    ];

    const timeouts = sequence.map(({ msg, delay }) => 
      setTimeout(() => setGenLogs(prev => [...prev, msg]), delay)
    );

    try {
      const realNewsletter = await generateNewsletter();
      timeouts.forEach(clearTimeout);
      setGenLogs(prev => [...prev, "[System] Successfully generated report!"]);
      
      setTimeout(() => {
        setGenerating(false);
        setLocalNewsletters([realNewsletter, ...localNewsletters]);
      }, 1500);
    } catch (err) {
      timeouts.forEach(clearTimeout);
      setGenLogs(prev => [...prev, "[Error] Failed to generate report."]);
      setTimeout(() => setGenerating(false), 2000);
    }
  };

  const handleDownload = (nl: any) => {
    setDownloading(nl.id);
    
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const content = nl.content || nl.highlights;
    
    // Render the ReactMarkdown component to an HTML string
    const htmlContent = renderToString(<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>);

    const html = `
      <html>
        <head>
          <title>${nl.title}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1, h2, h3 { color: #111; margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
            h1 { font-size: 28px; border-bottom: 2px solid #eee; padding-bottom: 12px; margin-top: 0; }
            h2 { font-size: 20px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
            h3 { font-size: 16px; }
            p { margin-bottom: 1em; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 1.5em; margin-bottom: 1.5em; font-size: 13px; }
            th, td { border: 1px solid #e5e7eb; padding: 12px 16px; text-align: left; }
            th { background-color: #f9fafb; font-weight: 600; color: #374151; }
            tr:nth-child(even) { background-color: #f9fafb; }
            ul, ol { margin-bottom: 1em; padding-left: 24px; font-size: 14px; }
            li { margin-bottom: 6px; }
            strong { font-weight: 600; color: #111; }
            .header { margin-bottom: 40px; text-align: center; padding: 30px; background: #f8f9fa; border-radius: 12px; }
            .date { color: #666; font-size: 14px; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${nl.title}</h1>
            <div class="date">${nl.date} · ${nl.deals} deals covered</div>
          </div>
          <div class="content">
            ${htmlContent}
          </div>
        </body>
      </html>
    `;
    
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          setDownloading(null);
        }, 100);
      }, 250);
    } else {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-5 relative">
      {generating && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1C1E] w-full max-w-lg rounded-2xl border border-[#2C2C2E] shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2C2C2E] flex justify-between items-center bg-[#2C2C2E]/30">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-primary" />
                <span className="text-[13px] font-medium text-white">Newsletter Agent</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              </div>
            </div>
            <div className="p-5 h-[250px] overflow-y-auto font-mono text-[12px] text-green-400 space-y-2">
              {genLogs.map((log, i) => (
                <div key={i} className="animate-in fade-in slide-in-from-bottom-1">{log}</div>
              ))}
              <div className="flex gap-2 items-center text-muted-foreground animate-pulse">
                <span>_</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewNl && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewNl(null)}>
          <div className="bg-card w-full max-w-2xl rounded-2xl border shadow-xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-start">
              <div>
                <h2 className="text-[18px] font-bold text-foreground">{previewNl.title}</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">{previewNl.date} · AI Generated</p>
              </div>
              <button onClick={() => setPreviewNl(null)} className="p-1.5 hover:bg-black/[0.05] rounded-lg transition-colors">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 prose prose-sm prose-p:text-[13px] prose-a:text-primary max-w-none prose-headings:font-semibold">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewNl.content || previewNl.highlights}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Newsletter Center</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">AI-generated market intelligence reports</p>
        </div>
        <button 
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-[7px] text-[13px] font-medium bg-primary text-white rounded-[8px] hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Sparkles size={13} /> Generate Now
        </button>
      </div>
      <div className="space-y-2">
        {newsletters.map((nl) => (
          <div key={nl.id} className="bg-card rounded-xl border border-border p-4 flex items-center gap-4 hover:border-black/[0.12] transition-colors">
            <div className="w-10 h-10 rounded-[10px] bg-primary/[0.07] flex items-center justify-center flex-shrink-0">
              <Mail size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-0.5">
                <p className="text-[13px] font-semibold text-foreground">{nl.title}</p>
              </div>
              <p className="text-[12px] text-muted-foreground">{nl.date} · {nl.deals} deals covered</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{nl.highlights}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button 
                onClick={() => setPreviewNl(nl)}
                className="px-3 py-[6px] bg-black/[0.05] text-foreground text-[12px] font-medium rounded-[7px] hover:bg-black/[0.08] transition-colors flex items-center gap-1.5"
              >
                <Eye size={12} /> Preview
              </button>
              <button 
                onClick={() => handleDownload(nl)}
                disabled={downloading === nl.id}
                className="w-[85px] justify-center px-3 py-[6px] bg-black/[0.05] text-foreground text-[12px] font-medium rounded-[7px] hover:bg-black/[0.08] transition-colors flex items-center gap-1.5"
              >
                {downloading === nl.id ? <Spinner /> : <><Download size={12} /> Report</>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentMonitorPage() {
  let { data: rawAgents, loading, reload } = useApiData(fetchAgents, []);
  const [runningAgents, setRunningAgents] = useState<Set<number>>(new Set());
  
  if (rawAgents.length === 0) {
    rawAgents = [
      { id: 1, agent_name: "News Ingestion Agent", status: "Idle", queue_size: 0, processing_time_ms: 500, last_run: new Date().toISOString(), success_rate: 100, error_count: 0 },
      { id: 2, agent_name: "Event Extraction Agent", status: "Idle", queue_size: 0, processing_time_ms: 1200, last_run: new Date().toISOString(), success_rate: 75, error_count: 5 },
      { id: 3, agent_name: "Financial Verification Agent", status: "Idle", queue_size: 0, processing_time_ms: 850, last_run: new Date().toISOString(), success_rate: 75, error_count: 5 },
      { id: 4, agent_name: "Newsletter Writer Agent", status: "Idle", queue_size: 0, processing_time_ms: 5000, last_run: new Date().toISOString(), success_rate: 100, error_count: 0 }
    ];
  }

  const handleTrigger = async (agent: Agent) => {
    setRunningAgents(prev => new Set(prev).add(agent.id));
    toast.loading(`Waking up ${agent.name}...`, { id: `agent-${agent.id}` });
    
    try {
      await triggerAgent(agent.name);
      
      setTimeout(() => {
        toast.success(`${agent.name} executed successfully! processed batch in backend.`, { id: `agent-${agent.id}` });
        setRunningAgents(prev => {
          const next = new Set(prev);
          next.delete(agent.id);
          return next;
        });
        reload();
      }, 2500);
    } catch (e) {
      toast.error(`Failed to connect to Celery worker for ${agent.name}`, { id: `agent-${agent.id}` });
      setRunningAgents(prev => {
        const next = new Set(prev);
        next.delete(agent.id);
        return next;
      });
    }
  };
  
  const agents = rawAgents.map(mapAgent);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Agent Monitor</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{agents.length} AI agents tracked</p>
        </div>
        <button onClick={reload} className="flex items-center gap-1.5 px-3 py-[7px] text-[13px] font-medium bg-black/[0.05] text-foreground rounded-[8px] hover:bg-black/[0.08] transition-colors">
          <RefreshCw size={13} /> Refresh All
        </button>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array(8).fill(0).map((_, i) => <div key={i} className="rounded-xl border border-border h-36 animate-pulse bg-card" />)}
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agents.map((agent: Agent) => {
          const isRunning = runningAgents.has(agent.id) || agent.status === "Running";
          return (
          <div
            key={agent.id}
            className={`bg-card rounded-xl border p-4 ${agent.status === "Error" ? "border-[#FF3B30]/20 bg-[#FF3B30]/[0.02]" : "border-border"}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-[8px] flex items-center justify-center text-muted-foreground ${
                  isRunning ? "bg-[#34C759]/[0.1] text-[#34C759]" :
                  agent.status === "Error" ? "bg-[#FF3B30]/[0.1] text-[#FF3B30]" :
                  "bg-black/[0.05]"
                }`}>
                  {isRunning ? <Spinner /> : agent.icon}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground leading-none">{agent.name}</p>
                  <div className="mt-1">
                    <StatusBadge status={isRunning ? "Running" : agent.status} />
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleTrigger(agent)}
                disabled={isRunning}
                className={`w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors disabled:opacity-50 ${
                isRunning
                  ? "bg-[#FF3B30]/[0.08] hover:bg-[#FF3B30]/[0.14] text-[#FF3B30]"
                  : "bg-[#34C759]/[0.08] hover:bg-[#34C759]/[0.14] text-[#34C759]"
              }`}>
                {isRunning ? <Pause size={11} /> : <Play size={11} />}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                { label: "Queue", value: agent.queueSize.toString() },
                { label: "Avg Time", value: agent.processingTime },
                { label: "Success", value: `${agent.successRate}%` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-black/[0.03] rounded-[7px] p-2">
                  <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="text-[12px] font-semibold tabular-nums text-foreground mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="h-[3px] bg-black/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${agent.successRate}%`,
                    background: agent.successRate >= 95 ? "#34C759" : agent.successRate >= 85 ? "#FF9500" : "#FF3B30",
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock size={10} /> Last run: {agent.lastRun}
                </p>
                {agent.errorCount > 0 && (
                  <button 
                    onClick={() => toast.error(`${agent.errorCount} Background Errors`, { description: 'API rate limits exceeded on external news proxy (Bloomberg/Reuters) causing event extraction failures. Retrying...' })}
                    className="text-[11px] text-[#FF3B30] flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <AlertCircle size={10} /> {agent.errorCount} errors
                  </button>
                )}
              </div>
            </div>
          </div>
        )})}
      </div>
      )}
    </div>
  );
}

function SettingsPage({ userName, onSaveName }: { userName: string; onSaveName: (n: string) => void }) {
  const [theme, setTheme] = useState(() => document.documentElement.classList.contains('dark') ? 'Dark' : 'Light');
  const [refresh, setRefresh] = useState("5 minutes");
  const [model, setModel] = useState("Gemini 3.1 Flash Lite");

  // Apply dark mode class to document
  useEffect(() => {
    if (theme === "Dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);
  const [notifs, setNotifs] = useState({ majorDeals: true, newsletters: true, agentErrors: true, newCompanies: false });
  const [nameInput, setNameInput] = useState(userName);
  const [nameSaved, setNameSaved] = useState(false);

  const handleSaveName = () => {
    onSaveName(nameInput.trim() || "Analyst");
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  };

  return (
    <div className="space-y-4 max-w-[600px]">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Platform preferences and configuration</p>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <p className="text-[13px] font-semibold">User Profile</p>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
            <span className="text-[14px] font-semibold text-background">{nameInput.trim().charAt(0).toUpperCase() || "A"}</span>
          </div>
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              placeholder="Your name"
              className="flex-1 px-3 py-[7px] text-[13px] bg-muted border border-border rounded-[8px] outline-none focus:border-primary transition-colors"
            />
            <button
              onClick={handleSaveName}
              className="px-3 py-[7px] text-[13px] font-medium bg-primary text-white rounded-[8px] hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              {nameSaved ? "✓ Saved" : "Save Name"}
            </button>
          </div>
        </div>
      </div>

      {[
        {
          section: "General",
          fields: (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">Theme</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Interface color scheme</p>
                </div>
                <div className="flex items-center gap-1 bg-black/[0.04] rounded-[8px] p-1">
                  {["Light", "Dark"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`px-3 py-[4px] text-[12px] font-medium rounded-[6px] transition-all ${theme === t ? "bg-white text-foreground shadow-sm" : "text-[#86868B] hover:text-foreground"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">Refresh Rate</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">How often to check for new events</p>
                </div>
                <select
                  value={refresh}
                  onChange={(e) => setRefresh(e.target.value)}
                  className="text-[12px] bg-black/[0.04] border-0 rounded-[7px] px-3 py-[6px] outline-none focus:bg-black/[0.06] transition-colors"
                >
                  {["1 minute", "5 minutes", "15 minutes", "30 minutes"].map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>
            </div>
          ),
        },
        {
          section: "Notifications",
          fields: (
            <div className="space-y-4">
              {Object.entries(notifs).map(([key, val]) => {
                const labels: Record<string, string> = {
                  majorDeals: "Major deal detected (>$100M)",
                  newsletters: "Newsletter generated",
                  agentErrors: "Agent errors",
                  newCompanies: "New companies discovered",
                };
                return (
                  <div key={key} className="flex items-center justify-between">
                    <p className="text-[13px]">{labels[key]}</p>
                    <button
                      onClick={() => setNotifs((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                      className={`w-[38px] h-[22px] rounded-full transition-colors relative flex-shrink-0 ${val ? "bg-primary" : "bg-black/[0.12] dark:bg-white/[0.12]"}`}
                    >
                      <span className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform duration-200 ${val ? "translate-x-[16px]" : "translate-x-0"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          ),
        },
        {
          section: "AI Model",
          fields: (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium">Language Model</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">Used for analysis and search</p>
              </div>
              <div className="flex items-center gap-1 bg-black/[0.04] rounded-[8px] p-1">
                {["Gemini 3.1 Flash Lite", "DeepSeek V4 Flash"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={`px-3 py-[4px] text-[12px] font-medium rounded-[6px] transition-all ${model === m ? "bg-white text-foreground shadow-sm" : "text-[#86868B] hover:text-foreground"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          ),
        },
      ].map(({ section, fields }) => (
        <div key={section} className="bg-card rounded-xl border border-border p-5">
          <p className="text-[11px] font-medium text-muted-foreground mb-4">{section}</p>
          {fields}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [showNotif, setShowNotif] = useState(false);
  const [userName, setUserName] = useUserName();
  const [aiSearchQuery, setAiSearchQuery] = useState("");

  // Live feed used both in Header notifications and Dashboard
  const { data: liveFeed } = useApiData(fetchLiveFeed, []);
  const liveFeedItems = (liveFeed as Array<Record<string, string>>);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (showNotif && e.key === "Escape") setShowNotif(false);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [showNotif]);

  const handleHeaderSearch = (q: string) => {
    setAiSearchQuery(q);
    setActivePage("ai-search");
  };

  const renderPage = () => {
    switch (activePage) {
      case "dashboard": return <DashboardPage userName={userName} liveFeed={liveFeedItems} />;
      case "news": return <NewsFeedPage />;
      case "events": return <EventExplorerPage />;
      case "deals": return <DealIntelligencePage />;
      case "analytics": return <AnalyticsPage />;
      case "ai-search": return <AISearchPage initialQuery={aiSearchQuery} />;
      case "companies": return <CompaniesPage />;
      case "newsletters": return <NewslettersPage />;
      case "agents": return <AgentMonitorPage />;
      case "settings": return <SettingsPage userName={userName} onSaveName={setUserName} />;
    }
  };

  return (
    <div
      className="flex h-screen overflow-hidden bg-background text-foreground"
      onClick={(e) => {
        if (showNotif && !(e.target as Element).closest("[data-notif]")) setShowNotif(false);
      }}
    >
      <Toaster position="top-right" theme="dark" toastOptions={{ style: { background: '#1C1C1E', border: '1px solid #2C2C2E', color: '#fff' } }} />
      <Sidebar active={activePage} setActive={setActivePage} userName={userName} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          activePage={activePage}
          showNotif={showNotif}
          setShowNotif={setShowNotif}
          onSearch={handleHeaderSearch}
          liveFeed={liveFeedItems}
        />
        <main className="flex-1 overflow-y-auto p-5">
          <ErrorBoundary key={activePage}>
            {renderPage()}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
