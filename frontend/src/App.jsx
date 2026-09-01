import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import AlertsPage from './pages/AlertsPage'
import ForecastPage from './pages/ForecastPage'
import ReconciliationPage from './pages/ReconciliationPage'

const NAV = [
  { key: 'reconciliation', label: 'Reconciliation' },
  { key: 'forecast',       label: 'Forecast' },
  { key: 'alerts',         label: 'Alerts' },
]

const fmtBalance = (p) =>
  p == null ? '' : new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    notation: 'compact', maximumFractionDigits: 1,
  }).format(p / 100)

export default function App() {
  const [page, setPage]           = useState('reconciliation')
  const [accounts, setAccounts]   = useState([])
  const [accountId, setAccountId] = useState('')
  const [batchId, setBatchId]     = useState(null)
  const [alertCount, setAlertCount] = useState(0)
  const [health, setHealth]       = useState(null)

  useEffect(() => {
    apiFetch('/accounts')
      .then((data) => { setAccounts(data); if (data.length) setAccountId(data[0].id) })
      .catch(() => {})
    apiFetch('/alerts')
      .then((d) => setAlertCount(d.total ?? 0))
      .catch(() => {})
    apiFetch('/health')
      .then(setHealth)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!accountId) return
    setBatchId(null)
    apiFetch(`/reconciliation/summary?account_id=${accountId}`)
      .then((d) => setBatchId(d.batch_id))
      .catch(() => setBatchId(null))
  }, [accountId])

  const activeAccount = accounts.find((a) => a.id === accountId)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 'var(--sidebar-w)',
        background: 'var(--surface-1)',
        borderRight: '1px solid var(--hairline)',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--hairline)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>
            <span style={{ color: 'var(--accent)' }}>recon</span>
            <span style={{ color: 'var(--ink-muted)' }}>/</span>
            <span>forecast</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginTop: 2 }}>
            Liquidity Intelligence
          </div>
        </div>

        {/* Account selector */}
        <div style={{ padding: '12px 12px 8px' }}>
          <div style={{
            fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            Account
          </div>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ width: '100%' }}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {activeAccount && (
            <div className="amount" style={{
              fontSize: 11, marginTop: 5,
              color: activeAccount.current_balance_paise >= activeAccount.min_threshold_paise
                ? 'var(--success)' : 'var(--danger)',
            }}>
              {fmtBalance(activeAccount.current_balance_paise)}
              {activeAccount.has_active_alert && (
                <span style={{ marginLeft: 4, color: 'var(--danger)' }}>⚠</span>
              )}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '4px 8px' }}>
          {NAV.map((n) => {
            const active = page === n.key
            return (
              <button
                key={n.key}
                onClick={() => setPage(n.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', textAlign: 'left',
                  padding: '7px 10px', marginBottom: 2,
                  border: 'none',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                  borderRadius: 'var(--radius-md)',
                  background: active ? 'var(--surface-2)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--ink-muted)',
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  cursor: 'pointer',
                }}
              >
                {n.label}
                {n.key === 'alerts' && alertCount > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, minWidth: 18,
                    background: 'var(--danger)', color: '#fff',
                    borderRadius: 9999, padding: '1px 5px',
                  }}>
                    {alertCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Service health */}
        {health && (
          <div style={{
            padding: '10px 14px', borderTop: '1px solid var(--hairline)',
            fontSize: 11, color: 'var(--ink-subtle)',
          }}>
            {['db', 'dynamo', 'sns'].map((s) => (
              <span key={s} style={{ marginRight: 8 }}>
                <span style={{ color: health[s] === 'ok' ? 'var(--success)' : 'var(--danger)' }}>●</span>
                {' '}{s}
              </span>
            ))}
          </div>
        )}
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        {page === 'reconciliation' && <ReconciliationPage accountId={accountId} batchId={batchId} />}
        {page === 'forecast'       && <ForecastPage accountId={accountId} />}
        {page === 'alerts'         && <AlertsPage />}
      </main>
    </div>
  )
}
