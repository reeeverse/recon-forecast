import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import Skeleton from './Skeleton'

const fmtPaise = (p) =>
  p == null ? '—' : new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(p / 100)

export default function CashPositionBar({ accountId }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!accountId) return
    setData(null); setErr(null)
    apiFetch(`/accounts/${accountId}/cash-position`)
      .then(setData)
      .catch((e) => setErr(e.message))
  }, [accountId])

  if (!accountId) return null
  if (err) return null
  if (!data) return <Skeleton height={60} style={{ borderRadius: 'var(--radius-lg)' }} />

  // API field is threshold_paise (not min_threshold_paise)
  const { current_balance_paise: bal, threshold_paise: thr } = data
  const safe = !thr || bal >= thr
  const pct = thr > 0 ? Math.min(100, (bal / (thr * 2)) * 100) : 100

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: `1px solid ${safe ? 'var(--hairline)' : 'var(--danger)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '14px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
            Current Balance
          </div>
          <div className="amount" style={{
            fontSize: 22, fontWeight: 600,
            color: safe ? 'var(--success)' : 'var(--danger)',
          }}>
            {fmtPaise(bal)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
            Min threshold: <span className="amount">{fmtPaise(thr)}</span>
          </div>
        </div>
      </div>

      {/* bar */}
      <div style={{
        height: 6, background: 'var(--surface-3)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: safe ? 'var(--success)' : 'var(--danger)',
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* threshold marker line */}
      <div style={{ position: 'relative', height: 0 }}>
        <div style={{
          position: 'absolute',
          left: '50%', top: -6,
          width: 1, height: 8,
          background: 'var(--warning)',
          opacity: 0.6,
        }} />
      </div>
    </div>
  )
}
