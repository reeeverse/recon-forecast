import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api'

const fmtPaise = (p) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format((p ?? 0) / 100)

const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: '2-digit',
}) : '—'

const EMPTY_FORM = {
  txn_date: '', amount_rs: '', direction: 'credit',
  description: '', reference: '', counterparty: '',
}

const EMPTY_CORRECT = {
  txn_date: '', amount_rs: '', direction: 'credit',
  description: '', reference: '', counterparty: '',
  correction_note: '',
}

export default function LedgerPanel({ batchId, accountId, onReconciled }) {
  const [entries, setEntries]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [running, setRunning]       = useState(false)
  const [msg, setMsg]               = useState(null)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [correctId, setCorrectId]   = useState(null)
  const [correctForm, setCorrectForm] = useState(null)
  const formRef   = useRef(null)
  const correctRef = useRef(null)

  function load() {
    if (!batchId) return
    setLoading(true)
    apiFetch(`/ledger-entries?batch_id=${batchId}`)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(load, [batchId])

  function flash(text, ok = true) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3500)
  }

  function startAdd() {
    setCorrectId(null); setCorrectForm(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function startCorrect(e) {
    setShowForm(false)
    setCorrectId(e.id)
    setCorrectForm({
      txn_date: e.txn_date,
      amount_rs: (e.amount_paise / 100).toString(),
      direction: e.direction,
      description: e.description,
      reference: e.reference,
      counterparty: e.counterparty,
      correction_note: '',
    })
    setTimeout(() => correctRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function handleSave(ev) {
    ev.preventDefault()
    if (!form.txn_date || !form.amount_rs) return flash('Date and amount are required', false)
    const amtPaise = Math.round(parseFloat(form.amount_rs) * 100)
    if (isNaN(amtPaise) || amtPaise <= 0) return flash('Enter a valid positive amount', false)

    setSaving(true)
    try {
      const payload = {
        txn_date: form.txn_date,
        amount_paise: amtPaise,
        direction: form.direction,
        description: form.description,
        reference: form.reference,
        counterparty: form.counterparty,
      }
      await apiFetch('/ledger-entries', {
        method: 'POST',
        body: JSON.stringify({ batch_id: batchId, account_id: accountId, ...payload }),
      })
      flash('Entry added')
      setShowForm(false); setForm(EMPTY_FORM)
      load()
    } catch (ex) {
      flash(ex.message || 'Save failed', false)
    } finally {
      setSaving(false)
    }
  }

  async function handleCorrect(ev) {
    ev.preventDefault()
    if (!correctForm.correction_note.trim()) return flash('Correction note is required', false)
    const amtPaise = Math.round(parseFloat(correctForm.amount_rs) * 100)
    if (isNaN(amtPaise) || amtPaise <= 0) return flash('Enter a valid positive amount', false)

    setSaving(true)
    try {
      await apiFetch(`/ledger-entries/${correctId}/correct`, {
        method: 'POST',
        body: JSON.stringify({
          txn_date: correctForm.txn_date,
          amount_paise: amtPaise,
          direction: correctForm.direction,
          description: correctForm.description,
          reference: correctForm.reference,
          counterparty: correctForm.counterparty,
          correction_note: correctForm.correction_note,
        }),
      })
      flash('Correction added — original entry marked as corrected')
      setCorrectId(null); setCorrectForm(null)
      load()
    } catch (ex) {
      flash(ex.message || 'Correction failed', false)
    } finally {
      setSaving(false)
    }
  }

  async function runRecon() {
    setRunning(true)
    try {
      const res = await apiFetch('/reconciliation/run', {
        method: 'POST',
        body: JSON.stringify({ batch_id: batchId }),
      })
      const s = res.summary
      flash(`Reconciliation done — ${s.auto_matched} auto-matched, ${s.review} for review, ${s.unmatched_bank} unmatched bank, ${s.duplicates} duplicates`)
      onReconciled?.()
    } catch (ex) {
      flash(ex.message || 'Reconciliation failed', false)
    } finally {
      setRunning(false)
    }
  }

  if (!batchId) return null

  const inp = (style = {}) => ({
    padding: '7px 10px',
    background: 'var(--surface-2)',
    border: '1px solid var(--hairline)',
    borderRadius: 7,
    color: 'var(--ink)',
    fontSize: 13,
    ...style,
  })

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, flex: 1 }}>
          Ledger Entries
          <span style={{ marginLeft: 8, color: 'var(--ink-subtle)', fontWeight: 400 }}>
            ({entries.length} entries for this batch)
          </span>
        </h2>
        <button onClick={startAdd} style={{
          padding: '6px 14px', background: 'var(--surface-2)',
          border: '1px solid var(--hairline)', borderRadius: 7,
          color: 'var(--ink)', fontSize: 13, cursor: 'pointer',
        }}>
          + Add Entry
        </button>
        <button
          onClick={runRecon}
          disabled={running}
          style={{
            padding: '6px 14px',
            background: running ? 'var(--surface-2)' : 'var(--accent)',
            border: 'none', borderRadius: 7,
            color: running ? 'var(--ink-muted)' : '#fff',
            fontSize: 13, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {running ? 'Running…' : '▶ Run Reconciliation'}
        </button>
      </div>

      {msg && (
        <div style={{
          marginBottom: 10, padding: '8px 12px', borderRadius: 7, fontSize: 13,
          background: msg.ok ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
          color: msg.ok ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${msg.ok ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
        }}>
          {msg.text}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div ref={formRef} style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--hairline)',
          borderRadius: 10, padding: '16px 20px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>
            Add new ledger entry
          </div>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Date *</div>
                <input type="date" required value={form.txn_date}
                  onChange={e => setForm(f => ({ ...f, txn_date: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Amount (₹) *</div>
                <input type="number" required min="0.01" step="0.01" placeholder="e.g. 5000.00"
                  value={form.amount_rs}
                  onChange={e => setForm(f => ({ ...f, amount_rs: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Direction *</div>
                <select value={form.direction}
                  onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })}>
                  <option value="credit">Credit (money in)</option>
                  <option value="debit">Debit (money out)</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Description</div>
                <input type="text" placeholder="e.g. Payment from Acme Corp" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Reference</div>
                <input type="text" placeholder="e.g. UTR123456789" value={form.reference}
                  onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Counterparty</div>
                <input type="text" placeholder="e.g. Acme Corp Ltd" value={form.counterparty}
                  onChange={e => setForm(f => ({ ...f, counterparty: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{
                padding: '7px 18px', background: 'var(--accent)', border: 'none',
                borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'Saving…' : 'Add Entry'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }} style={{
                padding: '7px 14px', background: 'transparent',
                border: '1px solid var(--hairline)', borderRadius: 7,
                color: 'var(--ink-muted)', fontSize: 13, cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Correction form */}
      {correctForm && (
        <div ref={correctRef} style={{
          background: 'var(--surface-1)',
          border: '1px solid rgba(210,153,34,0.4)',
          borderRadius: 10, padding: '16px 20px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)', marginBottom: 4 }}>
            Add correction entry
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 14 }}>
            Original entry #{correctId} will be marked as corrected. A new linked entry will be created.
          </div>
          <form onSubmit={handleCorrect}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Date *</div>
                <input type="date" required value={correctForm.txn_date}
                  onChange={e => setCorrectForm(f => ({ ...f, txn_date: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Amount (₹) *</div>
                <input type="number" required min="0.01" step="0.01" value={correctForm.amount_rs}
                  onChange={e => setCorrectForm(f => ({ ...f, amount_rs: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Direction *</div>
                <select value={correctForm.direction}
                  onChange={e => setCorrectForm(f => ({ ...f, direction: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })}>
                  <option value="credit">Credit (money in)</option>
                  <option value="debit">Debit (money out)</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Description</div>
                <input type="text" value={correctForm.description}
                  onChange={e => setCorrectForm(f => ({ ...f, description: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Reference</div>
                <input type="text" value={correctForm.reference}
                  onChange={e => setCorrectForm(f => ({ ...f, reference: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Counterparty</div>
                <input type="text" value={correctForm.counterparty}
                  onChange={e => setCorrectForm(f => ({ ...f, counterparty: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Correction Note *</div>
                <textarea required rows={2} placeholder="Why is this being corrected?" value={correctForm.correction_note}
                  onChange={e => setCorrectForm(f => ({ ...f, correction_note: e.target.value }))}
                  style={{ ...inp({ width: '100%', boxSizing: 'border-box', resize: 'vertical' }) }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{
                padding: '7px 18px',
                background: 'rgba(210,153,34,0.8)', border: 'none',
                borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'Saving…' : 'Save Correction'}
              </button>
              <button type="button" onClick={() => { setCorrectId(null); setCorrectForm(null) }} style={{
                padding: '7px 14px', background: 'transparent',
                border: '1px solid var(--hairline)', borderRadius: 7,
                color: 'var(--ink-muted)', fontSize: 13, cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Entries table */}
      {loading ? (
        <div style={{ color: 'var(--ink-muted)', fontSize: 13, padding: '12px 0' }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{
          background: 'var(--surface-1)', border: '1px solid var(--hairline)',
          borderRadius: 10, padding: '24px 20px', textAlign: 'center',
          color: 'var(--ink-muted)', fontSize: 13,
        }}>
          No ledger entries yet. Add entries above, then run reconciliation to match against bank records.
        </div>
      ) : (
        <div style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--hairline)',
          borderRadius: 10,
          overflowX: 'auto',
        }}>
          <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
                {['Date', 'Amount', 'Direction', 'Description', 'Reference', 'Counterparty', 'Status', ''].map(h => (
                  <th key={h} style={{
                    padding: '7px 10px', textAlign: 'left',
                    fontSize: 11, fontWeight: 600,
                    color: 'var(--ink-muted)', textTransform: 'uppercase',
                    letterSpacing: '0.03em', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{
                  borderBottom: '1px solid var(--hairline-soft)',
                  opacity: e.is_corrected ? 0.5 : 1,
                }}
                  onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={ev => ev.currentTarget.style.background = ''}>
                  <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink-muted)' }}>{fmtDate(e.txn_date)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span className="amount" style={{
                      fontSize: 12,
                      color: e.direction === 'credit' ? 'var(--success)' : 'var(--danger)',
                      textDecoration: e.is_corrected ? 'line-through' : 'none',
                    }}>
                      {e.direction === 'debit' ? '−' : '+'}{fmtPaise(e.amount_paise)}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 7px', borderRadius: 9999,
                      background: e.direction === 'credit' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
                      color: e.direction === 'credit' ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {e.direction}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={e.description}>
                    {e.description || '—'}
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--ink-muted)' }}>{e.reference || '—'}</td>
                  <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--ink-muted)' }}>{e.counterparty || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {e.is_corrected && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 9999, background: 'rgba(139,148,158,0.15)', color: 'var(--ink-muted)', fontWeight: 600 }}>
                        CORRECTED
                      </span>
                    )}
                    {e.corrects_id && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 9999, background: 'rgba(210,153,34,0.15)', color: 'var(--warning)', fontWeight: 600 }}>
                        CORRECTION OF #{e.corrects_id}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    {!e.is_corrected && !e.corrects_id && (
                      <button onClick={() => startCorrect(e)} style={{
                        padding: '3px 8px', fontSize: 11,
                        background: 'transparent', border: '1px solid rgba(210,153,34,0.4)',
                        borderRadius: 5, color: 'var(--warning)', cursor: 'pointer',
                      }}>
                        Correct
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
