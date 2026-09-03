import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "../api";
import { useIsMobile } from "../hooks/useIsMobile";

const BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

function ImagePanel({ theme, accountId }) {
  const inputRef = useRef();
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState("");
  const accent = theme?.accent || "#388bfd";

  function onFile(f) {
    setFile(f);
    setResult(null);
    setError("");
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(f);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await apiFetch("/ai/analyze", { method: "POST", body: form, raw: true });
      setResult(data);
    } catch (err) {
      setError(err.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!result?.csv) return;
    const blob = new Blob([result.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)" }}>Analyze Statement</div>
      <div
        onClick={() => inputRef.current.click()}
        style={{
          border: `2px dashed ${preview ? accent : "var(--hairline)"}`,
          borderRadius: 12, padding: preview ? 0 : 32, textAlign: "center",
          cursor: "pointer", overflow: "hidden", minHeight: 120,
          background: "var(--surface-2)", transition: "border-color 0.2s",
        }}
      >
        <input ref={inputRef} type="file" accept="image/*" hidden
          onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
        {preview
          ? <img src={preview} alt="statement" style={{ width: "100%", display: "block", maxHeight: 220, objectFit: "cover" }} />
          : <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🖼</div>
              <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>Drop a bank statement image</div>
            </>
        }
      </div>

      {file && (
        <button type="button" onClick={analyze} disabled={loading} style={{
          padding: "10px 0", background: accent, color: "#000",
          border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
          cursor: loading ? "wait" : "pointer",
        }}>
          {loading ? "Analyzing…" : "Extract Transactions"}
        </button>
      )}

      {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}

      {result && (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>{result.count} transactions extracted</div>
              <button type="button" onClick={downloadCsv} style={{
                padding: "5px 12px", background: "var(--surface-2)",
                border: "1px solid var(--hairline)", borderRadius: 7,
                color: "var(--ink)", fontSize: 12, cursor: "pointer",
              }}>
                Download CSV
              </button>
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                    {["Date", "Description", "Amount", "Dir"].map(h => (
                      <th key={h} style={{ padding: "4px 8px", borderBottom: "1px solid var(--hairline-soft)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.transactions.slice(0, 30).map((t, i) => (
                    <tr key={i} style={{ color: "var(--ink)" }}>
                      <td style={{ padding: "4px 8px", fontVariantNumeric: "tabular-nums" }}>{t.date}</td>
                      <td style={{ padding: "4px 8px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</td>
                      <td style={{ padding: "4px 8px", fontVariantNumeric: "tabular-nums" }}>₹{((t.amount_paise || 0) / 100).toLocaleString("en-IN")}</td>
                      <td style={{ padding: "4px 8px", color: t.direction === "credit" ? "var(--success)" : "var(--danger)" }}>{t.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function ChatPanel({ theme, accountId }) {
  const accent = theme?.accent || "#388bfd";
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi! I can help you understand your reconciliation results, spot anomalies, and interpret forecasts. Ask me anything." }
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: msg }]);
    setLoading(true);

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${BASE}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg, account_id: accountId }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiText = "";
      setMessages(prev => [...prev, { role: "assistant", text: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const { text } = JSON.parse(payload);
            aiText += text;
            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", text: aiText };
              return copy;
            });
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)", marginBottom: 12 }}>AI Assistant</div>
      <div style={{
        flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12,
        paddingRight: 4, minHeight: 0,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div style={{
              maxWidth: "82%", padding: "10px 14px",
              background: m.role === "user" ? accent : "var(--surface-2)",
              color: m.role === "user" ? "#000" : "var(--ink)",
              borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap",
            }}>
              {m.text || (loading && i === messages.length - 1 ? "▌" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--hairline)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about reconciliation, forecasts, alerts…"
          style={{
            flex: 1, padding: "10px 14px",
            background: "var(--surface-2)",
            border: "1px solid var(--hairline)",
            borderRadius: 10, fontSize: 14, color: "var(--ink)", outline: "none",
          }}
        />
        <button
          type="button"
          onClick={send} disabled={loading || !input.trim()}
          style={{
            padding: "10px 18px", background: accent, color: "#000",
            border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
            cursor: loading ? "wait" : "pointer", opacity: (loading || !input.trim()) ? 0.6 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default function ChatPage({ theme, accountId }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", marginBottom: 20, letterSpacing: "-0.03em" }}>
        AI Agent
      </h1>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 16,
      }}>
        <div style={{
          background: "var(--surface-1)", border: "1px solid var(--hairline)",
          borderRadius: 16, padding: isMobile ? 16 : 24, overflowY: "auto",
        }}>
          <ImagePanel theme={theme} accountId={accountId} />
        </div>
        <div style={{
          background: "var(--surface-1)", border: "1px solid var(--hairline)",
          borderRadius: 16, padding: isMobile ? 16 : 24,
          display: "flex", flexDirection: "column",
          minHeight: isMobile ? 420 : 500,
        }}>
          <ChatPanel theme={theme} accountId={accountId} />
        </div>
      </div>
    </div>
  );
}
