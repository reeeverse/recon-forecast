# Dashboard Design System — recon-forecast

Internal finance operations tool. Not a SaaS landing page.
Audience: finance ops team. Aesthetic: clean data tool, Linear-density, Stripe financial signals.

---

## Design Read

"Internal B2B finance dashboard for ops teams — data-dense, trust-first, no decorative chrome.
Linear surface ladder for dark hierarchy, Stripe tabular-figure convention for all paise amounts,
PostHog's semantic badge palette for exception kinds."

Dials: `DESIGN_VARIANCE: 4 / MOTION_INTENSITY: 2 / VISUAL_DENSITY: 7`

---

## Color Tokens

```css
:root {
  /* Canvas */
  --canvas:        #0f1117;   /* near-black, not pure #000 */
  --surface-1:     #161b22;   /* card background */
  --surface-2:     #1c2128;   /* table row hover, selected state */
  --surface-3:     #21262d;   /* input backgrounds */
  --hairline:      #30363d;   /* all 1px borders */
  --hairline-soft: #21262d;   /* subtle dividers */

  /* Text */
  --ink:           #e6edf3;   /* primary text */
  --ink-muted:     #8b949e;   /* secondary labels */
  --ink-subtle:    #484f58;   /* disabled, placeholder */

  /* Accent — single blue (no purple, no gradient) */
  --accent:        #388bfd;   /* primary CTA, active nav, links */
  --accent-hover:  #58a6ff;   /* hover state */

  /* Semantic */
  --success:       #3fb950;   /* auto_matched, ok */
  --warning:       #d29922;   /* review, medium severity */
  --danger:        #f85149;   /* unmatched, critical/high alert */
  --info:          #388bfd;   /* informational */

  /* Amount display — financial data */
  --amount-positive: #3fb950;
  --amount-negative: #f85149;
  --amount-neutral:  #e6edf3;
}
```

---

## Typography

Use **Inter** (Google Fonts). No custom fonts needed.

```css
body {
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink);
  background: var(--canvas);
}

/* Financial amounts — ALWAYS tabular figures */
.amount {
  font-feature-settings: "tnum";  /* Stripe convention */
  letter-spacing: -0.3px;
  font-variant-numeric: tabular-nums;
}
```

| Role | Size | Weight | Use |
|---|---|---|---|
| Page title | 20px | 600 | Section headings |
| Card title | 14px | 600 | Metric card labels |
| Body | 14px | 400 | Table cells, descriptions |
| Caption | 12px | 400 | Timestamps, IDs |
| Amount-lg | 24px | 600 | Big balance figures |
| Amount-sm | 14px | 500 | Table amount cells |
| Badge | 11px | 500 | Status pills |

---

## Spacing

Base unit: 4px.

| Token | Value | Use |
|---|---|---|
| `--space-1` | 4px | tight gaps |
| `--space-2` | 8px | inline gaps |
| `--space-3` | 12px | button padding |
| `--space-4` | 16px | card padding, row height |
| `--space-6` | 24px | section gaps |
| `--space-8` | 32px | card internal padding |
| `--space-12` | 48px | between major sections |

---

## Border Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | badges, tags, table chips |
| `--radius-md` | 6px | buttons, inputs |
| `--radius-lg` | 8px | cards, panels |

No pill-radius on data UI buttons. No 16px+ softness.

---

## Elevation

No drop shadows. Linear-style surface ladder only.

| Level | CSS | Use |
|---|---|---|
| 0 | `background: var(--canvas)` | Page background |
| 1 | `background: var(--surface-1); border: 1px solid var(--hairline)` | Cards, panels |
| 2 | `background: var(--surface-2); border: 1px solid var(--hairline)` | Hovered rows, selected state |
| 3 | `background: var(--surface-3)` | Inputs, dropdowns |

---

## Status Badges

Used on: reconciliation exception kinds, alert severity, batch status.

```jsx
const BADGE = {
  auto_matched:      { bg: '#1a3a1a', text: '#3fb950', label: 'Matched' },
  review:            { bg: '#3a2e00', text: '#d29922', label: 'Review' },
  unmatched_bank:    { bg: '#3a1a1a', text: '#f85149', label: 'Unmatched' },
  unmatched_ledger:  { bg: '#3a1a1a', text: '#f85149', label: 'No Ledger' },
  timing_diff:       { bg: '#1a2a3a', text: '#388bfd', label: 'Timing' },
  amount_diff:       { bg: '#3a2e00', text: '#d29922', label: 'Amt Diff' },
  duplicate:         { bg: '#3a1a3a', text: '#bc8cff', label: 'Duplicate' },
  ambiguous:         { bg: '#3a2e00', text: '#d29922', label: 'Ambiguous' },
  critical:          { bg: '#3a0a0a', text: '#f85149', label: 'Critical' },
  high:              { bg: '#3a1a1a', text: '#f85149', label: 'High' },
  medium:            { bg: '#3a2e00', text: '#d29922', label: 'Medium' },
  low:               { bg: '#1a2a1a', text: '#3fb950', label: 'Low' },
}
```

Structure: `background-color` is dark-tinted version of semantic color. 4px radius. 11px/500 text. 2px 6px padding.

---

## Amount Formatting

All amounts stored as integer paise (₹1 = 100 paise). Always format before display:

```js
const formatPaise = (paise) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
// 500000000 → "₹50,00,000"
```

Direction coloring: credit = `--amount-positive`, debit = `--amount-negative`.

---

## Component Checklist (Anti-Vibecode)

**DO:**
- Dark canvas `#0f1117` — not pure black, not white
- Single accent color (blue `#388bfd`) — no purple, no gradient
- 1px hairline borders for all card elevation
- Tabular figures on every amount cell
- Compact row height (36–40px in tables)
- Skeleton loaders while data fetches
- Empty state messages when lists are empty

**DON'T:**
- No Lucide icon spam (max 1 icon per UI action, not decoration)
- No bento grid layout
- No drop shadows
- No pill-rounded primary buttons
- No atmospheric gradients or mesh backgrounds
- No fake/hardcoded data (always from API)
- No "coming soon" placeholders in shipped UI
- No soft-corner radius > 8px on data components
- No Inter italic (never needed in data UI)

---

## Component Map → API Endpoints

| Component | API call | Key fields |
|---|---|---|
| `AccountSelector` | `GET /api/v1/accounts` | id, name, current_balance_paise |
| `ReconSummaryCards` | `GET /api/v1/reconciliation/summary?account_id=` | auto_matched, review, unmatched_bank, unmatched_ledger, avg_confidence |
| `ExceptionsTable` | `GET /api/v1/reconciliation/exceptions?batch_id=&page=` | match_type, exception_kind, confidence, bank, ledger, amount_delta_paise |
| `ForecastChart` | `GET /api/v1/accounts/{id}/forecast` | horizon_date, predicted_close_paise, predicted_low_paise, predicted_high_paise |
| `CashPositionBar` | `GET /api/v1/accounts/{id}/cash-position` | current_balance_paise, min_threshold_paise, projected_balance_paise |
| `AlertsList` | `GET /api/v1/alerts` | severity, account_id, breach_date, shortfall_paise |

---

## Layout Structure

```
┌─ Sidebar (240px) ─────┬─ Main content ─────────────────────┐
│  Logo                 │  ┌─ Top bar ──────────────────────┐ │
│  ─────────────────    │  │  AccountSelector  [Batch info] │ │
│  Nav:                 │  └────────────────────────────────┘ │
│  > Reconciliation     │                                     │
│  > Forecast           │  ┌─ Content area ─────────────────┐ │
│  > Alerts             │  │  (ReconSummaryCards /          │ │
│                       │  │   ForecastChart /              │ │
│  ─────────────────    │  │   ExceptionsTable /            │ │
│  [Active alerts 🔴]   │  │   AlertsList)                  │ │
└───────────────────────┴──┴────────────────────────────────┘ │
```

No tabs as top-level nav. Sidebar with 3 sections.
Active page highlighted with `--accent` left border + `--surface-2` background.
