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
  day: '2-digit', month: 'short', year: 'numeric',
}) : '—'

export default function AlertsList() {
  const [alerts, setAlerts] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    apiFetch('/alerts')
      .then((d) => setAlerts(d.items ?? []))
      .catch((e) => setErr(e.message))
  }, [])

  if (err) return (
    <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>
  )

  if (!alerts) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[...Array(2)].map((_, i) => <Skeleton key={i} height={64} style={{ borderRadius: 'var(--radius-lg)' }} />)}
    </div>
  )

  if (alerts.length === 0) return (
    <div style={{
      background: 'var(--surface-1)', border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-lg)', padding: '24px 20px',
      textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13,
    }}>
      <span style={{ color: 'var(--success)', fontSize: 18, display: 'block', marginBottom: 6 }}>✓</span>
      No active liquidity alerts
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {alerts.map((a) => (
        <div
          key={a.alert_id}
          style={{
            background: 'var(--surface-1)',
            border: `1px solid ${a.severity === 'critical' || a.severity === 'high' ? 'var(--danger)' : 'var(--hairline)'}`,
            borderLeft: `3px solid ${
              a.severity === 'critical' ? 'var(--danger)' :
              a.severity === 'high'     ? 'var(--danger)' :
              a.severity === 'medium'   ? 'var(--warning)' : 'var(--success)'
            }`,
            borderRadius: 'var(--radius-lg)',
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 16,
          }}
        >
          <Badge kind={a.severity} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {a.account_id}
              <span style={{ fontWeight: 400, color: 'var(--ink-muted)', marginLeft: 8 }}>
                breach {fmtDate(a.breach_date)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
              Shortfall:{' '}
              <span className="amount" style={{ color: 'var(--danger)' }}>
                {fmtPaise(a.shortfall_paise)}
              </span>
              {' '}·{' '}
              Model: {a.model}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-subtle)', whiteSpace: 'nowrap' }}>
            {fmtDate(a.triggered_at)}
          </div>
        </div>
      ))}
    </div>
  )
}
