import AlertsList from '../components/AlertsList'

export default function AlertsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Alerts
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-muted)', margin: 0 }}>
          Active liquidity breach warnings across all accounts.
        </p>
      </div>
      <AlertsList />
    </div>
  )
}
