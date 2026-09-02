const KIND_COLOR = {
  auto_matched:     'var(--success)',
  review:           'var(--warning)',
  unmatched_bank:   'var(--danger)',
  unmatched_ledger: 'var(--danger)',
  timing_diff:      'var(--accent)',
  amount_diff:      'var(--warning)',
  duplicate:        'var(--accent)',
  ambiguous:        'var(--warning)',
  none:             'var(--ink-subtle)',
  critical:         'var(--danger)',
  high:             'var(--danger)',
  medium:           'var(--warning)',
  low:              'var(--success)',
  ok:               'var(--success)',
  error:            'var(--danger)',
  not_configured:   'var(--ink-subtle)',
}

const LABELS = {
  auto_matched: 'Matched', unmatched_bank: 'No Ledger',
  unmatched_ledger: 'No Bank', timing_diff: 'Timing',
  amount_diff: 'Amt Diff', none: '—',
}

export default function Badge({ kind }) {
  const color = KIND_COLOR[kind] ?? 'var(--ink-subtle)'
  const label = LABELS[kind] ?? kind?.replace(/_/g, ' ')
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 7px',
      borderRadius: 'var(--radius-sm)',
      whiteSpace: 'nowrap',
      textTransform: 'capitalize',
      color,
      border: `1px solid ${color}`,
    }}>
      {label}
    </span>
  )
}
