import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import Skeleton from './Skeleton'

const fmt = (n) => (n ?? 0).toLocaleString('en-IN')

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px',
      minWidth: 140,
      flex: 1,
    }}>
      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 6 }}>{label}</div>
      <div className="amount" style={{ fontSize: 22, fontWeight: 600, color: color ?? 'var(--ink)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function ReconSummaryCards({ accountId }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!accountId) return
    setData(null); setErr(null)
    apiFetch(`/reconciliation/summary?account_id=${accountId}`)
      .then(setData)
      .catch((e) => setErr(e.message))
  }, [accountId])

  if (!accountId) return null

  if (err) return (
    <div style={{ color: 'var(--danger)', padding: 16 }}>
      Summary unavailable — run reconciliation first
    </div>
  )

  if (!data) return (
    <div style={{ display: 'flex', gap: 12 }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{
          flex: 1, background: 'var(--surface-1)', border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-lg)', padding: '16px 20px',
        }}>
          <Skeleton height={12} width="60%" style={{ marginBottom: 10 }} />
          <Skeleton height={28} width="80%" />
        </div>
      ))}
    </div>
  )

  const { totals, avg_confidence, verified_count } = data
  const matchRate = totals.bank > 0
    ? ((totals.auto_matched / totals.bank) * 100).toFixed(1)
    : '—'

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <MetricCard
          label="Auto Matched"
          value={fmt(totals.auto_matched)}
          sub={`${matchRate}% match rate`}
          color="var(--success)"
        />
        <MetricCard
          label="For Review"
          value={fmt(totals.review)}
          color={totals.review > 0 ? 'var(--warning)' : 'var(--ink-muted)'}
        />
        <MetricCard
          label="Unmatched Bank"
          value={fmt(totals.unmatched_bank)}
          color={totals.unmatched_bank > 0 ? 'var(--danger)' : 'var(--ink-muted)'}
        />
        <MetricCard
          label="Unmatched Ledger"
          value={fmt(totals.unmatched_ledger)}
          color={totals.unmatched_ledger > 0 ? 'var(--danger)' : 'var(--ink-muted)'}
        />
        <MetricCard
          label="Avg Confidence"
          value={avg_confidence ? `${avg_confidence.toFixed(1)}%` : '—'}
          sub={`${fmt(verified_count)} verified`}
        />
      </div>
      <div style={{
        marginTop: 8, fontSize: 12, color: 'var(--ink-muted)',
      }}>
        Batch {data.batch_id} · Status: {data.status}
      </div>
    </div>
  )
}
