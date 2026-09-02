import { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "./api";

import LoginPage from "./pages/LoginPage";
import ReconciliationPage from "./pages/ReconciliationPage";
import ForecastPage from "./pages/ForecastPage";
import AlertsPage from "./pages/AlertsPage";
const DarkParticle = lazy(() => import("./themes/DarkParticle"));

const UploadPage      = lazy(() => import("./pages/UploadPage"));
const ChatPage        = lazy(() => import("./pages/ChatPage"));
const ConnectionsPage = lazy(() => import("./pages/ConnectionsPage"));

// Single design token set — dark particle field
const T = {
  accent:    "#388bfd",
  surface:   "#0f1117",
  surface1:  "#161b22",
  surface2:  "rgba(255,255,255,0.05)",
  hairline:  "rgba(255,255,255,0.07)",
  ink:       "#e2e8f0",
  inkMuted:  "#94a3b8",
  inkSubtle: "#475569",
  success:   "#22c55e",
  danger:    "#f87171",
  warning:   "#f59e0b",
  sidebarBg: "rgba(13,17,23,0.85)",
};

// Sync CSS custom properties once at load
const CSS_VARS = {
  "--canvas":        "#0f1117",
  "--surface-1":     "#161b22",
  "--surface-2":     "#1c2128",
  "--surface-3":     "#21262d",
  "--hairline":      "#30363d",
  "--hairline-soft": "#21262d",
  "--ink":           "#e6edf3",
  "--ink-muted":     "#8b949e",
  "--ink-subtle":    "#484f58",
  "--accent":        "#388bfd",
  "--accent-hover":  "#58a6ff",
  "--success":       "#3fb950",
  "--warning":       "#d29922",
  "--danger":        "#f85149",
};
Object.entries(CSS_VARS).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));

const NAV = [
  { key: "reconciliation", label: "Reconciliation", path: "/dashboard" },
  { key: "forecast",       label: "Forecast",       path: "/dashboard/forecast" },
  { key: "alerts",         label: "Alerts",         path: "/dashboard/alerts" },
  { key: "upload",         label: "Upload",         path: "/dashboard/upload" },
  { key: "ai",             label: "AI Agent",       path: "/dashboard/ai" },
  { key: "connections",    label: "Connections",    path: "/dashboard/connections" },
];

const fmtBalance = (p) =>
  p == null ? "" : new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    notation: "compact", maximumFractionDigits: 1,
  }).format(p / 100);

function Sidebar({ accounts, accountId, setAccountId, alertCount, health, user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeAccount = accounts.find(a => a.id === accountId);

  return (
    <aside style={{
      width: 200, flexShrink: 0,
      background: T.sidebarBg,
      backdropFilter: "blur(20px)",
      borderRight: `1px solid ${T.hairline}`,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "20px 16px 16px", borderBottom: `1px solid ${T.hairline}` }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.03em", color: T.ink }}>
          recon<span style={{ color: T.accent }}>·</span>forecast
        </div>
        <div style={{ fontSize: 11, color: T.inkSubtle, marginTop: 2 }}>Liquidity Intelligence</div>
      </div>

      <div style={{ padding: "12px 12px 8px" }}>
        <div style={{ fontSize: 11, color: T.inkMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Account
        </div>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          style={{
            width: "100%", padding: "6px 8px",
            background: T.surface2, border: `1px solid ${T.hairline}`,
            borderRadius: 8, color: T.ink, fontSize: 13,
          }}
        >
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {activeAccount && (
          <div style={{
            fontSize: 11, marginTop: 5, fontVariantNumeric: "tabular-nums",
            color: activeAccount.current_balance_paise >= activeAccount.min_threshold_paise
              ? T.success : T.danger,
          }}>
            {fmtBalance(activeAccount.current_balance_paise)}
            {activeAccount.has_active_alert && <span style={{ marginLeft: 4 }}>⚠</span>}
          </div>
        )}
      </div>

      <nav style={{ flex: 1, padding: "4px 8px" }}>
        {NAV.map(n => {
          const active = location.pathname === n.path ||
            (n.path !== "/dashboard" && location.pathname.startsWith(n.path));
          return (
            <button
              key={n.key}
              onClick={() => navigate(n.path)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", textAlign: "left",
                padding: "7px 10px", marginBottom: 2, border: "none",
                borderLeft: `2px solid ${active ? T.accent : "transparent"}`,
                borderRadius: 8,
                background: active ? T.surface2 : "transparent",
                color: active ? T.ink : T.inkMuted,
                fontSize: 13, fontWeight: active ? 500 : 400, cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {n.label}
              {n.key === "alerts" && alertCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, minWidth: 18,
                  background: T.danger, color: "#fff",
                  borderRadius: 9999, padding: "1px 5px",
                }}>
                  {alertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {health && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${T.hairline}`, fontSize: 11, color: T.inkSubtle }}>
          {["db", "dynamo", "sns"].map(s => (
            <span key={s} style={{ marginRight: 8 }}>
              <span style={{ color: health[s] === "ok" ? T.success : T.danger }}>●</span> {s}
            </span>
          ))}
        </div>
      )}

      <div style={{ padding: "10px 14px", borderTop: `1px solid ${T.hairline}`, fontSize: 12, color: T.inkMuted }}>
        <div style={{ marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user?.email}
        </div>
        <button
          onClick={onLogout}
          style={{
            padding: "5px 10px", background: "transparent",
            border: `1px solid ${T.hairline}`, borderRadius: 7,
            color: T.inkSubtle, fontSize: 12, cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function Dashboard({ user, onLogout }) {
  const location = useLocation();
  const [accounts, setAccounts]     = useState([]);
  const [accountId, setAccountId]   = useState("");
  const [batchId, setBatchId]       = useState(null);
  const [alertCount, setAlertCount] = useState(0);
  const [health, setHealth]         = useState(null);

  useEffect(() => {
    apiFetch("/accounts")
      .then(data => { setAccounts(data); if (data.length) setAccountId(data[0].id); })
      .catch(() => {});
    apiFetch("/alerts")
      .then(d => setAlertCount(d.total ?? 0))
      .catch(() => {});
    apiFetch("/health")
      .then(setHealth)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!accountId) return;
    setBatchId(null);
    apiFetch(`/reconciliation/summary?account_id=${accountId}`)
      .then(d => setBatchId(d.batch_id))
      .catch(() => setBatchId(null));
  }, [accountId]);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative" }}>
      <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "#080810", zIndex: 0 }} />}>
        <DarkParticle />
      </Suspense>

      <div style={{ position: "relative", zIndex: 10, display: "flex", width: "100%", height: "100%" }}>
        <Sidebar
          accounts={accounts} accountId={accountId} setAccountId={setAccountId}
          alertCount={alertCount} health={health} user={user} onLogout={onLogout}
        />

        <main style={{ flex: 1, overflowY: "auto", color: T.ink, position: "relative" }}>
          <Suspense fallback={<div style={{ padding: 32, color: T.inkMuted }}>Loading…</div>}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                style={{ minHeight: "100%", padding: "28px 32px", boxSizing: "border-box" }}
              >
                <Routes location={location}>
                  <Route path="/" element={<ReconciliationPage accountId={accountId} batchId={batchId} />} />
                  <Route path="/forecast"    element={<ForecastPage accountId={accountId} accent={T.accent} />} />
                  <Route path="/alerts"      element={<AlertsPage />} />
                  <Route path="/upload"      element={<UploadPage theme={T} accountId={accountId} />} />
                  <Route path="/ai"          element={<ChatPage theme={T} accountId={accountId} />} />
                  <Route path="/connections" element={<ConnectionsPage theme={T} />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  });

  function handleLogin(userData) {
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />}
        />
        <Route
          path="/dashboard/*"
          element={user ? <Dashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
