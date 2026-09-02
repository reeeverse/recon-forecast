import { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { apiFetch } from "../api";

const DarkParticle = lazy(() => import("../themes/DarkParticle"));

const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";
const ACCENT = "#60a5fa";
const INPUT_BG = "rgba(255,255,255,0.06)";

export default function LoginPage({ onLogin }) {
  const [mode, setMode]         = useState("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

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
      onLogin(data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
      <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "#080810", zIndex: 0 }} />}>
        <DarkParticle />
      </Suspense>

      <div style={{
        position: "relative", zIndex: 10,
        minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          style={{
            width: "100%", maxWidth: 400,
            background: CARD,
            backdropFilter: "blur(24px)",
            border: `1px solid ${BORDER}`,
            borderRadius: 20,
            padding: 36,
          }}
        >
          <div style={{ marginBottom: 28, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, letterSpacing: "-0.03em" }}>
              recon<span style={{ color: ACCENT }}>·</span>forecast
            </div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
              Bank reconciliation & liquidity intelligence
            </div>
          </div>

          <div style={{
            display: "flex", background: "rgba(0,0,0,0.2)",
            borderRadius: 10, padding: 3, marginBottom: 24,
          }}>
            {["login", "signup"].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1, padding: "8px 0", border: "none", borderRadius: 8,
                  background: mode === m ? ACCENT : "transparent",
                  color: mode === m ? "#000" : MUTED,
                  fontWeight: 600, fontSize: 13, cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {m === "login" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: MUTED, display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={{
                  width: "100%", padding: "10px 14px", boxSizing: "border-box",
                  background: INPUT_BG, border: `1px solid ${BORDER}`,
                  borderRadius: 10, fontSize: 14, color: TEXT, outline: "none",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: MUTED, display: "block", marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Min 8 characters" : "••••••••"}
                style={{
                  width: "100%", padding: "10px 14px", boxSizing: "border-box",
                  background: INPUT_BG, border: `1px solid ${BORDER}`,
                  borderRadius: 10, fontSize: 14, color: TEXT, outline: "none",
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
                background: ACCENT, color: "#000",
                border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1, transition: "opacity 0.15s",
              }}
            >
              {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
