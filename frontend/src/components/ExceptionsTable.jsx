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

function fmtDays(days) {
  if (days == null) return '—'
  if (days === 0) return '0d'
  const h = days * 24
  return `${days}d (${h}h 0m 0s)`
}

const MATCH_FILTERS = [
  { key: 'all',               label: 'All' },
  { key: 'auto_matched',      label: 'Auto Matched',      mt: true },
  { key: 'review',            label: 'For Review',        mt: true },
  { key: 'unmatched_bank',    label: 'Unmatched Bank',    mt: true },
  { key: 'unmatched_ledger',  label: 'Unmatched Ledger',  mt: true },
  { key: 'duplicate_bank',    label: 'Duplicate',         mt: true },
  { key: 'timing_diff',       label: 'Timing Diff',       ek: true },
  { key: 'amount_diff',       label: 'Amount Diff',       ek: true },
]

const MATCH_COLOR = {
  auto_matched:     'var(--success)',
  review:           'var(--warning)',
  unmatched_bank:   'var(--danger)',
  unmatched_ledger: 'var(--danger)',
  duplicate_bank:   'var(--warning)',
  duplicate_ledger: 'var(--warning)',
}

const STATUS_STYLE = {
  open:      { bg: 'rgba(139,148,158,0.15)', color: 'var(--ink-muted)' },
  confirmed: { bg: 'rgba(63,185,80,0.15)',   color: 'var(--success)' },
  rejected:  { bg: 'rgba(248,81,73,0.15)',   color: 'var(--danger)' },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.open
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, padding: '2px 6px',
      borderRadius: 9999, background: s.bg, color: s.color,
      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {status || 'open'}
    </span>
  )
}

export default function ExceptionsTable({ batchId }) {
  const [rows, setRows]       = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [filter, setFilter]   = useState({ key: 'all', mt: false, ek: false })
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [acting, setActing]   = useState(null)

  const PAGE_SIZE = 15

  useEffect(() => {
    if (!batchId) return
    setLoading(true); setErr(null)
    let q = `/reconciliation/exceptions?batch_id=${batchId}&page=${page}&page_size=${PAGE_SIZE}`
    if (filter.key !== 'all') {
      if (filter.mt) q += `&match_type=${filter.key}`
      else if (filter.ek) q += `&kind=${filter.key}`
    }
    apiFetch(q)
      .then((d) => { setRows(d.items); setTotal(d.total) })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [batchId, page, filter])

  useEffect(() => { setPage(1) }, [filter, batchId])

  async function handleAction(resultId, status, e) {
    e.stopPropagation()
    setActing(resultId)
    try {
      await apiFetch(`/reconciliation/${resultId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setRows(prev => prev.map(r =>
        r.result_id === resultId ? { ...r, status } : r
      ))
    } catch (ex) {
      setErr(ex.message || 'Action failed')
    } finally {
      setActing(null)
    }
  }

  if (!batchId) return (
    <div style={{ color: 'var(--ink-muted)', padding: 32, textAlign: 'center' }}>
      No batch loaded — upload a bank statement first
    </div>
  )

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      {/* filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {MATCH_FILTERS.map((f) => {
          const active = filter.key === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f)}
              style={{
                padding: '3px 10px', fontSize: 12,
                background: active ? 'var(--accent)' : 'var(--surface-2)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline)'}`,
                color: active ? '#fff' : (MATCH_COLOR[f.key] || 'var(--ink-muted)'),
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
              }}
            >
              {f.label}
            </button>
          )
        })}
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
        <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
              {['Type', 'Status', 'Conf', 'Bank Date', 'Bank Amount', 'Bank Desc', 'Ledger Date', 'Ledger Amount', 'Ledger Desc', 'Δ Amount', 'Δ Days', 'Exception', ''].map((h) => (
                <th key={h} style={{
                  padding: '8px 10px', textAlign: 'left',
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
                {[...Array(13)].map((_, j) => (
                  <td key={j} style={{ padding: '10px 10px' }}>
                    <Skeleton height={12} width={j === 0 ? 80 : 60} />
                  </td>
                ))}
              </tr>
            )) : rows.length === 0 ? (
              <tr>
                <td colSpan={13} style={{
                  padding: '32px 12px', textAlign: 'center',
                  color: 'var(--ink-muted)', fontSize: 13,
                }}>
                  No records found for this filter
                </td>
              </tr>
            ) : rows.map((r) => {
              const isExpanded = expanded === r.result_id
              const canAct = r.match_type === 'review' && (r.status === 'open' || !r.status)
              const isActing = acting === r.result_id
              return (
                <>
                  <tr
                    key={r.result_id}
                    onClick={() => setExpanded(isExpanded ? null : r.result_id)}
                    style={{
                      borderBottom: isExpanded ? 'none' : '1px solid var(--hairline-soft)',
                      transition: 'background 0.1s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '9px 10px' }}><Badge kind={r.match_type} /></td>
                    <td style={{ padding: '9px 10px' }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: '9px 10px' }}>
                      <span className="amount" style={{
                        fontSize: 12,
                        color: r.confidence >= 85 ? 'var(--success)' : r.confidence >= 60 ? 'var(--warning)' : 'var(--ink-muted)',
                      }}>
                        {r.confidence ? `${r.confidence.toFixed(0)}%` : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 12, color: 'var(--ink-muted)' }}>
                      {fmtDate(r.bank?.txn_date)}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span className="amount" style={{
                        fontSize: 12,
                        color: r.bank?.direction === 'credit' ? 'var(--success)' : 'var(--danger)',
                      }}>
                        {fmtPaise(r.bank?.amount_paise)}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--ink-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.bank?.description}>
                      {r.bank?.description || '—'}
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 12, color: 'var(--ink-muted)' }}>
                      {fmtDate(r.ledger?.txn_date)}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span className="amount" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        {fmtPaise(r.ledger?.amount_paise)}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--ink-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.ledger?.description}>
                      {r.ledger?.description || '—'}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span className="amount" style={{
                        fontSize: 12,
                        color: r.amount_delta_paise > 0 ? 'var(--warning)' : 'var(--ink-muted)',
                      }}>
                        {r.amount_delta_paise != null ? fmtPaise(r.amount_delta_paise) : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span
                        title={r.date_delta_days > 0 ? `Case A: same amount, different date — ${r.date_delta_days * 24}h apart` : undefined}
                        style={{
                          fontSize: 12,
                          color: r.date_delta_days > 0 ? 'var(--warning)' : 'var(--ink-muted)',
                          cursor: r.date_delta_days > 0 ? 'help' : 'default',
                        }}
                      >
                        {r.date_delta_days != null ? fmtDays(r.date_delta_days) : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px' }}><Badge kind={r.exception_kind} /></td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                      {canAct && (
                        <span onClick={(e) => e.stopPropagation()}>
                          <button
                            disabled={isActing}
                            onClick={(e) => handleAction(r.result_id, 'confirmed', e)}
                            style={{
                              padding: '3px 8px', fontSize: 10, marginRight: 4,
                              background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.4)',
                              borderRadius: 5, color: 'var(--success)', cursor: isActing ? 'not-allowed' : 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            ✓
                          </button>
                          <button
                            disabled={isActing}
                            onClick={(e) => handleAction(r.result_id, 'rejected', e)}
                            style={{
                              padding: '3px 8px', fontSize: 10,
                              background: 'rgba(248,81,73,0.15)', border: '1px solid rgba(248,81,73,0.4)',
                              borderRadius: 5, color: 'var(--danger)', cursor: isActing ? 'not-allowed' : 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            ✗
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded score row */}
                  {isExpanded && r.scores && (
                    <tr key={`${r.result_id}-exp`} style={{ borderBottom: '1px solid var(--hairline-soft)', background: 'var(--surface-2)' }}>
                      <td colSpan={13} style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
                          <span style={{ color: 'var(--ink-muted)' }}>Score breakdown:</span>
                          {[
                            ['Amount', r.scores.amount],
                            ['Date', r.scores.date],
                            ['Reference', r.scores.reference],
                            ['Description', r.scores.description],
                          ].map(([lbl, val]) => (
                            <span key={lbl}>
                              <span style={{ color: 'var(--ink-muted)' }}>{lbl}: </span>
                              <span style={{
                                color: val >= 0.85 ? 'var(--success)' : val >= 0.6 ? 'var(--warning)' : 'var(--danger)',
                                fontWeight: 600,
                              }}>
                                {val != null ? `${(val * 100).toFixed(0)}%` : '—'}
                              </span>
                            </span>
                          ))}
                          {r.bank?.reference && (
                            <span style={{ color: 'var(--ink-muted)' }}>Bank ref: <b style={{ color: 'var(--ink)' }}>{r.bank.reference}</b></span>
                          )}
                          {r.ledger?.reference && (
                            <span style={{ color: 'var(--ink-muted)' }}>Ledger ref: <b style={{ color: 'var(--ink)' }}>{r.ledger.reference}</b></span>
                          )}
                        </div>
                        {r.exception_kind === 'timing_diff' && (
                          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-muted)' }}>
                            Case A: Same amounts (bank ↔ ledger), different transaction dates — bank posted {r.date_delta_days}d later ({r.date_delta_days * 24}h difference).
                          </div>
                        )}
                        {r.exception_kind === 'amount_diff' && (
                          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-muted)' }}>
                            Case B: Same date, different amounts — bank shows {fmtPaise(r.bank?.amount_paise)}, ledger shows {fmtPaise(r.ledger?.amount_paise)}, delta = {fmtPaise(r.amount_delta_paise)}.
                          </div>
                        )}
                        {(r.match_type === 'duplicate_bank' || r.match_type === 'duplicate_ledger') && (
                          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--warning)' }}>
                            Duplicate: This transaction appears more than once in the uploaded file. The first occurrence is matched; duplicates are excluded from verified transactions.
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 6, color: 'var(--ink-muted)', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Page {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 6, color: 'var(--ink-muted)', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
            Next →
          </button>
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-subtle)' }}>
        Click any row to expand score breakdown · ✓/✗ buttons appear on "For Review" rows to confirm or reject
      </div>

      {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{err}</div>}
    </div>
  )
}
