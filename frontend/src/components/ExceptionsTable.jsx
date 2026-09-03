import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import Badge from './Badge'
import Skeleton from './Skeleton'

const fmtPaise = (p) =>
  p == null ? '—' : new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(p / 100)

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: '2-digit',
}) : '—'

const KIND_FILTERS = ['all', 'review', 'unmatched_bank', 'unmatched_ledger', 'timing_diff', 'amount_diff', 'duplicate']

export default function ExceptionsTable({ batchId }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [kind, setKind] = useState('all')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const PAGE_SIZE = 15

  useEffect(() => {
    if (!batchId) return
    setLoading(true); setErr(null)
    const kindQ = kind !== 'all' ? `&kind=${kind}` : ''
    apiFetch(`/reconciliation/exceptions?batch_id=${batchId}&page=${page}&page_size=${PAGE_SIZE}${kindQ}`)
      .then((d) => { setRows(d.items); setTotal(d.total) })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [batchId, page, kind])

  // reset page on filter change
  useEffect(() => { setPage(1) }, [kind, batchId])

  if (!batchId) return (
    <div style={{ color: 'var(--ink-muted)', padding: 32, textAlign: 'center' }}>
      No batch loaded — run reconciliation first
    </div>
  )

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      {/* filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>Filter:</span>
        {KIND_FILTERS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            style={{
              padding: '3px 10px',
              fontSize: 12,
              background: kind === k ? 'var(--accent)' : 'var(--surface-2)',
              border: `1px solid ${kind === k ? 'var(--accent)' : 'var(--hairline)'}`,
              color: kind === k ? '#fff' : 'var(--ink-muted)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {k === 'all' ? 'All' : k.replace(/_/g, ' ')}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--ink-muted)', fontSize: 12 }}>
          {total.toLocaleString('en-IN')} rows
        </span>
      </div>

      {/* table */}
      <div style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
              {['Type', 'Conf', 'Bank Date', 'Bank Amount', 'Ledger Date', 'Ledger Amount', 'Δ Amount', 'Δ Days', 'Exception'].map((h) => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: 'left',
                  fontSize: 11, fontWeight: 600,
                  color: 'var(--ink-muted)', whiteSpace: 'nowrap',
                  letterSpacing: '0.03em', textTransform: 'uppercase',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? [...Array(5)].map((_, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
                {[...Array(9)].map((_, j) => (
                  <td key={j} style={{ padding: '10px 12px' }}>
                    <Skeleton height={12} width={j === 0 ? 80 : 60} />
                  </td>
                ))}
              </tr>
            )) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{
                  padding: '32px 12px', textAlign: 'center',
                  color: 'var(--ink-muted)', fontSize: 13,
                }}>
                  No exceptions found
                </td>
              </tr>
            ) : rows.map((r) => (
              <tr
                key={r.result_id}
                style={{ borderBottom: '1px solid var(--hairline-soft)', transition: 'background 0.1s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = ''}
              >
                <td style={{ padding: '9px 12px' }}><Badge kind={r.match_type} /></td>
                <td style={{ padding: '9px 12px' }}>
                  <span className="amount" style={{
                    fontSize: 12,
                    color: r.confidence >= 85 ? 'var(--success)' : r.confidence >= 60 ? 'var(--warning)' : 'var(--ink-muted)',
                  }}>
                    {r.confidence ? `${r.confidence.toFixed(0)}%` : '—'}
                  </span>
                </td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--ink-muted)' }}>
                  {fmtDate(r.bank?.txn_date)}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <span className="amount" style={{
                    fontSize: 12,
                    color: r.bank?.direction === 'credit' ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {fmtPaise(r.bank?.amount_paise)}
                  </span>
                </td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--ink-muted)' }}>
                  {fmtDate(r.ledger?.txn_date)}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <span className="amount" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                    {fmtPaise(r.ledger?.amount_paise)}
                  </span>
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <span className="amount" style={{
                    fontSize: 12,
                    color: r.amount_delta_paise > 0 ? 'var(--warning)' : 'var(--ink-muted)',
                  }}>
                    {r.amount_delta_paise != null ? fmtPaise(r.amount_delta_paise) : '—'}
                  </span>
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <span style={{
                    fontSize: 12,
                    color: r.date_delta_days > 0 ? 'var(--warning)' : 'var(--ink-muted)',
                  }}>
                    {r.date_delta_days != null ? `${r.date_delta_days}d` : '—'}
                  </span>
                </td>
                <td style={{ padding: '9px 12px' }}><Badge kind={r.exception_kind} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            Page {page} / {totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
        </div>
      )}

      {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{err}</div>}
    </div>
  )
}
