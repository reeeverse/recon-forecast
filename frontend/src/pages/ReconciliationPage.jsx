import { useState } from 'react'
import BankStatementsPanel from '../components/BankStatementsPanel'
import ExceptionsTable from '../components/ExceptionsTable'
import LedgerPanel from '../components/LedgerPanel'
import ReconSummaryCards from '../components/ReconSummaryCards'

export default function ReconciliationPage({ accountId, batchId }) {
  const [reconKey, setReconKey] = useState(0)

  function handleReconciled() {
    setReconKey(k => k + 1)
  }

  const divider = (
    <div style={{ borderTop: '1px solid var(--hairline-soft)', margin: '0 0 4px' }} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Match &amp; Review
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-muted)', margin: 0 }}>
          Match bank lines against your books. Add entries below, then run matching.
        </p>
      </div>

      {/* Summary cards */}
      <div>
        <ReconSummaryCards key={reconKey} accountId={accountId} />
      </div>

      {divider}

      {/* Bank statement lines */}
      <BankStatementsPanel batchId={batchId} accountId={accountId} />

      {divider}

      {/* Ledger entries + run reconciliation */}
      <LedgerPanel
        batchId={batchId}
        accountId={accountId}
        onReconciled={handleReconciled}
      />

      {divider}

      {/* Results table */}
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Match Results &amp; Exceptions
        </h2>
        <ExceptionsTable key={reconKey} batchId={batchId} />
      </div>
    </div>
  )
}
