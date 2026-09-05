import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "./api";
import { useIsMobile } from "./hooks/useIsMobile";

import LoginPage from "./pages/LoginPage";
import ReconciliationPage from "./pages/ReconciliationPage";
import ForecastPage from "./pages/ForecastPage";
import AlertsPage from "./pages/AlertsPage";
const DarkParticle = lazy(() => import("./themes/DarkParticle"));

const UploadPage      = lazy(() => import("./pages/UploadPage"));
const ChatPage        = lazy(() => import("./pages/ChatPage"));
const ConnectionsPage = lazy(() => import("./pages/ConnectionsPage"));
const SettingsPage    = lazy(() => import("./pages/SettingsPage"));
const AuditTrailPage  = lazy(() => import("./pages/AuditTrailPage"));

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
  { key: "reconciliation", label: "Match & Review",  path: "/dashboard" },
  { key: "forecast",       label: "Cash Outlook",    path: "/dashboard/forecast" },
  { key: "alerts",         label: "Warnings",        path: "/dashboard/alerts" },
  { key: "upload",         label: "Upload",          path: "/dashboard/upload" },
  { key: "ai",             label: "AI Chat",         path: "/dashboard/ai" },
  { key: "connections",    label: "Connections",     path: "/dashboard/connections" },
  { key: "settings",       label: "Settings",        path: "/dashboard/settings" },
  { key: "audit",          label: "Activity",        path: "/dashboard/audit" },
];

const fmtBalance = (p) =>
  p == null ? "" : new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    notation: "compact", maximumFractionDigits: 1,
  }).format(p / 100);

function AccountSwitcher({ accounts, accountId, setAccountId, onAddAccount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = accounts.find(a => a.id === accountId);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const safe = !active || active.current_balance_paise >= active.min_threshold_paise;

  return (
    <div ref={ref} style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${T.hairline}` }}>
      <div style={{ fontSize: 10, color: T.inkSubtle, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
        Account
      </div>

      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", textAlign: "left", background: "rgba(255,255,255,0.04)",
          border: `1px solid ${open ? T.accent : T.hairline}`,
          borderRadius: 9, padding: "8px 10px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "border-color 0.15s",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {active?.name ?? "Select account"}
          </div>
          {active && (
            <div style={{ fontSize: 11, marginTop: 2, fontVariantNumeric: "tabular-nums", color: safe ? T.success : T.danger }}>
              {fmtBalance(active.current_balance_paise)}
              {active.has_active_alert && <span style={{ marginLeft: 4 }}>⚠</span>}
              {active.account_type === "savings" && (
                <span style={{ marginLeft: 6, color: T.inkSubtle }}>savings</span>
              )}
            </div>
          )}
        </div>
        <span style={{ color: T.inkMuted, fontSize: 10, marginLeft: 6, flexShrink: 0 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", zIndex: 200, left: 12, right: 12,
          marginTop: 4,
          background: "#1a1f28",
          border: `1px solid ${T.hairline}`,
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}>
          {accounts.map(a => {
            const isCurrent = a.id === accountId;
            const acctSafe = a.current_balance_paise >= a.min_threshold_paise;
            return (
              <button
                key={a.id}
                onClick={() => { setAccountId(a.id); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left", padding: "10px 14px",
                  background: isCurrent ? "rgba(56,139,253,0.12)" : "transparent",
                  border: "none", borderBottom: `1px solid ${T.hairline}`,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: isCurrent ? 600 : 400, color: isCurrent ? T.accent : T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.name}
                    {isCurrent && <span style={{ marginLeft: 6, fontSize: 10, color: T.accent }}>●</span>}
                  </div>
                  <div style={{ fontSize: 11, color: acctSafe ? T.success : T.danger, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
                    {fmtBalance(a.current_balance_paise)}
                    {a.account_type === "savings" && <span style={{ marginLeft: 6, color: T.inkSubtle }}>savings</span>}
                  </div>
                </div>
              </button>
            );
          })}
          <button
            onClick={() => { setOpen(false); onAddAccount(); }}
            style={{
              width: "100%", textAlign: "left", padding: "9px 14px",
              background: "transparent", border: "none",
              color: T.inkMuted, fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ fontSize: 14, color: T.accent }}>＋</span> Add account
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar({ accounts, accountId, setAccountId, alertCount, health, user, onLogout, isMobile, open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeAccount = accounts.find(a => a.id === accountId);

  function handleNav(path) {
    navigate(path);
    if (isMobile) onClose();
  }

  const sidebarStyle = isMobile ? {
    position: "fixed", top: 0, left: open ? 0 : -260, height: "100vh",
    width: 240, zIndex: 100,
    background: "rgba(10,13,20,0.98)",
    backdropFilter: "blur(24px)",
    borderRight: `1px solid ${T.hairline}`,
    display: "flex", flexDirection: "column",
    transition: "left 0.25s cubic-bezier(0.4,0,0.2,1)",
    overflowY: "auto",
  } : {
    width: 200, flexShrink: 0,
    background: T.sidebarBg,
    backdropFilter: "blur(20px)",
    borderRight: `1px solid ${T.hairline}`,
    display: "flex", flexDirection: "column",
  };

  return (
    <>
      {isMobile && open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 99,
            backdropFilter: "blur(2px)",
          }}
        />
      )}
      <aside style={sidebarStyle}>
        <div style={{ padding: "20px 16px 16px", borderBottom: `1px solid ${T.hairline}` }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.03em", color: T.ink }}>
            recon<span style={{ color: T.accent }}>·</span>forecast
          </div>
          <div style={{ fontSize: 11, color: T.inkSubtle, marginTop: 2 }}>Liquidity Intelligence</div>
        </div>

        <AccountSwitcher
          accounts={accounts}
          accountId={accountId}
          setAccountId={(id) => { setAccountId(id); if (isMobile) onClose(); }}
          onAddAccount={() => handleNav("/dashboard/settings")}
        />

        <nav style={{ flex: 1, padding: "4px 8px" }}>
          {NAV.map(n => {
            const active = location.pathname === n.path ||
              (n.path !== "/dashboard" && location.pathname.startsWith(n.path));
            return (
              <button
                key={n.key}
                onClick={() => handleNav(n.path)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", textAlign: "left",
                  padding: isMobile ? "10px 12px" : "7px 10px",
                  marginBottom: 2, border: "none",
                  borderLeft: `2px solid ${active ? T.accent : "transparent"}`,
                  borderRadius: 8,
                  background: active ? T.surface2 : "transparent",
                  color: active ? T.ink : T.inkMuted,
                  fontSize: isMobile ? 14 : 13,
                  fontWeight: active ? 500 : 400, cursor: "pointer",
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
    </>
  );
}

function Dashboard({ user, onLogout }) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accounts, setAccounts]       = useState([]);
  const [accountId, setAccountId]     = useState("");
  const [batchId, setBatchId]         = useState(null);
  const [alertCount, setAlertCount]   = useState(0);
  const [health, setHealth]           = useState(null);

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

  // Close sidebar on route change on mobile
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative", flexDirection: "column" }}>
      <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "#080810", zIndex: 0 }} />}>
        <DarkParticle />
      </Suspense>

      {/* Mobile top bar */}
      {isMobile && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 52,
          display: "flex", alignItems: "center", gap: 12, padding: "0 16px",
          background: "rgba(10,13,20,0.92)",
          backdropFilter: "blur(20px)",
          borderBottom: `1px solid ${T.hairline}`,
          zIndex: 98,
          flexShrink: 0,
        }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Open menu"
            style={{
              background: "none", border: "none", color: T.ink,
              cursor: "pointer", padding: "6px 4px", lineHeight: 1,
              fontSize: 22, display: "flex", alignItems: "center",
            }}
          >
            ☰
          </button>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.03em", color: T.ink }}>
            recon<span style={{ color: T.accent }}>·</span>forecast
          </div>
        </div>
      )}

      <div style={{
        position: "relative", zIndex: 10, display: "flex",
        width: "100%", flex: 1, overflow: "hidden",
        paddingTop: isMobile ? 52 : 0,
        boxSizing: "border-box",
      }}>
        <Sidebar
          accounts={accounts} accountId={accountId} setAccountId={setAccountId}
          alertCount={alertCount} health={health} user={user} onLogout={onLogout}
          isMobile={isMobile} open={sidebarOpen} onClose={() => setSidebarOpen(false)}
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
                style={{
                  minHeight: "100%",
                  padding: isMobile ? "16px" : "28px 32px",
                  boxSizing: "border-box",
                }}
              >
                <Routes location={location}>
                  <Route path="/" element={<ReconciliationPage accountId={accountId} batchId={batchId} />} />
                  <Route path="/forecast"    element={<ForecastPage accountId={accountId} accent={T.accent} />} />
                  <Route path="/alerts"      element={<AlertsPage accountId={accountId} />} />
                  <Route path="/upload"      element={<UploadPage theme={T} accountId={accountId} />} />
                  <Route path="/ai"          element={<ChatPage theme={T} accountId={accountId} />} />
                  <Route path="/connections" element={<ConnectionsPage theme={T} />} />
                  <Route path="/settings"   element={<SettingsPage />} />
                  <Route path="/audit"      element={<AuditTrailPage accountId={accountId} />} />
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
