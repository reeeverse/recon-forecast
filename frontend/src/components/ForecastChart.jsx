import { useEffect, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { apiFetch } from '../api'
import Skeleton from './Skeleton'

const fmtPaise = (p) =>
  p == null ? '—' : new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    notation: 'compact', maximumFractionDigits: 1,
  }).format(p / 100)

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

const CustomTooltip = ({ active, payload, label, threshold }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-lg)', padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--ink-muted)', marginBottom: 4 }}>{fmtDate(label)}</div>
      <div><span style={{ color: 'var(--accent)' }}>●</span> Forecast: <span className="amount">{fmtPaise(d?.predicted_close_paise)}</span></div>
      {d?.predicted_low_paise != null && (
        <div style={{ color: 'var(--ink-muted)' }}>
          Range: <span className="amount">{fmtPaise(d.predicted_low_paise)}</span>
          {' – '}
          <span className="amount">{fmtPaise(d.predicted_high_paise)}</span>
        </div>
      )}
      {threshold > 0 && d?.predicted_low_paise < threshold && (
        <div style={{ color: 'var(--danger)', marginTop: 4 }}>⚠ Below threshold</div>
      )}
    </div>
  )
}

export default function ForecastChart({ accountId, threshold, accent = "#388bfd" }) {
  const [points, setPoints] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!accountId) return
    setPoints(null); setErr(null)
    apiFetch(`/accounts/${accountId}/forecast`)
      .then((d) => setPoints(d.points ?? []))
      .catch((e) => setErr(e.message))
  }, [accountId])

  if (!accountId) return null

  if (err) return (
    <div style={{ color: 'var(--danger)', padding: 16, fontSize: 13 }}>
      Forecast unavailable — ingest data first
    </div>
  )

  if (!points) return <Skeleton height={240} style={{ borderRadius: 'var(--radius-lg)' }} />

  if (points.length === 0) return (
    <div style={{
      height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--ink-muted)', fontSize: 13,
      background: 'var(--surface-1)', border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-lg)',
    }}>
      No forecast data — run pipeline first
    </div>
  )

  const minY = Math.min(...points.map((p) => p.predicted_low_paise ?? p.predicted_close_paise))
  const maxY = Math.max(...points.map((p) => p.predicted_high_paise ?? p.predicted_close_paise))
  const pad = (maxY - minY) * 0.1

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--ink)' }}>
        14-Day Cash Forecast
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-muted)', marginLeft: 8 }}>
          Holt double-exponential (α=0.4, β=0.2)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={points} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={accent} stopOpacity={0.15} />
              <stop offset="95%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline-soft)" vertical={false} />
          <XAxis
            dataKey="horizon_date"
            tickFormatter={fmtDate}
            tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
            axisLine={false} tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={fmtPaise}
            tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
            axisLine={false} tickLine={false}
            width={72}
            domain={[minY - pad, maxY + pad]}
          />
          <Tooltip content={<CustomTooltip threshold={threshold} />} />
          {/* confidence band */}
          <Area
            type="monotone"
            dataKey="predicted_high_paise"
            stroke="none" fill="url(#fcGrad)"
            dot={false} legendType="none"
          />
          {/* main forecast line */}
          <Area
            type="monotone"
            dataKey="predicted_close_paise"
            stroke={accent} strokeWidth={2}
            fill="url(#fcGrad)"
            dot={false}
            activeDot={{ r: 4, fill: accent, stroke: 'var(--canvas)', strokeWidth: 2 }}
          />
          {/* low band */}
          <Area
            type="monotone"
            dataKey="predicted_low_paise"
            stroke="none" fill="none"
            dot={false} legendType="none"
          />
          {threshold > 0 && (
            <ReferenceLine
              y={threshold}
              stroke="var(--danger)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: 'Min', fill: 'var(--danger)', fontSize: 10, position: 'right' }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
