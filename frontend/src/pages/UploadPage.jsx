import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "../api";

function DropZone({ label, accept, file, onFile, accent }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragging ? accent : "rgba(255,255,255,0.12)"}`,
        borderRadius: 14, padding: "28px 20px", textAlign: "center",
        cursor: "pointer", transition: "border-color 0.2s",
        background: dragging ? `${accent}08` : "rgba(255,255,255,0.03)",
      }}
    >
      <input ref={inputRef} type="file" accept={accept} hidden
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <div style={{ fontSize: 28, marginBottom: 8 }}>
        {file ? "✓" : "↑"}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#e2e8f0", marginBottom: 4 }}>{label}</div>
      {file
        ? <div style={{ fontSize: 13, color: accent }}>{file.name}</div>
        : <div style={{ fontSize: 12, color: "#64748b" }}>Drop CSV here or click to browse</div>
      }
    </div>
  );
}

export default function UploadPage({ theme, accountId }) {
  const accent = theme?.accent || "#388bfd";
  const [bankFile, setBankFile]     = useState(null);
  const [ledgerFile, setLedgerFile] = useState(null);
  const [status, setStatus]         = useState("idle");
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState("");

  async function handleUpload() {
    if (!bankFile || !ledgerFile) {
      setError("Please select both CSV files.");
      return;
    }
    setError("");
    setStatus("uploading");
    setResult(null);

    try {
      const aid = accountId || "ACC-001";

      const bankForm = new FormData();
      bankForm.append("file", bankFile);
      bankForm.append("account_id", aid);
      await apiFetch(`/upload/statement`, { method: "POST", body: bankForm, raw: true });

      const ledgerForm = new FormData();
      ledgerForm.append("file", ledgerFile);
      ledgerForm.append("account_id", aid);
      await apiFetch(`/upload/ledger`, { method: "POST", body: ledgerForm, raw: true });

      setStatus("reconciling");
      const recon = await apiFetch(`/reconciliation/run`, {
        method: "POST",
        body: JSON.stringify({ account_id: aid }),
      });
      setResult(recon);
      setStatus("done");
    } catch (err) {
      setError(err.message || "Upload failed");
      setStatus("idle");
    }
  }

  const busy = status === "uploading" || status === "reconciling";

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 6, letterSpacing: "-0.03em" }}>
        Upload Statements
      </h1>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 28 }}>
        Drop your bank statement and ledger CSVs — reconciliation runs automatically.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <DropZone label="Bank Statement" accept=".csv" file={bankFile} onFile={setBankFile} accent={accent} />
        <DropZone label="Ledger CSV" accept=".csv" file={ledgerFile} onFile={setLedgerFile} accent={accent} />
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
          color: "#f87171", fontSize: 13,
        }}>{error}</div>
      )}

      <button
        onClick={handleUpload} disabled={busy || (!bankFile && !ledgerFile)}
        style={{
          padding: "12px 28px", background: accent, color: "#000",
          border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
          cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
        }}
      >
        {busy
          ? status === "uploading" ? "Uploading…" : "Running reconciliation…"
          : "Upload & Reconcile"}
      </button>

      <AnimatePresence>
        {status === "done" && result && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop: 28, padding: 24,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
            }}
          >
            <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: 16 }}>Reconciliation complete</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "Auto matched", val: result.auto_matched ?? "—", color: "#22c55e" },
                { label: "Needs review", val: result.review ?? "—", color: "#f59e0b" },
                { label: "Unmatched", val: (result.unmatched_bank || 0) + (result.unmatched_ledger || 0), color: "#f87171" },
              ].map(c => (
                <div key={c.label} style={{
                  padding: 14, background: "rgba(0,0,0,0.2)", borderRadius: 10, textAlign: "center",
                }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: c.color, fontVariantNumeric: "tabular-nums" }}>
                    {c.val}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{c.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
