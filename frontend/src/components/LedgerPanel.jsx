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

export default function LedgerPanel({ batchId, accountId, onReconciled }) {
  const [entries, setEntries]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [running, setRunning]   = useState(false)
  const [msg, setMsg]           = useState(null)
  const [editId, setEditId]     = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const formRef = useRef(null)

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
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function startEdit(e) {
    setEditId(e.id)
    setForm({
      txn_date: e.txn_date,
      amount_rs: (e.amount_paise / 100).toString(),
      direction: e.direction,
      description: e.description,
      reference: e.reference,
      counterparty: e.counterparty,
    })
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function handleSave(e) {
    e.preventDefault()
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
      if (editId) {
        await apiFetch(`/ledger-entries/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) })
        flash('Entry updated')
      } else {
        await apiFetch('/ledger-entries', {
          method: 'POST',
          body: JSON.stringify({ batch_id: batchId, account_id: accountId, ...payload }),
        })
        flash('Entry added')
      }
      setShowForm(false); setEditId(null); setForm(EMPTY_FORM)
      load()
    } catch (ex) {
      flash(ex.message || 'Save failed', false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this ledger entry?')) return
    try {
      await apiFetch(`/ledger-entries/${id}`, { method: 'DELETE' })
      flash('Deleted')
      load()
    } catch (ex) {
      flash(ex.message || 'Delete failed', false)
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

      {/* Add / Edit form */}
      {showForm && (
        <div ref={formRef} style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--hairline)',
          borderRadius: 10, padding: '16px 20px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>
            {editId ? 'Edit ledger entry' : 'Add new ledger entry'}
          </div>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Date *</div>
                <input
                  type="date"
                  required
                  value={form.txn_date}
                  onChange={e => setForm(f => ({ ...f, txn_date: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Amount (₹) *</div>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 5000.00"
                  value={form.amount_rs}
                  onChange={e => setForm(f => ({ ...f, amount_rs: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Direction *</div>
                <select
                  value={form.direction}
                  onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })}
                >
                  <option value="credit">Credit (money in)</option>
                  <option value="debit">Debit (money out)</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Description</div>
                <input
                  type="text"
                  placeholder="e.g. Payment from Acme Corp"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Reference</div>
                <input
                  type="text"
                  placeholder="e.g. UTR123456789"
                  value={form.reference}
                  onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Counterparty</div>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp Ltd"
                  value={form.counterparty}
                  onChange={e => setForm(f => ({ ...f, counterparty: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{
                padding: '7px 18px', background: 'var(--accent)', border: 'none',
                borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'Saving…' : editId ? 'Update' : 'Add Entry'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM) }} style={{
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
                {['Date', 'Amount', 'Direction', 'Description', 'Reference', 'Counterparty', ''].map(h => (
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
                <tr key={e.id} style={{ borderBottom: '1px solid var(--hairline-soft)' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={ev => ev.currentTarget.style.background = ''}>
                  <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink-muted)' }}>{fmtDate(e.txn_date)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span className="amount" style={{
                      fontSize: 12,
                      color: e.direction === 'credit' ? 'var(--success)' : 'var(--danger)',
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
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(e)} style={{
                      padding: '3px 8px', fontSize: 11,
                      background: 'transparent', border: '1px solid var(--hairline)',
                      borderRadius: 5, color: 'var(--ink-muted)', cursor: 'pointer', marginRight: 4,
                    }}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(e.id)} style={{
                      padding: '3px 8px', fontSize: 11,
                      background: 'transparent', border: '1px solid rgba(248,81,73,0.4)',
                      borderRadius: 5, color: 'var(--danger)', cursor: 'pointer',
                    }}>
                      Delete
                    </button>
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
