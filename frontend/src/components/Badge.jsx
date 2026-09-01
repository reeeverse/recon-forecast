const STYLES = {
  auto_matched:     { background: '#0d2b0d', color: '#3fb950' },
  review:           { background: '#2b2200', color: '#d29922' },
  unmatched_bank:   { background: '#2b0d0d', color: '#f85149' },
  unmatched_ledger: { background: '#2b0d0d', color: '#f85149' },
  timing_diff:      { background: '#0d1a2b', color: '#388bfd' },
  amount_diff:      { background: '#2b2200', color: '#d29922' },
  duplicate:        { background: '#1a0d2b', color: '#bc8cff' },
  ambiguous:        { background: '#2b2200', color: '#d29922' },
  none:             { background: '#1c2128', color: '#8b949e' },
  critical:         { background: '#2b0505', color: '#f85149' },
  high:             { background: '#2b0d0d', color: '#f85149' },
  medium:           { background: '#2b2200', color: '#d29922' },
  low:              { background: '#0d2b0d', color: '#3fb950' },
  ok:               { background: '#0d2b0d', color: '#3fb950' },
  error:            { background: '#2b0d0d', color: '#f85149' },
  not_configured:   { background: '#1c2128', color: '#8b949e' },
}

const LABELS = {
  auto_matched: 'Matched', unmatched_bank: 'No Ledger',
  unmatched_ledger: 'No Bank', timing_diff: 'Timing',
  amount_diff: 'Amt Diff', none: '—',
}

export default function Badge({ kind }) {
  const s = STYLES[kind] ?? STYLES.none
  const label = LABELS[kind] ?? kind?.replace(/_/g, ' ')
  return (
    <span style={{
      ...s,
      fontSize: 11,
      fontWeight: 500,
      padding: '2px 7px',
      borderRadius: 4,
      whiteSpace: 'nowrap',
      textTransform: 'capitalize',
    }}>
      {label}
    </span>
  )
}
