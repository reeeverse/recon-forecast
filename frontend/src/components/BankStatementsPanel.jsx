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
  txn_date: '', value_date: '', amount_rs: '', direction: 'credit',
  description: '', reference: '',
}

export default function BankStatementsPanel({ batchId, accountId }) {
  const [items, setItems]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)
  const formRef = useRef(null)
  const PAGE_SIZE = 50

  function load() {
    if (!batchId) return
    setLoading(true)
    apiFetch(`/bank-lines?batch_id=${batchId}&page=${page}&page_size=${PAGE_SIZE}`)
      .then(d => { setItems(d.items); setTotal(d.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(load, [batchId, page])
  useEffect(() => { setPage(1) }, [batchId])

  function flash(text, ok = true) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3500)
  }

  function startAdd() {
    setForm(EMPTY_FORM)
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function handleSave(ev) {
    ev.preventDefault()
    if (!form.txn_date || !form.amount_rs) return flash('Date and amount are required', false)
    const amtPaise = Math.round(parseFloat(form.amount_rs) * 100)
    if (isNaN(amtPaise) || amtPaise <= 0) return flash('Enter a valid positive amount', false)

    setSaving(true)
    try {
      await apiFetch('/bank-lines', {
        method: 'POST',
        body: JSON.stringify({
          batch_id: batchId,
          account_id: accountId,
          txn_date: form.txn_date,
          value_date: form.value_date || null,
          amount_paise: amtPaise,
          direction: form.direction,
          description: form.description,
          reference: form.reference,
        }),
      })
      flash('Bank line added')
      setShowForm(false)
      setForm(EMPTY_FORM)
      load()
    } catch (ex) {
      flash(ex.message || 'Save failed', false)
    } finally {
      setSaving(false)
    }
  }

  if (!batchId) return null

  const totalPages = Math.ceil(total / PAGE_SIZE)

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
      {/* Header row — matches LedgerPanel exactly */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, flex: 1 }}>
          Bank Statement Lines
          <span style={{ marginLeft: 8, color: 'var(--ink-subtle)', fontWeight: 400 }}>
            ({total} lines for this batch)
          </span>
        </h2>
        <button onClick={startAdd} style={{
          padding: '6px 14px', background: 'var(--surface-2)',
          border: '1px solid var(--hairline)', borderRadius: 7,
          color: 'var(--ink)', fontSize: 13, cursor: 'pointer',
        }}>
          + Add Entry
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
            Add bank statement line
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
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Value Date</div>
                <input type="date" value={form.value_date}
                  onChange={e => setForm(f => ({ ...f, value_date: e.target.value }))}
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
                <input type="text" placeholder="e.g. NEFT ACME CORP" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={inp({ width: '100%', boxSizing: 'border-box' })} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Reference</div>
                <input type="text" placeholder="e.g. UTR123456789" value={form.reference}
                  onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
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

      {loading ? (
        <div style={{ color: 'var(--ink-muted)', fontSize: 13, padding: '12px 0' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{
          background: 'var(--surface-1)', border: '1px solid var(--hairline)',
          borderRadius: 10, padding: '24px 20px', textAlign: 'center',
          color: 'var(--ink-muted)', fontSize: 13,
        }}>
          No bank lines for this batch. Add entries above or upload a bank statement.
        </div>
      ) : (
        <>
          <div style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--hairline)',
            borderRadius: 10,
            overflowX: 'auto',
          }}>
            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
                  {['Date', 'Value Date', 'Amount', 'Direction', 'Description', 'Reference'].map(h => (
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
                {items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--hairline-soft)' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = ''}>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink-muted)' }}>{fmtDate(item.txn_date)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink-muted)' }}>{fmtDate(item.value_date)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span className="amount" style={{
                        fontSize: 12,
                        color: item.direction === 'credit' ? 'var(--success)' : 'var(--danger)',
                      }}>
                        {item.direction === 'debit' ? '−' : '+'}{fmtPaise(item.amount_paise)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 7px', borderRadius: 9999,
                        background: item.direction === 'credit' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
                        color: item.direction === 'credit' ? 'var(--success)' : 'var(--danger)',
                      }}>
                        {item.direction}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={item.description}>
                      {item.description || '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--ink-muted)' }}>{item.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 6, color: 'var(--ink-muted)', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Page {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 6, color: 'var(--ink-muted)', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
