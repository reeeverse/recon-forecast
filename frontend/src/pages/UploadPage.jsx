import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "../api";
import { useIsMobile } from "../hooks/useIsMobile";

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
        border: `2px dashed ${dragging ? accent : "var(--hairline)"}`,
        borderRadius: 14, padding: "28px 20px", textAlign: "center",
        cursor: "pointer", transition: "border-color 0.2s",
        background: dragging ? `${accent}10` : "var(--surface-1)",
      }}
    >
      <input ref={inputRef} type="file" accept={accept} hidden
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <div style={{ fontSize: 28, marginBottom: 8 }}>
        {file ? "✓" : "↑"}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", marginBottom: 4 }}>{label}</div>
      {file
        ? <div style={{ fontSize: 13, color: accent }}>{file.name}</div>
        : <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>Drop CSV here or click to browse</div>
      }
    </div>
  );
}

export default function UploadPage({ theme, accountId }) {
  const accent = theme?.accent || "#388bfd";
  const isMobile = useIsMobile();
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

      // Upload statement first — captures the batch_id
      const bankForm = new FormData();
      bankForm.append("file", bankFile);
      bankForm.append("account_id", aid);
      const { batch_id: statementBatchId } = await apiFetch("/upload/statement", {
        method: "POST", body: bankForm, raw: true,
      });

      // Upload ledger into the same batch
      const ledgerForm = new FormData();
      ledgerForm.append("file", ledgerFile);
      ledgerForm.append("account_id", aid);
      ledgerForm.append("batch_id", String(statementBatchId));
      await apiFetch("/upload/ledger", { method: "POST", body: ledgerForm, raw: true });

      setStatus("reconciling");
      const recon = await apiFetch("/reconciliation/run", {
        method: "POST",
        body: JSON.stringify({ batch_id: statementBatchId }),
      });
      setResult(recon.summary);
      setStatus("done");
    } catch (err) {
      setError(err.message || "Upload failed");
      setStatus("idle");
    }
  }

  const busy = status === "uploading" || status === "reconciling";

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 4 }}>
        Upload Statements
      </h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 14, marginBottom: 28, margin: "4px 0 28px" }}>
        Drop your bank statement and ledger CSVs — reconciliation runs automatically.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <DropZone label="Bank Statement" accept=".csv" file={bankFile} onFile={setBankFile} accent={accent} />
        <DropZone label="Ledger CSV" accept=".csv" file={ledgerFile} onFile={setLedgerFile} accent={accent} />
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
          color: "var(--danger)", fontSize: 13,
        }}>{error}</div>
      )}

      <button
        onClick={handleUpload} disabled={busy || (!bankFile && !ledgerFile)}
        style={{
          padding: "12px 28px", background: accent, color: "#000",
          border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
          cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
          width: isMobile ? "100%" : "auto",
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
              background: "var(--surface-1)",
              border: "1px solid var(--hairline)",
              borderRadius: 14,
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 16 }}>
              Reconciliation complete
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "Auto matched",  val: result.auto_matched  ?? "—", color: "var(--success)" },
                { label: "Needs review",  val: result.review        ?? "—", color: "var(--warning)" },
                { label: "Unmatched",     val: (result.unmatched_bank || 0) + (result.unmatched_ledger || 0), color: "var(--danger)" },
              ].map(c => (
                <div key={c.label} style={{
                  padding: 14, background: "var(--surface-2)", borderRadius: 10, textAlign: "center",
                }}>
                  <div className="amount" style={{ fontSize: 24, fontWeight: 700, color: c.color }}>
                    {c.val}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>{c.label}</div>
                </div>
              ))}
            </div>
            {result.duplicates > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--warning)" }}>
                ⚠ {result.duplicates} duplicate row{result.duplicates !== 1 ? "s" : ""} detected
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
