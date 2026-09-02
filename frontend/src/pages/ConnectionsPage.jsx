import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "../api";

function Modal({ onClose, onSave, theme }) {
  const accent = theme?.accent || "#388bfd";
  const [name, setName]   = useState("");
  const [dbType, setType] = useState("postgresql");
  const [connStr, setStr] = useState("");
  const [testing, setTesting]   = useState(false);
  const [testOk, setTestOk]     = useState(null);
  const [error, setError]       = useState("");

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setTesting(true);
    setTestOk(null);
    try {
      const data = await apiFetch("/connections", {
        method: "POST",
        body: JSON.stringify({ name, db_type: dbType, connection_string: connStr }),
      });
      setTestOk(true);
      setTimeout(() => { onSave(data); onClose(); }, 600);
    } catch (err) {
      setError(err.message || "Failed to save connection");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
    }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 440, background: "#161b22",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: 32,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, color: "#e2e8f0", marginBottom: 20 }}>
          Add Bank Connection
        </div>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 5 }}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              placeholder="HDFC Current Account"
              style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 5 }}>Database type</label>
            <select value={dbType} onChange={e => setType(e.target.value)}
              style={{ ...inputStyle, appearance: "none" }}>
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 5 }}>Connection string</label>
            <input value={connStr} onChange={e => setStr(e.target.value)} required
              placeholder={dbType === "postgresql" ? "postgresql://user:pass@host:5432/db" : "mysql://user:pass@host:3306/db"}
              style={inputStyle} />
            <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
              Stored encrypted (Fernet AES-128) — never logged.
            </div>
          </div>

          {error && (
            <div style={{
              padding: "8px 12px", borderRadius: 8,
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
              color: "#f87171", fontSize: 13,
            }}>{error}</div>
          )}

          {testOk && (
            <div style={{ color: "#22c55e", fontSize: 13 }}>✓ Connection verified</div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: "10px 0", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
              color: "#94a3b8", fontSize: 14, cursor: "pointer",
            }}>Cancel</button>
            <button type="submit" disabled={testing} style={{
              flex: 1, padding: "10px 0", background: accent, color: "#000",
              border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
              cursor: testing ? "wait" : "pointer",
            }}>
              {testing ? "Testing…" : "Save & Test"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 14px", boxSizing: "border-box",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10, fontSize: 14, color: "#e2e8f0", outline: "none",
};

export default function ConnectionsPage({ theme }) {
  const accent = theme?.accent || "#388bfd";
  const [connections, setConnections] = useState([]);
  const [showModal, setShowModal]     = useState(false);
  const [syncing, setSyncing]         = useState({});
  const [syncResults, setSyncResults] = useState({});

  useEffect(() => {
    apiFetch("/connections").then(setConnections).catch(() => {});
  }, []);

  async function handleSync(id) {
    setSyncing(s => ({ ...s, [id]: true }));
    setSyncResults(r => ({ ...r, [id]: null }));
    try {
      const res = await apiFetch(`/connections/${id}/sync`, { method: "POST" });
      setSyncResults(r => ({ ...r, [id]: res }));
      setConnections(c => c.map(conn =>
        conn.id === id ? { ...conn, last_sync_at: new Date().toISOString() } : conn
      ));
    } catch (err) {
      setSyncResults(r => ({ ...r, [id]: { error: err.message } }));
    } finally {
      setSyncing(s => ({ ...s, [id]: false }));
    }
  }

  async function handleDelete(id) {
    await apiFetch(`/connections/${id}`, { method: "DELETE" });
    setConnections(c => c.filter(conn => conn.id !== id));
  }

  return (
    <div style={{ padding: 32, maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-0.03em", margin: 0 }}>
            Bank Connections
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 4, marginBottom: 0 }}>
            Link external databases to pull transactions directly.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: "10px 18px", background: accent, color: "#000",
            border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}
        >
          + Add Connection
        </button>
      </div>

      {connections.length === 0 ? (
        <div style={{
          padding: 40, textAlign: "center",
          border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 14,
          color: "#475569", fontSize: 14,
        }}>
          No connections yet. Add a PostgreSQL or MySQL database to start syncing.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <AnimatePresence>
            {connections.map(conn => (
              <motion.div
                key={conn.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                style={{
                  padding: 20,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  display: "flex", alignItems: "center", gap: 16,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: conn.db_type === "postgresql" ? "rgba(59,130,246,0.15)" : "rgba(234,179,8,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, flexShrink: 0,
                }}>
                  {conn.db_type === "postgresql" ? "🐘" : "🐬"}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 15 }}>{conn.name}</div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                    {conn.db_type} ·{" "}
                    {conn.last_sync_at
                      ? `Last synced ${new Date(conn.last_sync_at).toLocaleString("en-IN")}`
                      : "Never synced"}
                  </div>
                  {syncResults[conn.id] && (
                    <div style={{ fontSize: 12, marginTop: 6, color: syncResults[conn.id].error ? "#f87171" : "#22c55e" }}>
                      {syncResults[conn.id].error
                        ? `Error: ${syncResults[conn.id].error}`
                        : `Synced ${syncResults[conn.id].synced} transactions`}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => handleSync(conn.id)}
                    disabled={syncing[conn.id]}
                    style={{
                      padding: "7px 14px", background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                      color: "#e2e8f0", fontSize: 13, cursor: syncing[conn.id] ? "wait" : "pointer",
                    }}
                  >
                    {syncing[conn.id] ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    onClick={() => handleDelete(conn.id)}
                    style={{
                      padding: "7px 14px", background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8,
                      color: "#f87171", fontSize: 13, cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <Modal
            theme={theme}
            onClose={() => setShowModal(false)}
            onSave={newConn => setConnections(c => [newConn, ...c])}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
