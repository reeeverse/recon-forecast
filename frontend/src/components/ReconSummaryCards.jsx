import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import Skeleton from './Skeleton'

const fmt = (n) => (n ?? 0).toLocaleString('en-IN')

const LEGENDS = [
  { key: 'auto_matched',     label: 'Auto Matched',     meaning: 'Confidence ≥ 85%. System is certain — automatically written to verified transactions and used in cash forecasting.' },
  { key: 'review',           label: 'For Review',       meaning: 'Confidence 60–84%. A probable match was found but not certain enough to auto-approve. Needs one human verification (first check, not double-check).' },
  { key: 'unmatched_bank',   label: 'Unmatched Bank',   meaning: 'Bank transaction with no corresponding ledger entry. Could be a missing ledger record or an unbooked bank charge.' },
  { key: 'unmatched_ledger', label: 'Unmatched Ledger', meaning: 'Ledger entry not confirmed by the bank statement. May be a posting error, future-dated, or a missing bank record.' },
  { key: 'duplicates',       label: 'Duplicates',       meaning: 'Same bank transaction appears more than once in the uploaded statement. Excluded from matching.' },
]

function MetricCard({ label, value, sub, color, legendKey, onHover, hovered }) {
  const entry = LEGENDS.find(l => l.key === legendKey)
  return (
    <div
      title={entry?.meaning}
      onMouseEnter={() => onHover && onHover(legendKey)}
      onMouseLeave={() => onHover && onHover(null)}
      style={{
        background: 'var(--surface-1)',
        border: `1px solid ${hovered === legendKey ? 'var(--accent)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        minWidth: 120,
        flex: 1,
        cursor: entry ? 'help' : 'default',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 6 }}>{label}</div>
      <div className="amount" style={{ fontSize: 22, fontWeight: 600, color: color ?? 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function ReconSummaryCards({ accountId }) {
  const [data, setData]     = useState(null)
  const [err, setErr]       = useState(null)
  const [hovered, setHovered] = useState(null)

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
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{
          flex: 1, background: 'var(--surface-1)', border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-lg)', padding: '16px 20px', minWidth: 120,
        }}>
          <Skeleton height={12} width="60%" style={{ marginBottom: 10 }} />
          <Skeleton height={28} width="80%" />
        </div>
      ))}
    </div>
  )

  const { totals, avg_confidence, verified_count } = data
  const total = totals.bank || 1
  const matchRate   = ((totals.auto_matched / total) * 100).toFixed(1)
  const reviewRate  = ((totals.review / total) * 100).toFixed(1)
  const pendingRate = (((totals.review + totals.unmatched_bank + totals.unmatched_ledger) / total) * 100).toFixed(1)

  return (
    <div>
      {/* Legend hint */}
      <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginBottom: 8 }}>
        Hover a card for what each category means
      </div>

      {/* Primary cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <MetricCard
          label="Auto Matched"
          value={fmt(totals.auto_matched)}
          sub={`${matchRate}% of bank records`}
          color="var(--success)"
          legendKey="auto_matched"
          onHover={setHovered}
          hovered={hovered}
        />
        <MetricCard
          label="For Review"
          value={fmt(totals.review)}
          sub={totals.review > 0 ? `${reviewRate}% need human check` : 'none pending'}
          color={totals.review > 0 ? 'var(--warning)' : 'var(--ink-muted)'}
          legendKey="review"
          onHover={setHovered}
          hovered={hovered}
        />
        <MetricCard
          label="Unmatched Bank"
          value={fmt(totals.unmatched_bank)}
          sub="no ledger counterpart"
          color={totals.unmatched_bank > 0 ? 'var(--danger)' : 'var(--ink-muted)'}
          legendKey="unmatched_bank"
          onHover={setHovered}
          hovered={hovered}
        />
        <MetricCard
          label="Unmatched Ledger"
          value={fmt(totals.unmatched_ledger)}
          sub="no bank confirmation"
          color={totals.unmatched_ledger > 0 ? 'var(--danger)' : 'var(--ink-muted)'}
          legendKey="unmatched_ledger"
          onHover={setHovered}
          hovered={hovered}
        />
        <MetricCard
          label="Duplicates"
          value={fmt(totals.duplicates)}
          sub="excluded from matching"
          color={totals.duplicates > 0 ? 'var(--warning)' : 'var(--ink-muted)'}
          legendKey="duplicates"
          onHover={setHovered}
          hovered={hovered}
        />
        <MetricCard
          label="Avg Confidence"
          value={avg_confidence ? `${avg_confidence.toFixed(1)}%` : '—'}
          sub={`${fmt(verified_count)} verified txns`}
        />
      </div>

      {/* Secondary info row */}
      <div style={{
        marginTop: 10,
        display: 'flex', gap: 20, flexWrap: 'wrap',
        fontSize: 12, color: 'var(--ink-muted)',
        padding: '8px 4px',
        borderTop: '1px solid var(--hairline-soft)',
      }}>
        <span>Bank records: <b style={{ color: 'var(--ink)' }}>{fmt(totals.bank)}</b></span>
        <span>Ledger entries: <b style={{ color: 'var(--ink)' }}>{fmt(totals.ledger)}</b></span>
        <span>Pending (review + unmatched): <b style={{ color: totals.review + totals.unmatched_bank > 0 ? 'var(--warning)' : 'var(--ink)' }}>{pendingRate}%</b></span>
        <span style={{ marginLeft: 'auto' }}>
          Batch {data.batch_id} · {data.status}
        </span>
      </div>

      {/* Hovered legend tooltip */}
      {hovered && LEGENDS.find(l => l.key === hovered) && (
        <div style={{
          marginTop: 8, padding: '10px 14px',
          background: 'var(--surface-2)',
          border: '1px solid var(--accent)',
          borderRadius: 8,
          fontSize: 12, color: 'var(--ink)',
          lineHeight: 1.5,
        }}>
          <b style={{ color: 'var(--accent)' }}>{LEGENDS.find(l => l.key === hovered).label}:</b>{' '}
          {LEGENDS.find(l => l.key === hovered).meaning}
        </div>
      )}
    </div>
  )
}
