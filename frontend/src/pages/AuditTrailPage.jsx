import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

const ACTION_STYLE = {
  confirmed:        { bg: 'rgba(63,185,80,0.15)',   color: 'var(--success)' },
  rejected:         { bg: 'rgba(248,81,73,0.15)',   color: 'var(--danger)' },
  correction_added: { bg: 'rgba(210,153,34,0.15)', color: 'var(--warning)' },
}

function ActionBadge({ action }) {
  const s = ACTION_STYLE[action] || { bg: 'rgba(139,148,158,0.15)', color: 'var(--ink-muted)' }
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, padding: '2px 7px',
      borderRadius: 9999, background: s.bg, color: s.color,
      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {action?.replace(/_/g, ' ')}
    </span>
  )
}

export default function AuditTrailPage({ accountId }) {
  const [items, setItems]   = useState([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState(null)
  const PAGE_SIZE = 20

  useEffect(() => {
    if (!accountId) return
    setLoading(true); setErr(null)
    apiFetch(`/audit-logs?account_id=${accountId}&page=${page}&page_size=${PAGE_SIZE}`)
      .then(d => { setItems(d.items); setTotal(d.total) })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [accountId, page])

  useEffect(() => { setPage(1) }, [accountId])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Activity Log
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-muted)', margin: 0 }}>
          Every action taken on this account — confirmations, rejections, and corrections — permanently recorded.
        </p>
      </div>

      {!accountId ? (
        <div style={{ color: 'var(--ink-muted)', padding: 32, textAlign: 'center', fontSize: 13 }}>
          Select an account to view its audit trail.
        </div>
      ) : (
        <>
          <div style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--hairline)',
            borderRadius: 10,
            overflowX: 'auto',
          }}>
            <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
                  {['Time', 'Action', 'Type', 'Entity', 'Who', 'Before', 'After', 'Notes'].map(h => (
                    <th key={h} style={{
                      padding: '8px 10px', textAlign: 'left',
                      fontSize: 11, fontWeight: 600,
                      color: 'var(--ink-muted)', textTransform: 'uppercase',
                      letterSpacing: '0.03em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
                      Loading…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
                      No audit entries yet. Confirm, reject, or correct entries to see them here.
                    </td>
                  </tr>
                ) : items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--hairline-soft)' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = ''}>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                      {fmtTime(item.created_at)}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <ActionBadge action={item.action} />
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--ink-muted)' }}>
                      {item.entity_type?.replace(/_/g, ' ')}
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--ink-muted)' }}>
                      #{item.entity_id}
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--ink-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={item.user_email}>
                      {item.user_email}
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--ink-muted)', maxWidth: 120 }}>
                      {item.old_value
                        ? Object.entries(item.old_value).map(([k, v]) => (
                          <div key={k}><span style={{ color: 'var(--ink-subtle)' }}>{k}:</span> {String(v)}</div>
                        ))
                        : '—'}
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--ink)', maxWidth: 120 }}>
                      {item.new_value
                        ? Object.entries(item.new_value).map(([k, v]) => (
                          <div key={k}><span style={{ color: 'var(--ink-subtle)' }}>{k}:</span> {String(v)}</div>
                        ))
                        : '—'}
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--ink-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={item.notes}>
                      {item.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{total} total entries</span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          </div>

          {err && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</div>}
        </>
      )}
    </div>
  )
}
