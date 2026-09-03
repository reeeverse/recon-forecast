import ExceptionsTable from '../components/ExceptionsTable'
import ReconSummaryCards from '../components/ReconSummaryCards'

export default function ReconciliationPage({ accountId, batchId }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Reconciliation
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-muted)', margin: 0 }}>
          Match bank statement lines against ledger entries for the selected account.
        </p>
      </div>
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Summary
        </h2>
        <ReconSummaryCards accountId={accountId} />
      </div>
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Exceptions
        </h2>
        <ExceptionsTable batchId={batchId} />
      </div>
    </div>
  )
}
