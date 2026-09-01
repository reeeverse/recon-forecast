import ExceptionsTable from '../components/ExceptionsTable'
import ReconSummaryCards from '../components/ReconSummaryCards'

export default function ReconciliationPage({ accountId, batchId }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Reconciliation Summary</h2>
        <ReconSummaryCards accountId={accountId} />
      </div>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Exceptions</h2>
        <ExceptionsTable batchId={batchId} />
      </div>
    </div>
  )
}
