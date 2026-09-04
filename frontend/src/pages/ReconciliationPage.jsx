import { useState } from 'react'
import BankStatementsPanel from '../components/BankStatementsPanel'
import ExceptionsTable from '../components/ExceptionsTable'
import LedgerPanel from '../components/LedgerPanel'
import ReconSummaryCards from '../components/ReconSummaryCards'

export default function ReconciliationPage({ accountId, batchId }) {
  // bump this to force ReconSummaryCards to re-fetch after reconciliation runs
  const [reconKey, setReconKey] = useState(0)

  function handleReconciled() {
    setReconKey(k => k + 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Reconciliation
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-muted)', margin: 0 }}>
          Match bank statement lines against ledger entries. Add ledger entries below, then run reconciliation.
        </p>
      </div>

      {/* Summary */}
      <div>
        <ReconSummaryCards key={reconKey} accountId={accountId} />
      </div>

      {/* Bank statement lines (read-only) */}
      <div>
        <BankStatementsPanel batchId={batchId} />
      </div>

      {/* Ledger CRUD + run reconciliation */}
      <LedgerPanel
        batchId={batchId}
        accountId={accountId}
        onReconciled={handleReconciled}
      />

      {/* Exceptions table */}
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Exceptions &amp; Match Results
        </h2>
        <ExceptionsTable key={reconKey} batchId={batchId} />
      </div>
    </div>
  )
}
