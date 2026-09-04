import AlertsList from '../components/AlertsList'

export default function AlertsPage({ accountId }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Warnings
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-muted)', margin: 0 }}>
          Liquidity breach warnings for the selected account.
        </p>
      </div>
      <AlertsList accountId={accountId} />
    </div>
  )
}
