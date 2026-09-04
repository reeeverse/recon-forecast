import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const fmtPaise = (p) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format((p ?? 0) / 100)

const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: '2-digit',
}) : '—'

export default function BankStatementsPanel({ batchId }) {
  const [items, setItems]   = useState([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(false)
  const PAGE_SIZE = 50

  useEffect(() => {
    if (!batchId) return
    setLoading(true)
    apiFetch(`/bank-lines?batch_id=${batchId}&page=${page}&page_size=${PAGE_SIZE}`)
      .then(d => { setItems(d.items); setTotal(d.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [batchId, page])

  useEffect(() => { setPage(1) }, [batchId])

  if (!batchId) return null

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
        Bank Statement Lines
        <span style={{ marginLeft: 8, color: 'var(--ink-subtle)', fontWeight: 400 }}>
          ({total} lines for this batch)
        </span>
      </h2>

      {loading ? (
        <div style={{ color: 'var(--ink-muted)', fontSize: 13, padding: '12px 0' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{
          background: 'var(--surface-1)', border: '1px solid var(--hairline)',
          borderRadius: 10, padding: '24px 20px', textAlign: 'center',
          color: 'var(--ink-muted)', fontSize: 13,
        }}>
          No bank statement lines for this batch.
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
