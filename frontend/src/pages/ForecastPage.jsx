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
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Cash Position</h2>
        <CashPositionBar accountId={accountId} />
      </div>
      <div>
        <ForecastChart accountId={accountId} threshold={threshold} accent={accent} />
      </div>
    </div>
  )
}
