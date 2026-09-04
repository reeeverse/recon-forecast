import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import CashPositionBar from '../components/CashPositionBar'
import ForecastChart from '../components/ForecastChart'

export default function ForecastPage({ accountId, accent }) {
  const [threshold, setThreshold] = useState(0)

  useEffect(() => {
    if (!accountId) return
    apiFetch('/accounts')
      .then((accounts) => {
        const acct = accounts.find((a) => a.id === accountId)
        setThreshold(acct?.min_threshold_paise ?? 0)
      })
      .catch(() => {})
  }, [accountId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Cash Outlook
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-muted)', margin: '4px 0 16px' }}>
          Current balance and 14-day cash projection.
        </p>
        <CashPositionBar accountId={accountId} />
      </div>
      <div>
        <ForecastChart accountId={accountId} threshold={threshold} accent={accent} />
      </div>
    </div>
  )
}
