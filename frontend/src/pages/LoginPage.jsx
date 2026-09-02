import { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "../api";

const DarkParticle  = lazy(() => import("../themes/DarkParticle"));
const LightGlass    = lazy(() => import("../themes/LightGlass"));
const CyberpunkGrid = lazy(() => import("../themes/CyberpunkGrid"));

const THEMES = [
  {
    id: "dark",
    label: "Particle Field",
    description: "Dark · Electric blue",
    bg: "#080810",
    accent: "#60a5fa",
    card: "rgba(255,255,255,0.05)",
    border: "rgba(255,255,255,0.08)",
    text: "#e2e8f0",
    subtext: "#94a3b8",
    inputBg: "rgba(255,255,255,0.06)",
    preview: "linear-gradient(135deg, #080810 0%, #1e2a4a 100%)",
  },
  {
    id: "light",
    label: "Light Glass",
    description: "Frosted · Indigo bloom",
    bg: "#eef2ff",
    accent: "#6366f1",
    card: "rgba(255,255,255,0.7)",
    border: "rgba(255,255,255,0.5)",
    text: "#1e1b4b",
    subtext: "#6366f1",
    inputBg: "rgba(255,255,255,0.6)",
    preview: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
  },
  {
    id: "cyber",
    label: "Cyberpunk Grid",
    description: "Dark · Neon green",
    bg: "#000000",
    accent: "#00ff88",
    card: "rgba(0,255,136,0.04)",
    border: "rgba(0,255,136,0.15)",
    text: "#00ff88",
    subtext: "#00cfff",
    inputBg: "rgba(0,255,136,0.05)",
    preview: "linear-gradient(135deg, #000000 0%, #001a0d 100%)",
  },
];

const SCENES = { dark: DarkParticle, light: LightGlass, cyber: CyberpunkGrid };

export default function LoginPage({ onLogin }) {
  const [themeId, setThemeId]   = useState("dark");
  const [mode, setMode]         = useState("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  const theme = THEMES.find(t => t.id === themeId);
  const Scene = SCENES[themeId];

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("theme", themeId);
      onLogin(data.user, themeId);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
      <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: theme.bg }} />}>
        <Scene />
      </Suspense>

      {/* Content layer */}
      <div style={{
        position: "relative", zIndex: 10,
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 32, padding: 24,
      }}>

        {/* Theme picker strip */}
        <div style={{ display: "flex", gap: 12 }}>
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => setThemeId(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px",
                background: t.id === themeId ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                border: t.id === themeId ? `1px solid ${t.accent}` : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, cursor: "pointer", transition: "background 0.15s, border-color 0.15s",
                color: theme.text,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: t.preview, border: `2px solid ${t.accent}44`,
                flexShrink: 0,
              }} />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{t.label}</div>
                <div style={{ fontSize: 10, color: theme.subtext }}>{t.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Login card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={themeId}
            initial={{ opacity: 0, y: 16, scale: 0.97, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(4px)" }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            style={{
              width: "100%", maxWidth: 400,
              background: theme.card,
              backdropFilter: "blur(24px)",
              border: `1px solid ${theme.border}`,
              borderRadius: 20,
              padding: 36,
            }}
          >
            {/* Logo */}
            <div style={{ marginBottom: 28, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, letterSpacing: "-0.03em" }}>
                recon<span style={{ color: theme.accent }}>·</span>forecast
              </div>
              <div style={{ fontSize: 13, color: theme.subtext, marginTop: 4 }}>
                Bank reconciliation & liquidity intelligence
              </div>
            </div>

            {/* Mode toggle */}
            <div style={{
              display: "flex", background: "rgba(0,0,0,0.15)",
              borderRadius: 10, padding: 3, marginBottom: 24,
            }}>
              {["login", "signup"].map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(""); }}
                  style={{
                    flex: 1, padding: "8px 0", border: "none", borderRadius: 8,
                    background: mode === m ? theme.accent : "transparent",
                    color: mode === m ? "#fff" : theme.subtext,
                    fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {m === "login" ? "Sign in" : "Sign up"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: theme.subtext, display: "block", marginBottom: 6 }}>
                  Email
                </label>
                <input
                  type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  style={{
                    width: "100%", padding: "10px 14px", boxSizing: "border-box",
                    background: theme.inputBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10, fontSize: 14, color: theme.text,
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: theme.subtext, display: "block", marginBottom: 6 }}>
                  Password
                </label>
                <input
                  type="password" required value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min 8 characters" : "••••••••"}
                  style={{
                    width: "100%", padding: "10px 14px", boxSizing: "border-box",
                    background: theme.inputBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10, fontSize: 14, color: theme.text,
                    outline: "none",
                  }}
                />
              </div>

              {error && (
                <div style={{
                  padding: "8px 12px", borderRadius: 8,
                  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                  color: "#f87171", fontSize: 13,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                style={{
                  marginTop: 6, padding: "12px 0",
                  background: theme.accent, color: themeId === "light" ? "#fff" : "#000",
                  border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15,
                  cursor: loading ? "wait" : "pointer",
                  opacity: loading ? 0.7 : 1, transition: "opacity 0.2s",
                }}
              >
                {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
